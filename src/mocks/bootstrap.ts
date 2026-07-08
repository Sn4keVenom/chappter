// src/mocks/bootstrap.ts
//
// Demo Mode session bootstrap. Populates useAuthStore with the current demo
// user so RootNavigator routes straight into the app — no Clerk sign-in, no
// AuthNavigator. App.tsx calls bootstrapDemoSession() once at module load,
// before the first render, so `user` is already set by the time
// RootNavigator's initial render runs.
//
// switchDemoUser() backs the "Switch demo role" picker in ProfileScreen —
// it's the only way the demo user identity changes after launch.

import { useAuthStore } from "../store/useAuthStore";
import { getCurrentDemoUser, setCurrentDemoUserId, toAppUser } from "./identity";
import { DEMO_MODE } from "../config/demo";

export function bootstrapDemoSession(): void {
  if (!DEMO_MODE) return;
  useAuthStore.getState().setUser(toAppUser(getCurrentDemoUser()));
}

export function switchDemoUser(userId: string): void {
  setCurrentDemoUserId(userId);
  useAuthStore.getState().setUser(toAppUser(getCurrentDemoUser()));
}
