// prisma/seed.ts
//
// Creates the minimum data required to run ChapterHub locally.
// Run with: npx ts-node prisma/seed.ts  (or: npm run db:seed)
//
// IDEMPOTENT: uses upsert / skipDuplicates so re-running is safe.
//
// What this creates:
//   · Current Semester row  — without this, leaderboard, dues, and the
//     home dashboard all return empty/null because every query filters by
//     a live semester.
//   · GENERAL Channel       — required for the pinned announcement feature
//     on the home dashboard and the Messaging tab's announcement section.
//   · SUPER_ADMIN seed user — optional, commented out by default. Uncomment
//     if you need a known admin account for the first local login.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱  Seeding ChapterHub database...\n");

  // ── Current Semester ────────────────────────────────────────────────────
  // Adjust startDate / endDate / label to match the real academic semester.
  // "Fall 2026" is used here as a placeholder — update before each semester.
  const now = new Date();
  const fallStart = new Date(`${now.getFullYear()}-08-25`);
  const fallEnd   = new Date(`${now.getFullYear()}-12-20`);

  const semester = await prisma.semester.upsert({
    where: { label: `Fall ${now.getFullYear()}` },
    update: { startDate: fallStart, endDate: fallEnd },
    create: {
      label:     `Fall ${now.getFullYear()}`,
      startDate: fallStart,
      endDate:   fallEnd,
    },
  });
  console.log(`✅  Semester: ${semester.label} (${semester.id})`);

  // ── GENERAL Channel ─────────────────────────────────────────────────────
  // There should be exactly one GENERAL channel. Prisma's createMany with
  // skipDuplicates won't work here because Channel has no unique constraint
  // on type, so we check manually.
  const existingGeneral = await prisma.channel.findFirst({
    where: { type: "GENERAL" },
  });

  if (!existingGeneral) {
    const generalChannel = await prisma.channel.create({
      data: {
        name: "#general",
        type: "GENERAL",
      },
    });
    console.log(`✅  General channel created (${generalChannel.id})`);
  } else {
    console.log(`⏭   General channel already exists (${existingGeneral.id})`);
  }

  // ── OFFICERS Channel ────────────────────────────────────────────────────
  const existingOfficers = await prisma.channel.findFirst({
    where: { type: "OFFICERS" },
  });

  if (!existingOfficers) {
    const officersChannel = await prisma.channel.create({
      data: {
        name: "#officers",
        type: "OFFICERS",
      },
    });
    console.log(`✅  Officers channel created (${officersChannel.id})`);
  } else {
    console.log(`⏭   Officers channel already exists (${existingOfficers.id})`);
  }

  // ── Optional: seed a SUPER_ADMIN user ───────────────────────────────────
  // Uncomment and replace <your-clerk-user-id> with the Clerk user ID from
  // the Clerk Dashboard after your first sign-in attempt (it will fail with
  // NEEDS_SYNC but you'll see the ID in server logs from the auth route).
  //
  // const adminUser = await prisma.user.upsert({
  //   where: { authProviderId: "<your-clerk-user-id>" },
  //   update: { role: "SUPER_ADMIN" },
  //   create: {
  //     authProviderId: "<your-clerk-user-id>",
  //     firstName: "Admin",
  //     lastName: "User",
  //     email: "admin@yourdomain.com",
  //     role: "SUPER_ADMIN",
  //     status: "ACTIVE",
  //   },
  // });
  // console.log(`✅  Admin user: ${adminUser.firstName} ${adminUser.lastName}`);

  console.log("\n🌱  Seed complete.");
}

main()
  .catch((e) => {
    console.error("❌  Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
