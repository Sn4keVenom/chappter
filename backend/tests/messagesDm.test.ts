// backend/tests/messagesDm.test.ts
//
// DM privacy — regression coverage for a release-hardening fix: messages.
// routes.ts's Exec+ bypass (intended for COMMITTEE/OFFICERS moderation) was
// also applying to DM channels, contradicting the file's own documented
// access model ("DM — ChannelMembership members only"). An Exec/Super Admin
// who was never added to a DM must not be able to read, post into, pin, or
// delete messages in it.

import { describe, it, expect } from "vitest";
import { prisma } from "../lib/prisma";
import { agent, authHeader, createUserWithMembership } from "./helpers";

async function createDm(chapterId: string, aUserId: string, bUserId: string) {
  const channel = await prisma.channel.create({
    data: { name: "dm", type: "DM" },
  });
  await prisma.channelMembership.createMany({
    data: [
      { channelId: channel.id, userId: aUserId },
      { channelId: channel.id, userId: bUserId },
    ],
  });
  return channel;
}

describe("DM privacy", () => {
  it("an Exec who is not a DM participant cannot list it via GET /channels", async () => {
    const { user: memberA, chapter } = await createUserWithMembership({ role: "MEMBER" });
    const { user: memberB } = await createUserWithMembership({ role: "MEMBER", chapterId: chapter.id });
    const { user: exec } = await createUserWithMembership({ role: "EXEC", chapterId: chapter.id });
    const dm = await createDm(chapter.id, memberA.id, memberB.id);

    const res = await (await agent()).get("/api/v1/channels").set(...authHeader(exec.authProviderId));

    expect(res.status).toBe(200);
    const ids: string[] = res.body.channels.map((c: any) => c.id);
    expect(ids).not.toContain(dm.id);
  });

  it("an Exec who is not a DM participant gets 403 reading its messages", async () => {
    const { user: memberA, chapter } = await createUserWithMembership({ role: "MEMBER" });
    const { user: memberB } = await createUserWithMembership({ role: "MEMBER", chapterId: chapter.id });
    const { user: exec } = await createUserWithMembership({ role: "EXEC", chapterId: chapter.id });
    const dm = await createDm(chapter.id, memberA.id, memberB.id);

    const res = await (await agent())
      .get(`/api/v1/channels/${dm.id}/messages`)
      .set(...authHeader(exec.authProviderId));

    expect(res.status).toBe(403);
  });

  it("an Exec who is not a DM participant gets 403 posting into it", async () => {
    const { user: memberA, chapter } = await createUserWithMembership({ role: "MEMBER" });
    const { user: memberB } = await createUserWithMembership({ role: "MEMBER", chapterId: chapter.id });
    const { user: exec } = await createUserWithMembership({ role: "EXEC", chapterId: chapter.id });
    const dm = await createDm(chapter.id, memberA.id, memberB.id);

    const res = await (await agent())
      .post(`/api/v1/channels/${dm.id}/messages`)
      .set(...authHeader(exec.authProviderId))
      .send({ content: "snooping" });

    expect(res.status).toBe(403);
  });

  it("a Super Admin who is not a DM participant cannot delete a message in it", async () => {
    const { user: memberA, chapter } = await createUserWithMembership({ role: "MEMBER" });
    const { user: memberB } = await createUserWithMembership({ role: "MEMBER", chapterId: chapter.id });
    const { user: superAdmin } = await createUserWithMembership({ role: "SUPER_ADMIN", chapterId: chapter.id });
    const dm = await createDm(chapter.id, memberA.id, memberB.id);
    const message = await prisma.message.create({
      data: { channelId: dm.id, senderId: memberA.id, content: "private" },
    });

    const res = await (await agent())
      .delete(`/api/v1/messages/${message.id}`)
      .set(...authHeader(superAdmin.authProviderId));

    expect(res.status).toBe(403);
  });

  it("a DM participant can still read and post normally", async () => {
    const { user: memberA, chapter } = await createUserWithMembership({ role: "MEMBER" });
    const { user: memberB } = await createUserWithMembership({ role: "MEMBER", chapterId: chapter.id });
    const dm = await createDm(chapter.id, memberA.id, memberB.id);

    const readRes = await (await agent())
      .get(`/api/v1/channels/${dm.id}/messages`)
      .set(...authHeader(memberA.authProviderId));
    expect(readRes.status).toBe(200);

    const postRes = await (await agent())
      .post(`/api/v1/channels/${dm.id}/messages`)
      .set(...authHeader(memberB.authProviderId))
      .send({ content: "hey" });
    expect(postRes.status).toBe(201);
  });
});
