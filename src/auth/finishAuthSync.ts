// src/auth/finishAuthSync.ts
//
// The one place "Clerk has a live session" turns into "useAuthStore has the
// flattened User" — called from every path that produces a session: initial
// page-load restore (SessionRestore.tsx), sign-in, and sign-up once email
// verification completes. Keeping this in one function means all three
// paths populate the store identically instead of three slightly different
// inline mappings (see JoinChapterPage.tsx's redeem() for the field list
// this mirrors).

import { syncUser } from "../api/auth";
import { useAuthStore } from "../store/useAuthStore";
import type { User } from "../types";

// Structural rather than importing Clerk's UserResource type directly —
// @clerk/types isn't a direct dependency (clerk-react re-exports its shape
// without publishing the package standalone at the version pinned here);
// this is just the handful of fields finishAuthSync actually reads off it.
interface ClerkUserLike {
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  imageUrl: string;
  primaryEmailAddress: { emailAddress: string } | null;
  primaryPhoneNumber: { phoneNumber: string } | null;
}

export async function finishAuthSync(clerkUser: ClerkUserLike, extra?: { phone?: string; username?: string }): Promise<User> {
  const user = await syncUser({
    firstName: clerkUser.firstName ?? "",
    lastName: clerkUser.lastName ?? "",
    email: clerkUser.primaryEmailAddress?.emailAddress ?? "",
    username: extra?.username ?? clerkUser.username ?? undefined,
    phone: extra?.phone ?? clerkUser.primaryPhoneNumber?.phoneNumber ?? undefined,
    avatarUrl: clerkUser.imageUrl,
  });

  useAuthStore.getState().setUser({
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
}
