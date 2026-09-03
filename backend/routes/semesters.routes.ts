// backend/routes/semesters.routes.ts
//
// Semesters — the mechanism behind "reset all points for everyone, but keep
// the previous ranking around for reference." Points are already scoped
// per-semester (PointsLedger.semesterId, GET /points/leaderboard resolves
// "current" from Semester date ranges) — starting a new one is the reset:
// every member reads as 0 on the new semester's leaderboard, while the old
// semester's data is untouched and still fully queryable via
// GET /points/leaderboard?semesterId=<old>. Nothing about Attendance is
// touched by any of this — it isn't semester-scoped at all, which is the
// explicit requirement this was built against ("This should NOT alter
// semester category attendance log for scribe. That is semesterly and
// should be reset separately.").
//
// Integration:
//   · rbac.ts → requirePermission, AuthedRequest, writeAuditLog
//   · schema.prisma → Semester
//   · src/api/semesters.ts on the client side

import { Router, Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { AuthedRequest, requirePermission, writeAuditLog } from "../middleware/rbac";

const router = Router();

function isCurrent(s: { startDate: Date; endDate: Date }, now: Date): boolean {
  return s.startDate <= now && s.endDate >= now;
}

// ── GET /semesters — any authenticated user ─────────────────────────────
// Open, not Exec+-gated: the leaderboard's "view a past semester's ranking"
// picker (PointsPage.tsx) needs this for anyone looking at the leaderboard,
// not just admins.
router.get(
  "/semesters",
  asyncHandler(async (_req: AuthedRequest, res: Response) => {
    const semesters = await prisma.semester.findMany({ orderBy: { startDate: "desc" } });
    const now = new Date();
    res.json({
      semesters: semesters.map((s) => ({
        id: s.id,
        label: s.label,
        startDate: s.startDate.toISOString(),
        endDate: s.endDate.toISOString(),
        isCurrent: isCurrent(s, now),
      })),
    });
  })
);

// ── POST /semesters — semesters.manage ──────────────────────────────────
const createSemesterSchema = z.object({
  label: z.string().min(1).max(60),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

router.post(
  "/semesters",
  requirePermission("semesters.manage"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const parsed = createSemesterSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const startDate = new Date(parsed.data.startDate);
    const endDate = new Date(parsed.data.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return res.status(400).json({ error: "Invalid date" });
    }
    if (endDate <= startDate) return res.status(400).json({ error: "End date must be after the start date." });

    const now = new Date();
    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        // Close out whatever's currently active so there's no ambiguous
        // overlap for "current semester" lookups elsewhere in the app —
        // this only ever touches the OLD semester's endDate, never any
        // PointsLedger/DuesRecord/CommitteeBudget row that points at it.
        const current = await tx.semester.findFirst({
          where: { startDate: { lte: now }, endDate: { gte: startDate } },
        });
        if (current && current.endDate > startDate) {
          await tx.semester.update({
            where: { id: current.id },
            data: { endDate: new Date(startDate.getTime() - 1000) },
          });
        }
        return tx.semester.create({ data: { label: parsed.data.label.trim(), startDate, endDate } });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return res.status(409).json({ error: `A semester named "${parsed.data.label.trim()}" already exists.` });
      }
      throw err;
    }

    await writeAuditLog({
      actorId: req.user!.id,
      action: "SEMESTER_CREATE",
      entityType: "Semester",
      entityId: result.id,
      after: { label: result.label, startDate, endDate },
    });

    res.status(201).json({
      semester: {
        id: result.id,
        label: result.label,
        startDate: result.startDate.toISOString(),
        endDate: result.endDate.toISOString(),
        isCurrent: isCurrent(result, now),
      },
    });
  })
);

export default router;
