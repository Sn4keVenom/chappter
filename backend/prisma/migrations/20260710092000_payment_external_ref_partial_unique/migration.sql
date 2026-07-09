-- Closes a TOCTOU race identified during release hardening: the Stripe
-- webhook handler's idempotency check in webhook.routes.ts (look for an
-- existing Payment with this externalRef, then create one) is not atomic.
-- Two genuinely concurrent deliveries of the same payment_intent.succeeded
-- event (Stripe does occasionally double-deliver near-simultaneously, not
-- just via sequential retries) could both pass the check before either
-- commits, creating two Payment rows and double-crediting the same dues
-- payment. Manual (officer-recorded) payments have externalRef = NULL and
-- must NOT be deduplicated against each other, which is exactly what a
-- partial index expresses and a plain @@unique cannot — same pattern as
-- ChapterJoinRequest's pending-only unique index (see that migration).
CREATE UNIQUE INDEX "Payment_externalRef_key"
  ON "Payment" ("externalRef")
  WHERE "externalRef" IS NOT NULL;
