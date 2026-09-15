// backend/routes/push.routes.ts
//
// "Add push notifications (mobile and desktop)." Self-service subscribe/
// unsubscribe for the current user's OWN device — see lib/push.ts for the
// actual sending (triggered from routes/messages.routes.ts on a new
// chapter-wide announcement) and public/sw-push.js for the service worker
// that receives them client-side.
//
// Integration:
//   · lib/push.ts → isPushConfigured
//   · schema.prisma → PushSubscription
//   · src/api/push.ts on the client side

import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { AuthedRequest } from "../middleware/rbac";
import { isPushConfigured } from "../lib/push";

const router = Router();

// ── GET /push/config — any authenticated user ────────────────────────────
// Tells the client whether to even offer the "enable notifications" toggle,
// and hands over the public key a subscription needs (PushManager.subscribe
// requires it client-side; the matching private key never leaves the
// server — see lib/push.ts).
router.get(
  "/push/config",
  asyncHandler(async (_req: AuthedRequest, res: Response) => {
    res.json({
      enabled: isPushConfigured(),
      publicKey: isPushConfigured() ? process.env.VAPID_PUBLIC_KEY : null,
    });
  })
);

// ── POST /push/subscribe — save this device's subscription ──────────────
const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

router.post(
  "/push/subscribe",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    if (!isPushConfigured()) {
      return res.status(503).json({ error: "Push notifications aren't configured on this server yet." });
    }
    const parsed = subscribeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    // upsert on endpoint (globally unique — it names one browser/device
    // subscription) rather than create: re-subscribing the same device
    // (e.g. re-enabling after a toggle-off) should just refresh the keys,
    // not 409 or duplicate.
    const subscription = await prisma.pushSubscription.upsert({
      where: { endpoint: parsed.data.endpoint },
      update: { userId: req.user!.id, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth },
      create: {
        userId: req.user!.id,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
      },
    });

    res.status(201).json({ id: subscription.id });
  })
);

// ── DELETE /push/subscribe — stop this device's subscription ────────────
const unsubscribeSchema = z.object({ endpoint: z.string().url() });

router.delete(
  "/push/subscribe",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const parsed = unsubscribeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    // Scoped to the caller's own userId too, not just the endpoint — a
    // malicious/buggy client shouldn't be able to unsubscribe someone
    // else's device just by guessing or replaying its endpoint URL.
    await prisma.pushSubscription.deleteMany({
      where: { endpoint: parsed.data.endpoint, userId: req.user!.id },
    });

    res.status(204).end();
  })
);

export default router;
