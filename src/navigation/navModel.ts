// src/navigation/navModel.ts
//
// The single description of what the app's navigation contains, for whom.
// Both the desktop sidebar and the mobile bottom bar/drawer render from this,
// so a role can never see an item in one place and not the other, and there
// is exactly one spot to edit when a destination is added.
//
// Two filters apply to every item:
//   · `module`     — the chapter has switched this feature off entirely
//                    (Chapter Settings › Modules)
//   · `permission` / `predicate` — this user's role doesn't grant it
//
// Filtering happens here, before render. That is deliberate: the mobile app's
// bug was hiding tab BUTTONS while their layout slots remained, which left
// gaps in the bar. Items that don't apply are never produced at all, so the
// remaining ones simply lay themselves out.

import type { Permission, ModuleKey } from "../types";

export interface NavItem {
  /** Route path, used directly as the <NavLink to>. */
  to: string;
  label: string;
  /** Short label for the bottom bar, where horizontal space is tight. */
  shortLabel?: string;
  icon: string;
  /** Hidden when this module is disabled chapter-wide. */
  module?: ModuleKey;
  /** Hidden unless the user holds this permission. */
  permission?: Permission;
  /** Escape hatch for checks that aren't a single permission. */
  predicate?: (ctx: NavContext) => boolean;
  /** Appears in the mobile bottom bar (max 5 survive; see mobileBar()). */
  primary?: boolean;
  /** Match child routes too — /events/123 should light up "Events". */
  matchPrefix?: boolean;
}

export interface NavSection {
  id: string;
  /** Omitted for the first section, which needs no heading. */
  title?: string;
  items: NavItem[];
}

export interface NavContext {
  can: (permission: Permission) => boolean;
  isModuleEnabled: (key: ModuleKey) => boolean;
  canViewAdminPanel: boolean;
  isSuperAdmin: boolean;
  isExecOrAbove: boolean;
  isTreasurerOrAdmin: boolean;
}

const SECTIONS: NavSection[] = [
  {
    id: "main",
    items: [
      { to: "/", label: "Home", icon: "⌂", primary: true },
      { to: "/events", label: "Events", icon: "◷", primary: true, matchPrefix: true, module: "events" },
      {
        to: "/messages",
        label: "Messages",
        shortLabel: "Chat",
        icon: "✉",
        primary: true,
        matchPrefix: true,
        module: "messaging",
      },
      {
        to: "/points",
        label: "Leaderboard",
        shortLabel: "Points",
        icon: "★",
        primary: true,
        matchPrefix: true,
        module: "points",
      },
      { to: "/committees", label: "Committees", icon: "⬡", matchPrefix: true, module: "committees" },
      { to: "/documents", label: "Documents", icon: "📄", matchPrefix: true, module: "documents" },
    ],
  },
  {
    id: "admin",
    title: "Administration",
    items: [
      {
        to: "/admin",
        label: "Admin Panel",
        shortLabel: "Admin",
        icon: "⚙",
        primary: true,
        predicate: (c) => c.canViewAdminPanel,
      },
      { to: "/admin/roster", label: "Roster", icon: "👥", matchPrefix: true, predicate: (c) => c.canViewAdminPanel },
      {
        to: "/admin/dues",
        label: "Dues",
        icon: "💰",
        module: "dues",
        predicate: (c) => c.isExecOrAbove,
      },
      {
        to: "/admin/invites",
        label: "Invite Codes",
        icon: "🔗",
        permission: "chapters.manageInvites",
      },
      {
        to: "/admin/join-requests",
        label: "Join Requests",
        icon: "📥",
        permission: "chapters.manageInvites",
      },
      {
        to: "/admin/budgets",
        label: "Committee Budgets",
        icon: "🏦",
        module: "committees",
        predicate: (c) => c.isTreasurerOrAdmin,
      },
      {
        to: "/admin/expenses",
        label: "Reimbursements",
        icon: "🧾",
        module: "committees",
        predicate: (c) => c.isTreasurerOrAdmin,
      },
      {
        to: "/admin/feedback",
        label: "Feedback",
        icon: "💬",
        module: "feedback",
        permission: "feedback.view",
      },
      {
        to: "/admin/squads",
        label: "Squad Randomizer",
        icon: "🎲",
        predicate: (c) => c.isExecOrAbove,
      },
      {
        to: "/admin/semesters",
        label: "Semesters",
        icon: "🗓",
        permission: "semesters.manage",
      },
      {
        to: "/admin/attendance-report",
        label: "Attendance Report",
        icon: "📊",
        permission: "attendance.viewReport",
      },
      { to: "/admin/audit-log", label: "Audit Log", icon: "🔒", predicate: (c) => c.isExecOrAbove },
    ],
  },
  {
    id: "account",
    title: "Account",
    items: [
      { to: "/profile", label: "Profile", icon: "○", matchPrefix: true },
      { to: "/family", label: "My Family", icon: "🌳" },
      { to: "/feedback", label: "Send Feedback", icon: "💬", module: "feedback" },
      { to: "/settings", label: "Settings", icon: "⚙️", matchPrefix: true },
    ],
  },
];

function isVisible(item: NavItem, ctx: NavContext): boolean {
  if (item.module && !ctx.isModuleEnabled(item.module)) return false;
  if (item.permission && !ctx.can(item.permission)) return false;
  if (item.predicate && !item.predicate(ctx)) return false;
  return true;
}

/** Full navigation for the desktop sidebar and the mobile drawer. */
export function navSections(ctx: NavContext): NavSection[] {
  return SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => isVisible(item, ctx)),
  })).filter((section) => section.items.length > 0);
}

/**
 * Destinations for the mobile bottom bar.
 *
 * Capped at five: past that the targets get narrower than a fingertip. Any
 * remaining destinations stay reachable from the drawer, which the bar's
 * trailing "More" button opens — so nothing is ever unreachable, and the bar
 * is never padded with blanks.
 */
export const MOBILE_BAR_LIMIT = 5;

export function mobileBarItems(ctx: NavContext): NavItem[] {
  return SECTIONS.flatMap((section) => section.items)
    .filter((item) => item.primary && isVisible(item, ctx))
    .slice(0, MOBILE_BAR_LIMIT);
}
