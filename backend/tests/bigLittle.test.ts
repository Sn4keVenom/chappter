// backend/tests/bigLittle.test.ts
//
// Big/Little relationships (spec §7/§8/§12): reference real accounts (not
// free text), self-reference and cycle prevention, cross-chapter rejection,
// clearable, and — the key referential-integrity requirement — the
// relationship keeps resolving correctly after either side's status
// changes to ALUMNI/INACTIVE.

import { describe, it, expect } from "vitest";
import { prisma } from "../lib/prisma";
import { agent, authHeader, createUserWithMembership } from "./helpers";

describe("Big/Little relationships", () => {
  it("assigns a Big and the family lookup reflects it both ways", async () => {
    const { user: exec, chapter } = await createUserWithMembership({ role: "EXEC" });
    const { user: big } = await createUserWithMembership({ role: "MEMBER", chapterId: chapter.id });
    const { user: little } = await createUserWithMembership({ role: "MEMBER", chapterId: chapter.id });

    const assignRes = await (await agent())
      .patch(`/api/v1/users/${little.id}/big`)
      .set(...authHeader(exec.authProviderId))
      .send({ bigUserId: big.id });
    expect(assignRes.status).toBe(200);

    const littleFamily = await (await agent())
      .get(`/api/v1/users/${little.id}/family`)
      .set(...authHeader(exec.authProviderId));
    expect(littleFamily.body.big.userId).toBe(big.id);

    const bigFamily = await (await agent())
      .get(`/api/v1/users/${big.id}/family`)
      .set(...authHeader(exec.authProviderId));
    expect(bigFamily.body.littles.map((l: any) => l.userId)).toContain(little.id);
  });

  it("rejects a member being their own Big", async () => {
    const { user: exec, chapter } = await createUserWithMembership({ role: "EXEC" });
    const { user: member } = await createUserWithMembership({ role: "MEMBER", chapterId: chapter.id });

    const res = await (await agent())
      .patch(`/api/v1/users/${member.id}/big`)
      .set(...authHeader(exec.authProviderId))
      .send({ bigUserId: member.id });

    expect(res.status).toBe(400);
  });

  it("rejects an assignment that would create a Big/Little cycle", async () => {
    const { user: exec, chapter } = await createUserWithMembership({ role: "EXEC" });
    const { user: grandBig } = await createUserWithMembership({ role: "MEMBER", chapterId: chapter.id });
    const { user: parent } = await createUserWithMembership({ role: "MEMBER", chapterId: chapter.id });
    const { user: child } = await createUserWithMembership({ role: "MEMBER", chapterId: chapter.id });

    // Build grandBig -> parent -> child
    await (await agent()).patch(`/api/v1/users/${parent.id}/big`).set(...authHeader(exec.authProviderId)).send({ bigUserId: grandBig.id });
    await (await agent()).patch(`/api/v1/users/${child.id}/big`).set(...authHeader(exec.authProviderId)).send({ bigUserId: parent.id });

    // grandBig's big = child would close the loop: grandBig -> child -> parent -> grandBig
    const cycleRes = await (await agent())
      .patch(`/api/v1/users/${grandBig.id}/big`)
      .set(...authHeader(exec.authProviderId))
      .send({ bigUserId: child.id });

    expect(cycleRes.status).toBe(400);
  });

  it("clears a Big assignment", async () => {
    const { user: exec, chapter } = await createUserWithMembership({ role: "EXEC" });
    const { user: big } = await createUserWithMembership({ role: "MEMBER", chapterId: chapter.id });
    const { user: little } = await createUserWithMembership({ role: "MEMBER", chapterId: chapter.id });

    await (await agent()).patch(`/api/v1/users/${little.id}/big`).set(...authHeader(exec.authProviderId)).send({ bigUserId: big.id });
    const clearRes = await (await agent())
      .patch(`/api/v1/users/${little.id}/big`)
      .set(...authHeader(exec.authProviderId))
      .send({ bigUserId: null });

    expect(clearRes.status).toBe(200);
    const family = await (await agent()).get(`/api/v1/users/${little.id}/family`).set(...authHeader(exec.authProviderId));
    expect(family.body.big).toBeNull();
  });

  it("rejects a proposed Big from a different chapter", async () => {
    const { user: exec, chapter } = await createUserWithMembership({ role: "EXEC" });
    const { user: little } = await createUserWithMembership({ role: "MEMBER", chapterId: chapter.id });
    const { user: outsider } = await createUserWithMembership({ role: "MEMBER" }); // different chapter

    const res = await (await agent())
      .patch(`/api/v1/users/${little.id}/big`)
      .set(...authHeader(exec.authProviderId))
      .send({ bigUserId: outsider.id });

    expect(res.status).toBe(404);
  });

  it("the relationship survives the Big's status changing to ALUMNI", async () => {
    const { user: exec, chapter } = await createUserWithMembership({ role: "EXEC" });
    const { user: big, membership: bigMembership } = await createUserWithMembership({ role: "MEMBER", chapterId: chapter.id });
    const { user: little } = await createUserWithMembership({ role: "MEMBER", chapterId: chapter.id });

    await (await agent()).patch(`/api/v1/users/${little.id}/big`).set(...authHeader(exec.authProviderId)).send({ bigUserId: big.id });

    // Big graduates
    await prisma.chapterMembership.update({ where: { id: bigMembership.id }, data: { status: "ALUMNI" } });

    const family = await (await agent()).get(`/api/v1/users/${little.id}/family`).set(...authHeader(exec.authProviderId));
    expect(family.body.big.userId).toBe(big.id);
  });

  it("the relationship survives the Little's status changing to INACTIVE", async () => {
    const { user: exec, chapter } = await createUserWithMembership({ role: "EXEC" });
    const { user: big } = await createUserWithMembership({ role: "MEMBER", chapterId: chapter.id });
    const { user: little, membership: littleMembership } = await createUserWithMembership({ role: "MEMBER", chapterId: chapter.id });

    await (await agent()).patch(`/api/v1/users/${little.id}/big`).set(...authHeader(exec.authProviderId)).send({ bigUserId: big.id });
    await prisma.chapterMembership.update({ where: { id: littleMembership.id }, data: { status: "INACTIVE" } });

    const bigFamily = await (await agent()).get(`/api/v1/users/${big.id}/family`).set(...authHeader(exec.authProviderId));
    expect(bigFamily.body.littles.map((l: any) => l.userId)).toContain(little.id);
  });

  it("a MEMBER without membership.manageRelationships cannot assign a Big", async () => {
    const { user: member, chapter } = await createUserWithMembership({ role: "MEMBER" });
    const { user: target } = await createUserWithMembership({ role: "MEMBER", chapterId: chapter.id });

    const res = await (await agent())
      .patch(`/api/v1/users/${target.id}/big`)
      .set(...authHeader(member.authProviderId))
      .send({ bigUserId: null });

    expect(res.status).toBe(403);
  });
});
