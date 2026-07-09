// backend/tests/inviteRedemption.test.ts
//
// Invite code redemption (spec §3): valid/revoked/expired/exhausted codes,
// duplicate-membership prevention, and — the most important test in this
// file — a real concurrency test proving the maxUses race fixed during
// release hardening actually holds under genuinely parallel requests
// against a real database, not just "looks right on inspection."

import { describe, it, expect } from "vitest";
import { prisma } from "../lib/prisma";
import { agent, authHeader, createUserWithMembership, createInvite, createUser } from "./helpers";

describe("invite redemption", () => {
  it("a valid code creates a membership matching the invite's role/status and increments useCount", async () => {
    const { chapter, membership: creatorMembership } = await createUserWithMembership({ role: "EXEC" });
    const invite = await createInvite({ chapterId: chapter.id, createdById: creatorMembership.id, code: "VALID001", role: "MEMBER", status: "ACTIVE" });
    const newUser = await createUser();

    const res = await (await agent())
      .post("/api/v1/chapters/join/redeem")
      .set(...authHeader(newUser.authProviderId))
      .send({ code: "VALID001" });

    expect(res.status).toBe(201);
    expect(res.body.user.hasChapter).toBe(true);
    expect(res.body.user.role).toBe("MEMBER");
    expect(res.body.user.status).toBe("ACTIVE");

    const updatedInvite = await prisma.chapterInvite.findUnique({ where: { id: invite.id } });
    expect(updatedInvite!.useCount).toBe(1);

    const redemption = await prisma.chapterInviteRedemption.findFirst({ where: { inviteId: invite.id, userId: newUser.id } });
    expect(redemption).not.toBeNull();

    const refreshedUser = await prisma.user.findUnique({ where: { id: newUser.id } });
    expect(refreshedUser!.activeChapterId).toBe(chapter.id);
  });

  it("rejects a revoked invite code", async () => {
    const { chapter, membership: creatorMembership } = await createUserWithMembership({ role: "EXEC" });
    await createInvite({ chapterId: chapter.id, createdById: creatorMembership.id, code: "REVOKED1", revokedAt: new Date() });
    const newUser = await createUser();

    const res = await (await agent())
      .post("/api/v1/chapters/join/redeem")
      .set(...authHeader(newUser.authProviderId))
      .send({ code: "REVOKED1" });

    expect(res.status).toBe(404);
  });

  it("rejects an expired invite code", async () => {
    const { chapter, membership: creatorMembership } = await createUserWithMembership({ role: "EXEC" });
    await createInvite({ chapterId: chapter.id, createdById: creatorMembership.id, code: "EXPIRED1", expiresAt: new Date(Date.now() - 1000) });
    const newUser = await createUser();

    const res = await (await agent())
      .post("/api/v1/chapters/join/redeem")
      .set(...authHeader(newUser.authProviderId))
      .send({ code: "EXPIRED1" });

    expect(res.status).toBe(400);
  });

  it("rejects a code that has already reached its use limit", async () => {
    const { chapter, membership: creatorMembership } = await createUserWithMembership({ role: "EXEC" });
    await createInvite({ chapterId: chapter.id, createdById: creatorMembership.id, code: "MAXED001", maxUses: 1 });

    const firstUser = await createUser();
    const firstRes = await (await agent())
      .post("/api/v1/chapters/join/redeem")
      .set(...authHeader(firstUser.authProviderId))
      .send({ code: "MAXED001" });
    expect(firstRes.status).toBe(201);

    const secondUser = await createUser();
    const secondRes = await (await agent())
      .post("/api/v1/chapters/join/redeem")
      .set(...authHeader(secondUser.authProviderId))
      .send({ code: "MAXED001" });
    expect(secondRes.status).toBe(400);
  });

  it("rejects redemption by someone already a member of the chapter", async () => {
    const { user: existingMember, chapter, membership: creatorMembership } = await createUserWithMembership({ role: "EXEC" });
    await createInvite({ chapterId: chapter.id, createdById: creatorMembership.id, code: "ALREADY1" });

    const res = await (await agent())
      .post("/api/v1/chapters/join/redeem")
      .set(...authHeader(existingMember.authProviderId))
      .send({ code: "ALREADY1" });

    expect(res.status).toBe(409);
  });

  it("rejects an unknown code", async () => {
    const newUser = await createUser();
    const res = await (await agent())
      .post("/api/v1/chapters/join/redeem")
      .set(...authHeader(newUser.authProviderId))
      .send({ code: "DOESNOTEXIST" });

    expect(res.status).toBe(404);
  });

  it("concurrent redemption of a single-use code: exactly one of two parallel requests succeeds", async () => {
    const { chapter, membership: creatorMembership } = await createUserWithMembership({ role: "EXEC" });
    await createInvite({ chapterId: chapter.id, createdById: creatorMembership.id, code: "RACE0001", maxUses: 1 });

    const userA = await createUser();
    const userB = await createUser();
    const app = await agent();

    const [resA, resB] = await Promise.all([
      app.post("/api/v1/chapters/join/redeem").set(...authHeader(userA.authProviderId)).send({ code: "RACE0001" }),
      app.post("/api/v1/chapters/join/redeem").set(...authHeader(userB.authProviderId)).send({ code: "RACE0001" }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([201, 400]);

    const memberships = await prisma.chapterMembership.count({ where: { chapterId: chapter.id } });
    // creator's own membership + exactly one successful redemption — never two.
    expect(memberships).toBe(2);

    const invite = await prisma.chapterInvite.findUnique({ where: { code: "RACE0001" } });
    expect(invite!.useCount).toBe(1);
  });
});
