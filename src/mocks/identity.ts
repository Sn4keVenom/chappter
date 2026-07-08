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

import { findUser, committeeMemberships, users, type MockUser } from "./seed";
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
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    title: user.title ?? null,
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
// exec-board title plus a committee-chair officer and a standard member,
// enough to exercise every permission-gated code path (Feature 1–5 included)
// without overwhelming the picker with all 15 mock users.
export const DEMO_SWITCHABLE_USERS: { user: MockUser; blurb: string }[] = [
  { user: findUser("u1")!, blurb: "Regent — sees every tab and admin action" },
  { user: findUser("u2")!, blurb: "Vice Regent — points system oversight" },
  { user: findUser("u15")!, blurb: "Scribe — attendance tracking & check-in delegation" },
  { user: findUser("u3")!, blurb: "Treasurer — dues, budgets & reimbursements" },
  { user: findUser("u5")!, blurb: "Officer — manages Service Committee only" },
  { user: findUser("u9")!, blurb: "Standard member view — no admin tab" },
];

export { users as demoAllUsers };
