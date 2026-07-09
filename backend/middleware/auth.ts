// backend/middleware/auth.ts
//
// Verifies the Clerk JWT from the Authorization header, looks up the local
// User row, then resolves their active ChapterMembership (role/office/status
// live there now, not on User — see schema.prisma) plus the permission set
// that membership grants (RolePermission ∪ OfficePermission). Attaches all
// of it to req.user so role/permission changes take effect immediately, not
// on token refresh, and so requireRole/requirePermission in rbac.ts are
// cheap synchronous checks rather than a query per route.
//
// A user with no activeChapterId (hasn't joined a chapter yet) still
// authenticates successfully — req.user.id is set — but role/office/status/
// permissions are all left undefined, so every requireRole/requirePermission
// check correctly denies rather than throwing.
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
      select: { id: true, activeChapterId: true },
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

    const membership = user.activeChapterId
      ? await prisma.chapterMembership.findUnique({
          where: { chapterId_userId: { chapterId: user.activeChapterId, userId: user.id } },
          select: { id: true, role: true, office: true, status: true },
        })
      : null;

    const permissions = new Set<string>();
    // SUPER_ADMIN bypasses every check unconditionally (requireRole/
    // requirePermission both special-case it) — no need to populate its
    // permission set, matching RolePermission's convention of never storing
    // rows for that role.
    if (membership && membership.role !== "SUPER_ADMIN") {
      const [roleRows, officeRows] = await Promise.all([
        prisma.rolePermission.findMany({
          where: { role: membership.role },
          select: { permission: true },
        }),
        membership.office
          ? prisma.officePermission.findMany({
              where: { office: membership.office },
              select: { permission: true },
            })
          : Promise.resolve([]),
      ]);
      for (const row of roleRows) permissions.add(row.permission);
      for (const row of officeRows) permissions.add(row.permission);
    }

    req.user = {
      id: user.id,
      chapterId: user.activeChapterId ?? undefined,
      membershipId: membership?.id,
      role: membership?.role,
      office: membership?.office ?? undefined,
      status: membership?.status,
      permissions,
    };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
