// src/utils/achievements.ts
//
// Pure client-side computation of achievement badges from data the app
// already fetches (points ledger, attendance, dues, committees) — there is
// no Achievement model in schema.prisma and no new API endpoint here. This
// works identically in Demo Mode and against the real backend, since it
// only ever looks at data shaped by the existing types/index.ts contracts.
//
// Rendered by ProfileScreen as a row of chips.

import type { DuesStatus } from "../types";

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

export function computeAchievements(input: AchievementInput): Achievement[] {
  return [
    {
      id: "first-checkin",
      icon: "✓",
      label: "First Check-In",
      description: "Checked in to your first event",
      earned: input.attendanceCount >= 1,
    },
    {
      id: "regular",
      icon: "🔥",
      label: "Regular",
      description: "Attended 5+ events this semester",
      earned: input.attendanceCount >= 5,
    },
    {
      id: "never-late",
      icon: "🏅",
      label: "Never Late",
      description: "3+ check-ins, always on time",
      earned: input.attendanceCount >= 3 && input.lateCount === 0,
    },
    {
      id: "top-3",
      icon: "🥇",
      label: "Top 3",
      description: "Ranked in the top 3 this semester",
      earned: input.rank != null && input.rank <= 3,
    },
    {
      id: "century",
      icon: "💯",
      label: "Century Club",
      description: "Earned 100+ points this semester",
      earned: input.totalPoints >= 100,
    },
    {
      id: "dues-settled",
      icon: "💳",
      label: "Dues Settled",
      description: "Dues fully paid or waived",
      earned: input.duesStatus === "PAID" || input.duesStatus === "WAIVED",
    },
    {
      id: "committed",
      icon: "⬡",
      label: "Committed",
      description: "Active on a chapter committee",
      earned: input.committeeCount >= 1,
    },
    {
      id: "recognized",
      icon: "⭐",
      label: "Recognized",
      description: "Received a bonus points award",
      earned: input.bonusCount >= 1,
    },
  ];
}
