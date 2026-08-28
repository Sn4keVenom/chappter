// backend/routes/chapters.routes.ts
//
// Chapters, invite codes/links, roster verification entries, and join
// requests (spec §3). A newly created account never auto-joins a chapter
// (see auth.routes.ts /auth/sync) — these are the ways one becomes a member:
// redeem an invite code (or the same code embedded in a deep link — see
// ChapterInvite's doc comment in schema.prisma), request to join and have it
// approved, or claim a role number off the exec-maintained roster (see
// ChapterRosterEntry's doc comment) which auto-files a join request.
//
// Integration:
//   · rbac.ts → requireRole, requirePermission, AuthedRequest, writeAuditLog
//   · lib/userSerializer.ts → flattenUser (shared with auth.routes.ts/users.routes.ts)
//   · schema.prisma → Chapter, ChapterMembership, ChapterInvite,
//     ChapterInviteRedemption, ChapterJoinRequest, ChapterRosterEntry
//   · auth.routes.ts → POST /auth/verify-role-number, the public read-only
//     pre-check that runs before POST /chapters/claim-role-number below

import { Router, Response } from "express";
import { z } from "zod";
import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { AuthedRequest, requireRole, requirePermission, writeAuditLog } from "../middleware/rbac";
import { flattenUser } from "../lib/userSerializer";
import { reconcileRosterClaims } from "../lib/rosterClaim";

const router = Router();

// Uppercase alphanumeric minus visually ambiguous characters (0/O, 1/I) —
// invite codes are read aloud and typed in by hand, not just tapped from a
// link/QR.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function generateInviteCode(): string {
  const bytes = crypto.randomBytes(8);
  let code = "";
  for (let i = 0; i < 8; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return code;
}

/** Guards routes scoped to :id (a chapterId param) so a Super Admin/Exec of
 * one chapter can't act on a different chapter through a raw API call —
 * every session has exactly one active chapter today (see User.activeChapterId
 * doc comment); switching between several is future UI, not built yet. */
function requireOwnChapter(req: AuthedRequest, res: Response): boolean {
  if (req.user?.chapterId !== req.params.id) {
    res.status(403).json({ error: "Not permitted for this chapter" });
    return false;
  }
  return true;
}

// ── GET /chapters — list, for the "Request to Join" chapter picker ───────
// Open to any authenticated user, including one with no membership yet.
router.get(
  "/chapters",
  asyncHandler(async (_req: AuthedRequest, res: Response) => {
    const chapters = await prisma.chapter.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, letters: true, university: true, logoUrl: true },
    });
    res.json({ chapters });
  })
);

// ── POST /chapters ─────────────────────────────────────────────────────────
const chapterSchema = z.object({
  name: z.string().min(1).max(200),
  letters: z.string().max(20).optional(),
  university: z.string().max(200).optional(),
  logoUrl: z.string().url().nullable().optional(),
});

router.post(
  "/chapters",
  requirePermission("chapters.manage"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const parsed = chapterSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const chapter = await prisma.chapter.create({ data: parsed.data });
    await writeAuditLog({
      actorId: req.user!.id,
      action: "CHAPTER_CREATE",
      entityType: "Chapter",
      entityId: chapter.id,
      after: chapter,
    });
    res.status(201).json({ chapter });
  })
);

// ── PATCH /chapters/:id ─────────────────────────────────────────────────────
router.patch(
  "/chapters/:id",
  requirePermission("chapters.manage"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    if (!requireOwnChapter(req, res)) return;

    const parsed = chapterSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const before = await prisma.chapter.findUnique({ where: { id: req.params.id } });
    if (!before) return res.status(404).json({ error: "Chapter not found" });

    const updated = await prisma.chapter.update({ where: { id: req.params.id }, data: parsed.data });
    await writeAuditLog({
      actorId: req.user!.id,
      action: "CHAPTER_UPDATE",
      entityType: "Chapter",
      entityId: updated.id,
      before,
      after: parsed.data,
    });
    res.json({ chapter: updated });
  })
);

// ── Invites ────────────────────────────────────────────────────────────────

const createInviteSchema = z.object({
  role: z.enum(["EXEC", "MEMBER", "PNM", "ALUMNI"]).default("MEMBER"),
  status: z.enum(["ACTIVE", "PNM", "ALUMNI", "INACTIVE"]).default("PNM"),
  maxUses: z.number().int().positive().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

router.post(
  "/chapters/:id/invites",
  requirePermission("chapters.manageInvites"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    if (!requireOwnChapter(req, res)) return;

    const parsed = createInviteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const invite = await prisma.chapterInvite.create({
      data: {
        chapterId: req.params.id,
        code: generateInviteCode(),
        role: parsed.data.role,
        status: parsed.data.status,
        maxUses: parsed.data.maxUses ?? undefined,
        expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined,
        createdById: req.user!.membershipId!,
      },
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "CHAPTER_INVITE_CREATE",
      entityType: "ChapterInvite",
      entityId: invite.id,
      after: invite,
    });

    res.status(201).json({ invite });
  })
);

router.get(
  "/chapters/:id/invites",
  requirePermission("chapters.manageInvites"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    if (!requireOwnChapter(req, res)) return;

    const invites = await prisma.chapterInvite.findMany({
      where: { chapterId: req.params.id },
      orderBy: { createdAt: "desc" },
    });
    res.json({ invites });
  })
);

router.delete(
  "/chapters/:id/invites/:inviteId",
  requirePermission("chapters.manageInvites"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    if (!requireOwnChapter(req, res)) return;

    const invite = await prisma.chapterInvite.findUnique({ where: { id: req.params.inviteId } });
    if (!invite || invite.chapterId !== req.params.id) {
      return res.status(404).json({ error: "Invite not found" });
    }

    const revoked = await prisma.chapterInvite.update({
      where: { id: invite.id },
      data: { revokedAt: new Date() },
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "CHAPTER_INVITE_REVOKE",
      entityType: "ChapterInvite",
      entityId: invite.id,
    });

    res.json({ invite: revoked });
  })
);

// ── Roster verification entries ─────────────────────────────────────────────
// Exec-maintained list of real members/alumni (name + role number), checked
// against a new signup's claim via POST /chapters/claim-role-number below.
// Independent of ChapterMembership.roleNumber, which is only assigned to
// someone AFTER they already have an account — see schema.prisma doc comment
// on ChapterRosterEntry.

const rosterEntrySchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  roleNumber: z.number().int().positive(),
  status: z.enum(["ACTIVE", "ALUMNI"]),
});

router.get(
  "/chapters/:id/roster-entries",
  requirePermission("chapters.manageInvites"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    if (!requireOwnChapter(req, res)) return;

    // Reconcile before reading. Claiming is otherwise only written by the
    // signup path (POST /chapters/claim-role-number), so anyone who joined
    // by invite code, plain join request, or who had a role number assigned
    // by hand left their row reading "Unclaimed" permanently. Doing it here
    // means the screen that shows the column is also the one that corrects
    // it — including for members who joined before this existed — rather
    // than needing a one-off backfill script. Idempotent and a no-op once
    // everything matches, so the repeat cost is one indexed query.
    await reconcileRosterClaims(prisma, req.params.id);

    const rosterEntries = await prisma.chapterRosterEntry.findMany({
      where: { chapterId: req.params.id },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
    res.json({ rosterEntries });
  })
);

router.post(
  "/chapters/:id/roster-entries",
  requirePermission("chapters.manageInvites"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    if (!requireOwnChapter(req, res)) return;

    const parsed = rosterEntrySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    let entry;
    try {
      entry = await prisma.chapterRosterEntry.create({
        data: { chapterId: req.params.id, ...parsed.data, createdById: req.user!.membershipId! },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return res.status(409).json({ error: `Role number ${parsed.data.roleNumber} is already on the roster.` });
      }
      throw err;
    }

    await writeAuditLog({
      actorId: req.user!.id,
      action: "CHAPTER_ROSTER_ENTRY_CREATE",
      entityType: "ChapterRosterEntry",
      entityId: entry.id,
      after: entry,
    });

    res.status(201).json({ rosterEntry: entry });
  })
);

// Bulk paste-import — one call per pasted batch rather than one request per
// row. Each row is created independently (not one all-or-nothing
// transaction) so a single duplicate role number doesn't block the rest of
// a real chapter's roster from importing.
router.post(
  "/chapters/:id/roster-entries/bulk",
  requirePermission("chapters.manageInvites"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    if (!requireOwnChapter(req, res)) return;

    const parsed = z.array(rosterEntrySchema).min(1).max(500).safeParse(req.body.entries);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const created: Awaited<ReturnType<typeof prisma.chapterRosterEntry.create>>[] = [];
    const errors: { index: number; error: string }[] = [];
    for (const [index, row] of parsed.data.entries()) {
      try {
        created.push(
          await prisma.chapterRosterEntry.create({
            data: { chapterId: req.params.id, ...row, createdById: req.user!.membershipId! },
          })
        );
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          errors.push({ index, error: `Role number ${row.roleNumber} is already on the roster.` });
        } else {
          throw err;
        }
      }
    }

    await writeAuditLog({
      actorId: req.user!.id,
      action: "CHAPTER_ROSTER_BULK_CREATE",
      entityType: "ChapterRosterEntry",
      entityId: req.params.id,
      after: { created: created.length, failed: errors.length },
    });

    res.status(201).json({ created, errors });
  })
);

router.delete(
  "/chapters/:id/roster-entries/:entryId",
  requirePermission("chapters.manageInvites"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    if (!requireOwnChapter(req, res)) return;

    const entry = await prisma.chapterRosterEntry.findUnique({ where: { id: req.params.entryId } });
    if (!entry || entry.chapterId !== req.params.id) {
      return res.status(404).json({ error: "Roster entry not found" });
    }
    if (entry.claimedByUserId) {
      return res.status(400).json({
        error: "This entry has already been claimed by a signup and is now part of that record — it can't be deleted.",
      });
    }

    await prisma.chapterRosterEntry.delete({ where: { id: entry.id } });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "CHAPTER_ROSTER_ENTRY_DELETE",
      entityType: "ChapterRosterEntry",
      entityId: entry.id,
      before: entry,
    });

    res.status(204).end();
  })
);

// ── POST /chapters/claim-role-number — any authenticated user ─────────────
// The real, atomic version of the pre-check at POST /auth/verify-role-number
// (auth.routes.ts) — that endpoint is read-only and runs before a Clerk
// account even exists; this one runs once the user has a session, actually
// claims the roster row, and derives the join request's roleNumber/
// memberStatus from the MATCHED ROW, never from client input directly. Do
// not let a future change accept those two fields straight from req.body —
// that would let anyone claim to be e.g. role #1 with no verification.
const claimRoleNumberSchema = z.object({
  firstName: z.string().min(1).max(100),
  roleNumber: z.number().int().positive(),
  status: z.enum(["ACTIVE", "ALUMNI"]),
  message: z.string().max(500).optional(),
});

router.post(
  "/chapters/claim-role-number",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const parsed = claimRoleNumberSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { firstName, roleNumber, status, message } = parsed.data;

    // Same lookup shape (and ordering, for the multi-chapter-collision edge
    // case) as the pre-check in auth.routes.ts, so both calls resolve to the
    // same row.
    const match = await prisma.chapterRosterEntry.findFirst({
      where: { roleNumber, status, firstName: { equals: firstName, mode: "insensitive" }, claimedByUserId: null },
      orderBy: { createdAt: "asc" },
    });
    if (!match) {
      return res.status(404).json({ error: "That name and role number don't match an unclaimed roster entry." });
    }

    const existingMembership = await prisma.chapterMembership.findUnique({
      where: { chapterId_userId: { chapterId: match.chapterId, userId: req.user!.id } },
    });
    if (existingMembership) {
      return res.status(409).json({ error: "You're already a member of this chapter" });
    }
    const existingPending = await prisma.chapterJoinRequest.findFirst({
      where: { chapterId: match.chapterId, userId: req.user!.id, status: "PENDING" },
    });
    if (existingPending) {
      return res.status(409).json({ error: "You already have a pending request for this chapter" });
    }

    let joinRequest;
    try {
      joinRequest = await prisma.$transaction(async (tx) => {
        // Same conditional-update-as-lock pattern as invite redemption above:
        // the findFirst check is a fast-path nicety, this guarded updateMany
        // is the real guarantee against two signups racing the same row.
        const claim = await tx.chapterRosterEntry.updateMany({
          where: { id: match.id, claimedByUserId: null },
          data: { claimedByUserId: req.user!.id },
        });
        if (claim.count === 0) {
          throw new Error("ROSTER_ENTRY_ALREADY_CLAIMED");
        }
        return tx.chapterJoinRequest.create({
          data: {
            chapterId: match.chapterId,
            userId: req.user!.id,
            message,
            roleNumber: match.roleNumber,
            memberStatus: match.status,
          },
        });
      });
    } catch (err) {
      if (err instanceof Error && err.message === "ROSTER_ENTRY_ALREADY_CLAIMED") {
        return res.status(409).json({ error: "That role number was just claimed by someone else." });
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return res.status(409).json({ error: "You already have a pending request for this chapter" });
      }
      throw err;
    }

    await writeAuditLog({
      actorId: req.user!.id,
      action: "MEMBERSHIP_JOIN_REQUEST_VIA_ROSTER_CLAIM",
      entityType: "ChapterJoinRequest",
      entityId: joinRequest.id,
      after: { chapterId: joinRequest.chapterId, roleNumber: joinRequest.roleNumber, memberStatus: joinRequest.memberStatus },
    });

    res.status(201).json({ joinRequest });
  })
);

// ── POST /chapters/join/redeem — any authenticated user ───────────────────
const redeemSchema = z.object({ code: z.string().min(1).max(40) });

router.post(
  "/chapters/join/redeem",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const parsed = redeemSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const invite = await prisma.chapterInvite.findUnique({
      where: { code: parsed.data.code.trim().toUpperCase() },
    });
    if (!invite || invite.revokedAt) {
      return res.status(404).json({ error: "Invite code not found or revoked" });
    }
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      return res.status(400).json({ error: "This invite code has expired" });
    }
    if (invite.maxUses != null && invite.useCount >= invite.maxUses) {
      return res.status(400).json({ error: "This invite code has reached its use limit" });
    }

    const existing = await prisma.chapterMembership.findUnique({
      where: { chapterId_userId: { chapterId: invite.chapterId, userId: req.user!.id } },
    });
    if (existing) {
      return res.status(409).json({ error: "You're already a member of this chapter" });
    }

    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });

    // The maxUses/revoked checks above are read-then-act — under concurrent
    // redemptions of the same code (e.g. two people racing a single-use
    // invite) they'd both pass the pre-check and over-redeem it. The
    // atomic conditional update below is the real guard: it only succeeds
    // if the invite is still unrevoked and under its use limit AT COMMIT
    // TIME, using Postgres's row lock on the UPDATE to serialize
    // concurrent attempts — one wins, the other sees count 0 and aborts.
    const usageGuard = invite.maxUses != null ? { useCount: { lt: invite.maxUses } } : {};

    let membership;
    try {
      membership = await prisma.$transaction(async (tx) => {
        const claim = await tx.chapterInvite.updateMany({
          where: { id: invite.id, revokedAt: null, ...usageGuard },
          data: { useCount: { increment: 1 } },
        });
        if (claim.count === 0) {
          throw new Error("INVITE_UNAVAILABLE");
        }

        const created = await tx.chapterMembership.create({
          data: {
            userId: user.id,
            chapterId: invite.chapterId,
            role: invite.role,
            status: invite.status,
            invitedById: invite.createdById,
          },
        });
        await tx.chapterInviteRedemption.create({
          data: { inviteId: invite.id, userId: user.id },
        });
        if (!user.activeChapterId) {
          await tx.user.update({ where: { id: user.id }, data: { activeChapterId: invite.chapterId } });
        }
        return created;
      });
    } catch (err) {
      if (err instanceof Error && err.message === "INVITE_UNAVAILABLE") {
        return res.status(400).json({ error: "This invite code was just used up or revoked — ask for a new one." });
      }
      throw err;
    }

    await writeAuditLog({
      actorId: user.id,
      action: "MEMBERSHIP_JOIN_VIA_INVITE",
      entityType: "ChapterMembership",
      entityId: membership.id,
      after: { chapterId: invite.chapterId, role: membership.role, status: membership.status },
    });

    res.status(201).json({ user: flattenUser(user, membership) });
  })
);

// ── Join requests ───────────────────────────────────────────────────────────

const joinRequestSchema = z.object({ message: z.string().max(500).optional() });

router.post(
  "/chapters/:id/join-requests",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const chapter = await prisma.chapter.findUnique({ where: { id: req.params.id } });
    if (!chapter) return res.status(404).json({ error: "Chapter not found" });

    const existingMembership = await prisma.chapterMembership.findUnique({
      where: { chapterId_userId: { chapterId: chapter.id, userId: req.user!.id } },
    });
    if (existingMembership) {
      return res.status(409).json({ error: "You're already a member of this chapter" });
    }

    const existingPending = await prisma.chapterJoinRequest.findFirst({
      where: { chapterId: chapter.id, userId: req.user!.id, status: "PENDING" },
    });
    if (existingPending) {
      return res.status(409).json({ error: "You already have a pending request for this chapter" });
    }

    const parsed = joinRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    // The findFirst check above is a fast-path UX nicety, not the real
    // guarantee — it has the same read-then-act race as the invite
    // redemption fix elsewhere in this file (two concurrent submits could
    // both pass it). The actual guarantee is the partial unique index from
    // migrations/20260710091000_join_request_partial_unique (undeclarable
    // in schema.prisma — see the doc comment on ChapterJoinRequest there),
    // which still reports as a normal Prisma P2002 even though Prisma's
    // schema doesn't know the constraint exists.
    let joinRequest;
    try {
      joinRequest = await prisma.chapterJoinRequest.create({
        data: { chapterId: chapter.id, userId: req.user!.id, message: parsed.data.message },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return res.status(409).json({ error: "You already have a pending request for this chapter" });
      }
      throw err;
    }

    res.status(201).json({ joinRequest });
  })
);

router.get(
  "/chapters/:id/join-requests",
  requirePermission("chapters.manageInvites"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    if (!requireOwnChapter(req, res)) return;

    const VALID_STATUSES = ["PENDING", "APPROVED", "DENIED"] as const;
    const statusParam = typeof req.query.status === "string" ? req.query.status : "PENDING";
    if (!VALID_STATUSES.includes(statusParam as (typeof VALID_STATUSES)[number])) {
      return res.status(400).json({ error: "Invalid status filter" });
    }
    const status = statusParam as (typeof VALID_STATUSES)[number];

    const joinRequests = await prisma.chapterJoinRequest.findMany({
      where: { chapterId: req.params.id, status },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
    res.json({ joinRequests });
  })
);

const reviewSchema = z.object({ approve: z.boolean() });

router.patch(
  "/chapters/join-requests/:id",
  requirePermission("chapters.manageInvites"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const joinRequest = await prisma.chapterJoinRequest.findUnique({ where: { id: req.params.id } });
    if (!joinRequest) return res.status(404).json({ error: "Join request not found" });
    if (req.user?.chapterId !== joinRequest.chapterId) {
      return res.status(403).json({ error: "Not permitted for this chapter" });
    }
    if (joinRequest.status !== "PENDING") {
      return res.status(400).json({ error: "This request has already been reviewed" });
    }

    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const updated = await prisma.$transaction(async (tx) => {
      const reviewed = await tx.chapterJoinRequest.update({
        where: { id: joinRequest.id },
        data: {
          status: parsed.data.approve ? "APPROVED" : "DENIED",
          reviewedById: req.user!.membershipId,
          reviewedAt: new Date(),
        },
      });

      if (parsed.data.approve) {
        const membership = await tx.chapterMembership.create({
          data: {
            userId: joinRequest.userId,
            chapterId: joinRequest.chapterId,
            invitedById: req.user!.membershipId,
            // Only set for requests auto-filed by claim-role-number
            // (roster-verified signup) — an ordinary browse/invite-adjacent
            // request leaves these at the schema defaults (role MEMBER,
            // status PNM), same as today.
            ...(joinRequest.memberStatus
              ? {
                  role: joinRequest.memberStatus === "ALUMNI" ? "ALUMNI" : "MEMBER",
                  status: joinRequest.memberStatus,
                  roleNumber: joinRequest.roleNumber,
                }
              : {}),
          },
        });
        const user = await tx.user.findUniqueOrThrow({ where: { id: joinRequest.userId } });
        if (!user.activeChapterId) {
          await tx.user.update({
            where: { id: user.id },
            data: { activeChapterId: joinRequest.chapterId },
          });
        }
        // The new membership may match a roster entry — claim it now (and
        // fill in a role number if the match was by name), rather than
        // leaving it until someone opens the roster screen.
        await reconcileRosterClaims(tx, joinRequest.chapterId);

        return { reviewed, membership };
      }
      return { reviewed, membership: null };
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "MEMBERSHIP_JOIN_REQUEST_REVIEWED",
      entityType: "ChapterJoinRequest",
      entityId: joinRequest.id,
      after: { status: updated.reviewed.status },
    });

    res.json({ joinRequest: updated.reviewed });
  })
);

// ── GET /chapters/me/pending — current user's own pending request ────────
// Used by the mobile onboarding screen to know whether to show "pending
// approval" vs. the join options.
router.get(
  "/chapters/me/pending",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const joinRequest = await prisma.chapterJoinRequest.findFirst({
      where: { userId: req.user!.id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: { chapter: { select: { name: true } } },
    });
    if (!joinRequest) return res.json({ joinRequest: null });
    res.json({
      joinRequest: {
        id: joinRequest.id,
        chapterId: joinRequest.chapterId,
        chapterName: joinRequest.chapter.name,
        message: joinRequest.message,
        status: joinRequest.status,
        createdAt: joinRequest.createdAt,
      },
    });
  })
);

export default router;
