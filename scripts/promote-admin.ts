// scripts/promote-admin.ts
//
// Promotes a user to SUPER_ADMIN by email address.
//
// Prerequisites: DATABASE_URL must be set in backend/.env
//
// Run from the BACKEND directory:
//   cd backend
//   DATABASE_URL="..." npx ts-node ../scripts/promote-admin.ts user@example.com
//
// Or using the backend's own dotenv:
//   cd backend
//   npx ts-node -e "require('dotenv').config(); require('../scripts/promote-admin')"
//
// The user must have logged in at least once (POST /auth/sync creates the row).

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];

  if (!email) {
    console.error("Usage: cd backend && npx ts-node ../scripts/promote-admin.ts <email>");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    console.error(`No user found with email: ${email}`);
    console.error("The user must have logged in at least once before being promoted.");
    process.exit(1);
  }

  if (user.role === "SUPER_ADMIN") {
    console.log(`${user.firstName} ${user.lastName} is already SUPER_ADMIN.`);
    process.exit(0);
  }

  const updated = await prisma.user.update({
    where: { email },
    data: { role: "SUPER_ADMIN" },
  });

  console.log(`✅  Promoted ${updated.firstName} ${updated.lastName} (${email})`);
  console.log(`   ${user.role} → SUPER_ADMIN`);
  console.log(`   ID: ${updated.id}`);
  console.log("\nThe user must restart the app to see updated permissions.");
}

main()
  .catch((e) => { console.error(e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
