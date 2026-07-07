// src/api/attendance.ts
// Attendance, manual overrides, leaderboard re-exported from users.ts
// is intentional — points are computed server-side; this module handles
// the attendance-specific operations.

import { apiClient } from "./client";
import type { RosterEntry, AttendanceRecord } from "../types";

export async function getEventRoster(eventId: string): Promise<{
  roster: RosterEntry[];
  checkedInCount: number;
  event: { id: string; title: string; pointValue: number };
}> {
  const { data } = await apiClient.get(`/events/${eventId}/attendance`);
  return data;
}

export async function manualMarkAttendance(
  eventId: string,
  userId: string,
  payload: {
    action: "mark_present" | "remove";
    overrideReason: string;
    late?: boolean;
  }
): Promise<{ attendance?: AttendanceRecord; removed?: boolean }> {
  const { data } = await apiClient.post(
    `/events/${eventId}/attendance/${userId}`,
    payload
  );
  return data;
}

export async function getMyAttendanceHistory(params?: {
  semesterId?: string;
  limit?: number;
  cursor?: string;
}): Promise<{ records: AttendanceRecord[]; nextCursor: string | null }> {
  const { data } = await apiClient.get("/attendance/history", { params });
  return data;
}

export async function getMemberAttendanceHistory(
  userId: string,
  params?: { semesterId?: string; limit?: number }
): Promise<{ records: AttendanceRecord[] }> {
  const { data } = await apiClient.get(`/attendance/history/${userId}`, { params });
  return data;
}

export async function getCheckInToken(
  eventId: string
): Promise<{ token: string; expiresAt: number }> {
  const { data } = await apiClient.get(`/events/${eventId}/checkin-token`);
  return data;
}

export async function selfCheckIn(
  eventId: string,
  token: string
): Promise<{
  attendance: AttendanceRecord;
  alreadyCheckedIn?: boolean;
}> {
  const { data } = await apiClient.post(`/events/${eventId}/checkin`, { token });
  return data;
}
