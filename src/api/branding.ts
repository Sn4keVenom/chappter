// src/api/branding.ts
//
// Chapter branding — the chapter's visual identity (primary/accent colors,
// display name, logo). Same thin apiClient-wrapper pattern as every other
// api/*.ts file, so screens never touch mock data directly and reconnecting
// the real backend stays a config change rather than a code change.
//
// ── Backend status ────────────────────────────────────────────────────────
// These four routes are NOT implemented in backend/routes yet — adding them
// needs a Prisma migration (a ChapterBranding table or columns on Chapter).
// The client interface is defined here now, and Demo Mode answers it fully
// (src/mocks/api.ts + src/mocks/router.ts), so the feature is testable today
// and wiring the server later means implementing these paths, not touching
// any screen:
//
//   GET    /chapters/:id/branding
//   PATCH  /chapters/:id/branding
//   POST   /chapters/:id/branding/reset
//
// Against a live backend that hasn't shipped them, getChapterBranding() 404s
// and useThemeStore falls back to DEFAULT_BRANDING — the app renders in the
// stock Chappter palette rather than breaking.

import { apiClient } from "./client";
import type { ChapterBranding } from "../types";

export type ChapterBrandingUpdate = Partial<
  Pick<
    ChapterBranding,
    | "chapterName"
    | "chapterLetters"
    | "logoUrl"
    | "logoEmoji"
    | "primaryColor"
    | "accentColor"
    | "backgroundTintLight"
    | "backgroundTintDark"
  >
>;

export async function getChapterBranding(chapterId: string): Promise<ChapterBranding> {
  const { data } = await apiClient.get<{ branding: ChapterBranding }>(
    `/chapters/${chapterId}/branding`
  );
  return data.branding;
}

export async function updateChapterBranding(
  chapterId: string,
  payload: ChapterBrandingUpdate
): Promise<ChapterBranding> {
  const { data } = await apiClient.patch<{ branding: ChapterBranding }>(
    `/chapters/${chapterId}/branding`,
    payload
  );
  return data.branding;
}

export async function resetChapterBranding(chapterId: string): Promise<ChapterBranding> {
  const { data } = await apiClient.post<{ branding: ChapterBranding }>(
    `/chapters/${chapterId}/branding/reset`,
    {}
  );
  return data.branding;
}
