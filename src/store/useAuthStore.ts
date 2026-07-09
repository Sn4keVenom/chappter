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
  // Historically reflected an in-progress session restoration, but cold-start
  // restoration is now handled entirely by navigation/SessionRestore.tsx
  // (real mode) / mocks/bootstrap.ts (Demo Mode) BEFORE RootNavigator ever
  // mounts — both call setUser() synchronously-or-after-await, so by the
  // time RootNavigator reads this store, isLoading is always false. Kept
  // for backward compatibility with RootNavigator's guard rather than
  // removed outright; a genuinely mid-navigation loading state (rare) would
  // still use it correctly if ever needed again.
  isLoading: boolean;
  setUser: (user: AppUser | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  setUser: (user) => set({ user, isLoading: false }),
}));
