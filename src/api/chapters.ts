// src/api/chapters.ts
// Chapters, invite codes/links, and join requests (spec §3). Same thin
// apiClient-wrapper pattern as every other api/*.ts file.

import { apiClient } from "./client";
import type { ChapterInvite, ChapterJoinRequest, ChapterSummary, MemberStatus, User, UserRole } from "../types";

export async function listChapters(): Promise<ChapterSummary[]> {
  const { data } = await apiClient.get<{ chapters: ChapterSummary[] }>("/chapters");
  return data.chapters;
}

export async function redeemInviteCode(code: string): Promise<User> {
  const { data } = await apiClient.post<{ user: User }>("/chapters/join/redeem", { code });
  return data.user;
}

export async function requestToJoinChapter(
  chapterId: string,
  message?: string,
  // The status picked at sign-up, forwarded through when this is a
  // fallback from a roster-claim that didn't go through — see
  // JoinChapterPage.tsx. Omitted for a genuinely cold "browse and request".
  status?: "ACTIVE" | "ALUMNI" | "PNM"
): Promise<ChapterJoinRequest> {
  const { data } = await apiClient.post<{ joinRequest: ChapterJoinRequest }>(
    `/chapters/${chapterId}/join-requests`,
    { message, status }
  );
  return data.joinRequest;
}

export async function getMyPendingJoinRequest(): Promise<ChapterJoinRequest | null> {
  const { data } = await apiClient.get<{ joinRequest: ChapterJoinRequest | null }>("/chapters/me/pending");
  return data.joinRequest;
}

// ── Admin (Exec+, chapters.manageInvites) ─────────────────────────────────

/**
 * Everything an admin can configure on an invite code. `code` is optional on
 * create — omit it and the server issues a random, unambiguous one.
 */
export interface InviteConfig {
  code?: string;
  label?: string | null;
  role?: UserRole;
  status?: MemberStatus;
  maxUses?: number | null;
  expiresAt?: string | null;
  active?: boolean;
}

export async function createInvite(chapterId: string, payload: InviteConfig): Promise<ChapterInvite> {
  const { data } = await apiClient.post<{ invite: ChapterInvite }>(`/chapters/${chapterId}/invites`, payload);
  return data.invite;
}

export async function getInvites(chapterId: string): Promise<ChapterInvite[]> {
  const { data } = await apiClient.get<{ invites: ChapterInvite[] }>(`/chapters/${chapterId}/invites`);
  return data.invites;
}

export async function updateInvite(
  chapterId: string,
  inviteId: string,
  payload: InviteConfig
): Promise<ChapterInvite> {
  const { data } = await apiClient.patch<{ invite: ChapterInvite }>(
    `/chapters/${chapterId}/invites/${inviteId}`,
    payload
  );
  return data.invite;
}

/**
 * Archive an invite. Keeps the existing DELETE route (the backend column is
 * `revokedAt`) — nothing is actually deleted, so archived codes stay visible
 * in the manager's history section.
 */
export async function archiveInvite(chapterId: string, inviteId: string): Promise<ChapterInvite> {
  const { data } = await apiClient.delete<{ invite: ChapterInvite }>(
    `/chapters/${chapterId}/invites/${inviteId}`
  );
  return data.invite;
}

/** Older name for archiveInvite, kept so existing callers don't break. */
export const revokeInvite = archiveInvite;

export async function restoreInvite(chapterId: string, inviteId: string): Promise<ChapterInvite> {
  const { data } = await apiClient.post<{ invite: ChapterInvite }>(
    `/chapters/${chapterId}/invites/${inviteId}/restore`,
    {}
  );
  return data.invite;
}

/**
 * Issue a new code string, preserving the invite's configuration and use
 * count. The previous string stops working immediately — callers must warn
 * before invoking this (see ChapterInviteManagerScreen).
 *
 * Not yet implemented by the real backend; Demo Mode answers it fully. See
 * src/api/branding.ts for the same note about routes pending on the server.
 */
export async function regenerateInvite(chapterId: string, inviteId: string): Promise<ChapterInvite> {
  const { data } = await apiClient.post<{ invite: ChapterInvite }>(
    `/chapters/${chapterId}/invites/${inviteId}/regenerate`,
    {}
  );
  return data.invite;
}

export async function getJoinRequests(
  chapterId: string,
  status: "PENDING" | "APPROVED" | "DENIED" = "PENDING"
): Promise<ChapterJoinRequest[]> {
  const { data } = await apiClient.get<{ joinRequests: ChapterJoinRequest[] }>(
    `/chapters/${chapterId}/join-requests`,
    { params: { status } }
  );
  return data.joinRequests;
}

export async function reviewJoinRequest(joinRequestId: string, approve: boolean): Promise<ChapterJoinRequest> {
  const { data } = await apiClient.patch<{ joinRequest: ChapterJoinRequest }>(
    `/chapters/join-requests/${joinRequestId}`,
    { approve }
  );
  return data.joinRequest;
}
