// backend/routes/auth.routes.ts
//
// Handles first-login provisioning. Called immediately after Clerk sign-in
// before the mobile app can use any other route (the auth middleware returns
// NEEDS_SYNC when the user row doesn't exist yet).
//
// Integration points:
//   · schema.prisma → User model (upsert by authProviderId)
//   · schema.prisma → CommitteeMembership (returns committeeChairOf for
//     useAuthStore / usePermissions on the mobile side)
//   · rbac.ts → AuthedRequest type
//   · lib/prisma.ts → prisma singleton
//   · server.ts mounts this BEFORE authMiddleware so unauthenticated users
//     can reach it on first install
//
// No requireRole guard here — the JWT is still verified inline because we
// can't use the normal authMiddleware (user row may not exist yet).

import { Router, Request, Response } from "express";
import { verifyToken } from "@clerk/backend";
import { z } from "zod";
import { prisma } from "../lib/prisma";

const router = Router();

const syncSchema = z.object({
  firstName: z.string().min(1).max(100),
  // Google accounts sometimes have no last name (single-name users, accounts
  // that only set a given name). min(0) prevents a 400 on first login.
  lastName: z.string().min(0).max(100),
  email: z.string().email(),
  phone: z.string().optional(),
  avatarUrl: z.string().url().optional(),
  pledgeClassLabel: z.string().max(50).optional(),
});

// ── POST /auth/sync ───────────────────────────────────────────────────────
// Upsert the User row from the auth provider identity.
// Returns the full user profile + committeeChairOf array so the mobile
// app can initialise useAuthStore immediately without a second round-trip.
router.post("/auth/sync", async (req: Request, res: Response) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing authorization header" });
  }

  let authProviderId: string;
  try {
    const payload = await verifyToken(header.slice(7), {
      secretKey: process.env.CLERK_SECRET_KEY!,
    });
    authProviderId = payload.sub;
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }

  const parsed = syncSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const body = parsed.data;

  const user = await prisma.user.upsert({
    where: { authProviderId },
    update: {
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email,
      ...(body.phone ? { phone: body.phone } : {}),
      ...(body.avatarUrl ? { avatarUrl: body.avatarUrl } : {}),
    },
    create: {
      authProviderId,
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email,
      phone: body.phone,
      avatarUrl: body.avatarUrl,
      pledgeClassLabel: body.pledgeClassLabel,
      role: "MEMBER",
      status: "ACTIVE",
    },
    include: {
      committeeMemberships: {
        where: { role: "CHAIR" },
        select: { committeeId: true },
      },
    },
  });

  res.json({
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      status: user.status,
      avatarUrl: user.avatarUrl,
      pledgeClassLabel: user.pledgeClassLabel,
      committeeChairOf: user.committeeMemberships.map((m) => m.committeeId),
    },
  });
});

export default router;
