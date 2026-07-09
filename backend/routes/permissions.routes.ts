// backend/routes/permissions.routes.ts
//
// "Roles should simply be permission presets" (spec §3) — real-backend
// counterpart to mocks/api.ts getRolePermissions/updateRolePermissions.
//
// IMPORTANT — read docs/PERMISSIONS.md before assuming this does more than
// it does: this route persists the RolePermission table (so the
// Permissions screen has somewhere real to read/write), but NOTHING else
// in this backend consults it for authorization yet. Every other route
// still gates on the flat role tier (rbac.ts requireRole/isAtLeast). Fully
// wiring requirePermission() to read this table is the single largest
// remaining gap between the mock (which fully implements the granular
// system) and the real backend — tracked, not done here.
//
// Integration:
//   · rbac.ts → requireRole, AuthedRequest, writeAuditLog
//   · schema.prisma → RolePermission
//   · src/api/permissions.ts on the mobile side — same request/response shapes

import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { AuthedRequest, requireRole, writeAuditLog } from "../middleware/rbac";

const router = Router();

const EDITABLE_ROLES = ["EXEC", "MEMBER", "PNM", "ALUMNI"] as const;

// Mirrors src/permissions/permissions.ts DEFAULT_ROLE_PRESETS — kept in
// sync by hand since there's no shared package between mobile and backend.
const DEFAULT_PRESETS: Record<(typeof EDITABLE_ROLES)[number], string[]> = {
  EXEC: [
    "events.view", "events.create", "events.edit", "events.delete",
    "attendance.view", "attendance.take", "attendance.edit",
    "documents.view", "documents.upload", "documents.delete",
    "points.award", "points.deduct",
    "messaging.post", "messaging.moderate",
    "committees.manage",
    "dues.manage", "finance.manage",
    "teams.manage",
    "feedback.view", "feedback.manage",
    "users.manage",
  ],
  MEMBER: ["events.view", "attendance.view", "documents.view", "messaging.post"],
  PNM: ["events.view", "documents.view", "messaging.post"],
  ALUMNI: ["events.view", "documents.view", "messaging.post"],
};

// ── GET /permissions ─────────────────────────────────────────────────────────
// Open to any authenticated user — this is metadata every client needs to
// gate its own UI correctly, not sensitive data (matches mocks/api.ts
// getRolePermissions reasoning). Auto-seeds defaults on first read.
router.get(
  "/permissions",
  asyncHandler(async (_req: AuthedRequest, res: Response) => {
    const existing = await prisma.rolePermission.findMany();
    if (existing.length === 0) {
      const seedRows = EDITABLE_ROLES.flatMap((role) =>
        DEFAULT_PRESETS[role].map((permission) => ({ role, permission }))
      );
      await prisma.rolePermission.createMany({ data: seedRows, skipDuplicates: true });
    }

    const rows = await prisma.rolePermission.findMany();
    const roles = EDITABLE_ROLES.map((role) => ({
      role,
      permissions: rows.filter((r) => r.role === role).map((r) => r.permission),
    }));
    res.json({ roles });
  })
);

// ── PATCH /permissions/:role — Super Admin only ─────────────────────────────
// Replaces the full permission list for a role. SUPER_ADMIN can't be
// edited — it always bypasses every check (see the mobile permission
// engine's hasPermission()), so it can never be misconfigured into a
// lockout.
const updateSchema = z.object({
  permissions: z.array(z.string().min(1).max(60)).max(100),
});

router.patch(
  "/permissions/:role",
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const roleParam = req.params.role;
    if (!EDITABLE_ROLES.includes(roleParam as (typeof EDITABLE_ROLES)[number])) {
      return res.status(400).json({
        error: roleParam === "SUPER_ADMIN"
          ? "Super Admin permissions can't be edited — always unrestricted"
          : "Unknown role",
      });
    }
    const role = roleParam as (typeof EDITABLE_ROLES)[number];

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { role } }),
      prisma.rolePermission.createMany({
        data: parsed.data.permissions.map((permission) => ({ role, permission })),
        skipDuplicates: true,
      }),
    ]);

    await writeAuditLog({
      actorId: req.user!.id,
      action: "ROLE_PERMISSIONS_UPDATE",
      entityType: "RolePermission",
      entityId: role,
      after: { role, permissions: parsed.data.permissions },
    });

    res.json({ role: { role, permissions: parsed.data.permissions } });
  })
);

export default router;
