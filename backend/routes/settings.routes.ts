// backend/routes/settings.routes.ts
//
// Centralized chapter configuration (spec §6) — real-backend counterpart
// to mocks/api.ts getChapterSettings/updateChapterSettings. Singleton row,
// id always "default" (see schema.prisma ChapterSettings doc comment).
//
// Integration:
//   · rbac.ts → requireRole, AuthedRequest, writeAuditLog
//   · schema.prisma → ChapterSettings
//   · src/api/settings.ts on the mobile side — same request/response shapes

import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { AuthedRequest, requireRole, writeAuditLog } from "../middleware/rbac";

const router = Router();

const DEFAULTS = {
  id: "default",
  chapterName: "Chapter",
  chapterLetters: "",
  university: "",
  logoUrl: null as string | null,
  currentSemesterLabel: "Current Semester",
  semesterStartDate: new Date(),
  semesterEndDate: new Date(),
  defaultDuesAmount: 150,
  defaultDuesPlan: "FULL",
  attendanceLateThresholdMinutes: 15,
  defaultEventPointValue: 5,
};

// ── GET /settings ──────────────────────────────────────────────────────────
// Open to any authenticated user (read-only chapter info, not sensitive).
// Auto-creates the singleton row with sane defaults on first read so a
// fresh database doesn't need a manual seed step before the app works.
router.get(
  "/settings",
  asyncHandler(async (_req: AuthedRequest, res: Response) => {
    const settings = await prisma.chapterSettings.upsert({
      where: { id: "default" },
      update: {},
      create: DEFAULTS,
    });
    res.json({ settings });
  })
);

// ── PATCH /settings — Super Admin only ─────────────────────────────────────
const updateSchema = z.object({
  chapterName: z.string().min(1).max(200).optional(),
  chapterLetters: z.string().max(20).optional(),
  university: z.string().max(200).optional(),
  logoUrl: z.string().url().nullable().optional(),
  currentSemesterLabel: z.string().min(1).max(50).optional(),
  semesterStartDate: z.string().datetime().optional(),
  semesterEndDate: z.string().datetime().optional(),
  defaultDuesAmount: z.number().positive().optional(),
  defaultDuesPlan: z.enum(["FULL", "MONTHLY"]).optional(),
  attendanceLateThresholdMinutes: z.number().int().min(0).optional(),
  defaultEventPointValue: z.number().int().min(0).optional(),
});

router.patch(
  "/settings",
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { semesterStartDate, semesterEndDate, ...rest } = parsed.data;

    const before = await prisma.chapterSettings.findUnique({ where: { id: "default" } });

    const updated = await prisma.chapterSettings.upsert({
      where: { id: "default" },
      update: {
        ...rest,
        ...(semesterStartDate ? { semesterStartDate: new Date(semesterStartDate) } : {}),
        ...(semesterEndDate ? { semesterEndDate: new Date(semesterEndDate) } : {}),
      },
      create: {
        ...DEFAULTS,
        ...rest,
        ...(semesterStartDate ? { semesterStartDate: new Date(semesterStartDate) } : {}),
        ...(semesterEndDate ? { semesterEndDate: new Date(semesterEndDate) } : {}),
      },
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "CHAPTER_SETTINGS_UPDATE",
      entityType: "ChapterSettings",
      entityId: "default",
      before,
      after: parsed.data,
    });

    res.json({ settings: updated });
  })
);

export default router;
