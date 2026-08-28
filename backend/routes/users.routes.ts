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
//   PATCH /users/me      Any authenticated user, self only (must be
//                        registered before PATCH /users/:id below — see
//                        that route's comment)
//   PATCH /users/:id/role  Super Admin only; self-change blocked
//   PATCH /users/:id       Super Admin only
//   DELETE /users/me     Any authenticated user, self only
//   DELETE /users/:id    Super Admin only; self-delete blocked (use
//                        DELETE /users/me)

import { Router, Response } from "express";
import { z } from "zod";
import { Prisma, MemberStatus, UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { AuthedRequest, requireRole, writeAuditLog } from "../middleware/rbac";
import { flattenUser } from "../lib/userSerializer";
import { deleteUserAccount } from "../lib/deleteUser";

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

// ── PATCH /users/me — self-service profile edit ───────────────────────────
// Never accepts role/office/status/roleNumber — those stay admin-only
// (PATCH /users/:id, requireRole("SUPER_ADMIN"), below). Moved here from
// membership.routes.ts, and deliberately placed BEFORE that generic
// PATCH /users/:id: both routers mount under /api/v1, this router is
// mounted first (server.ts), and ":id" happily matches the literal string
// "me" — so this must win the match, the same way GET /users/me above
// already wins over GET /users/:id by being registered first in this same
// file. Getting the order wrong here silently 403s every self-edit with
// "Not permitted" instead of ever reaching this handler.
const selfProfileSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(0).max(100).optional(),
  phone: z.string().max(30).nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  major: z.string().max(100).nullable().optional(),
  graduationYear: z.number().int().min(1900).max(2200).nullable().optional(),
});

router.patch(
  "/users/me",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const parsed = selfProfileSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { major, graduationYear, ...userFields } = parsed.data;

    const operations: Prisma.PrismaPromise<unknown>[] = [
      prisma.user.update({ where: { id: req.user!.id }, data: userFields }),
    ];
    if (req.user!.membershipId && (major !== undefined || graduationYear !== undefined)) {
      operations.push(
        prisma.chapterMembership.update({
          where: { id: req.user!.membershipId },
          data: {
            ...(major !== undefined ? { major } : {}),
            ...(graduationYear !== undefined ? { graduationYear } : {}),
          },
        })
      );
    }
    await prisma.$transaction(operations);

    const [updatedUser, membership, committeeMemberships] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } }),
      req.user!.chapterId
        ? prisma.chapterMembership.findUnique({
            where: { chapterId_userId: { chapterId: req.user!.chapterId, userId: req.user!.id } },
          })
        : Promise.resolve(null),
      prisma.committeeMembership.findMany({
        where: { userId: req.user!.id },
        include: { committee: { select: { id: true, name: true } } },
      }),
    ]);

    await writeAuditLog({
      actorId: req.user!.id,
      action: "SELF_PROFILE_UPDATE",
      entityType: "User",
      entityId: req.user!.id,
      after: parsed.data,
    });

    res.json({
      user: {
        ...flattenUser(updatedUser, membership, committeeMemberships.filter((m) => m.role === "CHAIR").map((m) => m.committeeId)),
        committeeMemberships: committeeMemberships.map((m) => ({
          committeeId: m.committeeId,
          committeeName: m.committee.name,
          role: m.role,
        })),
      },
    });
  })
);

// ── DELETE /users/me — self-service account deletion ──────────────────────
// Any authenticated user, no permission gate — deleting your own account
// isn't something that needs a grant. deleteUserAccount() removes the live
// Clerk account (so sign-in stops working immediately, on any device) and
// soft-deletes the local row in the same call — see lib/deleteUser.ts.
router.delete(
  "/users/me",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user || user.deletedAt) return res.status(404).json({ error: "User not found" });

    await deleteUserAccount(user);

    await writeAuditLog({
      actorId: user.id,
      action: "USER_SELF_DELETED",
      entityType: "User",
      entityId: user.id,
    });

    res.json({ deleted: true });
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

// ── GET /users/search ───────────────────────────────────────────────────────
// Any authenticated chapter member — deliberately NOT Exec-gated, unlike
// GET /users above. This exists so a member can find candidates for their
// OWN Big/Little (see membership.routes.ts PATCH /users/:id/big, now
// self-serviceable) without needing roster access, which is Exec+ because it
// returns email/role/status/roleNumber. This returns only name + avatar —
// no email, no role, nothing an ordinary member shouldn't see about a
// chapter-mate. Registered BEFORE GET /users/:id below for the same reason
// PATCH /users/me had to move to before PATCH /users/:id: ":id" matches the
// literal string "search" too, and Express takes whichever route was
// registered first.
router.get(
  "/users/search",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const chapterId = req.user!.chapterId;
    if (!chapterId) return res.status(403).json({ error: "Join a chapter first" });

    const q = String(req.query.q ?? "").trim();
    if (!q) return res.json({ users: [] });

    const memberships = await prisma.chapterMembership.findMany({
      where: {
        chapterId,
        userId: { not: req.user!.id }, // you're never a candidate for your own Big/Little
        user: {
          deletedAt: null,
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
          ],
        },
      },
      take: 15,
      orderBy: [{ user: { lastName: "asc" } }, { user: { firstName: "asc" } }],
      select: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
    });

    res.json({ users: memberships.map((m) => m.user) });
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
//
// Also derives and writes `status` alongside `role` — see syncedStatus()
// below. Before this, this was the ONLY reachable way to change a member's
// role from the real app (MemberProfilePage.tsx's role Select calls
// updateUserRole → here; the broader PATCH /users/:id below can set role
// and status together explicitly, but no screen calls it), and it only ever
// wrote `role`. A PNM who signs up gets role=PNM + status=PNM together
// (self-consistent at creation); promoting them to Member here left
// status="PNM" behind, so the roster showed a Member who was simultaneously
// still a PNM — the old and new identities visibly "stacked" instead of the
// new one replacing it, exactly for lack of this sync.
const roleSchema = z.object({
  role: z.enum(["SUPER_ADMIN", "EXEC", "MEMBER", "PNM", "ALUMNI"]),
});

/** What `status` should become when `role` is set to `newRole`, given the
 * membership's current status. PNM and ALUMNI are lifecycle stages in their
 * own right — as both a role AND a status — so setting one of those roles
 * always forces the matching status; they're mutually exclusive with every
 * other role/status combination by design ("Alumni should replace PNM or
 * Member/Exec... they should not overlap"). Member and Exec aren't lifecycle
 * stages themselves — they describe an already-ACTIVE person — so they only
 * promote OUT of PNM/ALUMNI into ACTIVE, and never touch an existing ACTIVE
 * or INACTIVE status: an admin correcting someone's role/office shouldn't
 * silently un-mark them as inactive as a side effect. Super Admin is an
 * administrative bypass, not a membership lifecycle stage the roster tracks
 * at all — status is left exactly as it was. */
function syncedStatus(newRole: UserRole, currentStatus: MemberStatus): MemberStatus {
  if (newRole === "PNM") return "PNM";
  if (newRole === "ALUMNI") return "ALUMNI";
  if (newRole === "SUPER_ADMIN") return currentStatus;
  // MEMBER or EXEC
  if (currentStatus === "PNM" || currentStatus === "ALUMNI") return "ACTIVE";
  return currentStatus;
}

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

    const newStatus = syncedStatus(parsed.data.role, before.status);

    const updated = await prisma.chapterMembership.update({
      where: { id: before.id },
      data: { role: parsed.data.role, status: newStatus },
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "ROLE_CHANGE",
      entityType: "ChapterMembership",
      entityId: before.id,
      before: { role: before.role, status: before.status },
      after: { role: updated.role, status: updated.status },
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

// ── DELETE /users/:id — Super Admin only ───────────────────────────────────
// Self-delete is blocked here too, same as PATCH /users/:id/role — use
// DELETE /users/me above instead. Not to prevent a Super Admin from ever
// deleting themselves (bootstrap-admin.ts can always create a new one), but
// so the two actions stay distinct: this is "I'm removing someone else,"
// that one is "I'm removing myself," and conflating them behind one button
// risks a misclick on the wrong account.
router.delete(
  "/users/:id",
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    if (req.params.id === req.user!.id) {
      return res.status(400).json({ error: "Use \"Delete my account\" in Settings to delete your own account." });
    }

    const membership = await prisma.chapterMembership.findUnique({
      where: { chapterId_userId: { chapterId: req.user!.chapterId!, userId: req.params.id } },
    });
    if (!membership) return res.status(404).json({ error: "User not found in your chapter" });

    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user || user.deletedAt) return res.status(404).json({ error: "User not found" });

    await deleteUserAccount(user);

    await writeAuditLog({
      actorId: req.user!.id,
      action: "USER_DELETED_BY_ADMIN",
      entityType: "User",
      entityId: user.id,
    });

    res.json({ deleted: true });
  })
);

export default router;
