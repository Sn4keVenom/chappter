// backend/routes/finance.routes.ts
//
// Committee budgets & expense reimbursements (Feature 5) — tracking only, no
// real payment processing. Real-backend counterpart to mocks/api.ts
// listCommitteeBudgets/getCommitteeBudget/setCommitteeBudget/listExpenses/
// submitExpense/updateExpenseStatus, which existed only in Demo Mode: every
// one of these paths 404'd against the live API ("No route for GET
// /api/v1/budgets", "…/expenses"), so the Budgets and Reimbursements screens
// were unusable outside the demo.
//
// ── Derived, not stored ──────────────────────────────────────────────────
// CommitteeBudget stores only `allocated`. spent/pending/remaining are summed
// from Expense rows on read, so the summary can never disagree with the
// expenses it summarises:
//
//   spent     = REIMBURSED            (money actually paid out)
//   pending   = SUBMITTED + APPROVED  (claimed, not yet settled)
//   remaining = allocated - spent - pending
//
// REJECTED counts toward nothing, which is the point of rejecting it.
//
// ── Authorization ────────────────────────────────────────────────────────
//   finance.manage  allocate budgets, review/settle any expense (Treasurer,
//                   via the Exec preset — see lib/permissionDefaults.ts)
//   committee chair submit an expense against their OWN committee, and read
//                   that committee's budget
// Everyone else can read the budget list (it's chapter money, not secret)
// but can't submit or settle anything.
//
// Integration:
//   · rbac.ts → requirePermission, requireCommitteeScope, AuthedRequest
//   · schema.prisma → CommitteeBudget, Expense, ReimbursementStatus
//   · src/api/finance.ts — same request/response shapes

import { Router, Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { AuthedRequest, requirePermission, writeAuditLog } from "../middleware/rbac";

const router = Router();

/** The semester budgets are scoped to. Same "spans today" lookup the points
 * leaderboard and dues use, so every screen agrees on the current term. */
async function currentSemester() {
  const now = new Date();
  return prisma.semester.findFirst({
    where: { startDate: { lte: now }, endDate: { gte: now } },
  });
}

const money = (d: Prisma.Decimal | null | undefined) => (d ? Number(d) : 0);

/** Rolls one committee's expenses into the budget summary shape the client
 * expects. Takes the already-fetched expense rows so callers can batch. */
function summarise(
  committee: { id: string; name: string },
  semesterId: string,
  allocated: number,
  expenses: { amount: Prisma.Decimal; status: string }[]
) {
  let spent = 0;
  let pending = 0;
  for (const e of expenses) {
    if (e.status === "REIMBURSED") spent += money(e.amount);
    else if (e.status === "SUBMITTED" || e.status === "APPROVED") pending += money(e.amount);
  }
  return {
    committeeId: committee.id,
    committeeName: committee.name,
    semesterId,
    allocated,
    spent,
    pending,
    remaining: allocated - spent - pending,
  };
}

// ── GET /budgets — every committee's budget for the current semester ──────
router.get(
  "/budgets",
  asyncHandler(async (_req: AuthedRequest, res: Response) => {
    const semester = await currentSemester();
    // No live semester is a legitimate state (between terms), not an error —
    // the same way GET /points/leaderboard returns an empty board.
    if (!semester) return res.json({ budgets: [] });

    const [committees, budgets, expenses] = await Promise.all([
      prisma.committee.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.committeeBudget.findMany({ where: { semesterId: semester.id } }),
      prisma.expense.findMany({ select: { committeeId: true, amount: true, status: true } }),
    ]);

    const allocatedBy = new Map(budgets.map((b) => [b.committeeId, money(b.allocated)]));
    const expensesBy = new Map<string, typeof expenses>();
    for (const e of expenses) {
      expensesBy.set(e.committeeId, [...(expensesBy.get(e.committeeId) ?? []), e]);
    }

    // Every committee appears, including ones never allocated anything —
    // a committee missing from the list reads as "no budget screen for us"
    // rather than "allocated nothing yet", which is the more useful default.
    res.json({
      budgets: committees.map((c) =>
        summarise(c, semester.id, allocatedBy.get(c.id) ?? 0, expensesBy.get(c.id) ?? [])
      ),
    });
  })
);

// ── GET /committees/:id/budget ────────────────────────────────────────────
router.get(
  "/committees/:id/budget",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const committee = await prisma.committee.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true },
    });
    if (!committee) return res.status(404).json({ error: "Committee not found" });

    const semester = await currentSemester();
    if (!semester) {
      return res.json({ budget: summarise(committee, "", 0, []) });
    }

    const [budget, expenses] = await Promise.all([
      prisma.committeeBudget.findUnique({
        where: { committeeId_semesterId: { committeeId: committee.id, semesterId: semester.id } },
      }),
      prisma.expense.findMany({
        where: { committeeId: committee.id },
        select: { amount: true, status: true },
      }),
    ]);

    res.json({ budget: summarise(committee, semester.id, money(budget?.allocated), expenses) });
  })
);

// ── PATCH /committees/:id/budget — finance.manage ─────────────────────────
const budgetSchema = z.object({ allocated: z.number().min(0).max(10_000_000) });

router.patch(
  "/committees/:id/budget",
  requirePermission("finance.manage"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const parsed = budgetSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const committee = await prisma.committee.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true },
    });
    if (!committee) return res.status(404).json({ error: "Committee not found" });

    const semester = await currentSemester();
    if (!semester) {
      return res.status(400).json({ error: "No active semester — set one in Chapter Settings first." });
    }

    // Upsert on (committeeId, semesterId): re-allocating replaces this
    // term's number rather than stacking a second row, and last term's
    // allocation is left untouched for history.
    const budget = await prisma.committeeBudget.upsert({
      where: { committeeId_semesterId: { committeeId: committee.id, semesterId: semester.id } },
      update: { allocated: parsed.data.allocated },
      create: { committeeId: committee.id, semesterId: semester.id, allocated: parsed.data.allocated },
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "COMMITTEE_BUDGET_SET",
      entityType: "CommitteeBudget",
      entityId: budget.id,
      after: { committeeId: committee.id, semesterId: semester.id, allocated: parsed.data.allocated },
    });

    const expenses = await prisma.expense.findMany({
      where: { committeeId: committee.id },
      select: { amount: true, status: true },
    });
    res.json({ budget: summarise(committee, semester.id, money(budget.allocated), expenses) });
  })
);

// ── Expenses ──────────────────────────────────────────────────────────────

const expenseInclude = {
  committee: { select: { id: true, name: true } },
  submittedBy: { select: { id: true, firstName: true, lastName: true } },
  reviewedBy: { include: { user: { select: { firstName: true, lastName: true } } } },
} as const;

type ExpenseRow = Prisma.ExpenseGetPayload<{ include: typeof expenseInclude }>;

function toExpense(e: ExpenseRow) {
  return {
    id: e.id,
    committeeId: e.committeeId,
    committeeName: e.committee.name,
    submittedBy: e.submittedBy,
    amount: money(e.amount),
    description: e.description,
    date: e.date.toISOString(),
    receiptLabel: e.receiptLabel,
    status: e.status,
    reimbursementMethod: e.reimbursementMethod,
    reimbursementNote: e.reimbursementNote,
    reviewedBy: e.reviewedBy
      ? { firstName: e.reviewedBy.user.firstName, lastName: e.reviewedBy.user.lastName }
      : null,
    createdAt: e.createdAt.toISOString(),
  };
}

/** True if this user chairs the committee — chairs may submit against their
 * own committee without holding chapter-wide finance.manage. */
async function chairsCommittee(userId: string, committeeId: string): Promise<boolean> {
  const membership = await prisma.committeeMembership.findUnique({
    where: { committeeId_userId: { committeeId, userId } },
    select: { role: true },
  });
  return membership?.role === "CHAIR";
}

// ── GET /expenses ─────────────────────────────────────────────────────────
router.get(
  "/expenses",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const { committeeId, status } = req.query;

    const canSeeAll =
      req.user!.role === "SUPER_ADMIN" || !!req.user!.permissions?.has("finance.manage");

    const expenses = await prisma.expense.findMany({
      where: {
        ...(committeeId ? { committeeId: String(committeeId) } : {}),
        ...(status ? { status: String(status) as ExpenseRow["status"] } : {}),
        // Without finance.manage you see only your own claims — an ordinary
        // member has no business reading the whole chapter's reimbursements.
        ...(canSeeAll ? {} : { submittedById: req.user!.id }),
      },
      orderBy: { createdAt: "desc" },
      include: expenseInclude,
    });

    res.json({ expenses: expenses.map(toExpense) });
  })
);

// ── POST /expenses — chair of the committee, or finance.manage ────────────
const submitSchema = z.object({
  committeeId: z.string().min(1),
  amount: z.number().positive().max(1_000_000),
  description: z.string().min(1).max(500),
  date: z.string().datetime().or(z.string().min(1)),
  receiptLabel: z.string().max(200).optional(),
});

router.post(
  "/expenses",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const parsed = submitSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const committee = await prisma.committee.findUnique({ where: { id: parsed.data.committeeId } });
    if (!committee) return res.status(404).json({ error: "Committee not found" });

    const allowed =
      req.user!.role === "SUPER_ADMIN" ||
      req.user!.permissions?.has("finance.manage") ||
      (await chairsCommittee(req.user!.id, parsed.data.committeeId));
    if (!allowed) {
      return res.status(403).json({ error: "Only this committee's head can submit expenses against it." });
    }

    const date = new Date(parsed.data.date);
    if (Number.isNaN(date.getTime())) return res.status(400).json({ error: "Invalid date" });

    const expense = await prisma.expense.create({
      data: {
        committeeId: parsed.data.committeeId,
        submittedById: req.user!.id,
        amount: parsed.data.amount,
        description: parsed.data.description,
        date,
        receiptLabel: parsed.data.receiptLabel,
      },
      include: expenseInclude,
    });

    res.status(201).json({ expense: toExpense(expense) });
  })
);

// ── PATCH /expenses/:id — finance.manage ──────────────────────────────────
// Review/settle. Deliberately NOT open to the submitter: approving your own
// reimbursement is the one thing this screen exists to prevent.
const reviewSchema = z.object({
  status: z.enum(["SUBMITTED", "APPROVED", "REIMBURSED", "REJECTED"]),
  reimbursementMethod: z.enum(["STRIPE", "PYLI", "CASH", "VENMO", "CHECK", "OTHER"]).optional(),
  reimbursementNote: z.string().max(500).optional(),
});

router.patch(
  "/expenses/:id",
  requirePermission("finance.manage"),
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const before = await prisma.expense.findUnique({ where: { id: req.params.id } });
    if (!before) return res.status(404).json({ error: "Expense not found" });

    const expense = await prisma.expense.update({
      where: { id: req.params.id },
      data: {
        ...parsed.data,
        reviewedById: req.user!.membershipId,
        reviewedAt: new Date(),
      },
      include: expenseInclude,
    });

    await writeAuditLog({
      actorId: req.user!.id,
      action: "EXPENSE_STATUS_UPDATE",
      entityType: "Expense",
      entityId: expense.id,
      before: { status: before.status },
      after: parsed.data,
    });

    res.json({ expense: toExpense(expense) });
  })
);

export default router;
