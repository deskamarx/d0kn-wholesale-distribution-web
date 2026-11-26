import type { DiagnosticEntry } from "./extras";

const DIAGNOSTICS_KEY = "d0kn-distribution-diagnostics-v1";
const MAX_ENTRIES = 60;

export function readDiagnostics(): DiagnosticEntry[] {
  try {
    const raw = window.localStorage.getItem(DIAGNOSTICS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter(
          (entry): entry is DiagnosticEntry =>
            Boolean(entry) &&
            typeof entry === "object" &&
            typeof (entry as DiagnosticEntry).message === "string" &&
            typeof (entry as DiagnosticEntry).time === "string"
        )
      : [];
  } catch {
    return [];
  }
}

export function recordDiagnostic(kind: DiagnosticEntry["kind"], message: string): void {
  try {
    const entries = readDiagnostics();
    const clean = String(message).slice(0, 300).replace(/\s+/g, " ");
    const next: DiagnosticEntry[] = [
      { id: `LOG-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, time: new Date().toISOString(), kind, message: clean },
      ...entries.filter((entry) => entry.message !== clean),
    ].slice(0, MAX_ENTRIES);
    window.localStorage.setItem(DIAGNOSTICS_KEY, JSON.stringify(next));
  } catch {
    // Diagnostics are best-effort and never block the app.
  }
}

export function clearDiagnostics(): void {
  try {
    window.localStorage.removeItem(DIAGNOSTICS_KEY);
  } catch {
    // Ignore unavailable storage.
  }
}

/** Captures errors and rejections without recording user data or stack traces. */
export function installDiagnostics(): () => void {
  const onError = (event: ErrorEvent) => recordDiagnostic("error", event.message || "Unknown script error");
  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    recordDiagnostic("rejection", reason instanceof Error ? reason.message : "Unhandled promise rejection");
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
