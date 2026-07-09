// backend/routes/users.routes.ts
//
// Integration points:
//   · rbac.ts  → requireRole, AuthedRequest, writeAuditLog
//   · prisma   → User, ChapterMembership, Semester, PointsLedger, DuesRecord
//   · lib/userSerializer.ts → flattenUser (shared with auth.routes.ts,
//     chapters.routes.ts) — role/office/status/roleNumber/major/graduationYear
//     live on ChapterMembership now, not User (see schema.prisma doc comment);
//     every route here that used to read them off User directly now resolves
//     the caller's (or target's) active membership first.
//
// Role gates (mirrors usePermissions.ts client-side):
//   GET /users           Exec+ (scoped to the caller's own chapter roster)
//   GET /users/:id       Exec+ (same chapter only)
//   PATCH /users/:id/role  Super Admin only; self-change blocked

import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { AuthedRequest, requireRole, writeAuditLog } from "../middleware/rbac";
import { flattenUser } from "../lib/userSerializer";

const router = Router();

/** Shared by GET /users/:id and the two PATCH editors below so all three
 * return the exact same flattened shape the mobile app already expects
 * from setProfile()/MemberProfileScreen. */
async function loadFullUser(userId: string, chapterId: string) {
  const [user, membership, committeeMemberships] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.chapterMembership.findUnique({
      where: { chapterId_userId: { chapterId, userId } },
    }),
    prisma.committeeMembership.findMany({
      where: { userId },
      include: { committee: { select: { id: true, name: true } } },
    }),
  ]);
  if (!user || !membership) return null;

  return {
    ...flattenUser(user, membership, committeeMemberships.filter((m) => m.role === "CHAIR").map((m) => m.committeeId)),
    committeeMemberships: committeeMemberships.map((m) => ({
      committeeId: m.committeeId,
      committeeName: m.committee.name,
      role: m.role,
    })),
  };
}

// ── GET /users/me ─────────────────────────────────────────────────────────
// Returns the current user's profile + committee chair list, matching what
// /auth/sync returns so the mobile app can refresh after role/chapter changes.
router.get(
  "/users/me",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const [membership, committeeMemberships] = await Promise.all([
      user.activeChapterId
        ? prisma.chapterMembership.findUnique({
            where: { chapterId_userId: { chapterId: user.activeChapterId, userId: user.id } },
          })
        : Promise.resolve(null),
      prisma.committeeMembership.findMany({
        where: { userId: user.id },
        include: { committee: { select: { id: true, name: true } } },
      }),
    ]);

    res.json({
      user: {
        ...flattenUser(
          user,
          membership,
          committeeMemberships.filter((m) => m.role === "CHAIR").map((m) => m.committeeId)
        ),
        committeeMemberships: committeeMemberships.map((m) => ({
          committeeId: m.committeeId,
          committeeName: m.committee.name,
          role: m.role,
        })),
      },
    });
  })
);

// ── GET /users/me/dashboard ───────────────────────────────────────────────
// Aggregated home-screen data in one round-trip. Four parallel queries:
//   1. Upcoming events (next 7 days)
//   2. Current-semester dues record
//   3. Current-semester points total + chapter rank
//   4. Pinned announcement (last pinned message in GENERAL channel)
router.get(
  "/users/me/dashboard",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
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
  })
);

// ── GET /users — roster ───────────────────────────────────────────────────
// Exec+ only, scoped to the caller's own chapter. Supports search by
// name/email and filtering by role/status.
router.get(
  "/users",
  requireRole("EXEC"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const { q, role, status, page = "1", limit = "50" } = req.query;
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));
    const skip = (pageNum - 1) * limitNum;

    const where = {
      chapterId: req.user!.chapterId!,
      ...(role ? { role: String(role) as any } : {}),
      ...(status ? { status: String(status) as any } : {}),
      // deletedAt: null — don't show accounts whose Clerk login was deleted
      // (see webhook.routes.ts) in the roster; their historical records
      // (attendance, messages, audit log) are untouched, just not surfaced
      // as an active member here.
      user: {
        deletedAt: null,
        ...(q
          ? {
              OR: [
                { firstName: { contains: String(q), mode: "insensitive" as const } },
                { lastName: { contains: String(q), mode: "insensitive" as const } },
                { email: { contains: String(q), mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
    };

    const [memberships, total] = await Promise.all([
      prisma.chapterMembership.findMany({
        where,
        orderBy: [{ user: { lastName: "asc" } }, { user: { firstName: "asc" } }],
        skip,
        take: limitNum,
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
          },
        },
      }),
      prisma.chapterMembership.count({ where }),
    ]);

    res.json({
      users: memberships.map((m) => ({
        id: m.user.id,
        firstName: m.user.firstName,
        lastName: m.user.lastName,
        email: m.user.email,
        avatarUrl: m.user.avatarUrl,
        role: m.role,
        office: m.office,
        status: m.status,
        roleNumber: m.roleNumber,
        pledgeClassLabel: m.pledgeClassLabel,
      })),
      total,
      page: pageNum,
      limit: limitNum,
    });
  })
);

// ── GET /users/:id ────────────────────────────────────────────────────────
router.get(
  "/users/:id",
  requireRole("EXEC"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const user = await loadFullUser(req.params.id, req.user!.chapterId!);
    if (!user) return res.status(404).json({ error: "User not found in your chapter" });
    res.json({ user });
  })
);

// ── PATCH /users/:id/role ─────────────────────────────────────────────────
// Super Admin only; self-role changes are blocked to prevent accidental
// lock-out of the only admin account.
const roleSchema = z.object({
  role: z.enum(["SUPER_ADMIN", "EXEC", "MEMBER", "PNM", "ALUMNI"]),
});

router.patch(
  "/users/:id/role",
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    if (req.params.id === req.user!.id) {
      return res.status(400).json({ error: "Cannot change your own role" });
    }

    const parsed = roleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const before = await prisma.chapterMembership.findUnique({
      where: { chapterId_userId: { chapterId: req.user!.chapterId!, userId: req.params.id } },
    });
    if (!before) return res.status(404).json({ error: "User not found in your chapter" });

    const updated = await prisma.chapterMembership.update({
      where: { id: before.id },
      data: { role: parsed.data.role },
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "ROLE_CHANGE",
      entityType: "ChapterMembership",
      entityId: before.id,
      before: { role: before.role },
      after: { role: updated.role },
    });

    res.json({ user: await loadFullUser(req.params.id, req.user!.chapterId!) });
  })
);

// ── PATCH /users/:id — role/office/status/major/graduationYear editor ────
// Super Admin only; mirrors mocks/api.ts updateUserFields. Each field is
// optional so a client can update just one without re-sending the others.
// Self-role-change is still blocked (see above) — self office/status edits
// are allowed since those can't lock out the account. Role numbers are NOT
// editable here — that's PATCH /users/:id/role-number in membership.routes.ts,
// gated by its own permission (spec §6/§11: distinct from general user mgmt).
const userFieldsSchema = z.object({
  role: z.enum(["SUPER_ADMIN", "EXEC", "MEMBER", "PNM", "ALUMNI"]).optional(),
  office: z
    .enum([
      "REGENT", "VICE_REGENT", "TREASURER", "SCRIBE", "MARSHAL",
      "CORRESPONDING_SECRETARY", "NEW_MEMBER_EDUCATOR",
    ])
    .nullable()
    .optional(),
  status: z.enum(["ACTIVE", "PNM", "ALUMNI", "INACTIVE"]).optional(),
  pledgeClassLabel: z.string().max(50).nullable().optional(),
  major: z.string().max(100).nullable().optional(),
  graduationYear: z.number().int().min(1900).max(2200).nullable().optional(),
});

router.patch(
  "/users/:id",
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const parsed = userFieldsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    if (parsed.data.role !== undefined && req.params.id === req.user!.id) {
      return res.status(400).json({ error: "Cannot change your own role" });
    }

    const before = await prisma.chapterMembership.findUnique({
      where: { chapterId_userId: { chapterId: req.user!.chapterId!, userId: req.params.id } },
    });
    if (!before) return res.status(404).json({ error: "User not found in your chapter" });

    const updated = await prisma.chapterMembership.update({
      where: { id: before.id },
      data: parsed.data,
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "USER_FIELDS_UPDATE",
      entityType: "ChapterMembership",
      entityId: before.id,
      before: {
        role: before.role,
        office: before.office,
        status: before.status,
        pledgeClassLabel: before.pledgeClassLabel,
        major: before.major,
        graduationYear: before.graduationYear,
      },
      after: parsed.data,
    });

    res.json({ user: await loadFullUser(req.params.id, req.user!.chapterId!) });
  })
);

export default router;
