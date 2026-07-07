// src/api/users.ts
// Follows the same pattern as events.ts: one function per backend route,
// typed request params, typed response. Imports from ../types for shapes.

import { apiClient } from "./client";
import type {
  User, UserSummary, DashboardData, LeaderboardEntry, LedgerEntry
} from "../types";

export async function getMe(): Promise<User> {
  const { data } = await apiClient.get<{ user: User }>("/users/me");
  return data.user;
}

export async function getDashboard(): Promise<DashboardData> {
  const { data } = await apiClient.get<DashboardData>("/users/me/dashboard");
  return data;
}

export async function getRoster(params?: {
  q?: string;
  role?: string;
  status?: string;
  page?: number;
  limit?: number;
}): Promise<{ users: UserSummary[]; total: number }> {
  const { data } = await apiClient.get<{ users: UserSummary[]; total: number }>(
    "/users",
    { params }
  );
  return data;
}

export async function getMemberProfile(userId: string): Promise<User> {
  const { data } = await apiClient.get<{ user: User }>(`/users/${userId}`);
  return data.user;
}

export async function updateUserRole(
  userId: string,
  role: User["role"]
): Promise<User> {
  const { data } = await apiClient.patch<{ user: User }>(
    `/users/${userId}/role`,
    { role }
  );
  return data.user;
}

export async function getLeaderboard(params?: {
  semesterId?: string;
}): Promise<{ leaderboard: LeaderboardEntry[]; semesterLabel: string | null }> {
  const { data } = await apiClient.get("/points/leaderboard", { params });
  return data;
}

export async function getPointsLedger(
  userId: string,
  params?: { semesterId?: string; limit?: number; cursor?: string }
): Promise<{ entries: LedgerEntry[]; total: number; nextCursor: string | null }> {
  const { data } = await apiClient.get(`/points/ledger/${userId}`, { params });
  return data;
}

export async function adjustPoints(payload: {
  userId: string;
  semesterId: string;
  amount: number;
  type: "BONUS" | "PENALTY" | "MANUAL_ADJUSTMENT";
  reason: string;
}): Promise<LedgerEntry> {
  const { data } = await apiClient.post<{ entry: LedgerEntry }>("/points/adjust", payload);
  return data.entry;
}
