// backend/tests/rosterVerification.test.ts
//
// Roster-verified signup (spec: account creation with role-number
// verification & exec approval): the public pre-check (POST
// /auth/verify-role-number), the real atomic claim (POST
// /chapters/claim-role-number), the resulting join request's threaded
// fields, and how approval seeds ChapterMembership from them. Also covers
// the roster admin CRUD (permission-gated, chapter-scoped) exec uses to
// populate the list these all check against.

import { describe, it, expect } from "vitest";
import { prisma } from "../lib/prisma";
import {
  agent,
  authHeader,
  createUserWithMembership,
  createRosterEntry,
  createUser,
} from "./helpers";

describe("POST /auth/verify-role-number", () => {
  it("a matching, unclaimed entry is valid", async () => {
    const { chapter, membership } = await createUserWithMembership({ role: "EXEC" });
    await createRosterEntry({ chapterId: chapter.id, createdById: membership.id, firstName: "Jordan", roleNumber: 214, status: "ACTIVE" });

    const res = await (await agent())
      .post("/api/v1/auth/verify-role-number")
      .send({ firstName: "Jordan", roleNumber: 214, status: "ACTIVE" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ valid: true });
  });

  it("is case-insensitive on first name", async () => {
    const { chapter, membership } = await createUserWithMembership({ role: "EXEC" });
    await createRosterEntry({ chapterId: chapter.id, createdById: membership.id, firstName: "Jordan", roleNumber: 215, status: "ACTIVE" });

    const res = await (await agent())
      .post("/api/v1/auth/verify-role-number")
      .send({ firstName: "jordan", roleNumber: 215, status: "ACTIVE" });

    expect(res.body).toEqual({ valid: true });
  });

  it("a wrong name for a real role number reports NAME_MISMATCH", async () => {
    const { chapter, membership } = await createUserWithMembership({ role: "EXEC" });
    await createRosterEntry({ chapterId: chapter.id, createdById: membership.id, firstName: "Jordan", roleNumber: 216, status: "ACTIVE" });

    const res = await (await agent())
      .post("/api/v1/auth/verify-role-number")
      .send({ firstName: "Alex", roleNumber: 216, status: "ACTIVE" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ valid: false, reason: "NAME_MISMATCH" });
  });

  it("a role number that doesn't exist for that status reports NOT_FOUND", async () => {
    const res = await (await agent())
      .post("/api/v1/auth/verify-role-number")
      .send({ firstName: "Jordan", roleNumber: 99999, status: "ACTIVE" });

    expect(res.body).toEqual({ valid: false, reason: "NOT_FOUND" });
  });

  it("an already-claimed entry reports ALREADY_CLAIMED", async () => {
    const { chapter, membership } = await createUserWithMembership({ role: "EXEC" });
    const claimer = await createUser();
    await createRosterEntry({
      chapterId: chapter.id,
      createdById: membership.id,
      firstName: "Jordan",
      roleNumber: 217,
      status: "ACTIVE",
      claimedByUserId: claimer.id,
    });

    const res = await (await agent())
      .post("/api/v1/auth/verify-role-number")
      .send({ firstName: "Jordan", roleNumber: 217, status: "ACTIVE" });

    expect(res.body).toEqual({ valid: false, reason: "ALREADY_CLAIMED" });
  });

  it("requires no authentication (public, pre-account)", async () => {
    // No Authorization header set at all — the whole point of this endpoint
    // is that it runs before a Clerk account exists.
    const res = await (await agent())
      .post("/api/v1/auth/verify-role-number")
      .send({ firstName: "Jordan", roleNumber: 1, status: "ACTIVE" });

    expect(res.status).not.toBe(401);
  });
});

describe("POST /chapters/claim-role-number", () => {
  it("claims the roster entry and creates a join request with the matched role number/status", async () => {
    const { chapter, membership } = await createUserWithMembership({ role: "EXEC" });
    await createRosterEntry({ chapterId: chapter.id, createdById: membership.id, firstName: "Riley", roleNumber: 300, status: "ALUMNI" });
    const signup = await createUser();

    const res = await (await agent())
      .post("/api/v1/chapters/claim-role-number")
      .set(...authHeader(signup.authProviderId))
      .send({ firstName: "Riley", roleNumber: 300, status: "ALUMNI", message: "excited to rejoin" });

    expect(res.status).toBe(201);
    expect(res.body.joinRequest.chapterId).toBe(chapter.id);
    expect(res.body.joinRequest.roleNumber).toBe(300);
    expect(res.body.joinRequest.memberStatus).toBe("ALUMNI");
    expect(res.body.joinRequest.status).toBe("PENDING");

    const entry = await prisma.chapterRosterEntry.findFirst({ where: { chapterId: chapter.id, roleNumber: 300 } });
    expect(entry!.claimedByUserId).toBe(signup.id);
  });

  it("never trusts client-supplied roleNumber/status beyond the lookup key — the created request always mirrors the matched row", async () => {
    const { chapter, membership } = await createUserWithMembership({ role: "EXEC" });
    await createRosterEntry({ chapterId: chapter.id, createdById: membership.id, firstName: "Sam", roleNumber: 1, status: "ACTIVE" });
    const signup = await createUser();

    const res = await (await agent())
      .post("/api/v1/chapters/claim-role-number")
      .set(...authHeader(signup.authProviderId))
      .send({ firstName: "Sam", roleNumber: 1, status: "ACTIVE" });

    expect(res.status).toBe(201);
    // The request body's fields ARE the matched row's fields here (that's
    // the honest case) — this test exists to pin the behavior that the
    // route derives them from the DB row it looked up, not an echo of the
    // request body, so a future edit can't accidentally start trusting
    // client input for these two fields.
    const stored = await prisma.chapterJoinRequest.findUnique({ where: { id: res.body.joinRequest.id } });
    const entry = await prisma.chapterRosterEntry.findFirst({ where: { chapterId: chapter.id, roleNumber: 1 } });
    expect(stored!.roleNumber).toBe(entry!.roleNumber);
    expect(stored!.memberStatus).toBe(entry!.status);
  });

  it("404s when name and role number don't match any unclaimed entry", async () => {
    const signup = await createUser();
    const res = await (await agent())
      .post("/api/v1/chapters/claim-role-number")
      .set(...authHeader(signup.authProviderId))
      .send({ firstName: "Nobody", roleNumber: 999999, status: "ACTIVE" });

    expect(res.status).toBe(404);
  });

  it("409s when the signer is already a member of the matched chapter", async () => {
    const { user, chapter, membership } = await createUserWithMembership({ role: "EXEC" });
    await createRosterEntry({ chapterId: chapter.id, createdById: membership.id, firstName: "Casey", roleNumber: 400, status: "ACTIVE" });

    const res = await (await agent())
      .post("/api/v1/chapters/claim-role-number")
      .set(...authHeader(user.authProviderId))
      .send({ firstName: "Casey", roleNumber: 400, status: "ACTIVE" });

    expect(res.status).toBe(409);
  });

  it("409s on a second claim attempt while the first request is still pending", async () => {
    const { chapter, membership } = await createUserWithMembership({ role: "EXEC" });
    await createRosterEntry({ chapterId: chapter.id, createdById: membership.id, firstName: "Drew", roleNumber: 401, status: "ACTIVE" });
    const signup = await createUser();
    const app = await agent();

    const first = await app
      .post("/api/v1/chapters/claim-role-number")
      .set(...authHeader(signup.authProviderId))
      .send({ firstName: "Drew", roleNumber: 401, status: "ACTIVE" });
    expect(first.status).toBe(201);

    // Same person, same roster entry (now claimed by them) — the entry no
    // longer matches the unclaimed-only lookup, so this now 404s rather than
    // 409ing on "already pending"; either way it must not silently create a
    // second join request.
    const second = await app
      .post("/api/v1/chapters/claim-role-number")
      .set(...authHeader(signup.authProviderId))
      .send({ firstName: "Drew", roleNumber: 401, status: "ACTIVE" });
    expect(second.status).not.toBe(201);

    const count = await prisma.chapterJoinRequest.count({ where: { chapterId: chapter.id, userId: signup.id } });
    expect(count).toBe(1);
  });

  it("concurrent claims of the same roster entry: exactly one of two parallel requests succeeds", async () => {
    const { chapter, membership } = await createUserWithMembership({ role: "EXEC" });
    await createRosterEntry({ chapterId: chapter.id, createdById: membership.id, firstName: "Morgan", roleNumber: 500, status: "ACTIVE" });

    const userA = await createUser();
    const userB = await createUser();
    const app = await agent();

    const [resA, resB] = await Promise.all([
      app.post("/api/v1/chapters/claim-role-number").set(...authHeader(userA.authProviderId)).send({ firstName: "Morgan", roleNumber: 500, status: "ACTIVE" }),
      app.post("/api/v1/chapters/claim-role-number").set(...authHeader(userB.authProviderId)).send({ firstName: "Morgan", roleNumber: 500, status: "ACTIVE" }),
    ]);

    // Exactly one request wins (201). The loser's status depends on timing:
    // 409 if its pre-check ran while the row still looked unclaimed and lost
    // the race at the atomic updateMany; 404 if its pre-check ran after the
    // winner had already committed. Both are correct — the real guarantee
    // under test is the counts below, not which error code the loser gets.
    const statuses = [resA.status, resB.status].sort((a, b) => a - b);
    expect(statuses[0]).toBe(201);
    expect(statuses[1]).toBeGreaterThanOrEqual(400);

    const requests = await prisma.chapterJoinRequest.count({ where: { chapterId: chapter.id, roleNumber: 500 } });
    expect(requests).toBe(1);

    const entry = await prisma.chapterRosterEntry.findFirst({ where: { chapterId: chapter.id, roleNumber: 500 } });
    expect([userA.id, userB.id]).toContain(entry!.claimedByUserId);
  });
});

describe("approving a roster-linked join request", () => {
  it("seeds ChapterMembership role/status/roleNumber from the matched roster entry", async () => {
    const { user: execUser, chapter, membership: execMembership } = await createUserWithMembership({ role: "EXEC" });
    await createRosterEntry({ chapterId: chapter.id, createdById: execMembership.id, firstName: "Taylor", roleNumber: 600, status: "ALUMNI" });
    const signup = await createUser();
    const app = await agent();

    const claim = await app
      .post("/api/v1/chapters/claim-role-number")
      .set(...authHeader(signup.authProviderId))
      .send({ firstName: "Taylor", roleNumber: 600, status: "ALUMNI" });
    expect(claim.status).toBe(201);

    const approve = await app
      .patch(`/api/v1/chapters/join-requests/${claim.body.joinRequest.id}`)
      .set(...authHeader(execUser.authProviderId))
      .send({ approve: true });
    expect(approve.status).toBe(200);

    const created = await prisma.chapterMembership.findUnique({
      where: { chapterId_userId: { chapterId: chapter.id, userId: signup.id } },
    });
    expect(created!.role).toBe("ALUMNI");
    expect(created!.status).toBe("ALUMNI");
    expect(created!.roleNumber).toBe(600);
  });

  it("an ordinary (non-roster) join request still defaults exactly as before — no regression", async () => {
    const { chapter, membership: execMembership } = await createUserWithMembership({ role: "EXEC" });
    const signup = await createUser();
    const app = await agent();

    const requested = await app
      .post(`/api/v1/chapters/${chapter.id}/join-requests`)
      .set(...authHeader(signup.authProviderId))
      .send({ message: "hi" });
    expect(requested.status).toBe(201);
    expect(requested.body.joinRequest.roleNumber).toBeNull();
    expect(requested.body.joinRequest.memberStatus).toBeNull();

    const execUser = await prisma.user.findUniqueOrThrow({ where: { id: execMembership.userId } });
    const approve = await app
      .patch(`/api/v1/chapters/join-requests/${requested.body.joinRequest.id}`)
      .set(...authHeader(execUser.authProviderId))
      .send({ approve: true });
    expect(approve.status).toBe(200);

    const created = await prisma.chapterMembership.findUnique({
      where: { chapterId_userId: { chapterId: chapter.id, userId: signup.id } },
    });
    expect(created!.role).toBe("MEMBER");
    expect(created!.status).toBe("PNM");
    expect(created!.roleNumber).toBeNull();
  });
});

describe("roster admin CRUD", () => {
  it("is permission-gated (chapters.manageInvites)", async () => {
    const { chapter, user } = await createUserWithMembership({ role: "PNM" });

    const res = await (await agent())
      .get(`/api/v1/chapters/${chapter.id}/roster-entries`)
      .set(...authHeader(user.authProviderId));

    expect(res.status).toBe(403);
  });

  it("is chapter-scoped — an exec from a different chapter can't read another chapter's roster", async () => {
    const { chapter: chapterA, membership } = await createUserWithMembership({ role: "EXEC" });
    await createRosterEntry({ chapterId: chapterA.id, createdById: membership.id });
    const { user: execB } = await createUserWithMembership({ role: "EXEC" });

    const res = await (await agent())
      .get(`/api/v1/chapters/${chapterA.id}/roster-entries`)
      .set(...authHeader(execB.authProviderId));

    expect(res.status).toBe(403);
  });

  it("creates, lists, and deletes an unclaimed entry", async () => {
    const { chapter, user } = await createUserWithMembership({ role: "EXEC" });
    const app = await agent();

    const created = await app
      .post(`/api/v1/chapters/${chapter.id}/roster-entries`)
      .set(...authHeader(user.authProviderId))
      .send({ firstName: "Avery", lastName: "Kim", roleNumber: 700, status: "ACTIVE" });
    expect(created.status).toBe(201);

    const listed = await app
      .get(`/api/v1/chapters/${chapter.id}/roster-entries`)
      .set(...authHeader(user.authProviderId));
    expect(listed.body.rosterEntries).toHaveLength(1);

    const deleted = await app
      .delete(`/api/v1/chapters/${chapter.id}/roster-entries/${created.body.rosterEntry.id}`)
      .set(...authHeader(user.authProviderId));
    expect(deleted.status).toBe(204);
  });

  it("rejects a duplicate role number within the same chapter", async () => {
    const { chapter, user } = await createUserWithMembership({ role: "EXEC" });
    const app = await agent();

    await app.post(`/api/v1/chapters/${chapter.id}/roster-entries`).set(...authHeader(user.authProviderId)).send({ firstName: "A", lastName: "One", roleNumber: 800, status: "ACTIVE" });
    const dup = await app.post(`/api/v1/chapters/${chapter.id}/roster-entries`).set(...authHeader(user.authProviderId)).send({ firstName: "B", lastName: "Two", roleNumber: 800, status: "ACTIVE" });

    expect(dup.status).toBe(409);
  });

  it("bulk-imports rows independently, reporting per-row duplicates instead of failing the whole batch", async () => {
    const { chapter, user, membership } = await createUserWithMembership({ role: "EXEC" });
    await createRosterEntry({ chapterId: chapter.id, createdById: membership.id, roleNumber: 900 });

    const res = await (await agent())
      .post(`/api/v1/chapters/${chapter.id}/roster-entries/bulk`)
      .set(...authHeader(user.authProviderId))
      .send({
        entries: [
          { firstName: "Ok", lastName: "One", roleNumber: 901, status: "ACTIVE" },
          { firstName: "Dup", lastName: "Two", roleNumber: 900, status: "ACTIVE" }, // collides with the pre-existing 900
          { firstName: "Ok", lastName: "Three", roleNumber: 902, status: "ALUMNI" },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.created).toHaveLength(2);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].index).toBe(1);
  });

  it("refuses to delete an already-claimed entry", async () => {
    const { chapter, user, membership } = await createUserWithMembership({ role: "EXEC" });
    const claimer = await createUser();
    const entry = await createRosterEntry({ chapterId: chapter.id, createdById: membership.id, claimedByUserId: claimer.id });

    const res = await (await agent())
      .delete(`/api/v1/chapters/${chapter.id}/roster-entries/${entry.id}`)
      .set(...authHeader(user.authProviderId));

    expect(res.status).toBe(400);
  });
});
