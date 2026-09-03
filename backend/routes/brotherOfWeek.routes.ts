// backend/routes/brotherOfWeek.routes.ts
//
// "Would be nice for a brother of the week tag. This will be awarded by the
// super admin, regent, or any member with the brother of the week tag.
// There should only be one person with brother of the week, so once it is
// awarded, it is removed from the previous person."
//
// Exactly one holder at a time, or none — Chapter.brotherOfWeekUserId is a
// single nullable FK (schema.prisma), so reassigning it to someone new IS
// "remove it from the previous person," atomically, with no separate step.
// No history table: the spec only asked that award/revoke work, not that
// past holders be tracked anywhere.
//
// Who can award it is deliberately NOT the standard permission-only check:
// the CURRENT holder can pass the title on themselves (spec: "or any
// member with the tag"), which brotherOfWeek.award alone can't express
// since it's data-dependent, not role/office-based — same shape as
// requireCommitteeScope checking "or the chair of THIS committee" on top
// of a flat permission.

import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { AuthedRequest, writeAuditLog } from "../middleware/rbac";

const router = Router();

const holderSelect = { id: true, firstName: true, lastName: true, avatarUrl: true } as const;

router.get(
  "/brother-of-week",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const chapter = await prisma.chapter.findUnique({
      where: { id: req.user!.chapterId! },
      include: { brotherOfWeek: { select: holderSelect } },
    });
    res.json({ user: chapter?.brotherOfWeek ?? null });
  })
);

const awardSchema = z.object({ userId: z.string().min(1) });

router.post(
  "/brother-of-week",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const parsed = awardSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const chapterId = req.user!.chapterId!;
    const chapter = await prisma.chapter.findUnique({ where: { id: chapterId } });
    if (!chapter) return res.status(404).json({ error: "Chapter not found" });

    const isCurrentHolder = chapter.brotherOfWeekUserId === req.user!.id;
    const allowed = req.user!.role === "SUPER_ADMIN" || req.user!.permissions?.has("brotherOfWeek.award") || isCurrentHolder;
    if (!allowed) {
      return res.status(403).json({ error: "Only Super Admin, Regent/Vice Regent, or the current holder can award this." });
    }

    const target = await prisma.chapterMembership.findUnique({
      where: { chapterId_userId: { chapterId, userId: parsed.data.userId } },
    });
    if (!target) return res.status(404).json({ error: "That person isn't in your chapter" });

    const before = chapter.brotherOfWeekUserId;
    const updated = await prisma.chapter.update({
      where: { id: chapterId },
      data: { brotherOfWeekUserId: parsed.data.userId },
      include: { brotherOfWeek: { select: holderSelect } },
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "BROTHER_OF_WEEK_AWARD",
      entityType: "Chapter",
      entityId: chapterId,
      before: { brotherOfWeekUserId: before },
      after: { brotherOfWeekUserId: parsed.data.userId },
    });

    res.json({ user: updated.brotherOfWeek });
  })
);

router.delete(
  "/brother-of-week",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const chapterId = req.user!.chapterId!;
    const chapter = await prisma.chapter.findUnique({ where: { id: chapterId } });
    if (!chapter) return res.status(404).json({ error: "Chapter not found" });

    const isCurrentHolder = chapter.brotherOfWeekUserId === req.user!.id;
    const allowed = req.user!.role === "SUPER_ADMIN" || req.user!.permissions?.has("brotherOfWeek.award") || isCurrentHolder;
    if (!allowed) {
      return res.status(403).json({ error: "Only Super Admin, Regent/Vice Regent, or the current holder can clear this." });
    }

    await prisma.chapter.update({ where: { id: chapterId }, data: { brotherOfWeekUserId: null } });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "BROTHER_OF_WEEK_CLEAR",
      entityType: "Chapter",
      entityId: chapterId,
      before: { brotherOfWeekUserId: chapter.brotherOfWeekUserId },
    });

    res.json({ user: null });
  })
);

export default router;
