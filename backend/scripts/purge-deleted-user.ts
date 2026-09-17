// backend/scripts/purge-deleted-user.ts
//
// Hard-deletes a User row — a real `DELETE FROM "User"`, not the soft
// delete every other path in the app performs (see lib/deleteUser.ts).
// Nothing else in the codebase ever does this; it exists for the specific
// case where a soft-deleted "ghost" account (its username/email already
// rewritten to deleted-<id>) needs to stop existing at all, e.g. because it
// keeps surfacing in admin screens that legitimately show soft-deleted-but-
// still-referenced data.
//
// SAFETY GUARDS (all enforced, none skippable via flags):
//   · Refuses to run on a user whose deletedAt is not already set. This is
//     the load-bearing guard — it's the only thing standing between this
//     script and accidentally destroying a live, still-signed-in-able
//     account. Soft-delete it first (the in-app delete flow, the Clerk
//     webhook, or scripts/delete-user.ts), confirm THAT was the right
//     account, and only then point this script at it.
//   · Always runs a dry-run report first — row counts across every table
//     with a foreign key to User, grouped by what happens to each on
//     delete (see the CASCADE / SET NULL / RESTRICT comments below, pulled
//     directly from `grep -rh 'REFERENCES "User"' prisma/migrations/*/
//     migration.sql` against this schema). Nothing is deleted on this pass.
//   · Only proceeds past the report with --confirm.
//   · Even with --confirm, refuses if any RESTRICT-linked row exists
//     (Event.createdById, Message.senderId, AuditLog.actorId,
//     Document.uploadedById, Expense.submittedById, PointsReset.resetById)
//     — Postgres would reject the delete outright for these anyway, but
//     checking first means you get a clear list of exactly what's in the
//     way instead of a raw P2003 error. These are chapter-owned history
//     (an event someone ran, a message others replied to, an audited admin
//     action, an uploaded document, a submitted expense, a points reset) —
//     resolving one always means a real decision (reassign ownership to
//     another user? is losing the linkage acceptable?), which is exactly
//     why this script won't make that call for you. Rerun this report
//     after resolving them by hand to confirm it's now clear.
//
// Usage (dry run — always start here):
//   npx tsx scripts/purge-deleted-user.ts <userId>
//
// Usage (actually delete, once the dry run shows it's clear):
//   npx tsx scripts/purge-deleted-user.ts <userId> --confirm
//
// Inside Docker (see deploy/):
//   docker compose exec api node dist/scripts/purge-deleted-user.js <userId>
//   docker compose exec api node dist/scripts/purge-deleted-user.js <userId> --confirm

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const userId = process.argv[2];
  const confirm = process.argv.includes("--confirm");

  if (!userId) {
    console.error("Usage: npx tsx scripts/purge-deleted-user.ts <userId> [--confirm]");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    console.error(`No user found with id "${userId}".`);
    process.exit(1);
  }

  if (!user.deletedAt) {
    console.error(
      `${user.firstName} ${user.lastName} (${user.email}) is NOT soft-deleted (deletedAt is null).\n` +
        `This script refuses to run on a live account — soft-delete it first ` +
        `(the in-app delete flow, or scripts/delete-user.ts), double-check that ` +
        `was the account you meant, and only then rerun this script.`
    );
    process.exit(1);
  }

  console.log(`Target: ${user.firstName} ${user.lastName}`);
  console.log(`  id:        ${user.id}`);
  console.log(`  email:     ${user.email}`);
  console.log(`  username:  ${user.username}`);
  console.log(`  deletedAt: ${user.deletedAt.toISOString()}`);
  console.log("");

  // ── CASCADE — Postgres removes these rows automatically, no action needed ──
  const cascadeCounts = {
    ChapterMembership: await prisma.chapterMembership.count({ where: { userId } }),
    ChapterInviteRedemption: await prisma.chapterInviteRedemption.count({ where: { userId } }),
    ChapterJoinRequest: await prisma.chapterJoinRequest.count({ where: { userId } }),
    CommitteeMembership: await prisma.committeeMembership.count({ where: { userId } }),
    Rsvp: await prisma.rsvp.count({ where: { userId } }),
    Attendance: await prisma.attendance.count({ where: { userId } }),
    PointsLedger: await prisma.pointsLedger.count({ where: { userId } }),
    DuesRecord: await prisma.duesRecord.count({ where: { userId } }),
    ChannelMembership: await prisma.channelMembership.count({ where: { userId } }),
    EventDelegate: await prisma.eventDelegate.count({ where: { userId } }),
    PushSubscription: await prisma.pushSubscription.count({ where: { userId } }),
  };

  // ── SET NULL — Postgres nulls these columns automatically, no action needed ──
  const setNullCounts = {
    "Attendance.recordedById": await prisma.attendance.count({ where: { recordedById: userId } }),
    "PointsLedger.awardedById": await prisma.pointsLedger.count({ where: { awardedById: userId } }),
    "Payment.recordedById": await prisma.payment.count({ where: { recordedById: userId } }),
    "FeedbackReport.submittedById": await prisma.feedbackReport.count({ where: { submittedById: userId } }),
    "ChapterRosterEntry.claimedByUserId": await prisma.chapterRosterEntry.count({ where: { claimedByUserId: userId } }),
    "Chapter.brotherOfWeekUserId": await prisma.chapter.count({ where: { brotherOfWeekUserId: userId } }),
  };

  // ── RESTRICT — blocks the delete outright until resolved by hand ──
  const restrictCounts = {
    "Event.createdById": await prisma.event.count({ where: { createdById: userId } }),
    "Message.senderId": await prisma.message.count({ where: { senderId: userId } }),
    "AuditLog.actorId": await prisma.auditLog.count({ where: { actorId: userId } }),
    "Document.uploadedById": await prisma.document.count({ where: { uploadedById: userId } }),
    "Expense.submittedById": await prisma.expense.count({ where: { submittedById: userId } }),
    "PointsReset.resetById": await prisma.pointsReset.count({ where: { resetById: userId } }),
  };

  console.log("Will be removed automatically (CASCADE):");
  for (const [table, count] of Object.entries(cascadeCounts)) {
    console.log(`  ${table.padEnd(28)} ${count}`);
  }
  console.log("");
  console.log("Will be nulled out automatically (SET NULL):");
  for (const [table, count] of Object.entries(setNullCounts)) {
    console.log(`  ${table.padEnd(32)} ${count}`);
  }
  console.log("");

  const blockers = Object.entries(restrictCounts).filter(([, count]) => count > 0);

  console.log("Blocks the delete until resolved (RESTRICT):");
  for (const [table, count] of Object.entries(restrictCounts)) {
    console.log(`  ${table.padEnd(24)} ${count}${count > 0 ? "  ⚠️" : ""}`);
  }
  console.log("");

  if (blockers.length > 0) {
    console.error(
      `Cannot proceed: ${blockers.map(([t, c]) => `${t} (${c})`).join(", ")} still reference this user.\n\n` +
        `Each of these is chapter-owned history this script won't silently destroy or reassign. ` +
        `For each one, either reassign it to another user (e.g. transfer the event, reattribute the ` +
        `document/expense) or decide by hand that deleting the referencing row is acceptable, then rerun ` +
        `this report to confirm it's clear before using --confirm.`
    );
    process.exit(1);
  }

  if (!confirm) {
    console.log("Dry run only — nothing was deleted. Rerun with --confirm to actually delete this user.");
    process.exit(0);
  }

  await prisma.user.delete({ where: { id: userId } });
  console.log(`✅  ${user.firstName} ${user.lastName} (${user.id}) permanently deleted.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
