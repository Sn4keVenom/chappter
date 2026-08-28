// src/permissions/permissions.ts
//
// Single source of truth for the permission system (product spec §3/§4).
// "Roles should simply be permission presets" — DEFAULT_ROLE_PRESETS below
// is exactly that: a starting Permission[] per UserRole. The *actual*
// current mapping is mutable (a Super Admin can edit it at runtime — see
// mocks/seed.ts `rolePermissions` and the PermissionsScreen), so both the
// client (hooks/usePermissions.ts, via store/usePermissionsStore.ts) and the
// mock server (mocks/api.ts) call hasPermission() against the CURRENT map,
// never the defaults directly, so they can never drift apart.
//
// Adding a new permission later: add the string to ALL_PERMISSIONS in
// types/index.ts, add a human label below, and decide which default
// presets include it. No other file needs to change — every screen that
// gates on it calls hasPermission(...) fresh.

import type { ExecOffice, Permission, UserRole } from "../types";
import { ALL_PERMISSIONS } from "../types";

// ── Role tier (Exec/Super Admin comparisons only — NOT used for granular
// feature gating, which always goes through hasPermission) ────────────────

const ROLE_RANK: Record<UserRole, number> = {
  PNM: 0,
  ALUMNI: 0,
  MEMBER: 1,
  EXEC: 2,
  SUPER_ADMIN: 3,
};

export function isExecOrAbove(role: UserRole | null | undefined): boolean {
  return !!role && ROLE_RANK[role] >= ROLE_RANK.EXEC;
}

export function isSuperAdmin(role: UserRole | null | undefined): boolean {
  return role === "SUPER_ADMIN";
}

// ── Default permission presets per role ───────────────────────────────────
// SUPER_ADMIN isn't listed here on purpose — see hasPermission() below,
// which hard-codes an unconditional bypass for it so a misconfigured
// preset can never lock the true admin out (spec §4: "bypass all
// permission restrictions").

export const DEFAULT_ROLE_PRESETS: Record<Exclude<UserRole, "SUPER_ADMIN">, Permission[]> = {
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
  MEMBER: [
    "events.view",
    "attendance.view",
    "documents.view",
    "messaging.post",
  ],
  PNM: [
    "events.view",
    "documents.view",
    "messaging.post",
  ],
  ALUMNI: [
    "events.view",
    "documents.view",
    "messaging.post",
  ],
};

export function defaultRolePermissions(): Record<UserRole, Permission[]> {
  return {
    SUPER_ADMIN: [...ALL_PERMISSIONS],
    EXEC: [...DEFAULT_ROLE_PRESETS.EXEC],
    MEMBER: [...DEFAULT_ROLE_PRESETS.MEMBER],
    PNM: [...DEFAULT_ROLE_PRESETS.PNM],
    ALUMNI: [...DEFAULT_ROLE_PRESETS.ALUMNI],
  };
}

// ── Default permission grants per named office ────────────────────────────
// Separate from role presets — a grant here applies regardless of the
// holder's role tier (spec §11: "default: Super Admin and Scribe" for role
// numbers, expressed as data here rather than an `office === "SCRIBE"`
// check wherever role numbers are assigned). SUPER_ADMIN's unconditional
// bypass in hasPermission() below means it never needs an entry here either.

export const DEFAULT_OFFICE_PRESETS: Partial<Record<ExecOffice, Permission[]>> = {
  SCRIBE: ["membership.assignRoleNumber"],
  // The Treasurer runs dues whether or not they hold the Exec role.
  TREASURER: ["dues.manage", "finance.manage"],
  // Announcing to the whole chapter (a pinned message in #general, which the
  // home dashboard surfaces) is deliberately narrower than Exec: the two
  // offices that speak for the chapter, not every board member.
  REGENT: ["messaging.announce", "achievements.manage"],
  VICE_REGENT: ["messaging.announce", "achievements.manage"],
};

export function defaultOfficePermissions(): Partial<Record<ExecOffice, Permission[]>> {
  // Deep-copied generically rather than key-by-key — the previous hand-written
  // form silently dropped every office added to DEFAULT_OFFICE_PRESETS after
  // SCRIBE, which is exactly the bug that would have hidden the two above.
  return Object.fromEntries(
    Object.entries(DEFAULT_OFFICE_PRESETS).map(([office, permissions]) => [office, [...(permissions ?? [])]])
  ) as Partial<Record<ExecOffice, Permission[]>>;
}

// ── The check every screen/mock-endpoint should call ──────────────────────
// officePresets is optional so existing call sites that don't pass one
// (nothing granted by office) keep working unchanged.

export function hasPermission(
  role: UserRole | null | undefined,
  currentPresets: Record<UserRole, Permission[]>,
  permission: Permission,
  office?: ExecOffice | null,
  officePresets?: Partial<Record<ExecOffice, Permission[]>>
): boolean {
  if (!role) return false;
  if (role === "SUPER_ADMIN") return true; // unconditional bypass, spec §4
  if ((currentPresets[role] ?? []).includes(permission)) return true;
  if (office && officePresets?.[office]?.includes(permission)) return true;
  return false;
}

// ── Scoped "management access" helper ──────────────────────────────────────
// Committees/events can be managed either by Exec+ (global) or by the
// specific committee's chair (scoped) — a chair's authority never depends
// on their global role/permission preset, only on (a) actually chairing
// that committee and (b) being an ACTIVE member (PNMs/Alumni/Inactive
// members can't chair in practice). This is intentionally separate from
// the permission-preset system: it's data-driven scoping, not a global
// grant, exactly like it was before this system existed (see
// usePermissions.canManageEvent) — just re-expressed without the removed
// OFFICER role tier.

export function hasScopedManagementAccess(params: {
  role: UserRole | null | undefined;
  status: string | null | undefined;
  committeeChairOf: string[];
  committeeId?: string | null;
}): boolean {
  if (isExecOrAbove(params.role)) return true;
  if (params.status !== "ACTIVE") return false;
  if (!params.committeeId) return false;
  return params.committeeChairOf.includes(params.committeeId);
}

/** True if this user chairs at least one committee (any), used for broad
 * "does this person have some management responsibility" checks like admin
 * panel visibility — narrower checks should pass committeeId to
 * hasScopedManagementAccess instead. */
export function hasAnyManagementAccess(params: {
  role: UserRole | null | undefined;
  status: string | null | undefined;
  committeeChairOf: string[];
}): boolean {
  if (isExecOrAbove(params.role)) return true;
  return params.status === "ACTIVE" && params.committeeChairOf.length > 0;
}

// ── Presentation metadata for the Super Admin permissions editor ─────────

export const PERMISSION_LABELS: Record<Permission, string> = {
  "events.view": "View events",
  "events.create": "Create events",
  "events.edit": "Edit events",
  "events.delete": "Delete events",
  "attendance.view": "View attendance",
  "attendance.take": "Take attendance (check-in)",
  "attendance.edit": "Edit / override attendance",
  "documents.view": "View documents",
  "documents.upload": "Upload documents",
  "documents.delete": "Delete documents",
  "points.award": "Award points",
  "points.deduct": "Deduct points",
  "messaging.post": "Post messages",
  "messaging.moderate": "Moderate messages (pin/delete others')",
  "messaging.manageChannels": "Create & archive channels",
  "messaging.announce": "Post chapter announcements",
  "achievements.manage": "Customize achievement badges",
  "committees.manage": "Manage committees",
  "dues.manage": "Manage dues",
  "finance.manage": "Manage committee budgets & reimbursements",
  "teams.manage": "Manage teams",
  "feedback.view": "View feedback submissions",
  "feedback.manage": "Manage feedback (update status)",
  "users.manage": "Manage users (roles, offices, status)",
  "settings.manage": "Manage chapter settings",
  "modules.manage": "Enable/disable modules",
  "permissions.manage": "Modify role permissions",
  "chapters.manage": "Manage chapter identity",
  "chapters.manageInvites": "Manage invite codes/links & join requests",
  "membership.assignRoleNumber": "Assign role numbers",
  "membership.manageRelationships": "Assign Big/Little",
};

export const PERMISSION_GROUPS: { label: string; permissions: Permission[] }[] = [
  { label: "Events", permissions: ["events.view", "events.create", "events.edit", "events.delete"] },
  { label: "Attendance", permissions: ["attendance.view", "attendance.take", "attendance.edit"] },
  { label: "Documents", permissions: ["documents.view", "documents.upload", "documents.delete"] },
  { label: "Points", permissions: ["points.award", "points.deduct"] },
  { label: "Messaging", permissions: ["messaging.post", "messaging.moderate"] },
  { label: "Committees", permissions: ["committees.manage"] },
  { label: "Finance", permissions: ["dues.manage", "finance.manage"] },
  { label: "Teams", permissions: ["teams.manage"] },
  { label: "Feedback", permissions: ["feedback.view", "feedback.manage"] },
  { label: "Membership", permissions: ["membership.assignRoleNumber", "membership.manageRelationships"] },
  { label: "Chapter Administration", permissions: ["users.manage", "settings.manage", "modules.manage", "permissions.manage", "chapters.manage", "chapters.manageInvites"] },
];

export const ASSIGNABLE_ROLES: UserRole[] = ["SUPER_ADMIN", "EXEC", "MEMBER", "PNM", "ALUMNI"];
export const EDITABLE_PRESET_ROLES: UserRole[] = ["EXEC", "MEMBER", "PNM", "ALUMNI"];
