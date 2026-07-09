// src/api/client.ts
//
// Axios instance shared by all api/*.ts modules. Centralizes:
//   · Base URL from environment / config
//   · Authorization header injection (token set by AuthNavigator after Clerk sign-in)
//   · Error normalization into ApiError so screens can handle them uniformly
//
// Integration points:
//   · setAuthToken() called by AuthNavigator.tsx after Clerk sign-in
//   · getAuthToken() called by ProfileScreen sign-out to clear it
//   · All api/*.ts modules import `apiClient` from here (same pattern as
//     the existing mobile/api/events.ts which already imports from "./client")
//   · ApiError.status is used in screens to distinguish 401/403/4xx/5xx

import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from "axios";
import { DEMO_MODE } from "../config/demo";
import { demoAdapter } from "../mocks/router";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

// Module-level token — survives component remounts but resets on full JS reload.
// For persistence across app restarts, write to SecureStore in setAuthToken.
let _authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  _authToken = token;
}

export function getAuthToken(): string | null {
  return _authToken;
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

// Inject Bearer token on every request
apiClient.interceptors.request.use((config) => {
  if (_authToken) {
    config.headers.Authorization = `Bearer ${_authToken}`;
  }
  return config;
});

// Retry once for GET requests only (idempotent — safe to repeat) on a
// network error or a 5xx. Mobile networks drop packets on WiFi/cellular
// handoff constantly; a single automatic retry with a short delay clears
// most of those transparently instead of surfacing an error the user would
// just retry manually anyway via pull-to-refresh. Never retries
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
      const message = error.response.data?.error ?? error.message;
      const code = error.response.data?.code;
      return Promise.reject(new ApiError(status, message, code));
    }
    // Network error / timeout
    return Promise.reject(
      new ApiError(0, "Network error — check your connection and try again.")
    );
  }
);
