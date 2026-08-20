// src/theme/semantic.ts
//
// Domain → color lookups, in one place. Each screen used to keep its own
// module-scope `Record<Status, string>` literal, which had two problems:
//
//   · Frozen at import time. Once colors became theme-aware, those literals
//     silently captured the light palette forever — a dark-mode dues badge
//     would still be the light-mode green.
//   · Duplicated. Dues status colors were declared identically in three
//     separate screens, so any change had to be made three times.
//
// These are plain FUNCTIONS, not objects: the `colors` read happens on every
// call, i.e. during render, so the value always matches the active theme.

import { colors } from "./colors";
import { withAlpha } from "./contrast";
import type {
  DuesStatus,
  EventCategory,
  FeedbackStatus,
  InviteState,
  ReimbursementStatus,
  UserRole,
} from "../types";

export function eventCategoryColor(category: EventCategory | string): string {
  switch (category) {
    case "BROTHERHOOD": return colors.categoryBrotherhood;
    case "SERVICE": return colors.categoryService;
    case "PROFESSIONAL": return colors.categoryProfessional;
    case "RUSH": return colors.categoryRush;
    case "ADMIN": return colors.categoryAdmin;
    default: return colors.categoryAdmin;
  }
}

export function duesStatusColor(status: DuesStatus | string): string {
  switch (status) {
    case "PAID": return colors.success;
    case "PARTIAL": return colors.warning;
    case "UNPAID": return colors.danger;
    case "WAIVED": return colors.textMuted;
    default: return colors.textMuted;
  }
}

export function reimbursementStatusColor(status: ReimbursementStatus | string): string {
  switch (status) {
    case "SUBMITTED": return colors.warning;
    case "APPROVED": return colors.primaryTint;
    case "REIMBURSED": return colors.success;
    case "REJECTED": return colors.danger;
    default: return colors.textMuted;
  }
}

export function feedbackStatusColor(status: FeedbackStatus | string): string {
  switch (status) {
    case "OPEN": return colors.warning;
    case "IN_REVIEW": return colors.primaryTint;
    case "RESOLVED": return colors.success;
    case "CLOSED": return colors.textMuted;
    default: return colors.textMuted;
  }
}

export function userRoleColor(role: UserRole | string): string {
  switch (role) {
    case "SUPER_ADMIN": return colors.primaryTint;
    case "EXEC": return colors.accentTint;
    case "PNM": return colors.categoryRush;
    case "ALUMNI": return colors.categoryBrotherhood;
    case "MEMBER":
    default:
      return colors.textMuted;
  }
}

export function inviteStateColor(state: InviteState): string {
  switch (state) {
    case "ACTIVE": return colors.success;
    case "EXPIRING_SOON": return colors.warning;
    case "PAUSED": return colors.warning;
    case "EXPIRED": return colors.danger;
    case "EXHAUSTED": return colors.danger;
    case "ARCHIVED": return colors.textMuted;
    default: return colors.textMuted;
  }
}

export function inviteStateLabel(state: InviteState): string {
  switch (state) {
    case "ACTIVE": return "Active";
    case "EXPIRING_SOON": return "Expiring soon";
    case "PAUSED": return "Paused";
    case "EXPIRED": return "Expired";
    case "EXHAUSTED": return "Use limit reached";
    case "ARCHIVED": return "Archived";
    default: return state;
  }
}

/**
 * Tinted background for a status badge. Replaces the old
 * `STATUS_COLOR[x] + "22"` pattern, which produced an invalid color string
 * whenever the base was anything but a plain 6-digit hex, and was far too
 * faint to see against a dark background.
 */
export function badgeBackground(color: string): string {
  return withAlpha(color, colors.scheme === "dark" ? 0.22 : 0.13);
}
