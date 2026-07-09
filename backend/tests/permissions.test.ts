// backend/tests/permissions.test.ts
//
// Data-driven permission enforcement: role-tier gates (requireRole),
// granular role-based grants and office-based grants (requirePermission),
// and the SUPER_ADMIN unconditional bypass. Specifically exercises the
// "Scribe can assign role numbers even without Exec-tier access" design
// (spec §6/§11 — an office grant, not a role grant).

import { describe, it, expect } from "vitest";
import { agent, authHeader, createUserWithMembership, createUser } from "./helpers";

describe("permissions", () => {
  it("a plain MEMBER cannot list the roster (requireRole EXEC)", async () => {
    const { user } = await createUserWithMembership({ role: "MEMBER" });
    const res = await (await agent()).get("/api/v1/users").set(...authHeader(user.authProviderId));
    expect(res.status).toBe(403);
  });

  it("an EXEC can list the roster", async () => {
    const { user } = await createUserWithMembership({ role: "EXEC" });
    const res = await (await agent()).get("/api/v1/users").set(...authHeader(user.authProviderId));
    expect(res.status).toBe(200);
  });

  it("a MEMBER (no office) cannot assign role numbers", async () => {
    const { user: actor, chapter } = await createUserWithMembership({ role: "MEMBER" });
    const { user: target } = await createUserWithMembership({ role: "MEMBER", chapterId: chapter.id });

    const res = await (await agent())
      .patch(`/api/v1/users/${target.id}/role-number`)
      .set(...authHeader(actor.authProviderId))
      .send({ roleNumber: 300 });

    expect(res.status).toBe(403);
  });

  it("a Scribe (office grant, not role tier) CAN assign role numbers", async () => {
    const { user: scribe, chapter } = await createUserWithMembership({ role: "MEMBER", office: "SCRIBE" });
    const { user: target } = await createUserWithMembership({ role: "MEMBER", chapterId: chapter.id });

    const res = await (await agent())
      .patch(`/api/v1/users/${target.id}/role-number`)
      .set(...authHeader(scribe.authProviderId))
      .send({ roleNumber: 301 });

    expect(res.status).toBe(200);
  });

  it("an EXEC without the Scribe office still cannot assign role numbers", async () => {
    // membership.assignRoleNumber is an office grant, not part of the EXEC
    // role preset — an Exec who isn't also Scribe shouldn't get it for free.
    const { user: exec, chapter } = await createUserWithMembership({ role: "EXEC", office: "TREASURER" });
    const { user: target } = await createUserWithMembership({ role: "MEMBER", chapterId: chapter.id });

    const res = await (await agent())
      .patch(`/api/v1/users/${target.id}/role-number`)
      .set(...authHeader(exec.authProviderId))
      .send({ roleNumber: 302 });

    expect(res.status).toBe(403);
  });

  it("SUPER_ADMIN bypasses every permission check unconditionally", async () => {
    const { user: admin, chapter } = await createUserWithMembership({ role: "SUPER_ADMIN" });
    const { user: target } = await createUserWithMembership({ role: "MEMBER", chapterId: chapter.id });

    const roleNumberRes = await (await agent())
      .patch(`/api/v1/users/${target.id}/role-number`)
      .set(...authHeader(admin.authProviderId))
      .send({ roleNumber: 303 });
    expect(roleNumberRes.status).toBe(200);

    const chapterRes = await (await agent())
      .patch(`/api/v1/chapters/${chapter.id}`)
      .set(...authHeader(admin.authProviderId))
      .send({ chapterName: "Renamed Chapter" });
    expect(chapterRes.status).toBe(200);
  });

  it("chapters.manageInvites: EXEC can create invites, MEMBER cannot", async () => {
    const { user: exec, chapter } = await createUserWithMembership({ role: "EXEC" });
    const execInviteRes = await (await agent())
      .post(`/api/v1/chapters/${chapter.id}/invites`)
      .set(...authHeader(exec.authProviderId))
      .send({});
    expect(execInviteRes.status).toBe(201);

    const { user: member } = await createUserWithMembership({ role: "MEMBER", chapterId: chapter.id });
    const memberInviteRes = await (await agent())
      .post(`/api/v1/chapters/${chapter.id}/invites`)
      .set(...authHeader(member.authProviderId))
      .send({});
    expect(memberInviteRes.status).toBe(403);
  });

  it("a user with no chapter membership at all is denied by every role/permission gate", async () => {
    const noChapterUser = await createUser();
    const res = await (await agent()).get("/api/v1/users").set(...authHeader(noChapterUser.authProviderId));
    expect(res.status).toBe(403);
  });
});
