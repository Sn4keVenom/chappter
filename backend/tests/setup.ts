// backend/tests/setup.ts
//
// Runs before every test file (see vitest.config.ts setupFiles). Two jobs:
//   1. Load .env.test so lib/env.ts's fail-fast check and the Prisma
//      client (both read process.env at import time) see DATABASE_URL /
//      CLERK_SECRET_KEY / CLERK_WEBHOOK_SIGNING_SECRET before server.ts
//      is ever imported by a test file.
//   2. Mock @clerk/backend's verifyToken/verifyWebhook — these tests
//      exercise everything WE built (chapter isolation, permissions, role
//      numbers, Big/Little, invite redemption) against a real Postgres
//      database; re-verifying Clerk's own JWT/webhook-signature math isn't
//      this suite's job. verifyToken resolves `{ sub: token }`, i.e. the
//      bearer token IS the authProviderId in every test — see
//      tests/helpers.ts authHeader().

import fs from "fs";
import path from "path";
import { beforeEach, vi } from "vitest";

// Minimal .env parser — no need for a real dotenv dependency just for this.
// Doesn't touch process.env for keys that are already set (e.g. by CI).
function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf-8").split("\n")) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (!match) continue;
    const key = match[1];
    if (process.env[key] !== undefined) continue;
    let value = (match[2] ?? "").trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    process.env[key] = value;
  }
}

loadEnvFile(path.resolve(__dirname, "../.env.test"));

if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.includes("chappter_test")) {
  throw new Error(
    "backend/tests/setup.ts: DATABASE_URL doesn't look like the test database " +
      '(expected it to include "chappter_test"). Refusing to run tests against ' +
      "what might be a real database. Copy .env.test.example to .env.test and " +
      "point it at a dedicated test database."
  );
}

vi.mock("@clerk/backend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@clerk/backend")>();
  return {
    ...actual,
    verifyToken: vi.fn(async (token: string) => {
      if (token === "invalid-token") throw new Error("invalid token");
      return { sub: token } as any;
    }),
  };
});

vi.mock("@clerk/backend/webhooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@clerk/backend/webhooks")>();
  return {
    ...actual,
    verifyWebhook: vi.fn(),
  };
});

// Fresh slate before every individual test, not just every file — see
// tests/helpers.ts resetDb().
beforeEach(async () => {
  const { resetDb } = await import("./helpers");
  await resetDb();
});
