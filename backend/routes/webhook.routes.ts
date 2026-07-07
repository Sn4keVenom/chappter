// backend/routes/webhook.routes.ts
//
// Stripe webhook endpoint — the ONLY route that legitimately runs without
// JWT authMiddleware. It authenticates via Stripe's HMAC signature on the
// raw request body instead.
//
// Mount requirements (enforced in server.ts):
//   · express.raw({ type: "application/json" }) for this path BEFORE express.json()
//   · This router mounts BEFORE authMiddleware
//
// Stripe is lazy-initialized at first request, not at module load. This
// prevents a missing STRIPE_SECRET_KEY from crashing the server on startup
// during development when Stripe isn't configured yet.

import { Router, Request, Response } from "express";
import Stripe from "stripe";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../lib/prisma";
import { recalcDuesStatus } from "../lib/dues.helpers";

const router = Router();

let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error(
        "STRIPE_SECRET_KEY is not set. Add it to .env to enable Stripe webhooks."
      );
    }
    _stripe = new Stripe(key, { apiVersion: "2024-06-20" });
  }
  return _stripe;
}

// ── POST /webhooks/stripe ─────────────────────────────────────────────────
// Idempotent on Payment.externalRef so Stripe replay deliveries are safe.
router.post("/webhooks/stripe", async (req: Request, res: Response) => {
  let stripe: Stripe;
  try {
    stripe = getStripe();
  } catch (err: any) {
    console.error("[Stripe webhook] not configured:", err.message);
    return res.status(503).json({ error: "Stripe not configured on this server" });
  }

  const sig = req.headers["stripe-signature"];
  if (!sig) {
    return res.status(400).json({ error: "Missing stripe-signature header" });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[Stripe webhook] STRIPE_WEBHOOK_SECRET not set");
    return res.status(503).json({ error: "Stripe webhook secret not configured" });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body as Buffer, sig, webhookSecret);
  } catch (err: any) {
    console.error("[Stripe webhook] signature validation failed:", err.message);
    return res.status(400).json({ error: "Webhook signature invalid" });
  }

  switch (event.type) {
    case "payment_intent.succeeded": {
      const intent = event.data.object as Stripe.PaymentIntent;
      const { duesRecordId } = intent.metadata;

      if (!duesRecordId) break; // Not a dues payment — ignore

      const existing = await prisma.payment.findFirst({
        where: { externalRef: intent.id },
      });

      if (!existing) {
        await prisma.payment.create({
          data: {
            duesRecordId,
            amount: new Decimal(intent.amount / 100), // Stripe amounts are cents
            method: "STRIPE",
            externalRef: intent.id,
            recordedById: null,
          },
        });
        await recalcDuesStatus(duesRecordId);
      }
      break;
    }

    default:
      break; // Acknowledge all events so Stripe doesn't retry unhandled types
  }

  res.json({ received: true });
});

export default router;
