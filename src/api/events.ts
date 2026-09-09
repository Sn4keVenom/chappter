// src/api/events.ts
//
// Events resource API layer.
//
// All types come from types/index.ts — there are no local redefinitions here.
// Previous versions defined local EventDetail and RsvpStatus; those were
// removed (TYPE-01 audit finding) because they diverged from the canonical
// types and caused inconsistent behaviour between screens that imported from
// this file versus types/index.ts.
//
// Integration points:
//   · api/client.ts   — apiClient, ApiError
//   · types/index.ts  — EventSummary, EventDetail, RsvpStatus (canonical)
//   · useEventsStore  — calls listEvents, expects EventSummary[]
//   · EventDetailScreen — calls getEvent, expects EventDetail

import { apiClient } from "./client";
import type { EventSummary, EventDetail, RsvpStatus, EventDelegate } from "../types";

// Re-export so screens that already import RsvpStatus from here continue to
// work without a migration step. They're the same type — this is just an alias.
export type { RsvpStatus, EventDetail, EventDelegate };

export async function getEvent(eventId: string): Promise<EventDetail> {
  const { data } = await apiClient.get<{ event: EventDetail }>(`/events/${eventId}`);
  return data.event;
}

export async function listEvents(params: {
  from?: string;
  to?: string;
  category?: string;
  committeeId?: string;
}): Promise<EventSummary[]> {
  const { data } = await apiClient.get<{ events: EventSummary[] }>("/events", { params });
  return data.events;
}

export async function setRsvp(eventId: string, status: RsvpStatus): Promise<void> {
  await apiClient.post(`/events/${eventId}/rsvp`, { status });
}

export interface EventCreateInput {
  title: string;
  description?: string;
  location?: string;
  category: EventDetail["category"];
  startTime: string;
  endTime: string;
  attendanceRequired: boolean;
  pointValue: number;
  committeeId?: string;
}

export async function createEvent(payload: EventCreateInput): Promise<EventDetail> {
  const { data } = await apiClient.post<{ event: EventDetail }>("/events", payload);
  return data.event;
}

export interface EventUpdateInput {
  title?: string;
  description?: string | null;
  location?: string | null;
  category?: EventDetail["category"];
  startTime?: string;
  endTime?: string;
  attendanceRequired?: boolean;
  pointValue?: number;
  committeeId?: string | null;
}

/** "No route for PATCH /api/v1/events/:id when trying to update an
 * event" — the route exists now (events.routes.ts); this is its typed
 * client wrapper, same pattern as every other function in this file. */
export async function updateEvent(eventId: string, payload: EventUpdateInput): Promise<EventDetail> {
  const { data } = await apiClient.patch<{ event: EventDetail }>(`/events/${eventId}`, payload);
  return data.event;
}

/** "Add ability for event creators (and all standard managers) to delete
 * event." Same scope as create/update — the backend blocks this once
 * attendance has actually been recorded (see events.routes.ts), so a
 * caller should be ready for that specific error rather than treating
 * every failure as generic. */
export async function deleteEvent(eventId: string): Promise<void> {
  await apiClient.delete(`/events/${eventId}`);
}

// Event-scoped attendance-code delegation (Feature 3) — lets an event
// organizer who can't personally attend hand check-in-code generation to
// another member without granting them general attendance-management access.
export async function addEventDelegate(eventId: string, userId: string): Promise<EventDelegate[]> {
  const { data } = await apiClient.post<{ delegates: EventDelegate[] }>(`/events/${eventId}/delegates`, { userId });
  return data.delegates;
}

export async function removeEventDelegate(eventId: string, userId: string): Promise<EventDelegate[]> {
  const { data } = await apiClient.delete<{ delegates: EventDelegate[] }>(`/events/${eventId}/delegates/${userId}`);
  return data.delegates;
}
