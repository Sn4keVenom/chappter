// src/store/useAuthStore.ts

import { create } from "zustand";
import type { ExecOffice, MemberStatus, UserRole } from "../types";

export interface AppUser {
  id: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  office?: ExecOffice | null;
  status: MemberStatus;
  committeeChairOf: string[]; // committee IDs this user chairs, for scoped officer checks
  teamId?: string | null; // gamification team — not a committee, no leader
}

interface AuthState {
  user: AppUser | null;
  // isLoading reflects an in-progress session restoration. Since we have no
  // persisted token storage yet (SecureStore integration is Phase 3), there
  // is nothing to restore on cold start. Initialize to false so RootNavigator
  // routes to the Auth stack immediately instead of showing an infinite spinner.
  //
  // When SecureStore is added, set isLoading: true here, restore the token in
  // an app-boot useEffect, then call setUser(restoredUser) or setUser(null)
  // to flip it back.
  isLoading: boolean;
  setUser: (user: AppUser | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,   // was true — caused infinite spinner on cold start
  setUser: (user) => set({ user, isLoading: false }),
}));
