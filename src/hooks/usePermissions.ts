// src/hooks/usePermissions.ts
//
// Thin client-side mirror of the server RBAC table (spec §2.2). This exists
// ONLY to hide/disable UI affordances early so officers aren't shown dead
// buttons — the backend re-checks every one of these independently and is
// the real authorization boundary. Never add a permission here that isn't
// also enforced server-side.

import { useAuthStore } from "../store/useAuthStore";

interface ScopedEvent {
  committeeId: string | null;
}

export function usePermissions() {
  const user = useAuthStore((s) => s.user);

  const isExecOrAbove = !!user && (user.role === "EXEC" || user.role === "SUPER_ADMIN");
  const isOfficerOrAbove = !!user && (isExecOrAbove || user.role === "OFFICER");

  /** Can this user manage (edit, check in attendees for) this specific event? */
  function canManageEvent(event: ScopedEvent): boolean {
    if (!user) return false;
    if (isExecOrAbove) return true;
    if (!isOfficerOrAbove) return false;
    if (!event.committeeId) return false; // chapter-wide events are Exec-managed only
    return user.committeeChairOf.includes(event.committeeId);
  }

  return {
    role: user?.role ?? null,
    isOfficerOrAbove,
    isExecOrAbove,
    canManageEvent,
    canViewAdminPanel: isOfficerOrAbove,
    canManageDues: isExecOrAbove,
    canViewAuditLog: isExecOrAbove,
  };
}
