// prisma/seed.ts
//
// Creates the minimum data required to run ChapterHub locally.
// Run with: npx tsx prisma/seed.ts  (or: npm run db:seed)
//
// IDEMPOTENT: uses upsert / skipDuplicates so re-running is safe.
//
// What this creates:
//   · Default Chapter + ChapterSettings — every user, invite, and join
//     request now hangs off a Chapter row (see schema.prisma Chapter/
//     ChapterMembership doc comments); a fresh database needs at least one
//     to exist before anyone can join it.
//   · Current Semester row  — without this, leaderboard, dues, and the
//     home dashboard all return empty/null because every query filters by
//     a live semester.
//   · GENERAL Channel       — required for the pinned announcement feature
//     on the home dashboard and the Messaging tab's announcement section.
//   · SUPER_ADMIN seed user + ChapterMembership — optional, commented out
//     by default. Uncomment if you need a known admin account for the
//     first local login.

import { PrismaClient } from "@prisma/client";
import { seedDefaultPermissions } from "../lib/permissionDefaults";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱  Seeding ChapterHub database...\n");

  // ── Default Chapter + Settings ──────────────────────────────────────────
  // Adjust name/letters/university to match the real chapter before going
  // live — this is the one chapter every invite/join-request/membership in
  // a single-chapter deployment attaches to.
  const now = new Date();
  const fallStart = new Date(`${now.getFullYear()}-08-25`);
  const fallEnd   = new Date(`${now.getFullYear()}-12-20`);

  let chapter = await prisma.chapter.findFirst({ orderBy: { createdAt: "asc" } });
  if (!chapter) {
    chapter = await prisma.chapter.create({
      data: { name: "Chapter", letters: "", university: "" },
    });
    console.log(`✅  Chapter created (${chapter.id}) — rename it via PATCH /chapters/:id`);
  } else {
    console.log(`⏭   Chapter already exists (${chapter.id})`);
  }

  await prisma.chapterSettings.upsert({
    where: { chapterId: chapter.id },
    update: {},
    create: {
      chapterId: chapter.id,
      currentSemesterLabel: `Fall ${now.getFullYear()}`,
      semesterStartDate: fallStart,
      semesterEndDate: fallEnd,
      defaultDuesAmount: 150,
    },
  });
  console.log(`✅  ChapterSettings ready for chapter ${chapter.id}`);

  // ── Default role/office permissions ─────────────────────────────────────
  // Previously only seeded lazily on the first GET /permissions call —
  // meaning a freshly deployed chapter had zero exec permissions granted
  // (every requirePermission() check 403ing) until someone happened to open
  // the Permissions screen. Seeding here means every role/office grant is
  // live from the moment this script finishes, not from whenever a Super
  // Admin first opens that screen.
  await seedDefaultPermissions(prisma);
  console.log("✅  Default role/office permissions seeded");

  // ── Current Semester ────────────────────────────────────────────────────
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

  // ── Optional: seed a SUPER_ADMIN user + membership ──────────────────────
  // Uncomment and replace <your-clerk-user-id> with the Clerk user ID from
  // the Clerk Dashboard after your first sign-in attempt (it will fail with
  // NEEDS_SYNC but you'll see the ID in server logs from the auth route).
  //
  // const adminUser = await prisma.user.upsert({
  //   where: { authProviderId: "<your-clerk-user-id>" },
  //   update: {},
  //   create: {
  //     authProviderId: "<your-clerk-user-id>",
  //     firstName: "Admin",
  //     lastName: "User",
  //     email: "admin@yourdomain.com",
  //     username: "admin",
  //     activeChapterId: chapter.id,
  //   },
  // });
  // await prisma.chapterMembership.upsert({
  //   where: { chapterId_userId: { chapterId: chapter.id, userId: adminUser.id } },
  //   update: { role: "SUPER_ADMIN", status: "ACTIVE" },
  //   create: { userId: adminUser.id, chapterId: chapter.id, role: "SUPER_ADMIN", status: "ACTIVE" },
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
