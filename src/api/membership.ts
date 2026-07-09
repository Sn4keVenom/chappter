// src/api/membership.ts
// Big/Little assignment, role numbers, family lookup (spec §6/§7/§11). Same
// thin apiClient-wrapper pattern as every other api/*.ts file.

import { apiClient } from "./client";
import type { FamilyMemberSummary } from "../types";

export async function getFamily(userId: string): Promise<{ big: FamilyMemberSummary | null; littles: FamilyMemberSummary[] }> {
  const { data } = await apiClient.get<{ big: FamilyMemberSummary | null; littles: FamilyMemberSummary[] }>(
    `/users/${userId}/family`
  );
  return data;
}

export async function setBig(userId: string, bigUserId: string | null): Promise<void> {
  await apiClient.patch(`/users/${userId}/big`, { bigUserId });
}

export async function setRoleNumber(userId: string, roleNumber: number | null): Promise<void> {
  await apiClient.patch(`/users/${userId}/role-number`, { roleNumber });
}
