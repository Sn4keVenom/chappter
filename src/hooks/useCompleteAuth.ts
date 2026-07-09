// src/hooks/useCompleteAuth.ts
//
// Shared tail end of every auth flow (password sign-in, sign-up + email
// verification, password reset, Google/Apple SSO): activate the Clerk
// session, retrieve a JWT, sync the DB User row, and populate useAuthStore.
// Centralized here so the five entry points in src/screens/auth/ don't each
// re-implement this sequence — see AuthNavigator.tsx's original doc comment
// for why the order (setActive → getToken → setAuthToken → sync → setUser)
// is load-bearing: getToken() on a non-active session returns null.

import { useClerk } from "@clerk/clerk-expo";
import { setAuthToken } from "../api/client";
import { syncUser, type SyncPayload } from "../api/auth";
import { useAuthStore } from "../store/useAuthStore";
import { rememberSession } from "../auth/rememberMe";
import type { User } from "../types";

export function useCompleteAuth() {
  const clerk = useClerk();
  const setUser = useAuthStore((s) => s.setUser);

  return async function completeAuth(
    sessionId: string,
    overrides?: Partial<SyncPayload>,
    options?: { rememberMe?: boolean }
  ): Promise<User> {
    await clerk.setActive({ session: sessionId });

    const jwt = await clerk.session?.getToken();
    if (!jwt) throw new Error("Could not retrieve session token from Clerk.");
    setAuthToken(jwt);

    const clerkUser = clerk.user;
    const user = await syncUser({
      firstName: overrides?.firstName ?? clerkUser?.firstName ?? "Member",
      lastName: overrides?.lastName ?? clerkUser?.lastName ?? "",
      email:
        overrides?.email ??
        clerkUser?.primaryEmailAddress?.emailAddress ??
        clerkUser?.emailAddresses?.[0]?.emailAddress ??
        "",
      username: overrides?.username ?? clerkUser?.username ?? undefined,
      avatarUrl: overrides?.avatarUrl ?? clerkUser?.imageUrl ?? undefined,
      phone: overrides?.phone,
    });

    await rememberSession(options?.rememberMe ?? true);

    setUser({
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      hasChapter: user.hasChapter,
      chapterId: user.chapterId,
      pendingJoinRequest: user.pendingJoinRequest,
      role: user.role,
      office: user.office,
      status: user.status,
      roleNumber: user.roleNumber,
      major: user.major,
      graduationYear: user.graduationYear,
      committeeChairOf: user.committeeChairOf,
      teamId: user.teamId,
    });

    return user;
  };
}
