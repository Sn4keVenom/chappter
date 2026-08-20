// src/hooks/useAsync.ts
//
// The one data-loading primitive every page uses. Replaces the mobile app's
// useFocusRefresh, which existed to work around React Navigation keeping
// screens mounted after they were navigated away from. On the web a route
// change unmounts the page, so a plain effect is both correct and simpler —
// there is no "refocus" to special-case.
//
// Deliberately not a data-fetching library. The app already has a clean API
// abstraction (src/api/*.ts) and the pages have modest needs: load, show a
// spinner, show an error with a retry, refresh after a mutation. Adding React
// Query for that would be a dependency and a second caching model competing
// with the zustand stores that already exist.

import { useCallback, useEffect, useRef, useState } from "react";

export interface AsyncState<T> {
  data: T | undefined;
  /** True only while there is nothing to show yet — drives the full-page spinner. */
  loading: boolean;
  /** True while a background refresh is in flight over existing content. */
  refreshing: boolean;
  error: string | null;
  /** Re-run the loader. `silent` keeps the current content on screen. */
  reload: (options?: { silent?: boolean }) => Promise<void>;
  /** Patch the local copy after a mutation, without a round trip. */
  setData: React.Dispatch<React.SetStateAction<T | undefined>>;
}

export function useAsync<T>(
  loader: () => Promise<T>,
  deps: React.DependencyList = []
): AsyncState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guards against a slow response from a previous set of deps (or from an
  // unmounted page) overwriting fresher data — the classic out-of-order
  // async-render bug.
  const requestRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(loader, deps);

  const reload = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      const id = ++requestRef.current;
      if (silent) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const result = await run();
        if (id !== requestRef.current || !mountedRef.current) return;
        setData(result);
      } catch (e: any) {
        if (id !== requestRef.current || !mountedRef.current) return;
        setError(e?.message ?? "Something went wrong.");
      } finally {
        if (id === requestRef.current && mountedRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [run]
  );

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, refreshing, error, reload, setData };
}
