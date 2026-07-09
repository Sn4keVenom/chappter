// backend/tests/auth.test.ts
//
// Authentication: /auth/sync provisioning, the NEEDS_SYNC handshake,
// invalid/missing tokens, and soft-delete interaction (a deleted account
// can neither authenticate nor be silently resurrected by a stray sync call).

import { describe, it, expect } from "vitest";
import { prisma } from "../lib/prisma";
import { agent, authHeader, createUser } from "./helpers";

describe("authentication", () => {
  it("POST /auth/sync provisions a new user with no chapter and no role", async () => {
    const res = await (await agent())
      .post("/api/v1/auth/sync")
      .set(...authHeader("clerk_new_user_1"))
      .send({ firstName: "Nadia", lastName: "Ortiz", email: "nadia.ortiz@example.test" });

    expect(res.status).toBe(200);
    expect(res.body.user.hasChapter).toBe(false);
    expect(res.body.user.role).toBeUndefined();
    expect(res.body.user.status).toBeUndefined();
    // suggestUsername() strips characters outside [a-z0-9_] from the email
    // local-part, so the period is dropped even though it's otherwise a
    // valid username character.
    expect(res.body.user.username).toBe("nadiaortiz");

    const stored = await prisma.user.findUnique({ where: { authProviderId: "clerk_new_user_1" } });
    expect(stored).not.toBeNull();
    expect(stored!.activeChapterId).toBeNull();
  });

  it("respects a client-supplied username on first sync (email/password sign-up path)", async () => {
    const res = await (await agent())
      .post("/api/v1/auth/sync")
      .set(...authHeader("clerk_new_user_2"))
      .send({ firstName: "Sam", lastName: "Lee", email: "sam@example.test", username: "samlee99" });

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe("samlee99");
  });

  it("rejects a client-supplied username that's already taken", async () => {
    await createUser({ username: "takenname" });

    const res = await (await agent())
      .post("/api/v1/auth/sync")
      .set(...authHeader("clerk_new_user_3"))
      .send({ firstName: "New", lastName: "Person", email: "new@example.test", username: "takenname" });

    expect(res.status).toBe(409);
  });

  it("auto-suggests a different username when two auto-derived usernames collide", async () => {
    await createUser({ username: "collide" });

    // No explicit username in the payload — forces the auto-suggest path,
    // whose base ("collide") is already taken by the fixture above.
    const res = await (await agent())
      .post("/api/v1/auth/sync")
      .set(...authHeader("clerk_new_user_4"))
      .send({ firstName: "Another", lastName: "Person", email: "collide@example.test" });

    expect(res.status).toBe(200);
    expect(res.body.user.username).not.toBe("collide");
    expect(res.body.user.username.startsWith("collide")).toBe(true);
  });

  it("repeat sync updates name/email but never re-touches username", async () => {
    await (await agent())
      .post("/api/v1/auth/sync")
      .set(...authHeader("clerk_repeat"))
      .send({ firstName: "Old", lastName: "Name", email: "old@example.test", username: "stableusername" });

    const res = await (await agent())
      .post("/api/v1/auth/sync")
      .set(...authHeader("clerk_repeat"))
      .send({ firstName: "New", lastName: "Name", email: "new@example.test" });

    expect(res.status).toBe(200);
    expect(res.body.user.firstName).toBe("New");
    expect(res.body.user.username).toBe("stableusername");
  });

  it("returns 401 with NEEDS_SYNC when Clerk-verified but no local User row exists", async () => {
    const res = await (await agent()).get("/api/v1/users/me").set(...authHeader("clerk_never_synced"));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("NEEDS_SYNC");
  });

  it("returns 401 when the token fails verification", async () => {
    const res = await (await agent()).get("/api/v1/users/me").set("Authorization", "Bearer invalid-token");
    expect(res.status).toBe(401);
  });

  it("returns 401 when the Authorization header is missing entirely", async () => {
    const res = await (await agent()).get("/api/v1/users/me");
    expect(res.status).toBe(401);
  });

  it("a soft-deleted user can no longer authenticate", async () => {
    const user = await createUser({ deletedAt: new Date() });
    const res = await (await agent()).get("/api/v1/users/me").set(...authHeader(user.authProviderId));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("NEEDS_SYNC");
  });

  it("/auth/sync refuses to resurrect a soft-deleted account", async () => {
    const user = await createUser({ deletedAt: new Date() });
    const res = await (await agent())
      .post("/api/v1/auth/sync")
      .set(...authHeader(user.authProviderId))
      .send({ firstName: "Resurrected", lastName: "User", email: "resurrected@example.test" });

    expect(res.status).toBe(401);
    const stillDeleted = await prisma.user.findUnique({ where: { id: user.id } });
    expect(stillDeleted!.deletedAt).not.toBeNull();
  });
});
