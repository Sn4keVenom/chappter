// backend/routes/dues.routes.ts
//
// All authenticated dues management routes.
// Mounted AFTER authMiddleware in server.ts — every handler has req.user.
//
// The Stripe webhook (POST /webhooks/stripe) is NOT here. It lives in
// webhook.routes.ts and is mounted separately before authMiddleware because
// it authenticates via Stripe signature, not our JWT.
//
// Integration points:
//   · rbac.ts           → requireRole, AuthedRequest, writeAuditLog
//   · lib/dues.helpers  → recalcDuesStatus (shared with webhook.routes.ts)
//   · schema.prisma     → DuesRecord, Payment, Semester
//
// Key decisions:
//   · DuesRecord.status is derived — never manually set by callers.
//     recalcDuesStatus() recomputes from payments every time a payment is added.
//   · WAIVED overrides derived status (recalcDuesStatus is a no-op on WAIVED records).
//   · createMany with skipDuplicates makes POST /dues/initialize idempotent.

import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { recalcDuesStatus } from "../lib/dues.helpers";
import { AuthedRequest, requirePermission, writeAuditLog } from "../middleware/rbac";

const router = Router();

// ── GET /dues/me ──────────────────────────────────────────────────────────
router.get(
  "/dues/me",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const records = await prisma.duesRecord.findMany({
      where: { userId: req.user!.id },
      include: {
        semester: { select: { id: true, label: true } },
        payments: { orderBy: { paidAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ records });
  })
);

// ── GET /dues — all members, Exec+ ────────────────────────────────────────
router.get(
  "/dues",
  requirePermission("dues.manage"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const { semesterId, status } = req.query;

    // DuesRecord has no chapterId column of its own (see schema.prisma's
    // multi-tenancy note), but it's always reachable through User.activeChapterId
    // — without this filter, any chapter's Exec+ could see every other
    // chapter's dues records via this one endpoint.
    const chapterFilter = { user: { activeChapterId: req.user!.chapterId! } };

    const records = await prisma.duesRecord.findMany({
      where: {
        ...chapterFilter,
        ...(semesterId ? { semesterId: String(semesterId) } : {}),
        ...(status ? { status: String(status) as any } : {}),
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        semester: { select: { id: true, label: true } },
        payments: { orderBy: { paidAt: "desc" } },
      },
      orderBy: [{ status: "asc" }, { user: { lastName: "asc" } }],
    });

    const summary = await prisma.duesRecord.groupBy({
      by: ["status"],
      where: { ...chapterFilter, ...(semesterId ? { semesterId: String(semesterId) } : {}) },
      _count: { _all: true },
      _sum: { amountOwed: true, amountPaid: true },
    });

    // No route anywhere hands the client a bare semester id — every other
    // dues action reads one off an EXISTING record's own `semester` field.
    // The one place that breaks down is "bill everyone" the very first time,
    // before any DuesRecord exists for anyone to read a semester off of.
    // Piggybacking it onto this response (which the Dues admin screen
    // already loads on open) avoids a whole extra route for one id.
    const now = new Date();
    const currentSemester = await prisma.semester.findFirst({
      where: { startDate: { lte: now }, endDate: { gte: now } },
    });

    res.json({
      records,
      summary,
      currentSemesterId: currentSemester?.id ?? null,
      currentSemesterLabel: currentSemester?.label ?? null,
    });
  })
);

// ── POST /dues/initialize — bulk-create DuesRecords for a semester ────────
// amountOwed/plan are OPTIONAL: both fall back to the chapter's configured
// defaults (ChapterSettings.defaultDuesAmount / defaultDuesPlan) so the
// Treasurer can bill everyone without retyping the number every term, while
// still being able to override it for a one-off.
const initSchema = z.object({
  semesterId: z.string(),
  amountOwed: z.number().positive().optional(),
  plan: z.enum(["FULL", "MONTHLY"]).optional(),
  dueDate: z.string().datetime().optional(),
  userIds: z.array(z.string()).min(1).optional(),
});

router.post(
  "/dues/initialize",
  requirePermission("dues.manage"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const parsed = initSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { semesterId, dueDate, userIds } = parsed.data;

    const semester = await prisma.semester.findUnique({ where: { id: semesterId } });
    if (!semester) return res.status(404).json({ error: "Semester not found" });

    const settings = await prisma.chapterSettings.findUnique({
      where: { chapterId: req.user!.chapterId! },
    });
    const amountOwed = parsed.data.amountOwed ?? (settings ? Number(settings.defaultDuesAmount) : undefined);
    if (amountOwed === undefined) {
      return res.status(400).json({
        error: "No amount given and no chapter default is set — set one in Chapter Settings first.",
      });
    }
    const plan =
      parsed.data.plan ??
      (settings?.defaultDuesPlan === "MONTHLY" ? "MONTHLY" : "FULL");

    // status lives on ChapterMembership now, not User (see schema.prisma
    // doc comment) — default target set is ACTIVE/PNM members of the
    // caller's own chapter.
    let targetIds: string[];
    if (userIds) {
      // Explicit userIds bypass the default chapter-scoped query above, so
      // verify each one is actually a member of the caller's own chapter —
      // otherwise an Exec+ could bulk-create DuesRecords for arbitrary users
      // in other chapters (or nonexistent users entirely).
      const memberships = await prisma.chapterMembership.findMany({
        where: { chapterId: req.user!.chapterId!, userId: { in: userIds } },
        select: { userId: true },
      });
      const validIds = new Set(memberships.map((m) => m.userId));
      const invalid = userIds.filter((id) => !validIds.has(id));
      if (invalid.length > 0) {
        return res.status(400).json({ error: "Some users are not members of this chapter", invalid });
      }
      targetIds = userIds;
    } else {
      targetIds = (
        await prisma.chapterMembership.findMany({
          where: { chapterId: req.user!.chapterId!, status: { in: ["ACTIVE", "PNM"] } },
          select: { userId: true },
        })
      ).map((m) => m.userId);
    }

    const result = await prisma.duesRecord.createMany({
      data: targetIds.map((userId) => ({
        userId,
        semesterId,
        amountOwed,
        plan,
        dueDate: dueDate ? new Date(dueDate) : null,
        status: "UNPAID",
      })),
      skipDuplicates: true,
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "DUES_INITIALIZE",
      entityType: "DuesRecord",
      entityId: semesterId,
      after: { semesterId, amountOwed, count: result.count },
    });

    res.json({ created: result.count, total: targetIds.length });
  })
);

// ── POST /dues/pay-pyli — self-service payment ─────────────────────────────
// Pyli is the chapter's external payment provider (see docs/DEMO_MODE.md and
// src/api/dues.ts's doc comment) — not a real payment integration, this
// mirrors a Pyli checkout completing instantly from the chapter's point of
// view. No permission gate: any member can pay their OWN dues this way, no
// officer approval needed — the one thing that keeps this from being "pay
// anyone's dues" is that it always acts on req.user's own record.
const payPyliSchema = z.object({
  semesterId: z.string(),
  amount: z.number().positive(),
  plan: z.enum(["FULL", "MONTHLY"]),
});

router.post(
  "/dues/pay-pyli",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const parsed = payPyliSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const duesRecord = await prisma.duesRecord.findUnique({
      where: { userId_semesterId: { userId: req.user!.id, semesterId: parsed.data.semesterId } },
    });
    if (!duesRecord) return res.status(404).json({ error: "No dues record for this semester yet" });
    if (duesRecord.status === "WAIVED") {
      return res.status(400).json({ error: "Dues are waived — no payment needed" });
    }

    const payment = await prisma.payment.create({
      data: {
        duesRecordId: duesRecord.id,
        amount: parsed.data.amount,
        method: "PYLI",
        externalRef: `pyli_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
        recordedById: null, // self-initiated, not an officer entry — Payment.recordedById's own doc comment
      },
    });

    // Recorded even for a partial payment, same as the manual payment route
    // — choosing a plan is a statement of intent ("I'm paying monthly"), not
    // a claim that this one instalment settles the balance.
    await prisma.duesRecord.update({ where: { id: duesRecord.id }, data: { plan: parsed.data.plan } });
    await recalcDuesStatus(duesRecord.id);

    await writeAuditLog({
      actorId: req.user!.id,
      action: "DUES_PAYMENT_PYLI",
      entityType: "Payment",
      entityId: payment.id,
      after: { amount: parsed.data.amount, plan: parsed.data.plan },
    });

    const updated = await prisma.duesRecord.findUnique({
      where: { id: duesRecord.id },
      include: { semester: { select: { id: true, label: true } } },
    });
    res.status(201).json({ payment, duesRecord: updated });
  })
);

// ── POST /dues/:userId/payment — manual payment record ───────────────────
const paymentSchema = z.object({
  semesterId: z.string(),
  amount: z.number().positive(),
  method: z.enum(["CASH", "VENMO", "CHECK", "OTHER"]),
  note: z.string().max(200).optional(),
});

router.post(
  "/dues/:userId/payment",
  requirePermission("dues.manage"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const parsed = paymentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { semesterId, amount, method, note } = parsed.data;
    const { userId } = req.params;

    const targetMembership = await prisma.chapterMembership.findUnique({
      where: { chapterId_userId: { chapterId: req.user!.chapterId!, userId } },
    });
    if (!targetMembership) return res.status(404).json({ error: "User not found" });

    const duesRecord = await prisma.duesRecord.findUnique({
      where: { userId_semesterId: { userId, semesterId } },
    });
    if (!duesRecord) {
      return res.status(404).json({ error: "No dues record for this user and semester" });
    }
    if (duesRecord.status === "WAIVED") {
      return res.status(400).json({ error: "Dues are waived — no payment needed" });
    }

    const payment = await prisma.payment.create({
      data: {
        duesRecordId: duesRecord.id,
        amount,
        method,
        externalRef: note ?? null,
        recordedById: req.user!.id,
      },
    });

    await recalcDuesStatus(duesRecord.id);

    await writeAuditLog({
      actorId: req.user!.id,
      action: "DUES_PAYMENT",
      entityType: "Payment",
      entityId: payment.id,
      after: { userId, amount, method },
    });

    const updated = await prisma.duesRecord.findUnique({
      where: { id: duesRecord.id },
      include: { semester: { select: { id: true, label: true } } },
    });
    res.status(201).json({ payment, duesRecord: updated });
  })
);

// ── POST /dues/:userId/waive ──────────────────────────────────────────────
const waiveSchema = z.object({
  semesterId: z.string(),
  reason: z.string().max(500).optional(),
});

router.post(
  "/dues/:userId/waive",
  requirePermission("dues.manage"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const parsed = waiveSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { semesterId, reason } = parsed.data;

    const targetMembership = await prisma.chapterMembership.findUnique({
      where: { chapterId_userId: { chapterId: req.user!.chapterId!, userId: req.params.userId } },
    });
    if (!targetMembership) return res.status(404).json({ error: "User not found" });

    const duesRecord = await prisma.duesRecord.findUnique({
      where: { userId_semesterId: { userId: req.params.userId, semesterId } },
    });
    if (!duesRecord) return res.status(404).json({ error: "Dues record not found" });

    const updated = await prisma.duesRecord.update({
      where: { id: duesRecord.id },
      data: { status: "WAIVED" },
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "DUES_WAIVE",
      entityType: "DuesRecord",
      entityId: duesRecord.id,
      before: { status: duesRecord.status },
      after: { status: "WAIVED", reason },
    });

    res.json({ duesRecord: updated });
  })
);

// ── POST /dues/reminders/send — Exec+ ────────────────────────────────────
const remindersSchema = z.object({ semesterId: z.string() });

router.post(
  "/dues/reminders/send",
  requirePermission("dues.manage"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const parsed = remindersSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { semesterId } = parsed.data;

    const unpaid = await prisma.duesRecord.findMany({
      where: {
        semesterId,
        status: { in: ["UNPAID", "PARTIAL"] },
        user: { activeChapterId: req.user!.chapterId! },
      },
      include: { user: { select: { id: true, email: true, firstName: true } } },
    });

    // Placeholder: integrate with SendGrid / Resend / etc. before launch.
    console.log(`[Chappter] Dues reminders requested for ${unpaid.length} members`);

    await writeAuditLog({
      actorId: req.user!.id,
      action: "DUES_REMINDERS_SENT",
      entityType: "DuesRecord",
      entityId: semesterId,
      after: { count: unpaid.length, semesterId },
    });

    res.json({
      sent: unpaid.length,
      members: unpaid.map((r) => ({
        userId: r.user.id,
        firstName: r.user.firstName,
        email: r.user.email,
        status: r.status,
        amountOwed: r.amountOwed,
        amountPaid: r.amountPaid,
      })),
    });
  })
);

// ── PATCH /dues/:userId — manage ONE member's dues record ─────────────────
// The per-member half of the request: everyone is billed the chapter default
// by POST /dues/initialize, and this is how a single person is moved onto
// instalments, given a different amount, or a different due date, without
// touching anyone else. Creates the record if the member was missed by the
// bulk run, so there's no "initialize first" ordering trap.
const manageSchema = z.object({
  semesterId: z.string(),
  amountOwed: z.number().positive().optional(),
  plan: z.enum(["FULL", "MONTHLY"]).nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
});

router.patch(
  "/dues/:userId",
  requirePermission("dues.manage"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const parsed = manageSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    // Same chapter-scoping as every other dues route — DuesRecord has no
    // chapterId of its own, so membership is the check.
    const membership = await prisma.chapterMembership.findUnique({
      where: { chapterId_userId: { chapterId: req.user!.chapterId!, userId: req.params.userId } },
    });
    if (!membership) return res.status(404).json({ error: "Member not found in your chapter" });

    const { semesterId, amountOwed, plan, dueDate } = parsed.data;

    const settings = await prisma.chapterSettings.findUnique({
      where: { chapterId: req.user!.chapterId! },
    });
    const fallbackAmount = settings ? Number(settings.defaultDuesAmount) : 0;

    const record = await prisma.duesRecord.upsert({
      where: { userId_semesterId: { userId: req.params.userId, semesterId } },
      update: {
        ...(amountOwed !== undefined ? { amountOwed } : {}),
        ...(plan !== undefined ? { plan } : {}),
        ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
      },
      create: {
        userId: req.params.userId,
        semesterId,
        amountOwed: amountOwed ?? fallbackAmount,
        plan: plan ?? (settings?.defaultDuesPlan === "MONTHLY" ? "MONTHLY" : "FULL"),
        dueDate: dueDate ? new Date(dueDate) : null,
        status: "UNPAID",
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        semester: { select: { id: true, label: true } },
        payments: { orderBy: { paidAt: "desc" } },
      },
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "DUES_RECORD_UPDATED",
      entityType: "DuesRecord",
      entityId: record.id,
      after: parsed.data,
    });

    res.json({ record });
  })
);

export default router;
