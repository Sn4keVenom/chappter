// backend/routes/users.routes.ts
//
// Integration points:
//   · rbac.ts  → requireRole, AuthedRequest, writeAuditLog
//   · prisma   → User, CommitteeMembership, Semester, PointsLedger, DuesRecord
//   · schema: User.role ∈ UserRole enum; SUPER_ADMIN required for role changes
//
// Role gates (mirrors usePermissions.ts client-side):
//   GET /users           Officer+
//   GET /users/:id       Officer+
//   PATCH /users/:id/role  Super Admin only; self-change blocked

import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthedRequest, requireRole, writeAuditLog } from "../middleware/rbac";

const router = Router();

// ── GET /users/me ─────────────────────────────────────────────────────────
// Returns the current user's profile + committee chair list, matching what
// /auth/sync returns so the mobile app can refresh after role changes.
router.get("/users/me", async (req: AuthedRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: {
      committeeMemberships: {
        include: { committee: { select: { id: true, name: true } } },
      },
    },
  });
  if (!user) return res.status(404).json({ error: "User not found" });

  res.json({
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      role: user.role,
      status: user.status,
      pledgeClassLabel: user.pledgeClassLabel,
      committeeChairOf: user.committeeMemberships
        .filter((m) => m.role === "CHAIR")
        .map((m) => m.committeeId),
      committeeMemberships: user.committeeMemberships.map((m) => ({
        committeeId: m.committeeId,
        committeeName: m.committee.name,
        role: m.role,
      })),
    },
  });
});

// ── GET /users/me/dashboard ───────────────────────────────────────────────
// Aggregated home-screen data in one round-trip. Four parallel queries:
//   1. Upcoming events (next 7 days)
//   2. Current-semester dues record
//   3. Current-semester points total + chapter rank
//   4. Pinned announcement (last pinned message in GENERAL channel)
router.get("/users/me/dashboard", async (req: AuthedRequest, res: Response) => {
  const now = new Date();
  const weekOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const userId = req.user!.id;

  const currentSemester = await prisma.semester.findFirst({
    where: { startDate: { lte: now }, endDate: { gte: now } },
  });

  const [upcomingEvents, duesRecord, pointsData, pinnedAnnouncement] =
    await Promise.all([
      // 1. Upcoming published events with user's RSVP status
      prisma.event.findMany({
        where: {
          status: "PUBLISHED",
          startTime: { gte: now, lte: weekOut },
        },
        orderBy: { startTime: "asc" },
        take: 5,
        include: {
          rsvps: { where: { userId }, select: { status: true } },
          attendances: { where: { userId }, select: { pointsAwarded: true, late: true } },
          committee: { select: { id: true, name: true } },
        },
      }),

      // 2. Current dues record — include semester so DuesRecord.semester is populated
      currentSemester
        ? prisma.duesRecord.findUnique({
            where: {
              userId_semesterId: { userId, semesterId: currentSemester.id },
            },
            include: {
              semester: { select: { id: true, label: true } },
            },
          })
        : null,

      // 3. Points total for current semester
      currentSemester
        ? prisma.pointsLedger.aggregate({
            where: { userId, semesterId: currentSemester.id },
            _sum: { amount: true },
          })
        : null,

      // 4. Most recent pinned message in GENERAL channel
      prisma.message.findFirst({
        where: {
          pinned: true,
          deletedAt: null,
          channel: { type: "GENERAL" },
        },
        orderBy: { createdAt: "desc" },
        include: { sender: { select: { firstName: true, lastName: true } } },
      }),
    ]);

  // Compute rank: count members with more points in this semester
  let rank: number | null = null;
  if (currentSemester && pointsData) {
    const myTotal = pointsData._sum.amount ?? 0;
    const higher = await prisma.pointsLedger.groupBy({
      by: ["userId"],
      where: { semesterId: currentSemester.id },
      _sum: { amount: true },
      having: { amount: { _sum: { gt: myTotal } } },
    });
    rank = higher.length + 1;
  }

  res.json({
    upcomingEvents: upcomingEvents.map((e) => ({
      id: e.id,
      title: e.title,
      location: e.location,
      category: e.category,
      startTime: e.startTime,
      endTime: e.endTime,
      attendanceRequired: e.attendanceRequired,
      pointValue: e.pointValue,
      committeeId: e.committeeId,
      committee: e.committee,
      myRsvpStatus: e.rsvps[0]?.status ?? null,
      myAttendance: e.attendances[0] ?? null,
    })),
    duesRecord,
    points: {
      total: pointsData?._sum.amount ?? 0,
      rank,
      semesterLabel: currentSemester?.label ?? null,
    },
    pinnedAnnouncement: pinnedAnnouncement
      ? {
          id: pinnedAnnouncement.id,
          content: pinnedAnnouncement.content,
          createdAt: pinnedAnnouncement.createdAt,
          senderName: `${pinnedAnnouncement.sender.firstName} ${pinnedAnnouncement.sender.lastName}`,
        }
      : null,
  });
});

// ── GET /users — roster ───────────────────────────────────────────────────
// Officer+ only. Supports search by name/email and filtering by role/status.
router.get(
  "/users",
  requireRole("OFFICER"),
  async (req: AuthedRequest, res: Response) => {
    const { q, role, status, page = "1", limit = "50" } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const users = await prisma.user.findMany({
      where: {
        ...(q
          ? {
              OR: [
                { firstName: { contains: String(q), mode: "insensitive" } },
                { lastName: { contains: String(q), mode: "insensitive" } },
                { email: { contains: String(q), mode: "insensitive" } },
              ],
            }
          : {}),
        ...(role ? { role: String(role) as any } : {}),
        ...(status ? { status: String(status) as any } : {}),
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip,
      take: Number(limit),
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        status: true,
        pledgeClassLabel: true,
        avatarUrl: true,
      },
    });

    const total = await prisma.user.count({
      where: {
        ...(q
          ? {
              OR: [
                { firstName: { contains: String(q), mode: "insensitive" } },
                { lastName: { contains: String(q), mode: "insensitive" } },
                { email: { contains: String(q), mode: "insensitive" } },
              ],
            }
          : {}),
        ...(role ? { role: String(role) as any } : {}),
        ...(status ? { status: String(status) as any } : {}),
      },
    });

    res.json({ users, total, page: Number(page), limit: Number(limit) });
  }
);

// ── GET /users/:id ────────────────────────────────────────────────────────
router.get(
  "/users/:id",
  requireRole("OFFICER"),
  async (req: AuthedRequest, res: Response) => {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: {
        committeeMemberships: {
          include: { committee: { select: { id: true, name: true } } },
        },
      },
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ user });
  }
);

// ── PATCH /users/:id/role ─────────────────────────────────────────────────
// Super Admin only; self-role changes are blocked to prevent accidental
// lock-out of the only admin account.
const roleSchema = z.object({
  role: z.enum(["MEMBER", "OFFICER", "EXEC", "SUPER_ADMIN"]),
});

router.patch(
  "/users/:id/role",
  requireRole("SUPER_ADMIN"),
  async (req: AuthedRequest, res: Response) => {
    if (req.params.id === req.user!.id) {
      return res.status(400).json({ error: "Cannot change your own role" });
    }

    const parsed = roleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const before = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!before) return res.status(404).json({ error: "User not found" });

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { role: parsed.data.role },
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "ROLE_CHANGE",
      entityType: "User",
      entityId: req.params.id,
      before: { role: before.role },
      after: { role: updated.role },
    });

    res.json({ user: updated });
  }
);

export default router;
