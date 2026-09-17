// src/store/useAuthStore.ts

import { create } from "zustand";
import type { ChapterJoinRequest, ExecOffice, MemberStatus, UserRole } from "../types";
import { DEMO_MODE } from "../config/demo";

export interface AppUser {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  // True once this user has joined a chapter (redeemed an invite or had a
  // join request approved) — see spec §2/§3: never auto-assigned on
  // creation. RootNavigator routes to OnboardingNavigator instead of the
  // main app while this is false.
  hasChapter: boolean;
  avatarUrl?: string | null;
  chapterId?: string | null;
  pendingJoinRequest?: ChapterJoinRequest | null;
  role?: UserRole;
  office?: ExecOffice | null;
  status?: MemberStatus;
  roleNumber?: number | null;
  major?: string | null;
  graduationYear?: number | null;
  committeeChairOf: string[]; // committee IDs this user chairs, for scoped officer checks
  teamId?: string | null; // gamification team — not a committee, no leader
}

interface AuthState {
  user: AppUser | null;
  // Demo Mode's mocks/bootstrap.ts calls setUser() synchronously before the
  // first render, so this is always false there. Real mode's
  // auth/SessionRestore.tsx can't do the same — it has to wait on Clerk's
  // own async load plus a POST /auth/sync round trip — so it starts true
  // there and RootRedirect (routes/RootRedirect.tsx) shows a spinner instead
  // of flashing /login for an already-signed-in returning user.
  isLoading: boolean;
  // True when Clerk confirms a live session but /auth/sync couldn't be
  // confirmed after retrying (backend unreachable/overloaded, not a bad
  // token) — see SessionRestore.tsx. Deliberately distinct from `user: null`
  // (genuinely signed out): RootRedirect must never treat this as signed-out
  // and fall through to /login, because Clerk really does still have an
  // active session there — landing on the plain sign-in form would fail
  // immediately with Clerk's own "You're already signed in" the moment they
  // tried to sign in again, with no way back to the working /switch-account
  // recovery screen.
  syncError: boolean;
  setUser: (user: AppUser | null) => void;
  setSyncError: (syncError: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: !DEMO_MODE,
  syncError: false,
  setUser: (user) => set({ user, isLoading: false, syncError: false }),
  setSyncError: (syncError) => set({ syncError, isLoading: false }),
}));
