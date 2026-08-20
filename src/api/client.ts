// src/api/client.ts
//
// Axios instance shared by all api/*.ts modules. Centralizes:
//   · Base URL from environment / config
//   · Authorization header injection
//   · Error normalization into ApiError so screens can handle them uniformly
//
// ── Why there's a token GETTER, not just a cached token string ────────────
// Clerk session tokens are short-lived by design (the default JWT template
// expires in ~60 seconds) and are meant to be re-fetched via
// `session.getToken()` before every request — Clerk caches internally and
// only hits the network when actually near expiry, so calling it per-request
// is cheap and is the supported integration pattern. Caching the JWT string
// once at sign-in (the original approach here) would mean every request
// after the first minute of a session 401s against the real backend, with
// no way to recover short of relaunching the app. setTokenGetter() lets
// ClerkTokenBridge (mounted inside <ClerkProvider>, see App.tsx) hand this
// module a live `() => session.getToken()` closure instead.
//
// setAuthToken() still exists for two cases where a getter isn't in play:
// Demo Mode (no Clerk session at all — see mocks/bootstrap.ts) and the
// brief window right after sign-in, before ClerkTokenBridge's effect has
// run, where a screen needs to make an authenticated call (POST /auth/sync)
// immediately. The getter always wins over the static token when both are set.
//
// Integration points:
//   · setTokenGetter() called by ClerkTokenBridge (App.tsx) once Clerk's
//     session is available; cleared on sign-out
//   · setAuthToken() called by useCompleteAuth.ts (first call right after
//     sign-in) and screens' sign-out handlers (to clear it)
//   · All api/*.ts modules import `apiClient` from here
//   · ApiError.status is used in screens to distinguish 401/403/4xx/5xx

import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from "axios";
import { DEMO_MODE } from "../config/demo";
import { demoAdapter } from "../mocks/router";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api/v1";

// Fallback token — survives component remounts but resets on full JS reload.
let _authToken: string | null = null;
let _tokenGetter: (() => Promise<string | null>) | null = null;

export function setAuthToken(token: string | null): void {
  _authToken = token;
}

export function getAuthToken(): string | null {
  return _authToken;
}

/** Registered by ClerkTokenBridge once a Clerk session exists; pass null on
 * sign-out. When set, this wins over the static token on every request so
 * the Authorization header always carries a fresh, unexpired JWT. */
export function setTokenGetter(getter: (() => Promise<string | null>) | null): void {
  _tokenGetter = getter;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
});

// Demo Mode (default): every request below is answered from local mock data
// via a custom axios adapter instead of hitting the network. Nothing else in
// this file — or any api/*.ts module, or any screen — changes between demo
// and live mode. See src/config/demo.ts and src/mocks/router.ts.
if (DEMO_MODE) {
  apiClient.defaults.adapter = demoAdapter;
}

// Inject a fresh Bearer token on every request. Async interceptors are
// natively supported by axios — this awaits Clerk's own cache/refresh logic
// (near-instant when the current token is still valid, one network round
// trip when it's not) rather than ever reusing a JWT past its ~60s lifetime.
apiClient.interceptors.request.use(async (config) => {
  const token = _tokenGetter ? await _tokenGetter() : _authToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Retry once for GET requests only (idempotent — safe to repeat) on a
// network error or a 5xx. Connections drop on network changes and when a
// backgrounded tab wakes up; a single automatic retry with a short delay
// clears most of those transparently instead of surfacing an error the
// user would just retry manually anyway. Never retries
// POST/PATCH/DELETE — those aren't safe to silently repeat here (some, like
// point adjustments, aren't naturally idempotent).
type RetryableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

function isRetryable(error: AxiosError, config?: RetryableConfig): config is RetryableConfig {
  if (!config || config._retried) return false;
  if ((config.method ?? "get").toLowerCase() !== "get") return false;
  if (!error.response) return true; // network error / timeout
  return error.response.status >= 500;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Normalize errors to ApiError
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ error?: string; code?: string }>) => {
    const config = error.config as RetryableConfig | undefined;

    if (isRetryable(error, config)) {
      config._retried = true;
      await delay(400);
      return apiClient(config);
    }

    if (error.response) {
      const status = error.response.status;
      // error.response.data.error is usually a string, but zod validation
      // failures (`{ error: parsed.error.flatten() }`, used by several
      // routes) send an object instead — without this guard, that object
      // gets passed straight to Error's message and every screen's
      // `Alert.alert(..., e.message)` would render "[object Object]".
      const rawMessage = error.response.data?.error;
      const message = typeof rawMessage === "string" ? rawMessage : error.message;
      const code = error.response.data?.code;
      return Promise.reject(new ApiError(status, message, code));
    }
    // Network error / timeout
    return Promise.reject(
      new ApiError(0, "Network error — check your connection and try again.")
    );
  }
);
