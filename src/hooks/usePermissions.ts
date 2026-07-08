// src/hooks/usePermissions.ts
//
// Thin client-side mirror of the server RBAC table (spec §2.2). This exists
// ONLY to hide/disable UI affordances early so officers aren't shown dead
// buttons — the backend re-checks every one of these independently and is
// the real authorization boundary. Never add a permission here that isn't
// also enforced server-side.

import { useAuthStore } from "../store/useAuthStore";

interface ScopedEvent {
  committeeId?: string | null;
}

interface DelegatableEvent extends ScopedEvent {
  attendanceDelegates?: { userId: string }[];
}

export function usePermissions() {
  const user = useAuthStore((s) => s.user);

  const isSuperAdmin = !!user && user.role === "SUPER_ADMIN";
  const isExecOrAbove = !!user && (user.role === "EXEC" || user.role === "SUPER_ADMIN");
  const isOfficerOrAbove = !!user && (isExecOrAbove || user.role === "OFFICER");

  // Named exec-board positions (Feature set: points/attendance/finance).
  // These are ADDITIVE to the tier checks above, never subtractive — a
  // title holder gets access to their specific surface even in the (real
  // org) case where every titled officer is already EXEC-tier, and
  // SUPER_ADMIN always bypasses regardless of title.
  const isViceRegentOrAdmin = isSuperAdmin || user?.title === "VICE_REGENT";
  const isScribeOrAdmin = isSuperAdmin || user?.title === "SCRIBE";
  const isTreasurerOrAdmin = isSuperAdmin || user?.title === "TREASURER";

  /** Can this user manage (edit, check in attendees for) this specific event? */
  function canManageEvent(event: ScopedEvent): boolean {
    if (!user) return false;
    if (isExecOrAbove) return true;
    if (!isOfficerOrAbove) return false;
    if (!event.committeeId) return false; // chapter-wide events are Exec-managed only
    return user.committeeChairOf.includes(event.committeeId);
  }

  /**
   * Can this user run general attendance management (mark present / remove)
   * for ANY event, not just ones they created or chair? Scribe's whole job.
   * Additive to canManageEvent — never narrower than the existing check.
   */
  function canManageAttendance(event?: ScopedEvent): boolean {
    if (isScribeOrAdmin) return true;
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
    role: user?.role ?? null,
    title: user?.title ?? null,
    isOfficerOrAbove,
    isExecOrAbove,
    isSuperAdmin,
    isViceRegentOrAdmin,
    isScribeOrAdmin,
    isTreasurerOrAdmin,
    canManageEvent,
    canManageAttendance,
    canGenerateCheckIn,
    canViewAdminPanel: isOfficerOrAbove,
    canManageDues: isExecOrAbove,
    canViewAuditLog: isExecOrAbove,
  };
}
