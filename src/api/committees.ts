// src/api/committees.ts

import { apiClient } from "./client";
import type { Committee, CommitteeMembershipSummary } from "../types";

export async function listCommittees(): Promise<Committee[]> {
  const { data } = await apiClient.get<{ committees: Committee[] }>("/committees");
  return data.committees;
}

export async function getCommittee(id: string): Promise<Committee> {
  const { data } = await apiClient.get<{ committee: Committee }>(`/committees/${id}`);
  return data.committee;
}

export async function createCommittee(payload: {
  name: string;
  description?: string;
}): Promise<Committee> {
  const { data } = await apiClient.post<{ committee: Committee }>("/committees", payload);
  return data.committee;
}

export async function updateCommittee(
  id: string,
  payload: { name?: string; description?: string }
): Promise<Committee> {
  const { data } = await apiClient.patch<{ committee: Committee }>(
    `/committees/${id}`,
    payload
  );
  return data.committee;
}

export async function addCommitteeMember(
  committeeId: string,
  payload: { userId: string; role?: "MEMBER" | "CHAIR" }
): Promise<CommitteeMembershipSummary> {
  const { data } = await apiClient.post(
    `/committees/${committeeId}/members`,
    payload
  );
  return data.membership;
}

export async function removeCommitteeMember(
  committeeId: string,
  userId: string
): Promise<void> {
  await apiClient.delete(`/committees/${committeeId}/members/${userId}`);
}
