// src/api/feedback.ts
//
// In-app feedback & bug reports (spec §9) — bug/feature/general, tagged
// with app version + platform for troubleshooting.

import { apiClient } from "./client";
import type { FeedbackReport, FeedbackStatus, FeedbackType } from "../types";

export async function submitFeedback(payload: {
  type: FeedbackType;
  message: string;
  appVersion: string;
  platform: string;
}): Promise<FeedbackReport> {
  const { data } = await apiClient.post<{ report: FeedbackReport }>("/feedback", payload);
  return data.report;
}

export async function listFeedback(params?: { type?: FeedbackType; status?: FeedbackStatus }): Promise<FeedbackReport[]> {
  const { data } = await apiClient.get<{ reports: FeedbackReport[] }>("/feedback", { params });
  return data.reports;
}

export async function updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<FeedbackReport> {
  const { data } = await apiClient.patch<{ report: FeedbackReport }>(`/feedback/${id}`, { status });
  return data.report;
}
