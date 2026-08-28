// src/utils/achievements.ts
//
// Evaluates a chapter's achievement badges against data the profile already
// fetches (points ledger, attendance, dues, committees).
//
// The DEFINITIONS now come from the server (GET /achievements) so a chapter
// can retune thresholds and add its own badges — "5+ events" is trivial for
// one chapter and unreachable for another. What stayed here is the
// evaluation: it's pure, needs no extra round-trip, and works identically in
// Demo Mode and against the real backend.
//
// Rendered by ProfilePage as a row of chips.

import type { AchievementDefinition, DuesStatus } from "../types";

export interface Achievement {
  id: string;
  icon: string;
  label: string;
  description: string;
  earned: boolean;
}

export interface AchievementInput {
  totalPoints: number;
  rank: number | null;
  attendanceCount: number;
  lateCount: number;
  bonusCount: number;
  duesStatus: DuesStatus | null;
  committeeCount: number;
}

/** Whether one definition is earned. Most metrics are "this number reached
 * the threshold"; RANK_AT_MOST inverts the comparison (lower is better) and
 * the two compound ones carry the logic the original hardcoded badges had. */
function isEarned(def: AchievementDefinition, input: AchievementInput): boolean {
  switch (def.metric) {
    case "ATTENDANCE_COUNT":
      return input.attendanceCount >= def.threshold;
    case "TOTAL_POINTS":
      return input.totalPoints >= def.threshold;
    case "BONUS_COUNT":
      return input.bonusCount >= def.threshold;
    case "COMMITTEE_COUNT":
      return input.committeeCount >= def.threshold;
    case "RANK_AT_MOST":
      return input.rank != null && input.rank <= def.threshold;
    case "NEVER_LATE_AFTER":
      return input.attendanceCount >= def.threshold && input.lateCount === 0;
    case "DUES_SETTLED":
      return input.duesStatus === "PAID" || input.duesStatus === "WAIVED";
    default:
      // An unknown metric from a newer backend shouldn't award a badge —
      // and shouldn't throw either.
      return false;
  }
}

/**
 * `definitions` is optional so a caller that hasn't loaded them yet (or is
 * offline) renders no badges rather than crashing — the profile treats an
 * empty list as "no achievements section", which is the same thing it did
 * before any were earned.
 */
export function computeAchievements(
  input: AchievementInput,
  definitions: AchievementDefinition[] = []
): Achievement[] {
  return definitions
    .filter((def) => def.enabled)
    .map((def) => ({
      id: def.id,
      icon: def.icon,
      label: def.label,
      description: def.description,
      earned: isEarned(def, input),
    }));
}
