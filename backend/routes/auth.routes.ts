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
      const username = existing ? undefined : body.username ?? (await suggestUsername(body.email));
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
            username: username!,
            phone: body.phone,
            avatarUrl: body.avatarUrl,
          },
        });
        break;
      } catch (err) {
        const isUsernameConflict =
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002" &&
          (err.meta?.target as string[] | undefined)?.includes("username");

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

export default router;
