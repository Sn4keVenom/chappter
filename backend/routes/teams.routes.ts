// backend/routes/teams.routes.ts
//
// Gamification teams (spec Feature 2 — src/types/index.ts Team doc comment).
// Real-backend counterpart to mocks/api.ts listTeams/getTeam/
// getTeamLeaderboard/addTeamMember/removeTeamMember. This router did not
// exist at all before — every one of these calls 404'd against the real
// backend (src/api/teams.ts's GET /teams/leaderboard, reported directly),
// which meant the TEAMS module (schema.prisma ModuleKey) was unusable
// outside Demo Mode.
//
// NOT committees: no chair/role distinction, and a member belongs to at
// most one team — reassigning replaces it (see ChapterMembership.teamId's
// doc comment). Teams themselves aren't created or renamed from the app
// today (no createTeam call exists in src/api/teams.ts, matching the mock,
// where db.teams is fixed seed data) — an Exec+ manages ROSTER, not the
// teams list itself. If team creation/rename is wanted later, POST /teams
// and PATCH /teams/:id slot in here the same way every other resource in
// this file does.
//
// Points aren't stored on Team — a team's total is the sum of its current
// members' PointsLedger entries for the active semester, computed the same
// way as the individual leaderboard (GET /points/leaderboard,
// attendance.routes.ts) so the two leaderboards agree on what "this
// semester" means.
//
// Integration:
//   · rbac.ts → requireRole, isAtLeast, AuthedRequest, writeAuditLog
//   · schema.prisma → Team, ChapterMembership.teamId
//   · src/api/teams.ts on the client side — same request/response shapes

import { Router, Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { AuthedRequest, requireRole, requirePermission, writeAuditLog } from "../middleware/rbac";

const router = Router();

interface TeamRow {
  id: string;
  name: string;
  color: string | null;
}

/** Shared by every route below — one team's member list with per-member
 * current-semester points, sorted highest first (matches mocks/api.ts
 * toTeam's `.sort((a, b) => b.points - a.points)`), plus the totals derived
 * from it. Doing this per-team rather than one big join keeps the "does this
 * team exist" 404 check and the shape simple; teams are small (a chapter has
 * a handful, not hundreds), so N+1 here is a non-issue. */
async function loadTeamDetail(team: TeamRow, semesterId: string | null) {
  const memberships = await prisma.chapterMembership.findMany({
    // user.deletedAt: null — a soft-deleted account keeps its team membership
    // (deletion never touches ChapterMembership; see lib/deleteUser.ts), so
    // exclude it here or it still pads memberCount and totalPoints. Matches
    // the individual leaderboard (GET /points/leaderboard).
    where: { teamId: team.id, user: { deletedAt: null } },
    include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
  });

  const pointsByUser = new Map<string, number>();
  if (semesterId && memberships.length > 0) {
    const totals = await prisma.pointsLedger.groupBy({
      by: ["userId"],
      where: { semesterId, userId: { in: memberships.map((m) => m.userId) } },
      _sum: { amount: true },
    });
    for (const t of totals) pointsByUser.set(t.userId, t._sum.amount ?? 0);
  }

  const members = memberships
    .map((m) => ({
      userId: m.user.id,
      firstName: m.user.firstName,
      lastName: m.user.lastName,
      avatarUrl: m.user.avatarUrl,
      points: pointsByUser.get(m.userId) ?? 0,
    }))
    .sort((a, b) => b.points - a.points);

  return {
    id: team.id,
    name: team.name,
    color: team.color,
    memberCount: members.length,
    totalPoints: members.reduce((sum, m) => sum + m.points, 0),
    members,
  };
}

/** The semester GET /points/leaderboard treats as "current" — same lookup,
 * so both leaderboards agree on what "this semester" means. Null (no
 * semester spans today) is a valid, handled state, not an error. */
async function currentSemesterId(): Promise<string | null> {
  const sem = await prisma.semester.findFirst({
    where: { startDate: { lte: new Date() }, endDate: { gte: new Date() } },
  });
  return sem?.id ?? null;
}

// ── POST /teams — Exec+ ─────────────────────────────────────────────────────
// Not in src/api/teams.ts or the mock (db.teams is fixed seed data there) —
// added anyway because without SOME way to create a team, GET /teams and
// GET /teams/leaderboard have no data to ever return on a real deployment.
// No dedicated admin screen calls this yet; it exists so the feature is
// usable (curl/Postman, or a future admin page) rather than permanently
// empty. If a "Manage teams" screen is wanted later, this is what it'd call.
const createTeamSchema = z.object({
  name: z.string().min(1).max(60),
  color: z.string().max(20).nullable().optional(),
});

router.post(
  "/teams",
  requireRole("EXEC"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const chapterId = req.user!.chapterId!;
    const parsed = createTeamSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    let team;
    try {
      team = await prisma.team.create({ data: { chapterId, ...parsed.data } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return res.status(409).json({ error: "A team with that name already exists" });
      }
      throw err;
    }

    await writeAuditLog({
      actorId: req.user!.id,
      action: "TEAM_CREATE",
      entityType: "Team",
      entityId: team.id,
      after: { name: team.name, color: team.color },
    });

    res.status(201).json({ team: await loadTeamDetail(team, await currentSemesterId()) });
  })
);

// ── PATCH /teams/:id — Regent, Vice Regent, or Super Admin ─────────────────
// Narrower than create/delete (Exec+, via requireRole above): renaming an
// existing team is explicitly scoped to the two offices that speak for the
// chapter, per teams.rename's grant in permissionDefaults.ts.
const renameTeamSchema = z.object({ name: z.string().min(1).max(60) });

router.patch(
  "/teams/:id",
  requirePermission("teams.rename"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const parsed = renameTeamSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const team = await prisma.team.findFirst({
      where: { id: req.params.id, chapterId: req.user!.chapterId },
    });
    if (!team) return res.status(404).json({ error: "Team not found" });

    let updated;
    try {
      updated = await prisma.team.update({
        where: { id: team.id },
        data: { name: parsed.data.name.trim() },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return res.status(409).json({ error: "A team with that name already exists" });
      }
      throw err;
    }

    await writeAuditLog({
      actorId: req.user!.id,
      action: "TEAM_RENAME",
      entityType: "Team",
      entityId: team.id,
      before: { name: team.name },
      after: { name: updated.name },
    });

    res.json({ team: await loadTeamDetail(updated, await currentSemesterId()) });
  })
);

// ── DELETE /teams/:id — Exec+ ───────────────────────────────────────────────
// Members aren't reassigned first — the FK is ON DELETE SET NULL (see
// schema.prisma ChapterMembership.team), so deleting a team just returns its
// members to no team, the same end state as removing them individually.
router.delete(
  "/teams/:id",
  requireRole("EXEC"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const team = await prisma.team.findFirst({
      where: { id: req.params.id, chapterId: req.user!.chapterId },
    });
    if (!team) return res.status(404).json({ error: "Team not found" });

    await prisma.team.delete({ where: { id: team.id } });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "TEAM_DELETE",
      entityType: "Team",
      entityId: team.id,
      before: { name: team.name },
    });

    res.json({ deleted: true });
  })
);

// ── GET /teams ───────────────────────────────────────────────────────────
router.get(
  "/teams",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const chapterId = req.user!.chapterId;
    if (!chapterId) return res.status(403).json({ error: "Join a chapter first" });

    const teams = await prisma.team.findMany({ where: { chapterId }, orderBy: { name: "asc" } });
    const semesterId = await currentSemesterId();
    const detailed = await Promise.all(teams.map((t) => loadTeamDetail(t, semesterId)));

    res.json({ teams: detailed });
  })
);

// ── GET /teams/leaderboard ─────────────────────────────────────────────────
// Registered before /teams/:id so Express doesn't try to look up a team
// literally named "leaderboard" (same ordering hazard as PATCH /users/me
// vs PATCH /users/:id in users.routes.ts).
router.get(
  "/teams/leaderboard",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const chapterId = req.user!.chapterId;
    if (!chapterId) return res.status(403).json({ error: "Join a chapter first" });

    const [teams, semesterId, semester] = await Promise.all([
      prisma.team.findMany({ where: { chapterId } }),
      currentSemesterId(),
      prisma.semester.findFirst({
        where: { startDate: { lte: new Date() }, endDate: { gte: new Date() } },
      }),
    ]);

    const myTeamId = req.user!.membershipId
      ? (await prisma.chapterMembership.findUnique({
          where: { id: req.user!.membershipId },
          select: { teamId: true },
        }))?.teamId ?? null
      : null;

    const detailed = await Promise.all(teams.map((t) => loadTeamDetail(t, semesterId)));
    const ranked = detailed.sort((a, b) => b.totalPoints - a.totalPoints);

    const leaderboard = ranked.map((t, i) => ({
      rank: i + 1,
      teamId: t.id,
      teamName: t.name,
      color: t.color,
      totalPoints: t.totalPoints,
      memberCount: t.memberCount,
      isMyTeam: t.id === myTeamId,
    }));

    res.json({ leaderboard, semesterLabel: semester?.label ?? null });
  })
);

// ── GET /teams/:id ─────────────────────────────────────────────────────────
router.get(
  "/teams/:id",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const team = await prisma.team.findFirst({
      where: { id: req.params.id, chapterId: req.user!.chapterId },
    });
    if (!team) return res.status(404).json({ error: "Team not found" });

    const semesterId = await currentSemesterId();
    res.json({ team: await loadTeamDetail(team, semesterId) });
  })
);

// ── POST /teams/:id/members — Exec+ ─────────────────────────────────────────
// One team per member: this REPLACES whatever team the member was already
// on (mirrors mocks/api.ts addTeamMember's "user.teamId = teamId" — a plain
// reassignment, not an add-to-a-set).
const addMemberSchema = z.object({ userId: z.string().min(1) });

router.post(
  "/teams/:id/members",
  requireRole("EXEC"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const chapterId = req.user!.chapterId!;
    const parsed = addMemberSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const team = await prisma.team.findFirst({ where: { id: req.params.id, chapterId } });
    if (!team) return res.status(404).json({ error: "Team not found" });

    const membership = await prisma.chapterMembership.findUnique({
      where: { chapterId_userId: { chapterId, userId: parsed.data.userId } },
    });
    if (!membership) return res.status(404).json({ error: "Member not found in your chapter" });

    const before = membership.teamId;
    await prisma.chapterMembership.update({
      where: { id: membership.id },
      data: { teamId: team.id },
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "TEAM_MEMBER_ASSIGNED",
      entityType: "ChapterMembership",
      entityId: membership.id,
      before: { teamId: before },
      after: { teamId: team.id },
    });

    const semesterId = await currentSemesterId();
    res.json({ team: await loadTeamDetail(team, semesterId) });
  })
);

// ── DELETE /teams/:id/members/:userId — Exec+ ───────────────────────────────
router.delete(
  "/teams/:id/members/:userId",
  requireRole("EXEC"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const chapterId = req.user!.chapterId!;

    const team = await prisma.team.findFirst({ where: { id: req.params.id, chapterId } });
    if (!team) return res.status(404).json({ error: "Team not found" });

    const membership = await prisma.chapterMembership.findUnique({
      where: { chapterId_userId: { chapterId, userId: req.params.userId } },
    });
    // Only clear it if they're actually on THIS team — a stale/mismatched
    // :id shouldn't silently knock someone off a different team than the
    // one named in the URL.
    if (!membership || membership.teamId !== team.id) {
      return res.status(404).json({ error: "That member isn't on this team" });
    }

    await prisma.chapterMembership.update({
      where: { id: membership.id },
      data: { teamId: null },
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "TEAM_MEMBER_REMOVED",
      entityType: "ChapterMembership",
      entityId: membership.id,
      before: { teamId: team.id },
      after: { teamId: null },
    });

    const semesterId = await currentSemesterId();
    res.json({ team: await loadTeamDetail(team, semesterId) });
  })
);

export default router;
