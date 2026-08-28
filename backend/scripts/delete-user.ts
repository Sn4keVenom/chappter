// backend/scripts/delete-user.ts
//
// Soft-deletes a User by username, freeing their email/username for reuse.
// The app itself now has a real "delete account" feature (DELETE /users/me,
// DELETE /users/:id in users.routes.ts) that deletes the live Clerk account
// AND does this same local step in one action — use that instead whenever
// the account in question can still sign in and use it.
//
// This script exists for the case that path can't cover: a Clerk account
// that's ALREADY gone (deleted by hand from the Clerk Dashboard, or from
// before this in-app feature existed) with only a stale local row left
// over. Nothing here calls Clerk — if the Clerk account still exists,
// delete it from the Dashboard first, or use the in-app feature instead of
// this script entirely.
//
// Uses the same softDeleteLocalUser() as the webhook and the in-app routes
// (lib/deleteUser.ts) — see its doc comment for why this is a soft delete
// (sets deletedAt + a placeholder email/username) and never touches
// ChapterMembership at all (ChapterRosterEntry.createdById is ON DELETE
// RESTRICT — for anyone who's ever run a roster Bulk Import, touching that
// membership would make Postgres reject the operation outright).
//
// Run from the backend directory:
//   npx tsx scripts/delete-user.ts <username>
//
// Inside Docker (see deploy/):
//   docker compose exec api node dist/scripts/delete-user.js <username>

import { PrismaClient } from "@prisma/client";
import { softDeleteLocalUser } from "../lib/deleteUser";

const prisma = new PrismaClient();

async function main() {
  const username = process.argv[2];

  if (!username) {
    console.error("Usage: npx tsx scripts/delete-user.ts <username>");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { username },
    include: {
      chapterMemberships: {
        include: { createdRosterEntries: { select: { id: true } } },
      },
    },
  });

  if (!user) {
    console.error(
      `No user found with username "${username}" — either it never existed, or it's ` +
        "already been soft-deleted (its username would now read deleted-<id>)."
    );
    process.exit(1);
  }

  if (user.deletedAt) {
    console.log(`${user.firstName} ${user.lastName} (@${username}) is already soft-deleted.`);
    process.exit(0);
  }

  // Informational only — soft delete never touches these, so nothing below
  // blocks the operation. It's just useful to see before you commit to it.
  for (const m of user.chapterMemberships) {
    if (m.role === "SUPER_ADMIN") {
      console.log(`Note: this account is SUPER_ADMIN. That membership row is left in place, unattached to any usable login.`);
    }
    if (m.createdRosterEntries.length > 0) {
      console.log(
        `Note: this account's membership created ${m.createdRosterEntries.length} roster entr${m.createdRosterEntries.length === 1 ? "y" : "ies"} ` +
          `(Bulk Import or +Add entry) — those stay exactly as they are; nothing about them changes.`
      );
    }
  }

  await softDeleteLocalUser(user.id);

  console.log(`✅  ${user.firstName} ${user.lastName} (@${username}) soft-deleted.`);
  console.log(`    Email and username are now free for a fresh signup, once the Clerk account is also deleted.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
