// backend/lib/permissionDefaults.ts
//
// Single place for the default role/office → permission grants, and a
// helper to seed them eagerly. Previously these defaults only lived inside
// permissions.routes.ts and were seeded lazily on the first `GET
// /permissions` call — meaning a freshly deployed chapter had ZERO exec
// permissions granted (every requirePermission() check failing 403) until
// someone happened to open the Permissions screen at least once. Found via
// the test suite added during release hardening: an EXEC-role fixture
// couldn't pass requirePermission("membership.manageRelationships") in a
// clean test database for exactly this reason.
//
// Mirrors src/permissions/permissions.ts DEFAULT_ROLE_PRESETS/
// DEFAULT_OFFICE_PRESETS on the mobile side — kept in sync by hand since
// there's no shared package between mobile and backend.

import type { PrismaClient } from "@prisma/client";

export const EDITABLE_ROLES = ["EXEC", "MEMBER", "PNM", "ALUMNI"] as const;
export const EDITABLE_OFFICES = [
  "REGENT", "VICE_REGENT", "TREASURER", "SCRIBE", "MARSHAL",
  "CORRESPONDING_SECRETARY", "NEW_MEMBER_EDUCATOR",
] as const;

export const DEFAULT_PRESETS: Record<(typeof EDITABLE_ROLES)[number], string[]> = {
  EXEC: [
    "events.view", "events.create", "events.edit", "events.delete",
    "attendance.view", "attendance.take", "attendance.edit",
    "documents.view", "documents.upload", "documents.delete",
    "points.award", "points.deduct",
    "messaging.post", "messaging.moderate", "messaging.manageChannels",
    "committees.manage",
    "dues.manage", "finance.manage",
    "teams.manage",
    "feedback.view", "feedback.manage",
    "users.manage",
    "chapters.manageInvites", "membership.manageRelationships",
  ],
  MEMBER: ["events.view", "attendance.view", "documents.view", "messaging.post"],
  PNM: ["events.view", "documents.view", "messaging.post"],
  ALUMNI: ["events.view", "documents.view", "messaging.post"],
};

// Grants scoped to a named office rather than a role tier — e.g. spec §6's
// "default: Super Admin and Scribe" for role-number assignment is
// expressed here, not as an `office === "SCRIBE"` check in membership.routes.ts.
export const DEFAULT_OFFICE_PRESETS: Partial<Record<(typeof EDITABLE_OFFICES)[number], string[]>> = {
  SCRIBE: ["membership.assignRoleNumber"],
  // The Treasurer runs dues whether or not they hold the Exec role.
  TREASURER: ["dues.manage", "finance.manage"],
  // Chapter-wide announcements are narrower than Exec — only the two offices
  // that speak for the chapter. Mirrors src/permissions/permissions.ts.
  REGENT: ["messaging.announce"],
  VICE_REGENT: ["messaging.announce"],
};

/** Idempotent — safe to call on every boot/seed run, and safe to call
 * concurrently with itself (skipDuplicates). Called from prisma/seed.ts
 * (real deployments) and tests/helpers.ts (test fixtures) so both get the
 * same eager seeding instead of relying on GET /permissions' lazy path. */
export async function seedDefaultPermissions(prisma: PrismaClient): Promise<void> {
  const roleRows = EDITABLE_ROLES.flatMap((role) =>
    DEFAULT_PRESETS[role].map((permission) => ({ role, permission }))
  );
  const officeRows = (Object.entries(DEFAULT_OFFICE_PRESETS) as [(typeof EDITABLE_OFFICES)[number], string[]][]).flatMap(
    ([office, permissions]) => (permissions ?? []).map((permission) => ({ office, permission }))
  );
  await prisma.rolePermission.createMany({ data: roleRows, skipDuplicates: true });
  if (officeRows.length > 0) {
    await prisma.officePermission.createMany({ data: officeRows, skipDuplicates: true });
  }
}
