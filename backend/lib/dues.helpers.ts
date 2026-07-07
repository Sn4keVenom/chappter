// backend/lib/dues.helpers.ts
//
// Shared business logic for dues status derivation.
// Imported by both dues.routes.ts (manual payments) and webhook.routes.ts
// (Stripe webhook) so the computation lives in exactly one place.

import { Decimal } from "@prisma/client/runtime/library";
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
 */
export async function recalcDuesStatus(duesRecordId: string): Promise<void> {
  const record = await prisma.duesRecord.findUnique({
    where: { id: duesRecordId },
    include: { payments: { select: { amount: true } } },
  });
  if (!record || record.status === "WAIVED") return;

  const totalPaid = record.payments.reduce(
    (sum, p) => sum.add(p.amount),
    new Decimal(0)
  );

  const newStatus =
    totalPaid.gte(record.amountOwed)
      ? "PAID"
      : totalPaid.gt(0)
      ? "PARTIAL"
      : "UNPAID";

  await prisma.duesRecord.update({
    where: { id: duesRecordId },
    data: { amountPaid: totalPaid, status: newStatus },
  });
}
