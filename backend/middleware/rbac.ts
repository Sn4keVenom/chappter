// backend/middleware/rbac.ts
//
// Server-side permission boundary. UI hides buttons for convenience;
// this is the actual authority. Every mutating route imports `requireRole`
// or `requireCommitteeScope` — never trust a client-sent role claim.

import { Request, Response, NextFunction } from "express";
import { UserRole, ExecOffice, MemberStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

// Populated by an upstream auth middleware that verifies the Clerk/Firebase
// JWT, loads the local User row, and resolves their active ChapterMembership
// (role/office/status/permissions now live there, not on User — see
// schema.prisma's Chapter/ChapterMembership doc comment). All membership
// fields are optional: a user who hasn't joined a chapter yet is still
// authenticated (req.user.id is always set) but has none of them, and every
// requireRole/requirePermission check below correctly denies rather than
// throwing in that case.
export interface AuthedRequest extends Request {
  user?: {
    id: string;
    chapterId?: string;
    membershipId?: string;
    role?: UserRole;
    office?: ExecOffice;
    status?: MemberStatus;
    // Union of RolePermission (by role) + OfficePermission (by office) grants
    // for this request's membership — computed once in middleware/auth.ts so
    // requirePermission() below is a cheap in-memory check, not a query per
    // route. Empty (not undefined) when there's a membership with no grants;
    // undefined only when there's no membership at all.
    permissions?: Set<string>;
  };
}

// Single source of truth for role tiering — every route file that needs a
// rank comparison (messages.routes.ts channel gating, events.routes.ts draft
// visibility, etc.) imports `isAtLeast`/`ROLE_RANK` from here instead of
// keeping its own copy. A previous audit found a route with a stale local
// copy still keyed on the removed "OFFICER" role, which silently broke
// (falls through to `undefined`, not a thrown error) for PNM/ALUMNI users —
// exactly the failure mode a single shared table prevents.
export const ROLE_RANK: Record<UserRole, number> = {
  PNM: 0,
  ALUMNI: 0,
  MEMBER: 0,
  EXEC: 1,
  SUPER_ADMIN: 2,
};

/** True if `role` is at least `minRole` in the tier above. A missing role
 * (no chapter membership yet) is never at least anything. */
export function isAtLeast(role: UserRole | undefined, minRole: UserRole): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}

/** Require at least this base role. Use for chapter-wide actions (Exec+). */
export function requireRole(minRole: UserRole) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    if (!isAtLeast(req.user.role, minRole)) {
      // No detail on what was required — avoid leaking authorization internals.
      return res.status(403).json({ error: "Not permitted" });
    }
    next();
  };
}

/**
 * Require a specific granular permission (RolePermission ∪ OfficePermission
 * for the caller's active membership — see middleware/auth.ts, which
 * resolves and attaches req.user.permissions once per request). SUPER_ADMIN
 * unconditionally bypasses, mirroring the mobile permission engine's
 * hasPermission() and RolePermission's own doc comment (it intentionally
 * has no SUPER_ADMIN rows to query).
 *
 * Use this — not requireRole — for the newer chapter/membership/invite
 * routes, which were built to be genuinely data-driven per spec §11 rather
 * than hardcoded to a role tier. Existing routes still on requireRole are a
 * separate, pre-existing gap (see docs/PERMISSIONS.md) this doesn't retrofit.
 */
export function requirePermission(permission: string) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    if (req.user.role === "SUPER_ADMIN") {
      return next();
    }
    if (!req.user.permissions?.has(permission)) {
      return res.status(403).json({ error: "Not permitted" });
    }
    next();
  };
}

/**
 * Require Officer-level access scoped to a specific committee, OR Exec+
 * globally. Looks up CommitteeMembership so a MEMBER who chairs a committee
 * gets write access only inside that committee's resources.
 */
export function requireCommitteeScope(
  getCommitteeId: (req: AuthedRequest) => Promise<string | null>
) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    if (isAtLeast(req.user.role, "EXEC")) {
      return next();
    }

    const committeeId = await getCommitteeId(req);
    if (!committeeId) {
      return res.status(403).json({ error: "Not permitted" });
    }

    const membership = await prisma.committeeMembership.findUnique({
      where: { committeeId_userId: { committeeId, userId: req.user.id } },
    });

    if (!membership || membership.role !== "CHAIR") {
      return res.status(403).json({ error: "Not permitted" });
    }

    next();
  };
}

// A Prisma transaction client has the same shape as the regular client.
// We accept it as an optional parameter so callers inside a $transaction
// block can pass `tx` — keeping the audit row in the same transaction as
// the mutation it logs. Outside transactions, pass nothing and the module-
// level singleton is used (existing behaviour, acceptable for read-only
// operations like ROLE_CHANGE that don't need strict atomicity with the
// audit row).
type TxClient = Omit<
  Prisma.TransactionClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/**
 * Writes one AuditLog row.
 *
 * For mutations that run inside prisma.$transaction(), pass the `tx` client:
 *   await prisma.$transaction(async (tx) => {
 *     await tx.attendance.create(...);
 *     await writeAuditLog({ ..., tx });
 *   });
 *
 * For mutations that don't use a transaction, omit `tx`:
 *   await prisma.user.update(...);
 *   await writeAuditLog({ ... });         // uses the singleton
 */
export async function writeAuditLog(params: {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  tx?: TxClient;
}): Promise<void> {
  const db = params.tx ?? prisma;
  await db.auditLog.create({
    data: {
      actorId: params.actorId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      before: params.before as any,
      after: params.after as any,
    },
  });
}
