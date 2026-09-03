// src/api/brotherOfWeek.ts
//
// Exactly one holder at a time — awarding it to someone new clears the
// previous holder automatically (see backend/routes/brotherOfWeek.routes.ts).
// Award/clear are open to any authenticated user on the wire; the backend
// enforces who's actually allowed (Super Admin, Regent/Vice Regent, or the
// CURRENT holder passing the title on) and 403s everyone else.

import { apiClient } from "./client";

export interface BrotherOfWeekHolder {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
}

export async function getBrotherOfWeek(): Promise<BrotherOfWeekHolder | null> {
  const { data } = await apiClient.get<{ user: BrotherOfWeekHolder | null }>("/brother-of-week");
  return data.user;
}

export async function awardBrotherOfWeek(userId: string): Promise<BrotherOfWeekHolder | null> {
  const { data } = await apiClient.post<{ user: BrotherOfWeekHolder | null }>("/brother-of-week", { userId });
  return data.user;
}

export async function clearBrotherOfWeek(): Promise<void> {
  await apiClient.delete("/brother-of-week");
}
