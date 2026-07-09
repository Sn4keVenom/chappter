// backend/tests/webhooks.test.ts
//
// Clerk `user.deleted` webhook (hardening item §1): soft-delete on a valid
// event, rejection on signature failure, idempotency on redelivery, and the
// end-to-end tie to auth — a webhook-deleted user really can't log back in.
//
// verifyWebhook itself is mocked (tests/setup.ts) — Clerk's HMAC signature
// math is Clerk's to test, not ours; these tests cover what OUR handler
// does with a payload once it's been verified (or rejected).

import { describe, it, expect, vi } from "vitest";
import { verifyWebhook } from "@clerk/backend/webhooks";
import { prisma } from "../lib/prisma";
import { agent, authHeader, createUser } from "./helpers";

function mockUserDeletedEvent(authProviderId: string) {
  vi.mocked(verifyWebhook).mockResolvedValueOnce({
    type: "user.deleted",
    object: "event",
    data: { object: "user", id: authProviderId, deleted: true },
    event_attributes: { http_request: { client_ip: "127.0.0.1", user_agent: "test" } },
  } as any);
}

describe("Clerk user.deleted webhook", () => {
  it("soft-deletes the matching user and frees up their email/username", async () => {
    const user = await createUser({ email: "keep@example.test", username: "keepusername" });
    mockUserDeletedEvent(user.authProviderId);

    const res = await (await agent()).post("/api/v1/webhooks/clerk").send({ type: "user.deleted", data: { id: user.authProviderId } });

    expect(res.status).toBe(200);
    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated!.deletedAt).not.toBeNull();
    expect(updated!.email).not.toBe("keep@example.test");
    expect(updated!.username).not.toBe("keepusername");

    // the freed email should now be available to a genuinely new signup
    const reused = await prisma.user.create({
      data: { authProviderId: "someone_else", email: "keep@example.test", username: "somebodynew", firstName: "New", lastName: "Person" },
    });
    expect(reused.email).toBe("keep@example.test");
  });

  it("writes an audit log entry for the deletion", async () => {
    const user = await createUser();
    mockUserDeletedEvent(user.authProviderId);

    await (await agent()).post("/api/v1/webhooks/clerk").send({ type: "user.deleted", data: { id: user.authProviderId } });

    const entry = await prisma.auditLog.findFirst({ where: { action: "USER_SOFT_DELETED_VIA_WEBHOOK", entityId: user.id } });
    expect(entry).not.toBeNull();
  });

  it("is idempotent — redelivering the same event doesn't error or double-process", async () => {
    const user = await createUser();
    mockUserDeletedEvent(user.authProviderId);
    const first = await (await agent()).post("/api/v1/webhooks/clerk").send({ type: "user.deleted", data: { id: user.authProviderId } });
    expect(first.status).toBe(200);

    mockUserDeletedEvent(user.authProviderId);
    const second = await (await agent()).post("/api/v1/webhooks/clerk").send({ type: "user.deleted", data: { id: user.authProviderId } });
    expect(second.status).toBe(200);

    const entries = await prisma.auditLog.count({ where: { action: "USER_SOFT_DELETED_VIA_WEBHOOK", entityId: user.id } });
    expect(entries).toBe(1);
  });

  it("rejects a request that fails signature verification", async () => {
    vi.mocked(verifyWebhook).mockRejectedValueOnce(new Error("signature mismatch"));
    const res = await (await agent()).post("/api/v1/webhooks/clerk").send({ anything: "goes" });
    expect(res.status).toBe(400);
  });

  it("acknowledges an unknown authProviderId without crashing", async () => {
    mockUserDeletedEvent("clerk_id_with_no_local_row");
    const res = await (await agent()).post("/api/v1/webhooks/clerk").send({ type: "user.deleted", data: { id: "clerk_id_with_no_local_row" } });
    expect(res.status).toBe(200);
  });

  it("a webhook-deleted user cannot authenticate afterward", async () => {
    const user = await createUser();
    mockUserDeletedEvent(user.authProviderId);
    await (await agent()).post("/api/v1/webhooks/clerk").send({ type: "user.deleted", data: { id: user.authProviderId } });

    const meRes = await (await agent()).get("/api/v1/users/me").set(...authHeader(user.authProviderId));
    expect(meRes.status).toBe(401);
  });
});
