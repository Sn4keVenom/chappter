// backend/routes/settings.routes.ts
//
// Centralized chapter configuration (spec §6) — real-backend counterpart
// to mocks/api.ts getChapterSettings/updateChapterSettings. Scoped to the
// caller's own chapter (req.user.chapterId) — one ChapterSettings row per
// Chapter now, not a hardcoded "default" singleton (see schema.prisma
// Chapter/ChapterSettings doc comments). Chapter's own identity fields
// (name/letters/university/logoUrl) live on Chapter itself; this route
// flattens them onto the same "settings" response shape as before so the
// mobile client (src/api/settings.ts, ChapterSettingsScreen.tsx) needs no
// changes.
//
// Integration:
//   · rbac.ts → requireRole, AuthedRequest, writeAuditLog
//   · schema.prisma → Chapter, ChapterSettings

import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { AuthedRequest, requireRole, writeAuditLog } from "../middleware/rbac";

const router = Router();

const SETTINGS_DEFAULTS = {
  currentSemesterLabel: "Current Semester",
  semesterStartDate: new Date(),
  semesterEndDate: new Date(),
  defaultDuesAmount: 150,
  defaultDuesPlan: "FULL",
  attendanceLateThresholdMinutes: 15,
  defaultEventPointValue: 5,
};

function flattenSettings(
  chapter: { name: string; letters: string | null; university: string | null; logoUrl: string | null },
  settings: {
    currentSemesterLabel: string;
    semesterStartDate: Date;
    semesterEndDate: Date;
    defaultDuesAmount: unknown;
    defaultDuesPlan: string;
    attendanceLateThresholdMinutes: number;
    defaultEventPointValue: number;
  }
) {
  return {
    chapterName: chapter.name,
    chapterLetters: chapter.letters ?? "",
    university: chapter.university ?? "",
    logoUrl: chapter.logoUrl,
    currentSemesterLabel: settings.currentSemesterLabel,
    semesterStartDate: settings.semesterStartDate,
    semesterEndDate: settings.semesterEndDate,
    defaultDuesAmount: settings.defaultDuesAmount,
    defaultDuesPlan: settings.defaultDuesPlan,
    attendanceLateThresholdMinutes: settings.attendanceLateThresholdMinutes,
    defaultEventPointValue: settings.defaultEventPointValue,
  };
}

// ── GET /settings ──────────────────────────────────────────────────────────
// Open to any authenticated user with a chapter (read-only chapter info,
// not sensitive). Auto-creates the ChapterSettings row with sane defaults
// on first read so a fresh chapter doesn't need a manual seed step.
router.get(
  "/settings",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const chapterId = req.user!.chapterId;
    if (!chapterId) return res.status(404).json({ error: "No chapter" });

    const chapter = await prisma.chapter.findUnique({ where: { id: chapterId } });
    if (!chapter) return res.status(404).json({ error: "Chapter not found" });

    const settings = await prisma.chapterSettings.upsert({
      where: { chapterId },
      update: {},
      create: { chapterId, ...SETTINGS_DEFAULTS },
    });

    res.json({ settings: flattenSettings(chapter, settings) });
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
    const chapterId = req.user!.chapterId;
    if (!chapterId) return res.status(404).json({ error: "No chapter" });

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const {
      chapterName, chapterLetters, university, logoUrl,
      semesterStartDate, semesterEndDate, ...settingsRest
    } = parsed.data;

    const beforeChapter = await prisma.chapter.findUnique({ where: { id: chapterId } });
    const beforeSettings = await prisma.chapterSettings.findUnique({ where: { chapterId } });
    if (!beforeChapter) return res.status(404).json({ error: "Chapter not found" });

    const [chapter, settings] = await prisma.$transaction([
      prisma.chapter.update({
        where: { id: chapterId },
        data: {
          ...(chapterName !== undefined ? { name: chapterName } : {}),
          ...(chapterLetters !== undefined ? { letters: chapterLetters } : {}),
          ...(university !== undefined ? { university } : {}),
          ...(logoUrl !== undefined ? { logoUrl } : {}),
        },
      }),
      prisma.chapterSettings.upsert({
        where: { chapterId },
        update: {
          ...settingsRest,
          ...(semesterStartDate ? { semesterStartDate: new Date(semesterStartDate) } : {}),
          ...(semesterEndDate ? { semesterEndDate: new Date(semesterEndDate) } : {}),
        },
        create: {
          chapterId,
          ...SETTINGS_DEFAULTS,
          ...settingsRest,
          ...(semesterStartDate ? { semesterStartDate: new Date(semesterStartDate) } : {}),
          ...(semesterEndDate ? { semesterEndDate: new Date(semesterEndDate) } : {}),
        },
      }),
    ]);

    await writeAuditLog({
      actorId: req.user!.id,
      action: "CHAPTER_SETTINGS_UPDATE",
      entityType: "ChapterSettings",
      entityId: chapterId,
      before: { chapter: beforeChapter, settings: beforeSettings },
      after: parsed.data,
    });

    res.json({ settings: flattenSettings(chapter, settings) });
  })
);

export default router;
