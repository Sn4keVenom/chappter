// backend/tests/helpers.ts
//
// Shared test fixtures — real Prisma calls against the test database (see
// tests/setup.ts for the DATABASE_URL safety check and the beforeEach that
// calls resetDb()). Keeping these as plain factory functions (not a
// custom ORM/builder) matches how the rest of this backend is written —
// no new abstraction just for tests.

import request from "supertest";
import type { Express } from "express";
import { prisma } from "../lib/prisma";
import type { UserRole, ExecOffice, MemberStatus } from "@prisma/client";
import { seedDefaultPermissions } from "../lib/permissionDefaults";

let appInstance: Express | null = null;

/** Lazily imports the Express app — deferred so tests/setup.ts's env
 * loading always runs first (see vitest.config.ts setupFiles ordering). */
export async function getApp(): Promise<Express> {
  if (!appInstance) {
    appInstance = (await import("../server")).default;
  }
  return appInstance;
}

export async function agent() {
  return request(await getApp());
}

/** verifyToken is mocked (tests/setup.ts) to resolve `{ sub: token }` — the
 * bearer token IS the authProviderId. */
export function authHeader(authProviderId: string): [string, string] {
  return ["Authorization", `Bearer ${authProviderId}`];
}

let counter = 0;
function unique(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now()}_${counter}`;
}

export async function createUser(overrides: Partial<{
  authProviderId: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  activeChapterId: string | null;
  deletedAt: Date | null;
}> = {}) {
  const id = unique("user");
  return prisma.user.create({
    data: {
      authProviderId: overrides.authProviderId ?? `clerk_${id}`,
      email: overrides.email ?? `${id}@example.test`,
      username: overrides.username ?? id,
      firstName: overrides.firstName ?? "Test",
      lastName: overrides.lastName ?? "User",
      activeChapterId: overrides.activeChapterId,
      deletedAt: overrides.deletedAt,
    },
  });
}

export async function createChapter(overrides: Partial<{ name: string }> = {}) {
  return prisma.chapter.create({
    data: { name: overrides.name ?? unique("Chapter") },
  });
}

/** Creates a membership AND points the user's activeChapterId at it
 * (matching how a real join — invite redemption/approval — always does
 * both), unless `setActive: false` is passed. */
export async function createMembership(params: {
  userId: string;
  chapterId: string;
  role?: UserRole;
  office?: ExecOffice | null;
  status?: MemberStatus;
  roleNumber?: number | null;
  bigMembershipId?: string | null;
  setActive?: boolean;
}) {
  const membership = await prisma.chapterMembership.create({
    data: {
      userId: params.userId,
      chapterId: params.chapterId,
      role: params.role ?? "MEMBER",
      office: params.office ?? null,
      status: params.status ?? "ACTIVE",
      roleNumber: params.roleNumber ?? null,
      bigMembershipId: params.bigMembershipId ?? null,
    },
  });
  if (params.setActive !== false) {
    await prisma.user.update({ where: { id: params.userId }, data: { activeChapterId: params.chapterId } });
  }
  return membership;
}

/** One call for the common case: a fresh user + chapter + membership,
 * already wired up as the user's active chapter. */
export async function createUserWithMembership(params: {
  role?: UserRole;
  office?: ExecOffice | null;
  status?: MemberStatus;
  roleNumber?: number | null;
  chapterId?: string;
} = {}) {
  const user = await createUser();
  const chapter = params.chapterId
    ? await prisma.chapter.findUniqueOrThrow({ where: { id: params.chapterId } })
    : await createChapter();
  const membership = await createMembership({
    userId: user.id,
    chapterId: chapter.id,
    role: params.role,
    office: params.office,
    status: params.status,
    roleNumber: params.roleNumber,
  });
  return { user, chapter, membership };
}

export async function createInvite(params: {
  chapterId: string;
  createdById: string; // ChapterMembership id
  code?: string;
  role?: UserRole;
  status?: MemberStatus;
  maxUses?: number | null;
  expiresAt?: Date | null;
  revokedAt?: Date | null;
}) {
  return prisma.chapterInvite.create({
    data: {
      chapterId: params.chapterId,
      createdById: params.createdById,
      code: params.code ?? unique("CODE").toUpperCase(),
      role: params.role ?? "MEMBER",
      status: params.status ?? "PNM",
      maxUses: params.maxUses ?? null,
      expiresAt: params.expiresAt ?? null,
      revokedAt: params.revokedAt ?? null,
    },
  });
}

export async function createRosterEntry(params: {
  chapterId: string;
  createdById: string; // ChapterMembership id
  firstName?: string;
  lastName?: string;
  roleNumber?: number;
  status?: "ACTIVE" | "ALUMNI";
  claimedByUserId?: string | null;
}) {
  return prisma.chapterRosterEntry.create({
    data: {
      chapterId: params.chapterId,
      createdById: params.createdById,
      firstName: params.firstName ?? "Jordan",
      lastName: params.lastName ?? unique("Roster"),
      roleNumber: params.roleNumber ?? Math.floor(Math.random() * 100000) + 1,
      status: params.status ?? "ACTIVE",
      claimedByUserId: params.claimedByUserId ?? null,
    },
  });
}

/** Truncates every table in the public schema (except Prisma's own
 * migration ledger) and resets identity sequences — a clean slate before
 * every single test, not just every file. Simpler and faster than
 * deleteMany-in-dependency-order across ~25 models. */
export async function resetDb(): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
  `;
  if (tables.length === 0) return;
  const names = tables.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);

  // Matches what prisma/seed.ts now does eagerly for a real deployment
  // (see lib/permissionDefaults.ts's doc comment) — without this, every
  // EXEC/office fixture would start with zero granted permissions, which
  // is not the state a real freshly-seeded chapter is in.
  await seedDefaultPermissions(prisma);
}
