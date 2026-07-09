// src/hooks/usePermissions.ts
//
// Thin client-side mirror of the server RBAC table (spec §3). This exists
// ONLY to hide/disable UI affordances early so members aren't shown dead
// buttons — the backend re-checks every one of these independently and is
// the real authorization boundary. Never add a permission here that isn't
// also enforced server-side (see mocks/api.ts, which imports the same
// permissions/permissions.ts engine).
//
// `can(permission)` is the general-purpose check new code should use.
// The named booleans below it (isExecOrAbove, canManageEvent, etc.) exist
// for the screens written before the granular permission system existed —
// they're now DERIVED from `can(...)` / the shared engine instead of raw
// role-tier comparisons, so behavior is unchanged but the underlying model
// is real permissions, not hardcoded role checks.

import { useAuthStore } from "../store/useAuthStore";
import { usePermissionsStore } from "../store/usePermissionsStore";
import { useOfficePermissionsStore } from "../store/useOfficePermissionsStore";
import {
  hasPermission,
  isExecOrAbove as isExecOrAboveOf,
  isSuperAdmin as isSuperAdminOf,
  hasAnyManagementAccess,
  hasScopedManagementAccess,
} from "../permissions/permissions";
import type { Permission } from "../types";

interface ScopedEvent {
  committeeId?: string | null;
}

interface DelegatableEvent extends ScopedEvent {
  attendanceDelegates?: { userId: string }[];
}

export function usePermissions() {
  const user = useAuthStore((s) => s.user);
  const presets = usePermissionsStore((s) => s.presets);
  const officePresets = useOfficePermissionsStore((s) => s.presets);

  const role = user?.role ?? null;
  const office = user?.office ?? null;

  const isSuperAdmin = isSuperAdminOf(role);
  const isExecOrAbove = isExecOrAboveOf(role);

  // Broad "has some management responsibility" signal — Exec+ or an ACTIVE
  // member who chairs at least one committee. Replaces the removed OFFICER
  // role tier (committee chairs used to literally hold that role; now
  // chairing is tracked via committeeChairOf, independent of role).
  const isOfficerOrAbove = hasAnyManagementAccess({
    role,
    status: user?.status ?? null,
    committeeChairOf: user?.committeeChairOf ?? [],
  });

  // Named exec-board offices — ADDITIVE to the permission checks below,
  // never subtractive. SUPER_ADMIN always bypasses regardless of office.
  const isViceRegentOrAdmin = isSuperAdmin || office === "VICE_REGENT";
  const isScribeOrAdmin = isSuperAdmin || office === "SCRIBE";
  const isTreasurerOrAdmin = isSuperAdmin || office === "TREASURER";

  /** General-purpose granular permission check — use this for any new code. */
  function can(permission: Permission): boolean {
    return hasPermission(role, presets, permission, office, officePresets);
  }

  /** Can this user manage (edit, check in attendees for) this specific event? */
  function canManageEvent(event: ScopedEvent): boolean {
    if (!user) return false;
    if (can("events.edit")) return true;
    return hasScopedManagementAccess({
      role,
      status: user.status,
      committeeChairOf: user.committeeChairOf,
      committeeId: event.committeeId,
    });
  }

  /**
   * Can this user run general attendance management (mark present / remove)
   * for ANY event, not just ones they created or chair? Scribe's whole job.
   * Additive to canManageEvent — never narrower than the existing check.
   */
  function canManageAttendance(event?: ScopedEvent): boolean {
    if (isScribeOrAdmin || can("attendance.edit")) return true;
    return !!event && canManageEvent(event);
  }

  /**
   * Can this user generate/display THIS event's rotating check-in code?
   * Narrower and more delegable than canManageAttendance — an event
   * creator/chair who can't personally attend can delegate just this to
   * another member (Feature 3), without granting them Scribe-wide access.
   */
  function canGenerateCheckIn(event: DelegatableEvent): boolean {
    if (canManageAttendance(event)) return true;
    if (!user) return false;
    return (event.attendanceDelegates ?? []).some((d) => d.userId === user.id);
  }

  return {
    role,
    office,
    isOfficerOrAbove,
    isExecOrAbove,
    isSuperAdmin,
    isViceRegentOrAdmin,
    isScribeOrAdmin,
    isTreasurerOrAdmin,
    can,
    canManageEvent,
    canManageAttendance,
    canGenerateCheckIn,
    canViewAdminPanel: isOfficerOrAbove,
  };
}
