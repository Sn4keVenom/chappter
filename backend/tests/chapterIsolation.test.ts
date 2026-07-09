// backend/tests/chapterIsolation.test.ts
//
// Multi-chapter data isolation — the core guarantee of splitting User
// (identity) from ChapterMembership (spec §3). An Exec/Super Admin in one
// chapter must never be able to read or mutate another chapter's members,
// even by guessing/enumerating IDs. Includes a regression test for the
// cross-tenant family-lookup leak found and fixed during release hardening.

import { describe, it, expect } from "vitest";
import { prisma } from "../lib/prisma";
import { agent, authHeader, createUserWithMembership, createUser, createChapter, createInvite } from "./helpers";

describe("chapter isolation", () => {
  it("GET /users/:id 404s for a member of a different chapter", async () => {
    const { user: exec } = await createUserWithMembership({ role: "EXEC" });
    const { user: otherChapterMember } = await createUserWithMembership({ role: "MEMBER" });

    const res = await (await agent())
      .get(`/api/v1/users/${otherChapterMember.id}`)
      .set(...authHeader(exec.authProviderId));

    expect(res.status).toBe(404);
  });

  it("GET /users (roster) never includes another chapter's members", async () => {
    const { user: exec, chapter } = await createUserWithMembership({ role: "EXEC" });
    const { user: sameChapterMember } = await createUserWithMembership({ role: "MEMBER", chapterId: chapter.id });
    await createUserWithMembership({ role: "MEMBER" }); // different chapter entirely

    const res = await (await agent()).get("/api/v1/users").set(...authHeader(exec.authProviderId));

    expect(res.status).toBe(200);
    const ids: string[] = res.body.users.map((u: any) => u.id);
    expect(ids).toContain(exec.id);
    expect(ids).toContain(sameChapterMember.id);
    expect(ids.length).toBe(2);
  });

  it("GET /users/:id/family 404s across chapters (regression: was previously unscoped)", async () => {
    const { user: exec } = await createUserWithMembership({ role: "EXEC" });
    const { user: otherChapterMember } = await createUserWithMembership({ role: "MEMBER" });

    const res = await (await agent())
      .get(`/api/v1/users/${otherChapterMember.id}/family`)
      .set(...authHeader(exec.authProviderId));

    expect(res.status).toBe(404);
  });

  it("a user with no chapter membership at all gets 403 from /users/:id/family", async () => {
    const noChapterUser = await createUser();
    const { user: target } = await createUserWithMembership({ role: "MEMBER" });

    const res = await (await agent())
      .get(`/api/v1/users/${target.id}/family`)
      .set(...authHeader(noChapterUser.authProviderId));

    expect(res.status).toBe(403);
  });

  it("PATCH /users/:id/big rejects a proposed Big from a different chapter", async () => {
    const { user: exec, chapter } = await createUserWithMembership({ role: "EXEC" });
    const { user: sameChapterMember } = await createUserWithMembership({ role: "MEMBER", chapterId: chapter.id });
    const { user: otherChapterMember } = await createUserWithMembership({ role: "MEMBER" });

    const res = await (await agent())
      .patch(`/api/v1/users/${sameChapterMember.id}/big`)
      .set(...authHeader(exec.authProviderId))
      .send({ bigUserId: otherChapterMember.id });

    expect(res.status).toBe(404);
  });

  it("PATCH /users/:id/role-number 404s for a target in a different chapter", async () => {
    const { user: exec } = await createUserWithMembership({ role: "EXEC", office: "SCRIBE" });
    const { user: otherChapterMember } = await createUserWithMembership({ role: "MEMBER" });

    const res = await (await agent())
      .patch(`/api/v1/users/${otherChapterMember.id}/role-number`)
      .set(...authHeader(exec.authProviderId))
      .send({ roleNumber: 100 });

    expect(res.status).toBe(404);
  });

  it("an Exec cannot manage another chapter's invites even with chapters.manageInvites", async () => {
    const { user: execA, chapter: chapterA, membership: membershipA } = await createUserWithMembership({ role: "EXEC" });
    const chapterB = await createChapter();
    await createInvite({ chapterId: chapterB.id, createdById: membershipA.id });

    const res = await (await agent())
      .get(`/api/v1/chapters/${chapterB.id}/invites`)
      .set(...authHeader(execA.authProviderId));

    expect(res.status).toBe(403);
    void chapterA;
  });

  it("POST /points/adjust rejects a target user from a different chapter", async () => {
    const { user: exec } = await createUserWithMembership({ role: "EXEC" });
    const { user: otherChapterMember } = await createUserWithMembership({ role: "MEMBER" });
    const semester = await prisma.semester.create({
      data: { label: `Sem ${Date.now()}`, startDate: new Date(), endDate: new Date(Date.now() + 86400000) },
    });

    const res = await (await agent())
      .post("/api/v1/points/adjust")
      .set(...authHeader(exec.authProviderId))
      .send({ userId: otherChapterMember.id, semesterId: semester.id, amount: 10, type: "BONUS", reason: "test" });

    expect(res.status).toBe(404);
  });

  it("GET /attendance/history/:userId 404s for a target in a different chapter", async () => {
    const { user: exec } = await createUserWithMembership({ role: "EXEC" });
    const { user: otherChapterMember } = await createUserWithMembership({ role: "MEMBER" });

    const res = await (await agent())
      .get(`/api/v1/attendance/history/${otherChapterMember.id}`)
      .set(...authHeader(exec.authProviderId));

    expect(res.status).toBe(404);
  });

  it("POST /dues/:userId/payment rejects a target user from a different chapter", async () => {
    const { user: exec } = await createUserWithMembership({ role: "EXEC" });
    const { user: otherChapterMember } = await createUserWithMembership({ role: "MEMBER" });
    const semester = await prisma.semester.create({
      data: { label: `Sem ${Date.now()}`, startDate: new Date(), endDate: new Date(Date.now() + 86400000) },
    });

    const res = await (await agent())
      .post(`/api/v1/dues/${otherChapterMember.id}/payment`)
      .set(...authHeader(exec.authProviderId))
      .send({ semesterId: semester.id, amount: 50, method: "CASH" });

    expect(res.status).toBe(404);
  });

  it("GET /dues never includes another chapter's dues records", async () => {
    const { user: execA, chapter: chapterA } = await createUserWithMembership({ role: "EXEC" });
    const { user: memberA } = await createUserWithMembership({ role: "MEMBER", chapterId: chapterA.id });
    const { user: memberB } = await createUserWithMembership({ role: "MEMBER" }); // different chapter
    const semester = await prisma.semester.create({
      data: { label: `Sem ${Date.now()}`, startDate: new Date(), endDate: new Date(Date.now() + 86400000) },
    });
    await prisma.duesRecord.create({
      data: { userId: memberA.id, semesterId: semester.id, amountOwed: 100 },
    });
    await prisma.duesRecord.create({
      data: { userId: memberB.id, semesterId: semester.id, amountOwed: 100 },
    });

    const res = await (await agent()).get("/api/v1/dues").set(...authHeader(execA.authProviderId));

    expect(res.status).toBe(200);
    const userIds: string[] = res.body.records.map((r: any) => r.user.id);
    expect(userIds).toContain(memberA.id);
    expect(userIds).not.toContain(memberB.id);
  });

  it("GET /audit-log never includes another chapter's entries", async () => {
    const { user: superAdminA, chapter: chapterA } = await createUserWithMembership({ role: "SUPER_ADMIN" });
    const { user: superAdminB } = await createUserWithMembership({ role: "SUPER_ADMIN" }); // different chapter
    await prisma.auditLog.create({
      data: { actorId: superAdminA.id, action: "TEST_ACTION_A", entityType: "Test", entityId: "1" },
    });
    await prisma.auditLog.create({
      data: { actorId: superAdminB.id, action: "TEST_ACTION_B", entityType: "Test", entityId: "2" },
    });

    const res = await (await agent()).get("/api/v1/audit-log").set(...authHeader(superAdminA.authProviderId));

    expect(res.status).toBe(200);
    const actions: string[] = res.body.entries.map((e: any) => e.action);
    expect(actions).toContain("TEST_ACTION_A");
    expect(actions).not.toContain("TEST_ACTION_B");
    void chapterA;
  });
});
