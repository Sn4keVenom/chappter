// backend/routes/auditlog.routes.ts
//
// Read access for the AuditLog table — every mutating route in this
// backend already writes to it via writeAuditLog() (rbac.ts), but until
// now nothing ever read it back; the mobile AuditLogScreen was a literal
// NotImplementedScreen stub for exactly that reason. This is the missing
// half: "basic audit logging infrastructure" isn't useful if the log can
// never actually be reviewed.
//
// Super Admin only — this is a chapter's full privileged-action history
// (role changes, role-number/Big-Little assignments, permission edits,
// chapter settings changes, invite/join-request decisions, the new
// soft-delete-via-webhook event, etc.), not something to expose more
// broadly.
//
// Integration:
//   · rbac.ts → requireRole, AuthedRequest
//   · schema.prisma → AuditLog (actorId → User, so we can resolve a name)

import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { AuthedRequest, requireRole } from "../middleware/rbac";

const router = Router();

// ── GET /audit-log ─────────────────────────────────────────────────────────
// Paginated, newest first. Optional filters: entityType, actorId. There's
// no chapterId column on AuditLog (it predates the chapter/membership
// system and logs actions across whatever the actor could reach) — in a
// single-chapter deployment this is moot; a genuinely multi-chapter
// deployment scoping this list is a follow-on, not implemented here (see
// the account-system implementation plan's scope line on this same
// single-chapter-per-deployment assumption for other tables).
router.get(
  "/audit-log",
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const { entityType, actorId, page = "1", limit = "50" } = req.query;
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));
    const skip = (pageNum - 1) * limitNum;

    const where = {
      ...(entityType ? { entityType: String(entityType) } : {}),
      ...(actorId ? { actorId: String(actorId) } : {}),
    };

    const [entries, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limitNum,
        include: { actor: { select: { id: true, firstName: true, lastName: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({
      entries: entries.map((e) => ({
        id: e.id,
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId,
        before: e.before,
        after: e.after,
        createdAt: e.createdAt,
        actor: { id: e.actor.id, firstName: e.actor.firstName, lastName: e.actor.lastName },
      })),
      total,
      page: pageNum,
      limit: limitNum,
    });
  })
);

export default router;
