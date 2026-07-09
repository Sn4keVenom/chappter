// backend/routes/attendance.routes.ts
//
// Integration points:
//   · rbac.ts → requireRole, requireCommitteeScope, AuthedRequest, writeAuditLog
//   · schema.prisma → Attendance (unique[eventId,userId]), PointsLedger (append-only)
//   · events.routes.ts → same QR check-in pattern; manual override here adds
//     MANUAL_ADJUSTMENT ledger entry when correcting points
//
// Key architecture decisions:
//   · Points ledger is APPEND-ONLY. Corrections insert new entries with
//     negative/positive delta; never UPDATE in place.
//   · Attendance.pointsAwarded is snapshot at check-in time, immune to
//     later Event.pointValue edits.
//   · Manual attendance override is audited — actorId, before/after state.

import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthedRequest, requireRole, requireCommitteeScope, writeAuditLog } from "../middleware/rbac";

const router = Router();

// ── GET /events/:eventId/attendance — roster with RSVP join ──────────────
// Officer scoped to this event's committee, or Exec+.
router.get(
  "/events/:eventId/attendance",
  requireCommitteeScope(async (req) => {
    const event = await prisma.event.findUnique({ where: { id: req.params.eventId } });
    return event?.committeeId ?? null;
  }),
  async (req: AuthedRequest, res: Response) => {
    const event = await prisma.event.findUnique({ where: { id: req.params.eventId } });
    if (!event) return res.status(404).json({ error: "Event not found" });

    const members = await prisma.user.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true, firstName: true, lastName: true, email: true, pledgeClassLabel: true,
        rsvps: { where: { eventId: req.params.eventId }, select: { status: true } },
        attendances: {
          where: { eventId: req.params.eventId },
          select: { id: true, checkInTime: true, method: true, late: true, pointsAwarded: true },
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    const roster = members.map((m) => ({
      userId: m.id,
      firstName: m.firstName,
      lastName: m.lastName,
      email: m.email,
      pledgeClassLabel: m.pledgeClassLabel,
      rsvpStatus: m.rsvps[0]?.status ?? null,
      attendance: m.attendances[0] ?? null,
    }));

    const checkedInCount = roster.filter((r) => r.attendance).length;

    res.json({ event: { id: event.id, title: event.title, pointValue: event.pointValue }, roster, checkedInCount });
  }
);

// ── POST /events/:eventId/attendance/:userId — manual override ────────────
// Allows an officer to mark someone present (or remove them) after the fact.
// Creates or deletes the Attendance row AND writes a correcting PointsLedger
// entry so the ledger stays append-only and accurate.
const manualSchema = z.object({
  action: z.enum(["mark_present", "remove"]),
  overrideReason: z.string().min(1).max(500),
  late: z.boolean().default(false),
});

router.post(
  "/events/:eventId/attendance/:userId",
  requireCommitteeScope(async (req) => {
    const event = await prisma.event.findUnique({ where: { id: req.params.eventId } });
    return event?.committeeId ?? null;
  }),
  async (req: AuthedRequest, res: Response) => {
    const parsed = manualSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { action, overrideReason, late } = parsed.data;
    const { eventId, userId } = req.params;

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) return res.status(404).json({ error: "Event not found" });

    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) return res.status(404).json({ error: "User not found" });

    const existing = await prisma.attendance.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });

    const now = new Date();
    const currentSemester = await prisma.semester.findFirst({
      where: { startDate: { lte: now }, endDate: { gte: now } },
    });

    if (action === "mark_present") {
      if (existing) {
        return res.status(409).json({ error: "Attendance already recorded" });
      }

      const pointsAwarded = late ? Math.floor(event.pointValue / 2) : event.pointValue;

      const attendance = await prisma.$transaction(async (tx) => {
        const created = await tx.attendance.create({
          data: {
            eventId,
            userId,
            method: "MANUAL",
            late,
            pointsAwarded,
            recordedById: req.user!.id,
            overrideReason,
          },
        });

        if (currentSemester && pointsAwarded > 0) {
          await tx.pointsLedger.create({
            data: {
              userId,
              eventId,
              semesterId: currentSemester.id,
              amount: pointsAwarded,
              type: "ATTENDANCE",
              reason: `Manual: attended ${event.title}${late ? " (late)" : ""}`,
              awardedById: req.user!.id,
            },
          });
        }

        // Audit log inside the transaction so it's atomic with the attendance row.
        await writeAuditLog({
          actorId: req.user!.id,
          action: "ATTENDANCE_OVERRIDE_ADD",
          entityType: "Attendance",
          entityId: created.id,
          after: { userId, eventId, overrideReason, pointsAwarded },
          tx,
        });

        return created;
      });

      return res.status(201).json({ attendance });
    }

    // action === "remove"
    if (!existing) {
      return res.status(404).json({ error: "No attendance record to remove" });
    }

    await prisma.$transaction(async (tx) => {
      await tx.attendance.delete({ where: { id: existing.id } });

      // Reverse the points with a correcting entry
      if (currentSemester && existing.pointsAwarded > 0) {
        await tx.pointsLedger.create({
          data: {
            userId,
            eventId,
            semesterId: currentSemester.id,
            amount: -existing.pointsAwarded,
            type: "MANUAL_ADJUSTMENT",
            reason: `Attendance removed: ${event.title} — ${overrideReason}`,
            awardedById: req.user!.id,
          },
        });
      }

      // Audit log inside the transaction so removal and its audit are atomic.
      await writeAuditLog({
        actorId: req.user!.id,
        action: "ATTENDANCE_OVERRIDE_REMOVE",
        entityType: "Attendance",
        entityId: existing.id,
        before: { userId, eventId, pointsAwarded: existing.pointsAwarded },
        tx,
      });
    });

    res.json({ removed: true });
  }
);

// ── GET /attendance/history — current user ────────────────────────────────
router.get("/attendance/history", async (req: AuthedRequest, res: Response) => {
  const { semesterId, limit = "20", cursor } = req.query;

  const records = await prisma.attendance.findMany({
    where: {
      userId: req.user!.id,
      ...(semesterId
        ? { event: { ledgerEntries: { some: { semesterId: String(semesterId) } } } }
        : {}),
    },
    orderBy: { checkInTime: "desc" },
    take: Number(limit) + 1,
    ...(cursor ? { cursor: { id: String(cursor) }, skip: 1 } : {}),
    include: {
      event: {
        select: { id: true, title: true, category: true, startTime: true, pointValue: true },
      },
    },
  });

  const hasMore = records.length > Number(limit);
  const items = hasMore ? records.slice(0, -1) : records;

  res.json({
    records: items,
    nextCursor: hasMore ? items[items.length - 1]?.id : null,
  });
});

// ── GET /attendance/history/:userId — Exec+ ───────────────────────────────
// TODO: the mock/mobile-side permission engine (permissions/permissions.ts)
// now also grants this to a committee chair via a granular "attendance.view"
// preset — requireRole only expresses a flat tier here. Matching that
// exactly needs a requireCommitteeScope-style resolver; tracked as a gap,
// see docs/DEMO_MODE.md.
router.get(
  "/attendance/history/:userId",
  requireRole("EXEC"),
  async (req: AuthedRequest, res: Response) => {
    const { semesterId, limit = "50" } = req.query;

    const records = await prisma.attendance.findMany({
      where: {
        userId: req.params.userId,
        ...(semesterId
          ? { event: { ledgerEntries: { some: { semesterId: String(semesterId) } } } }
          : {}),
      },
      orderBy: { checkInTime: "desc" },
      take: Number(limit),
      include: {
        event: { select: { id: true, title: true, category: true, startTime: true } },
      },
    });

    res.json({ records });
  }
);

// ── GET /points/leaderboard ───────────────────────────────────────────────
// Aggregate per-user totals for the given semester; if omitted, uses current.
router.get("/points/leaderboard", async (req: AuthedRequest, res: Response) => {
  const now = new Date();
  let semesterId = req.query.semesterId ? String(req.query.semesterId) : null;

  if (!semesterId) {
    const sem = await prisma.semester.findFirst({
      where: { startDate: { lte: now }, endDate: { gte: now } },
    });
    if (!sem) return res.json({ leaderboard: [], semesterLabel: null });
    semesterId = sem.id;
  }

  const semester = await prisma.semester.findUnique({ where: { id: semesterId } });

  // Raw aggregation with rank via window function
  const rows = await prisma.$queryRaw<
    { userId: string; total: bigint; firstName: string; lastName: string; avatarUrl: string | null }[]
  >`
    SELECT
      u.id AS "userId",
      u."firstName",
      u."lastName",
      u."avatarUrl",
      COALESCE(SUM(pl.amount), 0)::int AS total
    FROM "User" u
    LEFT JOIN "PointsLedger" pl
      ON pl."userId" = u.id AND pl."semesterId" = ${semesterId}
    WHERE u.status IN ('ACTIVE', 'PNM')
    GROUP BY u.id, u."firstName", u."lastName", u."avatarUrl"
    ORDER BY total DESC
  `;

  const leaderboard = rows.map((row, i) => ({
    rank: i + 1,
    userId: row.userId,
    firstName: row.firstName,
    lastName: row.lastName,
    avatarUrl: row.avatarUrl,
    total: Number(row.total),
    isMe: row.userId === req.user!.id,
  }));

  res.json({ leaderboard, semesterLabel: semester?.label ?? null });
});

// ── GET /points/ledger/:userId ────────────────────────────────────────────
// Self: any authenticated user. Other users: Exec+.
router.get("/points/ledger/:userId", async (req: AuthedRequest, res: Response) => {
  const isSelf = req.params.userId === req.user!.id;
  const isExecPlus = ["EXEC", "SUPER_ADMIN"].includes(req.user!.role);

  if (!isSelf && !isExecPlus) {
    return res.status(403).json({ error: "Not permitted" });
  }

  const { semesterId, limit = "50", cursor } = req.query;

  const entries = await prisma.pointsLedger.findMany({
    where: {
      userId: req.params.userId,
      ...(semesterId ? { semesterId: String(semesterId) } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Number(limit) + 1,
    ...(cursor ? { cursor: { id: String(cursor) }, skip: 1 } : {}),
    include: {
      event: { select: { id: true, title: true, category: true } },
      awardedBy: { select: { firstName: true, lastName: true } },
    },
  });

  const hasMore = entries.length > Number(limit);
  const items = hasMore ? entries.slice(0, -1) : entries;

  const totals = await prisma.pointsLedger.aggregate({
    where: {
      userId: req.params.userId,
      ...(semesterId ? { semesterId: String(semesterId) } : {}),
    },
    _sum: { amount: true },
  });

  res.json({
    entries: items,
    total: totals._sum.amount ?? 0,
    nextCursor: hasMore ? items[items.length - 1]?.id : null,
  });
});

// ── POST /points/adjust — Exec+ manual bonus/penalty ─────────────────────
const adjustSchema = z.object({
  userId: z.string(),
  semesterId: z.string(),
  amount: z.number().int().refine((n) => n !== 0, "Amount cannot be zero"),
  type: z.enum(["BONUS", "PENALTY", "MANUAL_ADJUSTMENT"]),
  reason: z.string().min(1).max(500),
});

router.post(
  "/points/adjust",
  requireRole("EXEC"),
  async (req: AuthedRequest, res: Response) => {
    const parsed = adjustSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { userId, semesterId, amount, type, reason } = parsed.data;

    const [targetUser, semester] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.semester.findUnique({ where: { id: semesterId } }),
    ]);
    if (!targetUser) return res.status(404).json({ error: "User not found" });
    if (!semester) return res.status(404).json({ error: "Semester not found" });

    const entry = await prisma.pointsLedger.create({
      data: { userId, semesterId, amount, type, reason, awardedById: req.user!.id },
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "POINTS_ADJUST",
      entityType: "PointsLedger",
      entityId: entry.id,
      after: { userId, amount, type, reason },
    });

    res.status(201).json({ entry });
  }
);

export default router;
