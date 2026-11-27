import { useCallback, useEffect, useRef, useState } from 'react';

import { readCache, writeCache } from '../storage/cache';

/**
 * Loads a remote resource with an offline-friendly cached fallback. Backend
 * rules stay authoritative: cached data is only displayed while offline or
 * while a refresh is in flight, and is never sent back as a write payload.
 */
export function useResource(
  cacheKey,
  loader,
  { ttlMs = 10 * 60 * 1000, enabled = true, deps = [] } = {},
) {
  const [state, setState] = useState({
    data: null,
    loading: true,
    refreshing: false,
    error: null,
    fromCache: false,
  });
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const key = typeof cacheKey === 'string' ? cacheKey : JSON.stringify(cacheKey);
  const depsKey = JSON.stringify(deps);

  const load = useCallback(
    async (options = {}) => {
      const { force = false } = options;
      setState((previous) => ({
        ...previous,
        loading: previous.data === null,
        refreshing: previous.data !== null || force,
        error: null,
      }));

      let cached = null;
      if (key) {
        cached = await readCache(key, { maxAgeMs: ttlMs });
        if (cached !== null) {
          setState((previous) => ({
            ...previous,
            data: previous.data ?? cached,
            fromCache: true,
            loading: false,
          }));
        }
      }

      if (!enabled) {
        setState((previous) => ({ ...previous, loading: false, refreshing: false }));
        return cached;
      }

      try {
        const data = (await loaderRef.current()) ?? null;
        setState({
          data,
          loading: false,
          refreshing: false,
          error: null,
          fromCache: false,
        });
        if (key) await writeCache(key, data, { ttlMs });
        return data;
      } catch (error) {
        setState((previous) => ({
          ...previous,
          loading: false,
          refreshing: false,
          error,
          fromCache: previous.data !== null,
        }));
        return cached;
      }
    },
    [key, ttlMs, enabled, depsKey],
  );

  useEffect(() => {
    load();
  }, [load]);

  const setData = useCallback((updater) => {
    setState((previous) => ({
      ...previous,
      data: typeof updater === 'function' ? updater(previous.data) : updater,
    }));
  }, []);

  return {
    ...state,
    refresh: useCallback(() => load({ force: true }), [load]),
    setData,
  };
}
