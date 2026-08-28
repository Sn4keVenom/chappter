// src/api/achievements.ts
//
// Chapter achievement badge definitions. Reading is open to every member
// (their own profile renders them); editing is `achievements.manage`,
// granted by office to Regent and Vice Regent.

import { apiClient } from "./client";
import type { AchievementDefinition, AchievementMetric } from "../types";

export async function listAchievements(): Promise<AchievementDefinition[]> {
  const { data } = await apiClient.get<{ achievements: AchievementDefinition[] }>("/achievements");
  return data.achievements;
}

export interface AchievementInputPayload {
  label: string;
  description: string;
  icon: string;
  metric: AchievementMetric;
  threshold: number;
  enabled?: boolean;
  sortOrder?: number;
}

export async function createAchievement(payload: AchievementInputPayload): Promise<AchievementDefinition> {
  const { data } = await apiClient.post<{ achievement: AchievementDefinition }>("/achievements", payload);
  return data.achievement;
}

export async function updateAchievement(
  id: string,
  payload: Partial<AchievementInputPayload>
): Promise<AchievementDefinition> {
  const { data } = await apiClient.patch<{ achievement: AchievementDefinition }>(`/achievements/${id}`, payload);
  return data.achievement;
}

/** Shipped defaults are disabled rather than removed (reset re-creates them
 * anyway); a chapter's own badge is really deleted. */
export async function deleteAchievement(id: string): Promise<void> {
  await apiClient.delete(`/achievements/${id}`);
}

/** Discards local changes: chapter-invented badges go, the shipped eight
 * come back with their original labels and thresholds. */
export async function resetAchievements(): Promise<AchievementDefinition[]> {
  const { data } = await apiClient.post<{ achievements: AchievementDefinition[] }>("/achievements/reset", {});
  return data.achievements;
}
