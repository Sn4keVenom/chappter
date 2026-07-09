// backend/scripts/promote-admin.ts
//
// Promotes a user to SUPER_ADMIN (on their active chapter membership) by
// email address.
//
// Prerequisites: DATABASE_URL must be set in backend/.env
//
// Run from the BACKEND directory:
//   cd backend
//   DATABASE_URL="..." npx tsx scripts/promote-admin.ts user@example.com
//
// The user must have logged in at least once (POST /auth/sync creates the
// row) AND already joined a chapter (redeemed an invite or been approved) —
// role lives on ChapterMembership, not User, so there must be a membership
// row to promote.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];

  if (!email) {
    console.error("Usage: cd backend && npx tsx scripts/promote-admin.ts <email>");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    console.error(`No user found with email: ${email}`);
    console.error("The user must have logged in at least once before being promoted.");
    process.exit(1);
  }

  if (!user.activeChapterId) {
    console.error(`${user.firstName} ${user.lastName} hasn't joined a chapter yet.`);
    console.error("They need to redeem an invite code or be approved via a join request first.");
    process.exit(1);
  }

  const membership = await prisma.chapterMembership.findUnique({
    where: { chapterId_userId: { chapterId: user.activeChapterId, userId: user.id } },
  });

  if (!membership) {
    console.error(`No membership found for ${email} in their active chapter.`);
    process.exit(1);
  }

  if (membership.role === "SUPER_ADMIN") {
    console.log(`${user.firstName} ${user.lastName} is already SUPER_ADMIN.`);
    process.exit(0);
  }

  const updated = await prisma.chapterMembership.update({
    where: { id: membership.id },
    data: { role: "SUPER_ADMIN" },
  });

  console.log(`✅  Promoted ${user.firstName} ${user.lastName} (${email})`);
  console.log(`   ${membership.role} → ${updated.role}`);
  console.log(`   User ID: ${user.id}  Membership ID: ${updated.id}`);
  console.log("\nThe user must restart the app to see updated permissions.");
}

main()
  .catch((e) => { console.error(e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
