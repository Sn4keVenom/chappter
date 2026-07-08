// backend/middleware/auth.ts
//
// Verifies the Clerk JWT from the Authorization header, then looks up the
// local User row so role changes take effect immediately — not on token
// refresh. Attaches { id, role } to req.user, which is consumed by
// requireRole / requireCommitteeScope in rbac.ts.
//
// Integration points:
//   · AuthedRequest interface — imported from rbac.ts
//   · prisma singleton    — imported from lib/prisma.ts
//   · server.ts mounts this before all /api/v1 routes (except /auth/sync)
//
// ── To swap auth providers ──────────────────────────────────────────────
// Firebase: replace createClerkClient/verifyToken with
//   admin.auth().verifyIdToken(token) → decoded.uid
// Any OIDC: verify with your library, extract `sub` as authProviderId.
// The DB-lookup + req.user attachment section stays identical.

import { Response, NextFunction } from "express";
import { verifyToken } from "@clerk/backend";
import { prisma } from "../lib/prisma";
import { AuthedRequest } from "./rbac";

export async function authMiddleware(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing authorization header" });
    return;
  }
  const token = header.slice(7);

  try {
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY!,
    });
    const authProviderId = payload.sub; // Clerk user ID (e.g. "user_2abc...")

    const user = await prisma.user.findUnique({
      where: { authProviderId },
      select: { id: true, role: true },
    });

    if (!user) {
      // User authenticated with Clerk but hasn't called POST /auth/sync yet
      // (first login or reinstall). Return a specific code so the mobile app
      // knows to call /auth/sync rather than treating this as a 401 error.
      res.status(401).json({
        error: "User not provisioned",
        code: "NEEDS_SYNC",
      });
      return;
    }

    req.user = { id: user.id, role: user.role };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
