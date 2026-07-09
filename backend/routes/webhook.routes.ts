// backend/routes/webhook.routes.ts
//
// Stripe + Clerk webhook endpoints — the ONLY routes that legitimately run
// without JWT authMiddleware. Each authenticates via its own provider's
// signature on the raw request body instead.
//
// Mount requirements (enforced in server.ts):
//   · express.raw({ type: "application/json" }) for both paths BEFORE express.json()
//   · This router mounts BEFORE authMiddleware
//
// Stripe is lazy-initialized at first request, not at module load. This
// prevents a missing STRIPE_SECRET_KEY from crashing the server on startup
// during development when Stripe isn't configured yet.

import { Router, Request, Response } from "express";
import Stripe from "stripe";
import { verifyWebhook } from "@clerk/backend/webhooks";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { recalcDuesStatus } from "../lib/dues.helpers";
import { writeAuditLog } from "../middleware/rbac";

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
    _stripe = new Stripe(key, { apiVersion: "2026-06-24.dahlia" });
  }
  return _stripe;
}

// ── POST /webhooks/stripe ─────────────────────────────────────────────────
// Idempotent on Payment.externalRef so Stripe replay deliveries are safe.
router.post(
  "/webhooks/stripe",
  asyncHandler(async (req: Request, res: Response) => {
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
          try {
            await prisma.payment.create({
              data: {
                duesRecordId,
                amount: new Decimal(intent.amount / 100), // Stripe amounts are cents
                method: "STRIPE",
                externalRef: intent.id,
                recordedById: null,
              },
            });
          } catch (err: any) {
            // P2002 on the partial unique index (see schema.prisma's doc
            // comment on Payment.externalRef) — two genuinely concurrent
            // deliveries of this same event both passed the `existing`
            // check above before either committed. The loser here lost the
            // race fairly; the winner already ran recalcDuesStatus, so this
            // delivery is done, not an error.
            if (err?.code === "P2002") break;
            throw err;
          }
          await recalcDuesStatus(duesRecordId);
        }
        break;
      }

      default:
        break; // Acknowledge all events so Stripe doesn't retry unhandled types
    }

    res.json({ received: true });
  })
);

// ── POST /webhooks/clerk ──────────────────────────────────────────────────
// Only handles `user.deleted` today — that's the one event where our DB
// can silently drift from reality (someone deletes their Clerk account
// directly, e.g. from Clerk's own account-management UI, and our side
// never finds out via /auth/sync since the user simply never calls it
// again). Every other Clerk event is acknowledged and ignored; add cases
// here as needed rather than standing up a second webhook endpoint.
//
// Soft delete, not a row delete — see User.deletedAt's doc comment in
// schema.prisma for why. email/username are also rewritten to a
// `deleted-<id>@...` placeholder in the same update so the original values
// free up for reuse (both columns are unique) without a second query.
router.post(
  "/webhooks/clerk",
  asyncHandler(async (req: Request, res: Response) => {
    const signingSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
    if (!signingSecret) {
      console.error("[Clerk webhook] CLERK_WEBHOOK_SIGNING_SECRET not set");
      return res.status(503).json({ error: "Clerk webhook secret not configured" });
    }

    // verifyWebhook() expects a Fetch API Request (it's framework-agnostic —
    // written for Next.js route handlers, Cloudflare Workers, etc.) rather
    // than an Express req. req.body is the raw Buffer here (see server.ts:
    // express.raw() is mounted for this path, before express.json()) —
    // rebuilding a Request from it preserves the exact bytes the signature
    // was computed over. content-length/host are dropped: Node's fetch
    // implementation recomputes framing from the body we actually pass, and
    // carrying the original values over can conflict with that.
    // globalThis.Headers/Request (not the bare identifiers) — under some
    // bundler/test-runner SSR transforms (found running this route under
    // Vitest), a bare `Request`/`Headers` reference gets rewritten to an
    // unrelated import instead of resolving to Node's built-in fetch API
    // globals. Property access on globalThis always finds the real one.
    const headers = new globalThis.Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (key === "content-length" || key === "host") continue;
      if (typeof value === "string") headers.set(key, value);
      else if (Array.isArray(value)) headers.set(key, value.join(", "));
    }
    const url = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
    const request = new globalThis.Request(url, { method: "POST", headers, body: req.body as Buffer });

    let evt;
    try {
      evt = await verifyWebhook(request, { signingSecret });
    } catch (err: any) {
      console.error("[Clerk webhook] signature verification failed:", err.message);
      return res.status(400).json({ error: "Invalid webhook signature" });
    }

    if (evt.type === "user.deleted") {
      const authProviderId = evt.data.id;
      if (authProviderId) {
        const user = await prisma.user.findUnique({ where: { authProviderId } });
        // Idempotent — Clerk retries webhook deliveries, and deletedAt
        // already being set means a previous delivery (or a re-delivery of
        // the same event) already handled this.
        if (user && !user.deletedAt) {
          const placeholder = `deleted-${user.id}`;
          await prisma.user.update({
            where: { id: user.id },
            data: {
              deletedAt: new Date(),
              email: `${placeholder}@deleted.chapterhub.invalid`,
              username: placeholder,
            },
          });
          await writeAuditLog({
            actorId: user.id,
            action: "USER_SOFT_DELETED_VIA_WEBHOOK",
            entityType: "User",
            entityId: user.id,
            after: { deletedAt: new Date() },
          });
        }
      }
    }

    res.json({ received: true });
  })
);

export default router;
