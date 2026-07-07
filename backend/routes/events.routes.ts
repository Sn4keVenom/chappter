// backend/routes/events.routes.ts
//
// Sample implementation for the /events resource family. Demonstrates the
// pattern every other resource (committees, dues, messages) should follow:
// RBAC middleware → validation → Prisma call (transactional where it writes
// more than one table) → audit log on mutations → typed JSON response.

import { Router, Response } from "express";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import {
  AuthedRequest,
  requireRole,
  requireCommitteeScope,
  writeAuditLog,
} from "../middleware/rbac";
const router = Router();

// ── Validation schemas ──────────────────────────────────────────────────

const createEventSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  location: z.string().optional(),
  category: z.enum(["BROTHERHOOD", "SERVICE", "PROFESSIONAL", "RUSH", "ADMIN"]),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  attendanceRequired: z.boolean().default(false),
  pointValue: z.number().int().min(0).default(0),
  committeeId: z.string().nullable().optional(),
  checkInWindowStart: z.string().datetime().nullable().optional(),
  checkInWindowEnd: z.string().datetime().nullable().optional(),
  lateThresholdMinutes: z.number().int().min(0).default(15),
});

// ── GET /events — list, filterable ──────────────────────────────────────
// Returns per-user RSVP status and attendance (myRsvpStatus, myAttendance)
// so the EventsFeed and HomeDashboard can show RSVP state without a second
// round-trip. The join is a WHERE userId, so it returns at most one row
// per event and never fans out.

router.get("/events", async (req: AuthedRequest, res: Response) => {
  const { from, to, category, committeeId } = req.query;
  const userId = req.user!.id;

  const events = await prisma.event.findMany({
    where: {
      status: "PUBLISHED",
      ...(from || to
        ? {
            startTime: {
              ...(from ? { gte: new Date(String(from)) } : {}),
              ...(to ? { lte: new Date(String(to)) } : {}),
            },
          }
        : {}),
      ...(category ? { category: String(category) as any } : {}),
      ...(committeeId ? { committeeId: String(committeeId) } : {}),
    },
    orderBy: { startTime: "asc" },
    include: {
      committee: { select: { id: true, name: true } },
      rsvps: { where: { userId }, select: { status: true } },
      attendances: { where: { userId }, select: { pointsAwarded: true, late: true } },
    },
  });

  res.json({
    events: events.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      location: e.location,
      category: e.category,
      startTime: e.startTime,
      endTime: e.endTime,
      status: e.status,
      attendanceRequired: e.attendanceRequired,
      pointValue: e.pointValue,
      committeeId: e.committeeId,
      committee: e.committee,
      myRsvpStatus: e.rsvps[0]?.status ?? null,
      myAttendance: e.attendances[0] ?? null,
    })),
  });
});

// ── GET /events/:id — single event with per-user status ─────────────────
// Called by EventDetailScreen on every tap. Returns the same shape as
// the list endpoint plus checkedInCount and check-in window fields.

router.get("/events/:id", async (req: AuthedRequest, res: Response) => {
  const userId = req.user!.id;

  const event = await prisma.event.findUnique({
    where: { id: req.params.id },
    include: {
      committee: { select: { id: true, name: true } },
      rsvps: { where: { userId }, select: { status: true } },
      attendances: { where: { userId }, select: { pointsAwarded: true, late: true } },
      _count: { select: { attendances: true } },
    },
  });

  if (!event) return res.status(404).json({ error: "Event not found" });

  // Don't expose DRAFT events to members; Officers/Exec can see them.
  const rank: Record<string, number> = { MEMBER: 0, OFFICER: 1, EXEC: 2, SUPER_ADMIN: 3 };
  if (event.status === "DRAFT" && rank[req.user!.role] < rank.OFFICER) {
    return res.status(404).json({ error: "Event not found" });
  }

  res.json({
    event: {
      id: event.id,
      title: event.title,
      description: event.description,
      location: event.location,
      latitude: event.latitude,
      longitude: event.longitude,
      category: event.category,
      startTime: event.startTime,
      endTime: event.endTime,
      status: event.status,
      attendanceRequired: event.attendanceRequired,
      pointValue: event.pointValue,
      checkInWindowStart: event.checkInWindowStart,
      checkInWindowEnd: event.checkInWindowEnd,
      committeeId: event.committeeId,
      committee: event.committee,
      checkedInCount: event._count.attendances,
      myRsvpStatus: event.rsvps[0]?.status ?? null,
      myAttendance: event.attendances[0] ?? null,
    },
  });
});

// ── POST /events — create (Officer scoped to own committee, or Exec) ────

router.post(
  "/events",
  requireCommitteeScope(async (req) => req.body?.committeeId ?? null),
  async (req: AuthedRequest, res: Response) => {
    const parsed = createEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const data = parsed.data;

    const event = await prisma.event.create({
      data: {
        title: data.title,
        description: data.description,
        location: data.location,
        category: data.category as any,
        startTime: new Date(data.startTime),
        endTime: new Date(data.endTime),
        attendanceRequired: data.attendanceRequired,
        pointValue: data.pointValue,
        committeeId: data.committeeId ?? null,
        checkInWindowStart: data.checkInWindowStart ? new Date(data.checkInWindowStart) : null,
        checkInWindowEnd: data.checkInWindowEnd ? new Date(data.checkInWindowEnd) : null,
        lateThresholdMinutes: data.lateThresholdMinutes,
        checkInTokenSecret: crypto.randomBytes(24).toString("hex"),
        status: "PUBLISHED",
        createdById: req.user!.id,
      },
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "EVENT_CREATE",
      entityType: "Event",
      entityId: event.id,
      after: event,
    });

    res.status(201).json({ event });
  }
);

// ── POST /events/:id/rsvp ────────────────────────────────────────────────

const rsvpSchema = z.object({
  status: z.enum(["GOING", "MAYBE", "NOT_GOING"]),
});

router.post("/events/:id/rsvp", async (req: AuthedRequest, res: Response) => {
  const parsed = rsvpSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const rsvp = await prisma.rsvp.upsert({
    where: { eventId_userId: { eventId: req.params.id, userId: req.user!.id } },
    update: { status: parsed.data.status, respondedAt: new Date() },
    create: {
      eventId: req.params.id,
      userId: req.user!.id,
      status: parsed.data.status,
    },
  });

  res.json({ rsvp });
});

// ── GET /events/:id/checkin-token — officer issues/refreshes signed QR ──

router.get(
  "/events/:id/checkin-token",
  requireCommitteeScope(async (req) => {
    const event = await prisma.event.findUnique({ where: { id: req.params.id } });
    return event?.committeeId ?? null;
  }),
  async (req: AuthedRequest, res: Response) => {
    const event = await prisma.event.findUnique({ where: { id: req.params.id } });
    if (!event) return res.status(404).json({ error: "Event not found" });

    // Short-lived signed token: eventId + expiry, HMAC'd with the event's
    // per-event secret so a screenshot can't be replayed past its window.
    const expiresAt = Date.now() + 60_000; // 60s rotation, matches QrDisplay refresh interval
    const payload = `${event.id}.${expiresAt}`;
    const signature = crypto
      .createHmac("sha256", event.checkInTokenSecret)
      .update(payload)
      .digest("hex");

    res.json({ token: `${payload}.${signature}`, expiresAt });
  }
);

// ── POST /events/:id/checkin — member self check-in via scanned token ───

const checkinSchema = z.object({ token: z.string() });

router.post("/events/:id/checkin", async (req: AuthedRequest, res: Response) => {
  const parsed = checkinSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Missing token" });
  }

  const event = await prisma.event.findUnique({ where: { id: req.params.id } });
  if (!event) return res.status(404).json({ error: "Event not found" });

  const [eventId, expiresAtStr, signature] = parsed.data.token.split(".");
  const expectedSig = crypto
    .createHmac("sha256", event.checkInTokenSecret)
    .update(`${eventId}.${expiresAtStr}`)
    .digest("hex");

  const tokenValid =
    eventId === event.id &&
    crypto.timingSafeEqual(
      Buffer.from(signature ?? "", "hex"),
      Buffer.from(expectedSig, "hex")
    ) &&
    Date.now() <= Number(expiresAtStr);

  if (!tokenValid) {
    return res.status(400).json({ error: "Check-in code expired or invalid — ask an officer to add you manually." });
  }

  const now = new Date();
  const windowEnd = event.checkInWindowEnd ?? event.endTime;
  if (now > windowEnd) {
    return res.status(400).json({ error: "Check-in window closed — ask an officer to add you manually." });
  }

  const lateThreshold = event.checkInWindowStart
    ? new Date(event.checkInWindowStart.getTime() + event.lateThresholdMinutes * 60_000)
    : null;
  const isLate = lateThreshold ? now > lateThreshold : false;

  // Idempotent: re-scanning an already-checked-in code returns the existing
  // record instead of erroring or double-awarding points.
  const existing = await prisma.attendance.findUnique({
    where: { eventId_userId: { eventId: event.id, userId: req.user!.id } },
  });
  if (existing) {
    return res.json({ attendance: existing, alreadyCheckedIn: true });
  }

  const attendance = await prisma.$transaction(async (tx) => {
    const created = await tx.attendance.create({
      data: {
        eventId: event.id,
        userId: req.user!.id,
        method: "QR",
        late: isLate,
        pointsAwarded: isLate ? Math.floor(event.pointValue / 2) : event.pointValue,
      },
    });

    const currentSemester = await tx.semester.findFirst({
      where: { startDate: { lte: now }, endDate: { gte: now } },
    });

    if (currentSemester && created.pointsAwarded > 0) {
      await tx.pointsLedger.create({
        data: {
          userId: req.user!.id,
          eventId: event.id,
          semesterId: currentSemester.id,
          amount: created.pointsAwarded,
          type: "ATTENDANCE",
          reason: `Attended ${event.title}${isLate ? " (late)" : ""}`,
        },
      });
    }

    return created;
  });

  res.status(201).json({ attendance });
});

export default router;
