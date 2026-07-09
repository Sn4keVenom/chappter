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

export async function requestToJoinChapter(chapterId: string, message?: string): Promise<ChapterJoinRequest> {
  const { data } = await apiClient.post<{ joinRequest: ChapterJoinRequest }>(
    `/chapters/${chapterId}/join-requests`,
    { message }
  );
  return data.joinRequest;
}

export async function getMyPendingJoinRequest(): Promise<ChapterJoinRequest | null> {
  const { data } = await apiClient.get<{ joinRequest: ChapterJoinRequest | null }>("/chapters/me/pending");
  return data.joinRequest;
}

// ── Admin (Exec+, chapters.manageInvites) ─────────────────────────────────

export async function createInvite(
  chapterId: string,
  payload: { role?: UserRole; status?: MemberStatus; maxUses?: number | null; expiresAt?: string | null }
): Promise<ChapterInvite> {
  const { data } = await apiClient.post<{ invite: ChapterInvite }>(`/chapters/${chapterId}/invites`, payload);
  return data.invite;
}

export async function getInvites(chapterId: string): Promise<ChapterInvite[]> {
  const { data } = await apiClient.get<{ invites: ChapterInvite[] }>(`/chapters/${chapterId}/invites`);
  return data.invites;
}

export async function revokeInvite(chapterId: string, inviteId: string): Promise<ChapterInvite> {
  const { data } = await apiClient.delete<{ invite: ChapterInvite }>(`/chapters/${chapterId}/invites/${inviteId}`);
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
