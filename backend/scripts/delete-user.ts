// backend/scripts/delete-user.ts
//
// Soft-deletes a User by username — the manual counterpart to the Clerk
// `user.deleted` webhook (webhook.routes.ts), for when that webhook isn't
// configured (CLERK_WEBHOOK_SIGNING_SECRET unset) or you'd rather not wait
// on it. Does exactly what the webhook does and nothing more: sets
// deletedAt and rewrites email/username to a `deleted-<id>` placeholder so
// the originals free up for reuse — it does NOT touch ChapterMembership,
// on purpose (see below).
//
// Deleting the account is a TWO-PART job, always:
//   1. Delete the user in the Clerk Dashboard (Users → find them → Delete).
//      Required regardless of this script — Clerk enforces unique emails on
//      its own side, so a fresh signup with the same email is blocked until
//      the old Clerk account itself is gone, not just our local row.
//   2. Run this script, so our side's email/username also free up. If the
//      webhook fires (it retries for a while if it wasn't reachable at the
//      moment of deletion), this becomes a harmless no-op — the username
//      you passed will already be renamed to the deleted-<id> placeholder
//      and this script will report "not found."
//
// Deliberately does NOT delete or touch ChapterMembership, and deliberately
// does NOT attempt a hard row delete. Two real reasons, not just caution:
//   · schema.prisma's User.deletedAt doc comment: AuditLog/Attendance/
//     Message/etc. aren't all cascade-safe for a record chapters rely on
//     for history — a hard delete can leave broken references or silently
//     erase things nobody meant to erase.
//   · Concretely, for anyone who has ever created a roster entry (run a
//     Bulk Import, add a roster row) — ChapterRosterEntry.createdById is
//     ON DELETE RESTRICT, not CASCADE. Deleting that membership would make
//     Postgres reject the whole operation outright. Soft delete sidesteps
//     this entirely by never touching ChapterMembership.
//
// Run from the backend directory:
//   npx tsx scripts/delete-user.ts <username>
//
// Inside Docker (see deploy/):
//   docker compose exec api node dist/scripts/delete-user.js <username>

import { PrismaClient } from "@prisma/client";

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

  const placeholder = `deleted-${user.id}`;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      deletedAt: new Date(),
      email: `${placeholder}@deleted.chappter.invalid`,
      username: placeholder,
    },
  });

  console.log(`✅  ${user.firstName} ${user.lastName} (@${username}) soft-deleted.`);
  console.log(`    Email and username are now free for a fresh signup, once the Clerk account is also deleted.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
