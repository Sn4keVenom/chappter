// src/store/usePointsStore.ts
//
// Integration points:
//   · users.ts API — getLeaderboard, getPointsLedger
//   · LeaderboardScreen.tsx — fetchLeaderboard on focus
//   · ProfileScreen.tsx — uses getLeaderboard directly (not this store)
//
// Fix (STATE-04): leaderboard and ledger now have separate loading flags so
// concurrent fetches don't clobber each other's state. Previously a single
// `loading` boolean caused races when ProfileScreen and LeaderboardScreen
// were both mounted.

import { create } from "zustand";
import { getLeaderboard, getPointsLedger } from "../api/users";
import type { LeaderboardEntry, LedgerEntry } from "../types";

interface PointsState {
  // Leaderboard
  leaderboard: LeaderboardEntry[];
  leaderboardSemesterLabel: string | null;
  leaderboardLoading: boolean;
  leaderboardError: string | null;

  // Points ledger (per-user, paginated)
  ledger: LedgerEntry[];
  ledgerTotal: number;
  ledgerNextCursor: string | null;
  ledgerLoading: boolean;
  ledgerError: string | null;

  fetchLeaderboard: (params?: { semesterId?: string }) => Promise<void>;
  fetchLedger: (userId: string, semesterId?: string) => Promise<void>;
  loadMoreLedger: (userId: string, semesterId?: string) => Promise<void>;
  resetLedger: () => void;
}

export const usePointsStore = create<PointsState>((set, get) => ({
  leaderboard: [],
  leaderboardSemesterLabel: null,
  leaderboardLoading: false,
  leaderboardError: null,

  ledger: [],
  ledgerTotal: 0,
  ledgerNextCursor: null,
  ledgerLoading: false,
  ledgerError: null,

  fetchLeaderboard: async (params) => {
    set({ leaderboardLoading: true, leaderboardError: null });
    try {
      const { leaderboard, semesterLabel } = await getLeaderboard(params);
      set({
        leaderboard,
        leaderboardSemesterLabel: semesterLabel,
        leaderboardLoading: false,
      });
    } catch (err: any) {
      set({
        leaderboardLoading: false,
        leaderboardError: err?.message ?? "Failed to load leaderboard",
      });
    }
  },

  fetchLedger: async (userId, semesterId) => {
    set({ ledgerLoading: true, ledgerError: null });
    try {
      const { entries, total, nextCursor } = await getPointsLedger(userId, {
        semesterId,
        limit: 30,
      });
      set({
        ledger: entries,
        ledgerTotal: total,
        ledgerNextCursor: nextCursor,
        ledgerLoading: false,
      });
    } catch (err: any) {
      set({
        ledgerLoading: false,
        ledgerError: err?.message ?? "Failed to load ledger",
      });
    }
  },

  loadMoreLedger: async (userId, semesterId) => {
    const { ledgerNextCursor, ledger } = get();
    if (!ledgerNextCursor) return;
    try {
      const { entries, total, nextCursor } = await getPointsLedger(userId, {
        semesterId,
        cursor: ledgerNextCursor,
        limit: 30,
      });
      set({
        ledger: [...ledger, ...entries],
        ledgerTotal: total,
        ledgerNextCursor: nextCursor,
      });
    } catch {
      // Silent — user can pull to refresh
    }
  },

  resetLedger: () =>
    set({ ledger: [], ledgerTotal: 0, ledgerNextCursor: null }),
}));
