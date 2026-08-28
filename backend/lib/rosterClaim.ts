// backend/lib/rosterClaim.ts
//
// Keeps ChapterRosterEntry in step with who has actually joined.
//
// ── Why this exists ──────────────────────────────────────────────────────
// A roster entry is marked claimed by exactly one path today: POST
// /chapters/claim-role-number, which only runs when someone signs up
// choosing Active/Alumni AND supplies a role number AND the pendingSignup
// stash survives the email-verification redirect (it lives in
// sessionStorage — see src/auth/pendingSignup.ts). Every other way into the
// chapter leaves the roster row untouched:
//
//   · signing up as PNM and being promoted later
//   · redeeming an invite code
//   · an ordinary join request, approved by an exec
//   · an exec assigning a role number by hand afterwards
//
// In all of those the person is plainly the roster row's owner, but the row
// still reads "Unclaimed" forever. Rather than adding a fifth place that
// remembers to write claimedByUserId, this reconciles the two sides from
// the data itself, so the column is correct no matter which route someone
// took — including for members who joined before this existed.
//
// Matching is deliberately conservative: a role-number match is trusted on
// its own (roleNumber is unique per chapter, so it identifies one person),
// but a name-only match must be UNAMBIGUOUS — exactly one membership and
// one roster entry sharing that first+last name. Two members called
// "Sam Cline" should stay unmatched rather than have the wrong number
// assigned to one of them.

import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

function nameKey(firstName: string, lastName: string): string {
  return `${firstName.trim().toLowerCase()}|${lastName.trim().toLowerCase()}`;
}

export interface ReconcileResult {
  claimed: number;
  roleNumbersFilled: number;
}

/**
 * Reconciles every unclaimed roster entry in one chapter against its current
 * memberships. Two effects, both idempotent:
 *
 *   1. An entry whose owner has joined is marked claimed.
 *   2. A member who matched by NAME but has no role number yet gets the
 *      entry's number — the "role numbers should auto-fill" case. Skipped
 *      for PNMs, which schema.prisma forbids from holding one (see
 *      membership.routes.ts, which rejects the same thing explicitly).
 */
export async function reconcileRosterClaims(db: Db, chapterId: string): Promise<ReconcileResult> {
  const [entries, memberships] = await Promise.all([
    db.chapterRosterEntry.findMany({ where: { chapterId, claimedByUserId: null } }),
    db.chapterMembership.findMany({
      where: { chapterId },
      include: { user: { select: { id: true, firstName: true, lastName: true, deletedAt: true } } },
    }),
  ]);

  if (entries.length === 0) return { claimed: 0, roleNumbersFilled: 0 };

  const live = memberships.filter((m) => !m.user.deletedAt);

  const byRoleNumber = new Map<number, (typeof live)[number]>();
  for (const m of live) {
    if (m.roleNumber != null) byRoleNumber.set(m.roleNumber, m);
  }

  // Name buckets, so ambiguity is detectable rather than silently resolved
  // by whichever row happened to sort first.
  const byName = new Map<string, (typeof live)[number][]>();
  for (const m of live) {
    const key = nameKey(m.user.firstName, m.user.lastName);
    byName.set(key, [...(byName.get(key) ?? []), m]);
  }
  const entryNameCounts = new Map<string, number>();
  for (const e of entries) {
    const key = nameKey(e.firstName, e.lastName);
    entryNameCounts.set(key, (entryNameCounts.get(key) ?? 0) + 1);
  }

  // A membership can only claim one entry per pass — without this, two
  // entries sharing a name could both bind to the same person.
  const usedMembershipIds = new Set<string>();
  let claimed = 0;
  let roleNumbersFilled = 0;

  for (const entry of entries) {
    const key = nameKey(entry.firstName, entry.lastName);

    // Role number is the strong signal: unique per chapter, so it names one
    // person outright.
    let match = byRoleNumber.get(entry.roleNumber);

    if (!match) {
      const candidates = (byName.get(key) ?? []).filter((m) => !usedMembershipIds.has(m.id));
      // Only when both sides are unambiguous.
      if (candidates.length === 1 && (entryNameCounts.get(key) ?? 0) === 1) {
        match = candidates[0];
      }
    }

    if (!match || usedMembershipIds.has(match.id)) continue;
    usedMembershipIds.add(match.id);

    // Guarded update rather than a bare update: another request may have
    // claimed this row since the read above (the signup claim path uses the
    // same conditional-update-as-lock pattern).
    const claimResult = await db.chapterRosterEntry.updateMany({
      where: { id: entry.id, claimedByUserId: null },
      data: { claimedByUserId: match.user.id },
    });
    if (claimResult.count === 0) continue;
    claimed += 1;

    if (match.roleNumber == null && match.status !== "PNM") {
      try {
        await db.chapterMembership.update({
          where: { id: match.id },
          data: { roleNumber: entry.roleNumber },
        });
        roleNumbersFilled += 1;
      } catch {
        // Unique (chapterId, roleNumber) collision — someone else already
        // holds it. The claim above still stands; leave the number alone
        // rather than failing the whole reconciliation.
      }
    }
  }

  return { claimed, roleNumbersFilled };
}
