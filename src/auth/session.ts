// src/auth/session.ts
//
// "Remember me" persistence, web edition. The mobile app stored this in
// expo-secure-store; on the web the natural pair is:
//
//   remember = true  → localStorage  (survives closing the browser)
//   remember = false → sessionStorage (cleared when the tab closes)
//
// That is a genuine improvement over the mobile behaviour rather than a
// port: the browser itself enforces the lifetime, instead of the app having
// to remember a flag and sign the user out on the next cold start.

const KEY = "chapterhub.rememberMe";

export function rememberSession(rememberMe: boolean): void {
  try {
    if (rememberMe) {
      localStorage.setItem(KEY, "1");
      sessionStorage.removeItem(KEY);
    } else {
      sessionStorage.setItem(KEY, "1");
      localStorage.removeItem(KEY);
    }
  } catch {
    // Storage blocked (private mode, embedded browser). Non-fatal: the
    // session simply lasts as long as the tab does.
  }
}

export function shouldRestoreSession(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
