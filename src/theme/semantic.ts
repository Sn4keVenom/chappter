// src/theme/semantic.ts
//
// Domain → color lookups, in one place. Each returns a CSS `var(--…)`
// reference rather than a literal, so the value follows the active theme and
// the chapter's branding without anything re-rendering.
//
// These are FUNCTIONS rather than lookup objects on purpose: the mobile app
// kept per-screen `Record<Status, string>` literals that froze the light
// palette at import time, and the same class of bug would return here if the
// map held resolved values.

import { cssVar } from "./cssVars";
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
    case "BROTHERHOOD": return cssVar("categoryBrotherhood");
    case "SERVICE": return cssVar("categoryService");
    case "PROFESSIONAL": return cssVar("categoryProfessional");
    case "RUSH": return cssVar("categoryRush");
    case "ADMIN":
    default: return cssVar("categoryAdmin");
  }
}

/** Semantic tone shared by the Badge component and any inline colouring. */
export type Tone = "neutral" | "success" | "warning" | "danger" | "primary" | "accent";

export function duesStatusTone(status: DuesStatus | string): Tone {
  switch (status) {
    case "PAID": return "success";
    case "PARTIAL": return "warning";
    case "UNPAID": return "danger";
    case "WAIVED":
    default: return "neutral";
  }
}

export function reimbursementStatusTone(status: ReimbursementStatus | string): Tone {
  switch (status) {
    case "SUBMITTED": return "warning";
    case "APPROVED": return "primary";
    case "REIMBURSED": return "success";
    case "REJECTED": return "danger";
    default: return "neutral";
  }
}

export function feedbackStatusTone(status: FeedbackStatus | string): Tone {
  switch (status) {
    case "OPEN": return "warning";
    case "IN_REVIEW": return "primary";
    case "RESOLVED": return "success";
    case "CLOSED":
    default: return "neutral";
  }
}

export function userRoleTone(role: UserRole | string): Tone {
  switch (role) {
    case "SUPER_ADMIN": return "primary";
    case "EXEC": return "accent";
    case "PNM": return "warning";
    case "ALUMNI": return "neutral";
    case "MEMBER":
    default: return "neutral";
  }
}

export function inviteStateTone(state: InviteState): Tone {
  switch (state) {
    case "ACTIVE": return "success";
    case "EXPIRING_SOON":
    case "PAUSED": return "warning";
    case "EXPIRED":
    case "EXHAUSTED": return "danger";
    case "ARCHIVED":
    default: return "neutral";
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
