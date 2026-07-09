// backend/tests/roleNumbers.test.ts
//
// Role numbers (spec §6): dedicated field, unique per chapter (not
// globally), PNMs excluded, permanent across status changes, clearable.

import { describe, it, expect } from "vitest";
import { prisma } from "../lib/prisma";
import { agent, authHeader, createUserWithMembership, createChapter, createMembership, createUser } from "./helpers";

describe("role numbers", () => {
  it("assigns a role number to an ACTIVE member", async () => {
    const { user: scribe, chapter } = await createUserWithMembership({ role: "MEMBER", office: "SCRIBE" });
    const { user: target } = await createUserWithMembership({ role: "MEMBER", status: "ACTIVE", chapterId: chapter.id });

    const res = await (await agent())
      .patch(`/api/v1/users/${target.id}/role-number`)
      .set(...authHeader(scribe.authProviderId))
      .send({ roleNumber: 210 });

    expect(res.status).toBe(200);
    expect(res.body.membership.roleNumber).toBe(210);
  });

  it("refuses to assign a role number to a PNM", async () => {
    const { user: scribe, chapter } = await createUserWithMembership({ role: "MEMBER", office: "SCRIBE" });
    const { user: pnm } = await createUserWithMembership({ role: "PNM", status: "PNM", chapterId: chapter.id });

    const res = await (await agent())
      .patch(`/api/v1/users/${pnm.id}/role-number`)
      .set(...authHeader(scribe.authProviderId))
      .send({ roleNumber: 211 });

    expect(res.status).toBe(400);
    const stored = await prisma.chapterMembership.findFirst({ where: { userId: pnm.id } });
    expect(stored!.roleNumber).toBeNull();
  });

  it("rejects a duplicate role number within the same chapter", async () => {
    const { user: scribe, chapter } = await createUserWithMembership({ role: "MEMBER", office: "SCRIBE" });
    const { user: first } = await createUserWithMembership({ role: "MEMBER", chapterId: chapter.id });
    const { user: second } = await createUserWithMembership({ role: "MEMBER", chapterId: chapter.id });

    const firstRes = await (await agent())
      .patch(`/api/v1/users/${first.id}/role-number`)
      .set(...authHeader(scribe.authProviderId))
      .send({ roleNumber: 220 });
    expect(firstRes.status).toBe(200);

    const secondRes = await (await agent())
      .patch(`/api/v1/users/${second.id}/role-number`)
      .set(...authHeader(scribe.authProviderId))
      .send({ roleNumber: 220 });
    expect(secondRes.status).toBe(409);
  });

  it("the same role number is reusable across two different chapters", async () => {
    const { user: scribeA, chapter: chapterA } = await createUserWithMembership({ role: "MEMBER", office: "SCRIBE" });
    const { user: memberA } = await createUserWithMembership({ role: "MEMBER", chapterId: chapterA.id });

    const chapterB = await createChapter();
    const scribeBUser = await createUser();
    await createMembership({ userId: scribeBUser.id, chapterId: chapterB.id, role: "MEMBER", office: "SCRIBE" });
    const memberBUser = await createUser();
    await createMembership({ userId: memberBUser.id, chapterId: chapterB.id, role: "MEMBER" });

    const resA = await (await agent())
      .patch(`/api/v1/users/${memberA.id}/role-number`)
      .set(...authHeader(scribeA.authProviderId))
      .send({ roleNumber: 230 });
    expect(resA.status).toBe(200);

    const resB = await (await agent())
      .patch(`/api/v1/users/${memberBUser.id}/role-number`)
      .set(...authHeader(scribeBUser.authProviderId))
      .send({ roleNumber: 230 });
    expect(resB.status).toBe(200);
  });

  it("a role number persists through status changes (ACTIVE -> ALUMNI)", async () => {
    const { user: scribe, chapter } = await createUserWithMembership({ role: "MEMBER", office: "SCRIBE" });
    const { user: target, membership } = await createUserWithMembership({ role: "MEMBER", chapterId: chapter.id });

    await (await agent())
      .patch(`/api/v1/users/${target.id}/role-number`)
      .set(...authHeader(scribe.authProviderId))
      .send({ roleNumber: 240 });

    await prisma.chapterMembership.update({ where: { id: membership.id }, data: { status: "ALUMNI" } });

    const stored = await prisma.chapterMembership.findUnique({ where: { id: membership.id } });
    expect(stored!.roleNumber).toBe(240);
    expect(stored!.status).toBe("ALUMNI");
  });

  it("clears a role number and frees it for reuse in the same chapter", async () => {
    const { user: scribe, chapter } = await createUserWithMembership({ role: "MEMBER", office: "SCRIBE" });
    const { user: first } = await createUserWithMembership({ role: "MEMBER", chapterId: chapter.id });
    const { user: second } = await createUserWithMembership({ role: "MEMBER", chapterId: chapter.id });

    await (await agent())
      .patch(`/api/v1/users/${first.id}/role-number`)
      .set(...authHeader(scribe.authProviderId))
      .send({ roleNumber: 250 });

    const clearRes = await (await agent())
      .patch(`/api/v1/users/${first.id}/role-number`)
      .set(...authHeader(scribe.authProviderId))
      .send({ roleNumber: null });
    expect(clearRes.status).toBe(200);
    expect(clearRes.body.membership.roleNumber).toBeNull();

    const reuseRes = await (await agent())
      .patch(`/api/v1/users/${second.id}/role-number`)
      .set(...authHeader(scribe.authProviderId))
      .send({ roleNumber: 250 });
    expect(reuseRes.status).toBe(200);
  });
});
