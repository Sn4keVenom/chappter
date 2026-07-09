// backend/middleware/rbac.ts
//
// Server-side permission boundary. UI hides buttons for convenience;
// this is the actual authority. Every mutating route imports `requireRole`
// or `requireCommitteeScope` — never trust a client-sent role claim.

import { Request, Response, NextFunction } from "express";
import { UserRole, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

// Populated by an upstream auth middleware that verifies the Clerk/Firebase
// JWT and attaches the local User row (looked up by authProviderId), so role
// changes take effect immediately rather than waiting for token refresh.
export interface AuthedRequest extends Request {
  user?: {
    id: string;
    role: UserRole;
  };
}

const ROLE_RANK: Record<UserRole, number> = {
  PNM: 0,
  ALUMNI: 0,
  MEMBER: 0,
  EXEC: 1,
  SUPER_ADMIN: 2,
};

/** Require at least this base role. Use for chapter-wide actions (Exec+). */
export function requireRole(minRole: UserRole) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    if (ROLE_RANK[req.user.role] < ROLE_RANK[minRole]) {
      // No detail on what was required — avoid leaking authorization internals.
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
    if (ROLE_RANK[req.user.role] >= ROLE_RANK.EXEC) {
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
