// backend/lib/achievementDefaults.ts
//
// The eight badges the app shipped with, as data.
//
// These were hardcoded in src/utils/achievements.ts with fixed thresholds,
// which meant a chapter could neither retune them nor add its own — "5+
// events" is trivial for one chapter and out of reach for another. They're
// now seeded per chapter, so behaviour is identical until someone edits
// them, and "reset" restores exactly this list.
//
// `key` is what makes reset and re-seeding idempotent: a chapter that
// already has "century" keeps its row (and its edits) rather than gaining a
// duplicate. Chapter-invented badges have a null key and are left alone by
// seeding — only an explicit reset removes them.

import type { PrismaClient } from "@prisma/client";

export const DEFAULT_ACHIEVEMENTS = [
  { key: "first-checkin", icon: "✓",  label: "First Check-In", description: "Checked in to your first event",      metric: "ATTENDANCE_COUNT", threshold: 1 },
  { key: "regular",       icon: "🔥", label: "Regular",        description: "Attended 5+ events this semester",     metric: "ATTENDANCE_COUNT", threshold: 5 },
  { key: "never-late",    icon: "🏅", label: "Never Late",     description: "3+ check-ins, always on time",         metric: "NEVER_LATE_AFTER", threshold: 3 },
  { key: "top-3",         icon: "🥇", label: "Top 3",          description: "Ranked in the top 3 this semester",    metric: "RANK_AT_MOST",     threshold: 3 },
  { key: "century",       icon: "💯", label: "Century Club",   description: "Earned 100+ points this semester",     metric: "TOTAL_POINTS",     threshold: 100 },
  { key: "dues-settled",  icon: "💳", label: "Dues Settled",   description: "Dues fully paid or waived",            metric: "DUES_SETTLED",     threshold: 1 },
  { key: "committed",     icon: "⬡",  label: "Committed",      description: "Active on a chapter committee",        metric: "COMMITTEE_COUNT",  threshold: 1 },
  { key: "recognized",    icon: "⭐", label: "Recognized",     description: "Received a bonus points award",        metric: "BONUS_COUNT",      threshold: 1 },
] as const;

/** Creates any default badge this chapter is missing. Idempotent — an
 * existing row (including one the chapter has since edited) is left exactly
 * as it is, so calling this on every read is safe and a chapter that has
 * deliberately retuned "Regular" doesn't have it silently reverted. */
export async function seedDefaultAchievements(prisma: PrismaClient, chapterId: string): Promise<void> {
  await prisma.achievement.createMany({
    data: DEFAULT_ACHIEVEMENTS.map((a, i) => ({
      chapterId,
      key: a.key,
      icon: a.icon,
      label: a.label,
      description: a.description,
      metric: a.metric,
      threshold: a.threshold,
      sortOrder: i,
    })),
    skipDuplicates: true, // the (chapterId, key) unique index does the work
  });
}
