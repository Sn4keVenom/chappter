// src/api/dues.ts

import { apiClient } from "./client";
import type { DuesRecord, Payment } from "../types";

export async function getMyDues(): Promise<DuesRecord[]> {
  const { data } = await apiClient.get<{ records: DuesRecord[] }>("/dues/me");
  return data.records;
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
