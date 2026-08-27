// backend/scripts/bootstrap-admin.ts
//
// Creates the FIRST Super Admin on a brand-new deployment.
//
// ── Why this exists separately from promote-admin.ts ─────────────────────
// promote-admin.ts upgrades an *existing* membership to SUPER_ADMIN. On a
// fresh database nobody has a membership yet, and there is no way to get one
// without an admin already in place:
//
//   · Join request  → needs an Exec/Super Admin to approve it
//   · Invite code   → needs an Exec/Super Admin to generate it
//   · Roster claim  → needs a ChapterRosterEntry, whose createdById is a
//                     foreign key to a ChapterMembership (schema.prisma:411)
//
// That is a genuine cycle. This script breaks it exactly once, by writing the
// membership directly. Every member after the first one goes through the
// normal roster-verification flow from the app.
//
// Prerequisites:
//   1. `npm run db:seed` has run (creates the Chapter row)
//   2. The person has signed up in the app at least once, so POST /auth/sync
//      created their User row. They will be sitting on the "join a chapter"
//      screen — that is expected, and this script is what gets them past it.
//
// Run from the backend directory:
//   npx tsx scripts/bootstrap-admin.ts you@example.com
//
// Inside Docker (see deploy/):
//   docker compose exec api node dist/scripts/bootstrap-admin.js you@example.com
//
// Idempotent: re-running against an already-bootstrapped account is a no-op.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];

  if (!email) {
    console.error("Usage: npx tsx scripts/bootstrap-admin.ts <email>");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    console.error(`No user found with email: ${email}`);
    console.error(
      "Sign up in the app first — POST /auth/sync creates the User row on " +
        "first sign-in. Getting stuck on the 'join a chapter' screen is the " +
        "expected state at this point."
    );
    process.exit(1);
  }

  if (user.deletedAt) {
    console.error(`${email} is soft-deleted (deletedAt set by the Clerk webhook).`);
    process.exit(1);
  }

  // The seed creates exactly one Chapter; oldest-first matches how seed.ts
  // itself looks the chapter up, so both agree in a multi-chapter database.
  const chapter = await prisma.chapter.findFirst({ orderBy: { createdAt: "asc" } });

  if (!chapter) {
    console.error("No Chapter row exists. Run the seed first: npm run db:seed");
    process.exit(1);
  }

  const existing = await prisma.chapterMembership.findUnique({
    where: { chapterId_userId: { chapterId: chapter.id, userId: user.id } },
  });

  if (existing?.role === "SUPER_ADMIN") {
    console.log(`${user.firstName} ${user.lastName} is already SUPER_ADMIN of ${chapter.name}.`);
    process.exit(0);
  }

  // Membership + activeChapterId in one transaction. A membership without
  // activeChapterId set leaves flattenUser() resolving nothing, so the app
  // would still show the join screen — the two writes are only useful together.
  await prisma.$transaction([
    prisma.chapterMembership.upsert({
      where: { chapterId_userId: { chapterId: chapter.id, userId: user.id } },
      update: { role: "SUPER_ADMIN", status: "ACTIVE" },
      create: {
        userId: user.id,
        chapterId: chapter.id,
        role: "SUPER_ADMIN",
        status: "ACTIVE",
      },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { activeChapterId: chapter.id },
    }),
  ]);

  console.log(`✅  ${user.firstName} ${user.lastName} <${email}> is now SUPER_ADMIN of ${chapter.name}.`);
  console.log("    Sign out and back in (or hard-refresh) to pick up the new role.");
  console.log("    Next: Admin tab → Chapter Administration → upload your roster.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
