// backend/routes/auth.routes.ts
//
// Handles first-login provisioning. Called immediately after Clerk sign-in
// before the mobile app can use any other route (the auth middleware returns
// NEEDS_SYNC when the user row doesn't exist yet).
//
// A freshly-created User never has a chapter membership (spec §2/§3 — no
// auto-assigned role). The response's `hasChapter`/`role`/`office`/`status`
// come from flattenUser() resolving the user's active ChapterMembership, if
// any; `pendingJoinRequest` lets the mobile app show "pending approval"
// instead of the join options when one's outstanding.
//
// Integration points:
//   · schema.prisma → User (upsert by authProviderId), ChapterMembership
//   · lib/userSerializer.ts → flattenUser (shared with users.routes.ts,
//     chapters.routes.ts)
//   · rbac.ts → AuthedRequest type
//   · lib/prisma.ts → prisma singleton
//   · server.ts mounts this BEFORE authMiddleware so unauthenticated users
//     can reach it on first install
//
// No requireRole guard here — the JWT is still verified inline because we
// can't use the normal authMiddleware (user row may not exist yet).

import { Router, Request, Response } from "express";
import { verifyToken } from "@clerk/backend";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { flattenUser } from "../lib/userSerializer";

const router = Router();

const syncSchema = z.object({
  firstName: z.string().min(1).max(100),
  // Google/Apple accounts sometimes have no last name (single-name users,
  // accounts that only set a given name). min(0) prevents a 400 on first login.
  lastName: z.string().min(0).max(100),
  email: z.string().email(),
  // Only present when the client already collected one (email/password
  // sign-up — see SignUpScreen). OAuth sign-ins (Google/Apple) don't have a
  // Clerk username, so this is optional and auto-suggested below on create.
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_.]+$/).optional(),
  phone: z.string().optional(),
  avatarUrl: z.string().url().optional(),
});

const verifyRoleNumberSchema = z.object({
  firstName: z.string().min(1).max(100),
  roleNumber: z.number().int().positive(),
  // PNM never has a role number, so it's never a valid input here — the
  // signup form only calls this endpoint when the user picked Active/Alumni.
  status: z.enum(["ACTIVE", "ALUMNI"]),
});

const USERNAME_ALPHABET = /[^a-z0-9_]/g;

/** Derives a unique username from an email local-part for OAuth sign-ins
 * that never collected one — e.g. "jane.doe@x.edu" → "janedoe", disambiguated
 * with a numeric suffix on collision. Users can change it later via the
 * profile editor (PATCH /users/me does not currently expose this — username
 * is treated as a stable identity fact, changeable only by Super Admin
 * today via a direct data fix, matching how few apps let this churn freely). */
async function suggestUsername(email: string): Promise<string> {
  const base = email.split("@")[0].toLowerCase().replace(USERNAME_ALPHABET, "") || "member";
  let candidate = base;
  let suffix = 0;
  // Bounded retry — collisions on a real email-derived base are rare enough
  // that this will essentially always resolve on the first or second try.
  while (suffix < 1000) {
    const existing = await prisma.user.findUnique({ where: { username: candidate } });
    if (!existing) return candidate;
    suffix += 1;
    candidate = `${base}${suffix}`;
  }
  return `${base}${Date.now()}`;
}

// ── POST /auth/sync ───────────────────────────────────────────────────────
// Upsert the User row from the auth provider identity.
router.post(
  "/auth/sync",
  asyncHandler(async (req: Request, res: Response) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing authorization header" });
    }

    let authProviderId: string;
    try {
      const payload = await verifyToken(header.slice(7), {
        secretKey: process.env.CLERK_SECRET_KEY!,
      });
      authProviderId = payload.sub;
    } catch {
      return res.status(401).json({ error: "Invalid token" });
    }

    const parsed = syncSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const body = parsed.data;

    const existing = await prisma.user.findUnique({ where: { authProviderId } });

    // A soft-deleted row (Clerk `user.deleted` webhook already fired for
    // this authProviderId — see webhook.routes.ts) must never be silently
    // resurrected by the upsert below overwriting its placeholder email/
    // username back to real values. In practice Clerk itself stops issuing
    // valid sessions for a deleted account, so this should be unreachable —
    // this is the defensive backstop, not the primary guard.
    if (existing?.deletedAt) {
      return res.status(401).json({ error: "This account has been deleted" });
    }

    // suggestUsername() checks availability before proposing a candidate,
    // but that check-then-insert isn't atomic — two OAuth sign-ups deriving
    // the same base username (e.g. "j.smith@gmail.com" and
    // "j.smith@yahoo.com" both → "jsmith") can race and both pass the
    // check. The retry loop below catches the resulting unique-constraint
    // violation and re-suggests, which will correctly skip the
    // now-committed username on the next attempt. A client-supplied
    // username (real sign-up flow) colliding is treated as a real conflict
    // instead — silently substituting a different one out from under a
    // user who explicitly chose it would be surprising.
    let user;
    let attempt = 0;
    for (;;) {
      // Prisma validates the `create` branch's required fields even when
      // `existing` means `update` is the one that'll actually run — found
      // by the test suite added in this same hardening pass: every repeat
      // sign-in (not just the first) calls /auth/sync, and `username`
      // being `undefined` here for an existing user 500'd on literally
      // every one of them. `create` only needs a *valid* value, never an
      // actually-new one, when the row already exists — the existing
      // user's own username is a safe, never-used-in-practice filler.
      const username = existing ? existing.username : body.username ?? (await suggestUsername(body.email));
      try {
        user = await prisma.user.upsert({
          where: { authProviderId },
          update: {
            firstName: body.firstName,
            lastName: body.lastName,
            email: body.email,
            ...(body.phone ? { phone: body.phone } : {}),
            ...(body.avatarUrl ? { avatarUrl: body.avatarUrl } : {}),
          },
          create: {
            authProviderId,
            firstName: body.firstName,
            lastName: body.lastName,
            email: body.email,
            username,
            phone: body.phone,
            avatarUrl: body.avatarUrl,
          },
        });
        break;
      } catch (err) {
        const conflictTarget =
          err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
            ? (err.meta?.target as string[] | undefined)
            : undefined;

        // A different existing account already owns this email (e.g. the
        // user previously signed up with a password using this address, and
        // is now completing a Google/Apple sign-in that Clerk treats as a
        // distinct identity with the same email) — this hits the `create`
        // branch and violates User.email's unique constraint. Without this
        // check the error fell through to the generic 500 handler below,
        // leaving the Clerk session active but the app stuck with no user.
        if (conflictTarget?.includes("email")) {
          return res.status(409).json({
            error: "An account with this email already exists. Please sign in using your original method.",
          });
        }

        const isUsernameConflict = conflictTarget?.includes("username");
        if (!isUsernameConflict) throw err;
        if (body.username) {
          return res.status(409).json({ error: "That username is already taken." });
        }
        if (++attempt >= 5) throw err;
        // loop and re-suggest
      }
    }

    const membership = user.activeChapterId
      ? await prisma.chapterMembership.findUnique({
          where: { chapterId_userId: { chapterId: user.activeChapterId, userId: user.id } },
        })
      : null;

    const committeeMemberships = await prisma.committeeMembership.findMany({
      where: { userId: user.id, role: "CHAIR" },
      select: { committeeId: true },
    });

    let pendingJoinRequest = null;
    if (!membership) {
      const joinRequest = await prisma.chapterJoinRequest.findFirst({
        where: { userId: user.id, status: "PENDING" },
        orderBy: { createdAt: "desc" },
        include: { chapter: { select: { name: true } } },
      });
      pendingJoinRequest = joinRequest
        ? {
            id: joinRequest.id,
            chapterId: joinRequest.chapterId,
            chapterName: joinRequest.chapter.name,
            status: joinRequest.status,
            createdAt: joinRequest.createdAt,
          }
        : null;
    }

    res.json({
      user: {
        ...flattenUser(user, membership, committeeMemberships.map((m) => m.committeeId)),
        pendingJoinRequest,
      },
    });
  })
);

// ── POST /auth/verify-role-number — public, no auth ─────────────────────────
// Read-only pre-check called from the sign-up form BEFORE a Clerk account
// exists, so a name/role-number mismatch can be shown inline without ever
// touching Clerk. This is deliberately NOT the actual claim — see
// POST /chapters/claim-role-number (chapters.routes.ts), which does the real
// atomic claim once the user has a session, using the exact same lookup
// ordering as here so both calls resolve to the same roster row.
//
// roleNumber is only unique per-chapter (schema.prisma), not globally, so in
// a deployment with multiple chapters two different chapters could in theory
// both have an unclaimed "Active, role #12, first name Sam" row — an
// astronomically unlikely real-world collision this endpoint does not try to
// disambiguate; it takes the oldest matching row, deterministically.
//
// Rate-limited hard in server.ts (separately from the general /auth limiter)
// because this is an enumeration vector: a name+number pair can be brute-forced
// by anyone, no account required.
router.post(
  "/auth/verify-role-number",
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = verifyRoleNumberSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { firstName, roleNumber, status } = parsed.data;

    const match = await prisma.chapterRosterEntry.findFirst({
      where: { roleNumber, status, firstName: { equals: firstName, mode: "insensitive" } },
      orderBy: { createdAt: "asc" },
    });
    if (match) {
      if (match.claimedByUserId) {
        return res.json({ valid: false, reason: "ALREADY_CLAIMED" });
      }
      return res.json({ valid: true });
    }

    // Distinguish "role number just doesn't exist for that status" from
    // "it exists, but under a different name" — same generic message is
    // shown to the user either way, but the reason is useful for support/logs.
    const numberExists = await prisma.chapterRosterEntry.findFirst({
      where: { roleNumber, status },
      select: { id: true },
    });
    res.json({ valid: false, reason: numberExists ? "NAME_MISMATCH" : "NOT_FOUND" });
  })
);

const lookupRoleNumberSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  status: z.enum(["ACTIVE", "ALUMNI"]),
});

// ── POST /auth/lookup-role-number — public, no auth ────────────────────────
// The reverse of verify-role-number above: given a name instead of a number,
// so the sign-up form can fill the role-number field in FOR the person
// rather than making them go find it themselves. Only returns a number when
// exactly one unclaimed roster row matches first+last name — the same
// ambiguity-averse rule lib/rosterClaim.ts uses for its own name-only
// matches, because two rows sharing a name should never resolve to a guess.
// A miss (zero or multiple matches) is silent: the field just stays empty
// and the person types their own number, same as before this existed.
//
// This is a stronger enumeration vector than verify-role-number — it hands
// back the number instead of just confirming a guessed one — so it shares
// that endpoint's tight rate limit (server.ts) on top of the general /auth
// one, and never reveals *why* it came up empty.
router.post(
  "/auth/lookup-role-number",
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = lookupRoleNumberSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { firstName, lastName, status } = parsed.data;

    const matches = await prisma.chapterRosterEntry.findMany({
      where: {
        status,
        claimedByUserId: null,
        firstName: { equals: firstName, mode: "insensitive" },
        lastName: { equals: lastName, mode: "insensitive" },
      },
      select: { roleNumber: true },
      take: 2, // only need to know "more than one" — never fetch the whole set
    });

    if (matches.length === 1) {
      return res.json({ found: true, roleNumber: matches[0].roleNumber });
    }
    res.json({ found: false });
  })
);

export default router;
