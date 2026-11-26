import { useCallback, useEffect, useRef } from "react";
import type { Language } from "../i18n";
import { hasSpeechSynthesis, speakAloud, VOICE_LOCALES } from "./voice";

/** Tracks whether an open form differs from the snapshot taken when it opened. */
export function useDirtyForm<T>(value: T, resetKey: string | number | boolean) {
  const baseline = useRef(JSON.stringify(value));
  useEffect(() => {
    baseline.current = JSON.stringify(value);
    // The snapshot must refresh only when a different record is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const dirty = JSON.stringify(value) !== baseline.current;

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const confirmDiscard = useCallback(
    (message: string) => !dirty || window.confirm(message),
    [dirty]
  );

  return { dirty, confirmDiscard };
}

export function duplicateExists<T extends { id: string }>(
  items: T[],
  field: keyof T,
  value: string,
  ignoreId?: string
): boolean {
  const needle = value.trim().toLocaleLowerCase();
  if (!needle) return false;
  return items.some(
    (item) => item.id !== ignoreId && String(item[field] ?? "").trim().toLocaleLowerCase() === needle
  );
}

export async function readErrorsAloud(errors: string[], language: Language): Promise<void> {
  if (errors.length === 0 || !hasSpeechSynthesis()) return;
  try {
    await speakAloud(errors.join(". "), VOICE_LOCALES[language]);
  } catch {
    // Speech feedback is optional; validation stays visible on screen.
  }
}
