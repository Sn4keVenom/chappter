// src/api/roster.ts
// Exec's verification roster (real member/alumni identity data, checked
// against a new signup's claimed name + role number) and the authenticated
// claim that turns a match into a join request. Same thin apiClient-wrapper
// pattern as api/chapters.ts.

import { apiClient } from "./client";
import type { ChapterJoinRequest, ChapterRosterEntry } from "../types";

export interface RosterEntryInput {
  firstName: string;
  lastName: string;
  roleNumber: number;
  status: "ACTIVE" | "INACTIVE" | "ALUMNI";
}

export async function listRosterEntries(chapterId: string): Promise<ChapterRosterEntry[]> {
  const { data } = await apiClient.get<{ rosterEntries: ChapterRosterEntry[] }>(
    `/chapters/${chapterId}/roster-entries`
  );
  return data.rosterEntries;
}

export async function createRosterEntry(
  chapterId: string,
  payload: RosterEntryInput
): Promise<ChapterRosterEntry> {
  const { data } = await apiClient.post<{ rosterEntry: ChapterRosterEntry }>(
    `/chapters/${chapterId}/roster-entries`,
    payload
  );
  return data.rosterEntry;
}

export interface BulkRosterResult {
  created: ChapterRosterEntry[];
  errors: { index: number; error: string }[];
}

export async function bulkCreateRosterEntries(
  chapterId: string,
  entries: RosterEntryInput[]
): Promise<BulkRosterResult> {
  const { data } = await apiClient.post<BulkRosterResult>(`/chapters/${chapterId}/roster-entries/bulk`, {
    entries,
  });
  return data;
}

export async function deleteRosterEntry(chapterId: string, entryId: string): Promise<void> {
  await apiClient.delete(`/chapters/${chapterId}/roster-entries/${entryId}`);
}

/**
 * The real, atomic claim — call once the user has a live session (after
 * sign-up completes). Derives the join request's roleNumber/memberStatus
 * from the matched roster row server-side; never send those as if they were
 * already-verified facts from anywhere else.
 */
export async function claimRoleNumber(payload: {
  firstName: string;
  roleNumber: number;
  status: "ACTIVE" | "ALUMNI";
  message?: string;
}): Promise<ChapterJoinRequest> {
  const { data } = await apiClient.post<{ joinRequest: ChapterJoinRequest }>(
    "/chapters/claim-role-number",
    payload
  );
  return data.joinRequest;
}
