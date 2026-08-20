// src/hooks/useFocusRefresh.ts
//
// Replaces the `useFocusEffect(useCallback(() => { load(); }, [load]))`
// pattern that every data-backed screen was using.
//
// ── The bug that pattern caused ───────────────────────────────────────────
// Those screens all follow the same shape:
//
//     const [loading, setLoading] = useState(true);
//     async function load() { setLoading(true); ...; setLoading(false); }
//     if (loading) return <ActivityIndicator />;      // full-screen spinner
//
// Combined with a plain focus effect, EVERY return to the screen — including
// simply tapping Back out of a submenu — flipped `loading` back to true and
// replaced the entire rendered screen with a centered spinner for the length
// of a round trip. Visually that reads as the page reloading and jumping,
// and it also discards local UI state (expanded sections, scroll position
// inside conditionally-rendered blocks) and fires a redundant request for
// data that hasn't changed.
//
// ── What this does instead ────────────────────────────────────────────────
//   · First focus  → load({ silent: false }): show the full-screen spinner,
//                    there's genuinely nothing to display yet.
//   · Later focus  → load({ silent: true }):  keep the current content on
//                    screen and refresh underneath it, so a real change
//                    (points adjusted on a pushed screen, a saved edit) still
//                    appears, with no flicker.
//   · Later focus within `staleAfterMs` → skip the request entirely.
//
// The `silent` flag is what each screen keys its `setLoading(true)` off.

import { useCallback, useRef } from "react";
import { useFocusEffect } from "@react-navigation/native";

export interface FocusRefreshOptions {
  /**
   * Skip the refetch entirely if the last load finished less than this many
   * milliseconds ago. 0 (the default) always revalidates, silently.
   *
   * Use a non-zero value on screens whose data can't have changed while the
   * user was on a pushed child screen — Settings being the obvious one.
   */
  staleAfterMs?: number;
  /** Set false to load on mount only and never refresh on refocus. */
  enabled?: boolean;
}

export type FocusLoad = (context: { silent: boolean }) => void | Promise<unknown>;

export function useFocusRefresh(load: FocusLoad, options: FocusRefreshOptions = {}): void {
  const { staleAfterMs = 0, enabled = true } = options;

  const hasLoadedRef = useRef(false);
  const lastLoadedAtRef = useRef(0);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;

      const isFirst = !hasLoadedRef.current;
      if (!isFirst && staleAfterMs > 0 && Date.now() - lastLoadedAtRef.current < staleAfterMs) {
        return; // fresh enough — nothing to do, nothing to repaint
      }

      hasLoadedRef.current = true;
      // Stamp before awaiting so two rapid focus events (e.g. a fast
      // back-swipe cancelled and retried) can't both fire a request.
      lastLoadedAtRef.current = Date.now();

      Promise.resolve(load({ silent: !isFirst })).finally(() => {
        lastLoadedAtRef.current = Date.now();
      });
    }, [load, staleAfterMs, enabled])
  );
}
