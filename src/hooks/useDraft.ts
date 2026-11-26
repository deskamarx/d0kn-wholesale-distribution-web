import { useCallback, useEffect, useState } from "react";

const DRAFT_PREFIX = "d0kn-distribution-draft-v1:";

/** Keeps half-filled Phase 2 forms recoverable after a reload. */
export function useDraft<T extends Record<string, unknown>>(key: string, initial: T) {
  const storageKey = `${DRAFT_PREFIX}${key}`;
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return initial;
      const parsed = JSON.parse(raw) as Partial<T>;
      return { ...initial, ...parsed };
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // Drafts are a convenience; ignore unavailable storage.
    }
  }, [storageKey, value]);

  const clearDraft = useCallback(() => {
    setValue(initial);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Ignore unavailable storage.
    }
  }, [initial, storageKey]);

  return { value, setValue, clearDraft };
}
