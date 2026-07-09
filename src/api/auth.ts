// src/api/auth.ts
// Wraps POST /auth/sync — called immediately after Clerk sign-in.
// Uses the raw axios instance with the auth token already set so the
// backend can verify the JWT matches the submitted profile data.

import { apiClient } from "./client";
import { User } from "../types";

export interface SyncPayload {
  firstName: string;
  lastName: string;
  email: string;
  // Only present for email/password sign-up (SignUpScreen already collected
  // it via Clerk). OAuth sign-ins (Google/Apple) omit it — the backend
  // auto-suggests one from the email on first sync (see auth.routes.ts).
  username?: string;
  phone?: string;
  avatarUrl?: string;
}

export async function syncUser(payload: SyncPayload): Promise<User> {
  const { data } = await apiClient.post<{ user: User }>("/auth/sync", payload);
  return data.user;
}
