// backend/routes/membership.routes.ts
//
// Big/Little assignment, role numbers, family lookup, and self-service
// profile editing (spec §6/§7/§9/§11). Family relationships resolve within
// ChapterMembership (not User) so Big/Little always stay within one
// chapter's roster — see schema.prisma's doc comment on that model.
//
// Integration:
//   · rbac.ts → requirePermission, AuthedRequest, writeAuditLog
//   · schema.prisma → ChapterMembership (bigMembershipId self-relation)

import { Router, Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { AuthedRequest, requirePermission, writeAuditLog } from "../middleware/rbac";

const router = Router();

function familyMemberSummary(m: {
  id: string;
  roleNumber: number | null;
  user: { id: string; firstName: string; lastName: string; avatarUrl: string | null };
}) {
  return {
    userId: m.user.id,
    firstName: m.user.firstName,
    lastName: m.user.lastName,
    avatarUrl: m.user.avatarUrl,
    roleNumber: m.roleNumber,
  };
}

// ── GET /users/:id/family — any authenticated viewer, same chapter only ───
// Not sensitive within a chapter — shown to any viewer on MemberProfileScreen,
// same as committee memberships already are. MUST still be scoped to the
// caller's own chapter: without a chapterId filter here, any authenticated
// user (from any chapter, or with no chapter at all) could look up any
// other user's family info across every chapter in the deployment — a
// cross-tenant leak once more than one chapter exists.
router.get(
  "/users/:id/family",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const chapterId = req.user!.chapterId;
    if (!chapterId) return res.status(403).json({ error: "Join a chapter first" });

    const membership = await prisma.chapterMembership.findUnique({
      where: { chapterId_userId: { chapterId, userId: req.params.id } },
      include: {
        big: { include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } } },
        littles: {
          include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
          orderBy: { joinedAt: "asc" },
        },
      },
    });
    if (!membership) return res.status(404).json({ error: "Member not found in your chapter" });

    res.json({
      big: membership.big ? familyMemberSummary(membership.big) : null,
      littles: membership.littles.map(familyMemberSummary),
    });
  })
);

// ── PATCH /users/:id/big ──────────────────────────────────────────────────
// Two authorization paths, checked after loading `target` (so self-service
// eligibility can depend on WHOSE relationship is being touched, not just
// who's asking) — an Exec+/manageRelationships admin can still do anything,
// exactly as before; everyone else can now manage their OWN Big/Little
// relationships without that permission, subject to one restriction: a PNM
// can add/remove their own Big (they can be a Little), but can't take on
// Littles themselves (add or release) — they have no one to pass initiation
// guidance to yet. Every other role can do both for themselves. This does
// NOT open up rearranging two OTHER people's relationship — that's still
// admin-only, unchanged from before.
const bigSchema = z.object({ bigUserId: z.string().nullable() });

router.patch(
  "/users/:id/big",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const parsed = bigSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const chapterId = req.user!.chapterId!;
    const target = await prisma.chapterMembership.findUnique({
      where: { chapterId_userId: { chapterId, userId: req.params.id } },
    });
    if (!target) return res.status(404).json({ error: "Member not found in your chapter" });

    const hasAdminPermission =
      req.user!.role === "SUPER_ADMIN" || !!req.user!.permissions?.has("membership.manageRelationships");
    const isEditingOwnBig = req.params.id === req.user!.id;
    // Claiming someone as one of MY littles (their new big := me), or
    // releasing one of my existing littles (their big := null, and I was
    // it) — both are "editing my littles," not "editing my big."
    const isClaimingAsMyLittle = parsed.data.bigUserId === req.user!.id;
    const isReleasingMyLittle =
      parsed.data.bigUserId === null && target.bigMembershipId === req.user!.membershipId;
    const canManageAsSelf =
      isEditingOwnBig ||
      ((isClaimingAsMyLittle || isReleasingMyLittle) && req.user!.role !== "PNM");

    if (!hasAdminPermission && !canManageAsSelf) {
      return res.status(403).json({ error: "Not permitted" });
    }

    if (parsed.data.bigUserId === null) {
      const updated = await prisma.chapterMembership.update({
        where: { id: target.id },
        data: { bigMembershipId: null },
      });
      await writeAuditLog({
        actorId: req.user!.id,
        action: "BIG_LITTLE_ASSIGNED",
        entityType: "ChapterMembership",
        entityId: target.id,
        before: { bigMembershipId: target.bigMembershipId },
        after: { bigMembershipId: null },
      });
      return res.json({ membership: updated });
    }

    const big = await prisma.chapterMembership.findUnique({
      where: { chapterId_userId: { chapterId, userId: parsed.data.bigUserId } },
    });
    if (!big) return res.status(404).json({ error: "Proposed Big not found in your chapter" });
    if (big.id === target.id) {
      return res.status(400).json({ error: "A member can't be their own Big" });
    }

    // Cycle guard: walk up the proposed Big's own lineage — if the target
    // shows up in it, assigning would create a loop (target → ... → target).
    // Bounded so a corrupt existing chain can't hang the request.
    let cursor: string | null = big.bigMembershipId;
    for (let hops = 0; cursor && hops < 50; hops++) {
      if (cursor === target.id) {
        return res.status(400).json({ error: "That assignment would create a Big/Little cycle" });
      }
      const next: { bigMembershipId: string | null } | null = await prisma.chapterMembership.findUnique({
        where: { id: cursor },
        select: { bigMembershipId: true },
      });
      cursor = next?.bigMembershipId ?? null;
    }

    const updated = await prisma.chapterMembership.update({
      where: { id: target.id },
      data: { bigMembershipId: big.id },
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "BIG_LITTLE_ASSIGNED",
      entityType: "ChapterMembership",
      entityId: target.id,
      before: { bigMembershipId: target.bigMembershipId },
      after: { bigMembershipId: big.id },
    });

    res.json({ membership: updated });
  })
);

// ── PATCH /users/:id/role-number ──────────────────────────────────────────
const roleNumberSchema = z.object({ roleNumber: z.number().int().positive().nullable() });

router.patch(
  "/users/:id/role-number",
  requirePermission("membership.assignRoleNumber"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const parsed = roleNumberSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const chapterId = req.user!.chapterId!;
    const target = await prisma.chapterMembership.findUnique({
      where: { chapterId_userId: { chapterId, userId: req.params.id } },
    });
    if (!target) return res.status(404).json({ error: "Member not found in your chapter" });

    if (parsed.data.roleNumber !== null && target.status === "PNM") {
      return res.status(400).json({
        error: "PNMs can't be assigned a role number until they're initiated — update status first",
      });
    }

    try {
      const updated = await prisma.chapterMembership.update({
        where: { id: target.id },
        data: { roleNumber: parsed.data.roleNumber },
      });

      await writeAuditLog({
        actorId: req.user!.id,
        action: "ROLE_NUMBER_ASSIGNED",
        entityType: "ChapterMembership",
        entityId: target.id,
        before: { roleNumber: target.roleNumber },
        after: { roleNumber: updated.roleNumber },
      });

      res.json({ membership: updated });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return res.status(409).json({ error: "That role number is already in use in this chapter" });
      }
      throw err;
    }
  })
);

// PATCH /users/me (self-service profile edit) used to live here. Moved to
// users.routes.ts, registered before its generic PATCH /users/:id — both
// routers mount under /api/v1, and Express matched requests to
// /api/v1/users/me against usersRouter's PATCH /users/:id FIRST (it's
// mounted earlier in server.ts, and ":id" happily binds to the literal
// string "me"), which requires SUPER_ADMIN and never reached this handler
// at all. Every non-admin editing major/graduation year/avatar got "Not
// permitted" — a route ordering bug, not a permissions bug. See
// users.routes.ts for the fix and the full handler.

export default router;
