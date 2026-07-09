// src/auth/rememberMe.ts
//
// "Remember Me" toggle on LoginScreen. Clerk's tokenCache (expo-secure-store,
// wired up in App.tsx) always persists the session refresh token — there's
// no per-sign-in flag in Clerk's mobile SDK to suppress that. To honor an
// explicit "don't remember me," we instead record the user's choice here and
// have SessionRestore.tsx check it on the NEXT cold start: if the last
// sign-in opted out, we sign out of the restored Clerk session immediately
// instead of continuing into the app, so the session doesn't survive an
// app restart even though Clerk's own cache still has it.
//
// Defaults to remembering (true) if never set, so behavior is unchanged for
// anyone who never sees/touches the toggle (e.g. mid-session after an
// update).

import * as SecureStore from "expo-secure-store";

const KEY = "chapterhub_remember_me";

export async function rememberSession(rememberMe: boolean): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, rememberMe ? "1" : "0");
  } catch {
    // Non-fatal — worst case, next cold start treats it as "remember" (the
    // safe default) rather than unexpectedly signing someone out.
  }
}

export async function shouldRestoreSession(): Promise<boolean> {
  try {
    const value = await SecureStore.getItemAsync(KEY);
    return value !== "0";
  } catch {
    return true;
  }
}
