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
import { asyncHandler } from "../lib/asyncHandler";
import {
  AuthedRequest,
  requireRole,
  requireCommitteeScope,
  writeAuditLog,
  isAtLeast,
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
//
// Capped at 200 rows (see `take` below) — this is a list endpoint, not an
// export; a chapter running for many years will accumulate more events than
// any single screen should render at once. Add real cursor pagination here
// (matching /attendance/history's pattern) before that becomes a problem.

router.get(
  "/events",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
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
      take: 200,
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
  })
);

// ── GET /events/:id — single event with per-user status ─────────────────
// Called by EventDetailScreen on every tap. Returns the same shape as
// the list endpoint plus checkedInCount and check-in window fields.

router.get(
  "/events/:id",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const userId = req.user!.id;

    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
      include: {
        committee: { select: { id: true, name: true } },
        rsvps: { where: { userId }, select: { status: true } },
        attendances: { where: { userId }, select: { pointsAwarded: true, late: true } },
        _count: { select: { attendances: true } },
        // Delegate names aren't sensitive within a chapter (same tier as
        // committee membership) — always included rather than gated per
        // viewer; the detail page itself only renders the section for
        // whoever canManageEvent() anyway.
        delegates: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
      },
    });

    if (!event) return res.status(404).json({ error: "Event not found" });

    // Don't expose DRAFT events to non-Exec members. (The removed OFFICER
    // tier used to also see drafts; committee chairs no longer have a role
    // tier of their own, so this is intentionally narrower than before
    // rather than silently broken — see rbac.ts isAtLeast doc comment.)
    if (event.status === "DRAFT" && !isAtLeast(req.user!.role, "EXEC")) {
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
        attendanceDelegates: event.delegates.map((d) => ({
          userId: d.user.id,
          firstName: d.user.firstName,
          lastName: d.user.lastName,
        })),
      },
    });
  })
);

// ── POST /events — create (Officer scoped to own committee, or Exec) ────

router.post(
  "/events",
  requireCommitteeScope(async (req) => req.body?.committeeId ?? null),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
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
  })
);

// ── POST /events/:id/rsvp ────────────────────────────────────────────────

const rsvpSchema = z.object({
  status: z.enum(["GOING", "MAYBE", "NOT_GOING"]),
});

router.post(
  "/events/:id/rsvp",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
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
  })
);

// ── GET /events/:id/checkin-token — officer issues/refreshes signed QR ──

// Uppercase alphanumeric minus visually ambiguous characters (0/O, 1/I) —
// same alphabet chapters.routes.ts uses for invite codes, for the same
// reason: this gets read aloud and typed in by hand, not just scanned.
const CHECKIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function generateCheckInCode(): string {
  const bytes = crypto.randomBytes(6);
  let code = "";
  for (let i = 0; i < 6; i++) code += CHECKIN_CODE_ALPHABET[bytes[i] % CHECKIN_CODE_ALPHABET.length];
  return code;
}

/** How long a check-in code (custom or auto) stays valid once set — the
 * event's own check-in window, not a rolling timer, so "set it once" (or
 * "leave it on the random default") actually means something. Same
 * boundary POST /events/:id/checkin already uses to decide whether
 * check-in is open at all. */
function checkInCodeExpiry(event: { checkInWindowEnd: Date | null; endTime: Date }): Date {
  return event.checkInWindowEnd ?? event.endTime;
}

router.get(
  "/events/:id/checkin-token",
  requireCommitteeScope(async (req) => {
    const event = await prisma.event.findUnique({ where: { id: req.params.id } });
    return event?.committeeId ?? null;
  }),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const event = await prisma.event.findUnique({ where: { id: req.params.id } });
    if (!event) return res.status(404).json({ error: "Event not found" });

    // Short-lived signed token: eventId + expiry, HMAC'd with the event's
    // per-event secret so a screenshot can't be replayed past its window.
    // The QR (checkInLink() in CheckInPage.tsx) encodes THIS — its length
    // doesn't matter to a person, they never read it, only a camera does.
    // Rotates every 60s regardless of what's going on with the code below.
    const expiresAt = Date.now() + 60_000; // matches CheckInPage's refresh interval
    const payload = `${event.id}.${expiresAt}`;
    const signature = crypto
      .createHmac("sha256", event.checkInTokenSecret)
      .update(payload)
      .digest("hex");

    // Short code: the human-typeable alternative, read off the organizer's
    // screen. Sticky, not regenerated on every poll of this endpoint —
    // POST .../checkin-code (below) is the only thing that changes it, so
    // an officer's custom code (or the auto-generated default) survives
    // this page auto-refreshing the QR every 55s. First request for an
    // event with none yet set gets a random default, same as before this
    // was customizable.
    let checkInCode = event.checkInCode;
    if (!checkInCode || !event.checkInCodeExpiresAt || event.checkInCodeExpiresAt.getTime() < Date.now()) {
      checkInCode = generateCheckInCode();
      await prisma.event.update({
        where: { id: event.id },
        data: { checkInCode, checkInCodeExpiresAt: checkInCodeExpiry(event) },
      });
    }

    res.json({ token: `${payload}.${signature}`, code: checkInCode, expiresAt });
  })
);

// ── POST /events/:id/checkin-code — set a custom code, or a fresh random
// one if none is given ─────────────────────────────────────────────────
// Security tradeoff, deliberately accepted here (not something to copy
// elsewhere): a custom code is memorable precisely because it's stable for
// the whole check-in window instead of rotating every 60s like the token
// does, which trades away some of the token's screenshot/replay
// resistance for that memorability — reasonable for event attendance among
// a few dozen people, not for anything higher-stakes.
const setCheckInCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{4,12}$/, "Code must be 4-12 characters: letters, numbers, and dashes.")
    .optional(),
});

router.post(
  "/events/:id/checkin-code",
  requireCommitteeScope(async (req) => {
    const event = await prisma.event.findUnique({ where: { id: req.params.id } });
    return event?.committeeId ?? null;
  }),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const parsed = setCheckInCodeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const event = await prisma.event.findUnique({ where: { id: req.params.id } });
    if (!event) return res.status(404).json({ error: "Event not found" });

    const checkInCode = parsed.data.code || generateCheckInCode();
    await prisma.event.update({
      where: { id: event.id },
      data: { checkInCode, checkInCodeExpiresAt: checkInCodeExpiry(event) },
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "EVENT_CHECKIN_CODE_SET",
      entityType: "Event",
      entityId: event.id,
      after: { checkInCode, custom: !!parsed.data.code },
    });

    res.json({ code: checkInCode });
  })
);

// ── POST /events/:id/checkin — member self check-in via scanned token ───
// Accepts either credential: `token` (from the QR / a scanned link) or
// `code` (typed in by hand off the organizer's screen) — exactly one is
// required. Both funnel into the same attendance-recording logic below
// once whichever one was sent is confirmed valid.

const checkinSchema = z
  .object({ token: z.string().optional(), code: z.string().optional() })
  .refine((d) => d.token || d.code, { message: "Missing token or code" });

router.post(
  "/events/:id/checkin",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const parsed = checkinSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Missing token or code" });
    }

    const event = await prisma.event.findUnique({ where: { id: req.params.id } });
    if (!event) return res.status(404).json({ error: "Event not found" });

    let credentialValid = false;

    if (parsed.data.token) {
      const [eventId, expiresAtStr, signature] = parsed.data.token.split(".");
      const expectedSig = crypto
        .createHmac("sha256", event.checkInTokenSecret)
        .update(`${eventId}.${expiresAtStr}`)
        .digest("hex");

      // timingSafeEqual throws if buffer lengths differ (e.g. a malformed or
      // truncated token) — that would otherwise reach the process as an
      // unhandled error rather than the intended 400, so it's guarded here
      // rather than relying solely on asyncHandler as the last line of defense.
      let signaturesMatch = false;
      try {
        signaturesMatch = crypto.timingSafeEqual(
          Buffer.from(signature ?? "", "hex"),
          Buffer.from(expectedSig, "hex")
        );
      } catch {
        signaturesMatch = false;
      }

      credentialValid = eventId === event.id && signaturesMatch && Date.now() <= Number(expiresAtStr);
    } else if (parsed.data.code) {
      const submitted = parsed.data.code.trim().toUpperCase();
      credentialValid =
        !!event.checkInCode &&
        submitted.length === event.checkInCode.length &&
        crypto.timingSafeEqual(Buffer.from(submitted), Buffer.from(event.checkInCode)) &&
        !!event.checkInCodeExpiresAt &&
        Date.now() <= event.checkInCodeExpiresAt.getTime();
    }

    if (!credentialValid) {
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

    let attendance;
    try {
      attendance = await prisma.$transaction(async (tx) => {
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
    } catch (err: any) {
      // P2002 = unique constraint violation — two concurrent scans of the
      // same valid token both passed the `existing` check above before
      // either committed. Treat the loser as "already checked in" instead
      // of a 500, since the outcome (one attendance row exists) is correct.
      if (err?.code === "P2002") {
        const raceWinner = await prisma.attendance.findUnique({
          where: { eventId_userId: { eventId: event.id, userId: req.user!.id } },
        });
        if (raceWinner) {
          return res.json({ attendance: raceWinner, alreadyCheckedIn: true });
        }
      }
      throw err;
    }

    res.status(201).json({ attendance });
  })
);

// ── Check-in delegates ─────────────────────────────────────────────────────
// A delegate can display THIS event's check-in code (GET /events/:id/
// checkin-token) without gaining attendance-management access to any other
// event — narrower and more delegable than the general access
// requireCommitteeScope grants for the rest of an event's management.
//
// Gated the same way GET /events/:id/checkin-token already is: Exec+, or the
// chair of the event's own committee. Mirrors mocks/api.ts
// addEventDelegate/removeEventDelegate's canManageDelegates, minus its extra
// Scribe carve-out — kept consistent with the neighbouring checkin-token
// route rather than widening this one specific action beyond it.

async function eventDelegateResponse(eventId: string) {
  const delegates = await prisma.eventDelegate.findMany({
    where: { eventId },
    include: { user: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { userId: "asc" },
  });
  return delegates.map((d) => ({ userId: d.user.id, firstName: d.user.firstName, lastName: d.user.lastName }));
}

const delegateSchema = z.object({ userId: z.string().min(1) });

router.post(
  "/events/:id/delegates",
  requireCommitteeScope(async (req) => {
    const event = await prisma.event.findUnique({ where: { id: req.params.id } });
    return event?.committeeId ?? null;
  }),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const parsed = delegateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const event = await prisma.event.findUnique({ where: { id: req.params.id } });
    if (!event) return res.status(404).json({ error: "Event not found" });

    const user = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
    if (!user) return res.status(404).json({ error: "User not found" });

    await prisma.eventDelegate.upsert({
      where: { eventId_userId: { eventId: event.id, userId: user.id } },
      update: {},
      create: { eventId: event.id, userId: user.id },
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "EVENT_DELEGATE_ADD",
      entityType: "Event",
      entityId: event.id,
      after: { userId: user.id },
    });

    res.status(201).json({ delegates: await eventDelegateResponse(event.id) });
  })
);

router.delete(
  "/events/:id/delegates/:userId",
  requireCommitteeScope(async (req) => {
    const event = await prisma.event.findUnique({ where: { id: req.params.id } });
    return event?.committeeId ?? null;
  }),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const event = await prisma.event.findUnique({ where: { id: req.params.id } });
    if (!event) return res.status(404).json({ error: "Event not found" });

    await prisma.eventDelegate.deleteMany({
      where: { eventId: event.id, userId: req.params.userId },
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "EVENT_DELEGATE_REMOVE",
      entityType: "Event",
      entityId: event.id,
      before: { userId: req.params.userId },
    });

    res.json({ delegates: await eventDelegateResponse(event.id) });
  })
);

export default router;
