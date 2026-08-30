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

export type VerifyRoleNumberResult =
  | { valid: true }
  | { valid: false; reason: "NAME_MISMATCH" | "NOT_FOUND" | "ALREADY_CLAIMED" };

/**
 * Read-only pre-check called from the sign-up form BEFORE a Clerk account
 * exists — public, no auth. Lets the form show an inline mismatch error
 * without ever touching Clerk. The real, atomic claim happens after account
 * creation via api/roster.ts claimRoleNumber().
 */
export async function verifyRoleNumber(payload: {
  firstName: string;
  roleNumber: number;
  status: "ACTIVE" | "ALUMNI";
}): Promise<VerifyRoleNumberResult> {
  const { data } = await apiClient.post<VerifyRoleNumberResult>("/auth/verify-role-number", payload);
  return data;
}

export type LookupRoleNumberResult = { found: true; roleNumber: number } | { found: false };

/**
 * Reverse of verifyRoleNumber: given a name instead of a number, so the
 * sign-up form can fill the role-number field in rather than making the
 * person go find their own number. Only ever resolves when the name
 * unambiguously matches one unclaimed roster row — see the route's doc
 * comment in auth.routes.ts. A miss just means the field stays empty; it's
 * not an error the form needs to show.
 */
export async function lookupRoleNumber(payload: {
  firstName: string;
  lastName: string;
  status: "ACTIVE" | "ALUMNI";
}): Promise<LookupRoleNumberResult> {
  const { data } = await apiClient.post<LookupRoleNumberResult>("/auth/lookup-role-number", payload);
  return data;
}
