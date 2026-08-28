// backend/scripts/set-username.ts
//
// Changes a User's username. There is no in-app path for this at all —
// PATCH /users/me (self-service) never accepted it, and PATCH /users/:id
// (the Super Admin editor) doesn't either; see auth.routes.ts's
// suggestUsername doc comment: "username is treated as a stable identity
// fact, changeable only by Super Admin today via a direct data fix." This
// is that direct data fix.
//
// Enforces the exact same format the sign-up form does (auth.routes.ts
// syncSchema), so a manually-set username can't end up somewhere the app
// itself would never produce one.
//
// Run from the backend directory:
//   npx tsx scripts/set-username.ts <current-username> <new-username>
//
// Inside Docker (see deploy/):
//   docker compose exec api node dist/scripts/set-username.js <current-username> <new-username>

import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const USERNAME_PATTERN = /^[a-zA-Z0-9_.]+$/;

async function main() {
  const [currentUsername, newUsername] = process.argv.slice(2);

  if (!currentUsername || !newUsername) {
    console.error("Usage: npx tsx scripts/set-username.ts <current-username> <new-username>");
    process.exit(1);
  }

  if (newUsername.length < 3 || newUsername.length > 30 || !USERNAME_PATTERN.test(newUsername)) {
    console.error(
      `"${newUsername}" isn't a valid username — 3 to 30 characters, letters/numbers/underscore/period only ` +
        "(the same rule the sign-up form enforces)."
    );
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { username: currentUsername } });
  if (!user) {
    console.error(`No user found with username "${currentUsername}".`);
    process.exit(1);
  }

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { username: newUsername },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      console.error(`"${newUsername}" is already taken by another account.`);
      process.exit(1);
    }
    throw err;
  }

  console.log(`✅  ${user.firstName} ${user.lastName}: @${currentUsername} → @${newUsername}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
