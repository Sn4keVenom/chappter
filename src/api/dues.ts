// src/api/dues.ts

import { apiClient } from "./client";
import type { DuesRecord, Payment, DuesPlan } from "../types";

export async function getMyDues(): Promise<DuesRecord[]> {
  const { data } = await apiClient.get<{ records: DuesRecord[] }>("/dues/me");
  return data.records;
}

// Self-service payment via Pyli, the chapter's external payment provider
// (Feature 4). Not a real payment integration — see docs/DEMO_MODE.md and
// src/mocks/api.ts's payDuesWithPyli for what this stands in for. Any
// member can pay their own dues this way; no officer approval needed.
export async function payDuesWithPyli(payload: {
  semesterId: string;
  amount: number;
  plan: DuesPlan;
}): Promise<{ payment: Payment; duesRecord: DuesRecord }> {
  const { data } = await apiClient.post("/dues/pay-pyli", payload);
  return data;
}

export async function getAllDues(params?: {
  semesterId?: string;
  status?: string;
}): Promise<{
  records: (DuesRecord & { user: { id: string; firstName: string; lastName: string; email: string } })[];
  summary: { status: string; _count: { _all: number }; _sum: { amountOwed: number; amountPaid: number } }[];
}> {
  const { data } = await apiClient.get("/dues", { params });
  return data;
}

export async function recordPayment(
  userId: string,
  payload: {
    semesterId: string;
    amount: number;
    method: "CASH" | "VENMO" | "CHECK" | "OTHER";
    note?: string;
  }
): Promise<{ payment: Payment; duesRecord: DuesRecord }> {
  const { data } = await apiClient.post(`/dues/${userId}/payment`, payload);
  return data;
}

export async function waiveDues(
  userId: string,
  semesterId: string,
  reason: string
): Promise<DuesRecord> {
  const { data } = await apiClient.post<{ duesRecord: DuesRecord }>(
    `/dues/${userId}/waive`,
    { semesterId, reason }
  );
  return data.duesRecord;
}

export async function initializeSemesterDues(payload: {
  semesterId: string;
  amountOwed: number;
  dueDate?: string;
  userIds?: string[];
}): Promise<{ created: number; total: number }> {
  const { data } = await apiClient.post("/dues/initialize", payload);
  return data;
}

export async function sendDuesReminders(semesterId: string): Promise<{
  sent: number;
  members: { userId: string; firstName: string; email: string; status: string }[];
}> {
  const { data } = await apiClient.post("/dues/reminders/send", { semesterId });
  return data;
}
