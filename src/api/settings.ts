// src/api/settings.ts
//
// Centralized chapter configuration (spec §6) — chapter name/letters,
// university, logo, semester dates, dues/attendance/points defaults. The
// primary place future chapter-wide customization should live.

import { apiClient } from "./client";
import type { ChapterSettings } from "../types";

export async function getChapterSettings(): Promise<ChapterSettings> {
  const { data } = await apiClient.get<{ settings: ChapterSettings }>("/settings");
  return data.settings;
}

export async function updateChapterSettings(payload: Partial<ChapterSettings>): Promise<ChapterSettings> {
  const { data } = await apiClient.patch<{ settings: ChapterSettings }>("/settings", payload);
  return data.settings;
}
