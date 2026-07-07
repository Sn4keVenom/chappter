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
import type { EventSummary, EventDetail, RsvpStatus } from "../types";

// Re-export so screens that already import RsvpStatus from here continue to
// work without a migration step. They're the same type — this is just an alias.
export type { RsvpStatus, EventDetail };

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
