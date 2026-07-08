// src/api/teams.ts
//
// Gamification teams (Feature 2) — groups of members for competition
// leaderboards. Distinct from committees: no leaders, one team per member.
// Same thin apiClient-wrapper pattern as every other api/*.ts file.

import { apiClient } from "./client";
import type { Team, TeamLeaderboardEntry } from "../types";

export async function listTeams(): Promise<Team[]> {
  const { data } = await apiClient.get<{ teams: Team[] }>("/teams");
  return data.teams;
}

export async function getTeam(id: string): Promise<Team> {
  const { data } = await apiClient.get<{ team: Team }>(`/teams/${id}`);
  return data.team;
}

export async function getTeamLeaderboard(): Promise<{
  leaderboard: TeamLeaderboardEntry[];
  semesterLabel: string | null;
}> {
  const { data } = await apiClient.get("/teams/leaderboard");
  return data;
}

export async function addTeamMember(teamId: string, userId: string): Promise<Team> {
  const { data } = await apiClient.post<{ team: Team }>(`/teams/${teamId}/members`, { userId });
  return data.team;
}

export async function removeTeamMember(teamId: string, userId: string): Promise<Team> {
  const { data } = await apiClient.delete<{ team: Team }>(`/teams/${teamId}/members/${userId}`);
  return data.team;
}
