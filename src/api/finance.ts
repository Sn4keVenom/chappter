// src/api/finance.ts
//
// Committee budgets & expense reimbursements (Feature 5) — tracking only,
// no real payment processing. The Treasurer allocates each committee's
// budget and reviews/settles reimbursements; committee chairs submit
// expenses against their own committee. Same thin apiClient-wrapper
// pattern as every other api/*.ts file.

import { apiClient } from "./client";
import type { CommitteeBudget, Expense, ReimbursementStatus, PaymentMethod } from "../types";

export async function listCommitteeBudgets(): Promise<CommitteeBudget[]> {
  const { data } = await apiClient.get<{ budgets: CommitteeBudget[] }>("/budgets");
  return data.budgets;
}

export async function getCommitteeBudget(committeeId: string): Promise<CommitteeBudget> {
  const { data } = await apiClient.get<{ budget: CommitteeBudget }>(`/committees/${committeeId}/budget`);
  return data.budget;
}

export async function setCommitteeBudget(committeeId: string, allocated: number): Promise<CommitteeBudget> {
  const { data } = await apiClient.patch<{ budget: CommitteeBudget }>(`/committees/${committeeId}/budget`, {
    allocated,
  });
  return data.budget;
}

export async function listExpenses(params?: { committeeId?: string; status?: string }): Promise<Expense[]> {
  const { data } = await apiClient.get<{ expenses: Expense[] }>("/expenses", { params });
  return data.expenses;
}

export async function submitExpense(payload: {
  committeeId: string;
  amount: number;
  description: string;
  date: string;
  receiptLabel?: string;
}): Promise<Expense> {
  const { data } = await apiClient.post<{ expense: Expense }>("/expenses", payload);
  return data.expense;
}

export async function updateExpenseStatus(
  expenseId: string,
  payload: { status: ReimbursementStatus; reimbursementMethod?: PaymentMethod; reimbursementNote?: string }
): Promise<Expense> {
  const { data } = await apiClient.patch<{ expense: Expense }>(`/expenses/${expenseId}`, payload);
  return data.expense;
}
