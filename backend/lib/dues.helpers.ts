// backend/lib/dues.helpers.ts
//
// Shared business logic for dues status derivation.
// Imported by both dues.routes.ts (manual payments) and webhook.routes.ts
// (Stripe webhook) so the computation lives in exactly one place.

import { prisma } from "./prisma";

/**
 * Recompute DuesRecord.status and DuesRecord.amountPaid from the sum of
 * all Payment rows linked to that record.
 *
 * Rules:
 *   sum >= amountOwed  → PAID
 *   sum > 0            → PARTIAL
 *   sum == 0           → UNPAID
 *   status == WAIVED   → no-op (waiver is authoritative)
 *
 * This is called from both dues.routes.ts (manual payment) and
 * webhook.routes.ts (Stripe), non-atomically, right after each
 * Payment.create(). A plain read-then-write (fetch payments, sum in JS,
 * then update) has a lost-update race: two payments landing near-
 * simultaneously can interleave so the recalc that read state first
 * finishes *writing* after the one that already correctly summed both,
 * clobbering the correct result with a stale one. Doing the sum and the
 * write in a single atomic SQL statement (computed by Postgres itself,
 * not read-modify-write in application code) closes that window entirely.
 */
export async function recalcDuesStatus(duesRecordId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "DuesRecord" AS dr
    SET "amountPaid" = paid.total,
        "status" = CASE
          WHEN dr.status = 'WAIVED'::"DuesStatus" THEN dr.status
          WHEN paid.total >= dr."amountOwed" THEN 'PAID'::"DuesStatus"
          WHEN paid.total > 0 THEN 'PARTIAL'::"DuesStatus"
          ELSE 'UNPAID'::"DuesStatus"
        END,
        "updatedAt" = now()
    FROM (
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM "Payment"
      WHERE "duesRecordId" = ${duesRecordId}
    ) AS paid
    WHERE dr.id = ${duesRecordId}
  `;
}
