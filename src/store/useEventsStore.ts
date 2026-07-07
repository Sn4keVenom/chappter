// src/store/useEventsStore.ts
//
// Integration points:
//   · useAuthStore.ts — same Zustand pattern (create with typed state)
//   · mobile/api/events.ts — listEvents(), RsvpStatus
//   · types/index.ts — EventSummary
//   · EventsFeedScreen.tsx calls fetchEvents on focus
//   · EventDetailScreen.tsx calls updateRsvpLocally for optimistic RSVP

import { create } from "zustand";
import { listEvents } from "../api/events";
import type { EventSummary, RsvpStatus } from "../types";

interface EventsState {
  events: EventSummary[];
  loading: boolean;
  error: string | null;
  // Fetch + replace store contents (pull-to-refresh pattern)
  fetchEvents: (params?: {
    from?: string;
    to?: string;
    category?: string;
    committeeId?: string;
  }) => Promise<void>;
  // Optimistic RSVP update — reverted by EventDetailScreen on API failure
  updateRsvpLocally: (eventId: string, status: RsvpStatus | null) => void;
}

export const useEventsStore = create<EventsState>((set) => ({
  events: [],
  loading: false,
  error: null,

  fetchEvents: async (params) => {
    set({ loading: true, error: null });
    try {
      const events = await listEvents(params ?? {});
      set({ events, loading: false });
    } catch (err: any) {
      set({ loading: false, error: err?.message ?? "Failed to load events" });
    }
  },

  updateRsvpLocally: (eventId, status) => {
    set((state) => ({
      events: state.events.map((e) =>
        e.id === eventId ? { ...e, myRsvpStatus: status } : e
      ),
    }));
  },
}));
