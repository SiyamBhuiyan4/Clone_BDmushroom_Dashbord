import { useCallback, useState } from "react";

/**
 * useState that survives a reload.
 *
 * Filters are a preference, not transient UI state: if you always work in
 * "last 7 days", re-selecting it on every visit to every page is friction the
 * app is imposing for no reason.
 *
 * Reads are guarded because a value written by an older build — or by a user
 * editing localStorage — must not take the whole page down.
 */
export function usePersistedState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  });

  const set = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // A full or blocked store is not worth failing an interaction over.
      }
    },
    [key],
  );

  return [value, set] as const;
}
