// src/mocks/identity.ts
//
// "Who am I logged in as" for Demo Mode. There's no real session — the demo
// user is just whichever id is currently selected here, defaulting to a
// SUPER_ADMIN so every tab/feature is visible on first launch. ProfileScreen
// exposes a role switcher (Demo Mode only) that calls setDemoUserId(), which
// re-populates useAuthStore exactly like a real login would.
//
// Kept separate from useAuthStore itself so this file is the only place that
// needs to know Demo Mode exists — useAuthStore is unchanged from the
// generated version.

import { findUser, committeeMemberships, users, DEMO_CHAPTER_ID, type MockUser } from "./seed";
import type { AppUser } from "../store/useAuthStore";

export const DEMO_DEFAULT_USER_ID = "u1";

let currentDemoUserId = DEMO_DEFAULT_USER_ID;

export function getCurrentDemoUserId(): string {
  return currentDemoUserId;
}

export function setCurrentDemoUserId(userId: string): void {
  if (!findUser(userId)) return;
  currentDemoUserId = userId;
}

export function toAppUser(user: MockUser): AppUser {
  return {
    id: user.id,
    // MockUser predates username (added with the real account system) —
    // derived from email rather than touching every seeded user record.
    username: user.email.split("@")[0],
    firstName: user.firstName,
    lastName: user.lastName,
    // Every demo user is already "in the chapter" — Demo Mode exists to
    // show the fully-populated app, not the join flow. chapterId must still
    // be set (not just hasChapter) — ChapterInviteManagerScreen/
    // JoinRequestsScreen read user.chapterId directly and silently no-op
    // (stuck spinner) without it.
    hasChapter: true,
    chapterId: DEMO_CHAPTER_ID,
    roleNumber: user.roleNumber ?? null,
    major: user.major ?? null,
    graduationYear: user.graduationYear ?? null,
    role: user.role,
    office: user.office ?? null,
    status: user.status,
    committeeChairOf: committeeMemberships
      .filter((m) => m.userId === user.id && m.role === "CHAIR")
      .map((m) => m.committeeId),
    teamId: user.teamId ?? null,
  };
}

export function getCurrentDemoUser(): MockUser {
  return findUser(currentDemoUserId) ?? findUser(DEMO_DEFAULT_USER_ID)!;
}

// A curated roster for the "Switch demo role" picker — one per named
// exec-board office plus a committee-chair member, a standard member, a
// PNM, and an Alumni, enough to exercise every permission-gated code path
// (including the new role/status/module/permission system) without
// overwhelming the picker with all 15 mock users.
export const DEMO_SWITCHABLE_USERS: { user: MockUser; blurb: string }[] = [
  { user: findUser("u1")!, blurb: "Super Admin, Regent — unrestricted access to every module and setting" },
  { user: findUser("u2")!, blurb: "Exec, Vice Regent — points system oversight" },
  { user: findUser("u15")!, blurb: "Exec, Scribe — attendance tracking & check-in delegation" },
  { user: findUser("u3")!, blurb: "Exec, Treasurer — dues, budgets & reimbursements" },
  { user: findUser("u5")!, blurb: "Member — chairs the Service Committee only" },
  { user: findUser("u9")!, blurb: "Standard member view — no admin tab" },
  { user: findUser("u11")!, blurb: "PNM — limited, prospective-member view" },
  { user: findUser("u14")!, blurb: "Alumni — limited, alumni view" },
];

export { users as demoAllUsers };
