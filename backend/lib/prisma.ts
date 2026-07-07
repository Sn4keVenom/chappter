// backend/lib/prisma.ts
//
// Singleton PrismaClient. In development, ts-node / nodemon create a new
// module instance on every restart, which opens a new connection pool each
// time. The global cache prevents that without affecting production (where
// there is always exactly one process instance).
//
// Every route file imports from here instead of instantiating PrismaClient
// directly — the pattern established in rbac.ts is the only exception because
// that file was generated first.

import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  global.__prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}
