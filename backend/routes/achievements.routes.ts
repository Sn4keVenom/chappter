// backend/routes/achievements.routes.ts
//
// Chapter-customizable achievement badges. The evaluation still happens
// client-side against data the profile already fetches (see
// src/utils/achievements.ts) — what moved to the server is the DEFINITIONS:
// which badges exist, what they're called, and what threshold earns them.
//
// Reading is open to every member (their own profile renders them); editing
// is `achievements.manage`, granted by office to Regent and Vice Regent
// rather than to Exec at large, with Super Admin bypassing as always.

import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { AuthedRequest, requirePermission, writeAuditLog } from "../middleware/rbac";
import { seedDefaultAchievements } from "../lib/achievementDefaults";

const router = Router();

const METRICS = [
  "ATTENDANCE_COUNT",
  "TOTAL_POINTS",
  "BONUS_COUNT",
  "COMMITTEE_COUNT",
  "RANK_AT_MOST",
  "NEVER_LATE_AFTER",
  "DUES_SETTLED",
] as const;

// ── GET /achievements ─────────────────────────────────────────────────────
// Any member. Seeds the defaults on first read so a chapter that predates
// this feature (or was created before it) gets the original eight badges
// without a migration backfill or a manual step.
router.get(
  "/achievements",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const chapterId = req.user!.chapterId;
    if (!chapterId) return res.json({ achievements: [] });

    await seedDefaultAchievements(prisma, chapterId);

    const achievements = await prisma.achievement.findMany({
      where: { chapterId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    res.json({ achievements });
  })
);

const achievementSchema = z.object({
  label: z.string().min(1).max(60),
  description: z.string().min(1).max(200),
  icon: z.string().min(1).max(8),
  metric: z.enum(METRICS),
  threshold: z.number().int().min(0).max(100_000),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});

// ── POST /achievements ────────────────────────────────────────────────────
router.post(
  "/achievements",
  requirePermission("achievements.manage"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const parsed = achievementSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const achievement = await prisma.achievement.create({
      // key stays null: it identifies the shipped defaults so reset can match
      // them, and a chapter's own badge isn't one of those.
      data: { ...parsed.data, chapterId: req.user!.chapterId! },
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "ACHIEVEMENT_CREATE",
      entityType: "Achievement",
      entityId: achievement.id,
      after: parsed.data,
    });

    res.status(201).json({ achievement });
  })
);

// ── PATCH /achievements/:id ───────────────────────────────────────────────
router.patch(
  "/achievements/:id",
  requirePermission("achievements.manage"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const parsed = achievementSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    // Scoped to the caller's own chapter — an :id alone would otherwise let
    // one chapter's Regent retune another chapter's badges.
    const before = await prisma.achievement.findFirst({
      where: { id: req.params.id, chapterId: req.user!.chapterId! },
    });
    if (!before) return res.status(404).json({ error: "Achievement not found" });

    const achievement = await prisma.achievement.update({
      where: { id: before.id },
      data: parsed.data,
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "ACHIEVEMENT_UPDATE",
      entityType: "Achievement",
      entityId: achievement.id,
      before: { label: before.label, metric: before.metric, threshold: before.threshold },
      after: parsed.data,
    });

    res.json({ achievement });
  })
);

// ── DELETE /achievements/:id ──────────────────────────────────────────────
// A real delete for chapter-invented badges. A shipped default is DISABLED
// instead, not removed: reset re-creates it anyway, and hiding it keeps the
// distinction between "we don't use this" and "this never existed".
router.delete(
  "/achievements/:id",
  requirePermission("achievements.manage"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const existing = await prisma.achievement.findFirst({
      where: { id: req.params.id, chapterId: req.user!.chapterId! },
    });
    if (!existing) return res.status(404).json({ error: "Achievement not found" });

    if (existing.key) {
      const disabled = await prisma.achievement.update({
        where: { id: existing.id },
        data: { enabled: false },
      });
      return res.json({ achievement: disabled, disabled: true });
    }

    await prisma.achievement.delete({ where: { id: existing.id } });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "ACHIEVEMENT_DELETE",
      entityType: "Achievement",
      entityId: existing.id,
      before: { label: existing.label },
    });

    res.json({ deleted: true });
  })
);

// ── POST /achievements/reset ──────────────────────────────────────────────
// Back to the shipped eight: chapter-invented badges are removed and the
// defaults restored to their original labels, icons and thresholds.
router.post(
  "/achievements/reset",
  requirePermission("achievements.manage"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const chapterId = req.user!.chapterId!;

    await prisma.$transaction(async (tx) => {
      // Clearing everything and re-seeding is simpler than diffing, and
      // "reset" genuinely means "discard local changes".
      await tx.achievement.deleteMany({ where: { chapterId } });
    });
    await seedDefaultAchievements(prisma, chapterId);

    await writeAuditLog({
      actorId: req.user!.id,
      action: "ACHIEVEMENTS_RESET",
      entityType: "Chapter",
      entityId: chapterId,
    });

    const achievements = await prisma.achievement.findMany({
      where: { chapterId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    res.json({ achievements });
  })
);

export default router;
