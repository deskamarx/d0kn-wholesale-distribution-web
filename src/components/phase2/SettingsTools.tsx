import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "../../i18n";
import { useToast } from "../Feedback";
import { Field, Phase2Panel, Pill, RowLine, StatStrip, Toolbar, type Phase2Props } from "./Phase2Ui";
import { checkIntegrity, type IntegrityIssue } from "../../lib/integrity";
import { clearDiagnostics, readDiagnostics } from "../../lib/diagnostics";
import { migrateState, STORAGE_SCHEMA } from "../../lib/migration";
import { DATE_RANGE_OPTIONS, VIEW_MODE_OPTIONS, type DateRangeKey, type ViewMode } from "../../lib/preferences";
import { createExtras, type DiagnosticEntry } from "../../lib/extras";
import {
  clearPin,
  hasPlatformAuthenticator,
  isDeviceUnlockEnabled,
  isLockEnabled,
  registerPlatformCredential,
  setPin,
} from "../../lib/security";

interface BackupFileHandle {
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
}

type BackupPickerWindow = Window & {
  showSaveFilePicker?: (options?: unknown) => Promise<BackupFileHandle>;
  showOpenFilePicker?: (options?: unknown) => Promise<BackupFileHandle[]>;
};


const DATE_LABELS: Record<DateRangeKey, string> = {
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "this-month": "This month",
  "last-month": "Last month",
  quarter: "This quarter",
  all: "All time",
};

const VIEW_LABELS: Record<ViewMode, string> = {
  card: "Cards",
  table: "Table",
};

function isAbort(error: unknown): boolean {
  if (error instanceof DOMException) return error.name === "AbortError";
  return Boolean(error && typeof error === "object" && (error as { name?: string }).name === "AbortError");
}

function picker(): BackupPickerWindow | null {
  if (typeof window === "undefined") return null;
  return window as unknown as BackupPickerWindow;
}

interface SharePreview {
  kind: "text" | "json";
  preview: string;
  entries: Array<{ label: string; value: string }>;
}

function parseShare(raw: string | undefined): SharePreview | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    const entries =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? Object.entries(parsed as Record<string, unknown>).slice(0, 8).map(([label, field]) => ({
            label,
            value: typeof field === "string" ? field : JSON.stringify(field),
          }))
        : [];
    return {
      kind: "json",
      preview: JSON.stringify(parsed, null, 2),
      entries,
    };
  } catch {
    return { kind: "text", preview: value.slice(0, 2000), entries: [] };
  }
}

export default function SettingsTools({
  module,
  state,
  setState,
  setTab,
  preferences,
  setPreferences,
  shareText,
}: Phase2Props) {
  const { t } = useLanguage();
  const { notify } = useToast();
  const [issues, setIssues] = useState<IntegrityIssue[] | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticEntry[]>(() => readDiagnostics());
  const [lastRun, setLastRun] = useState("");
  const [pastedBackup, setPastedBackup] = useState("");
  const [fileBusy, setFileBusy] = useState(false);
  const [pin, setPinValue] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinBusy, setPinBusy] = useState(false);
  const [lockEnabled, setLockEnabled] = useState(() => isLockEnabled());
  const [deviceUnlock, setDeviceUnlock] = useState(() => isDeviceUnlockEnabled());
  const [deviceSupported, setDeviceSupported] = useState(false);

  useEffect(() => {
    let active = true;
    void hasPlatformAuthenticator().then((available) => {
      if (active) setDeviceSupported(available);
    });
    return () => {
      active = false;
    };
  }, []);

  const share = useMemo(() => parseShare(shareText), [shareText]);
  const savePickerAvailable = typeof picker()?.showSaveFilePicker === "function";
  const openPickerAvailable = typeof picker()?.showOpenFilePicker === "function";
  const extras = state.extras ?? createExtras();
  const changesSinceBackup = Number(extras.changeCount) || 0;
  const lastBackupAt = extras.lastBackupAt
    ? new Date(extras.lastBackupAt).toLocaleString()
    : t("Never");
  const reminderPaused = Boolean(preferences.backupReminderDismissedAt);
  const issuesWithErrors = issues?.some((issue) => issue.severity === "error") ?? false;
  const backupTypes = () => [
    { description: t("D0K@N backup"), accept: { "application/json": [".json"] } },
  ];

  const runChecks = () => {
    const found = checkIntegrity(state);
    const logs = readDiagnostics();
    setIssues(found);
    setDiagnostics(logs);
    setLastRun(new Date().toLocaleTimeString());
    notify(
      t("Checks complete: {issues} issues, {logs} diagnostics", {
        issues: found.length,
        logs: logs.length,
      }),
      { tone: found.some((issue) => issue.severity === "error") ? "danger" : "success" }
    );
  };

  const restoreFromText = (text: string): boolean => {
    try {
      const migrated = migrateState(JSON.parse(text));
      if (!migrated) throw new Error("invalid backup");
      setState(migrated);
      setIssues(null);
      notify(t("Restore complete"), { tone: "success" });
      return true;
    } catch {
      notify(t("Invalid backup file. Please paste valid app backup JSON."), { tone: "danger" });
      return false;
    }
  };

  const saveBackup = async () => {
    const json = JSON.stringify(state, null, 2);
    const filePicker = picker();
    if (fileBusy) return;
    setFileBusy(true);
    try {
      if (filePicker?.showSaveFilePicker) {
        const handle = await filePicker.showSaveFilePicker({
          suggestedName: "d0kn-distribution-backup.json",
          types: backupTypes(),
        });
        const writable = await handle.createWritable();
        await writable.write(new Blob([json], { type: "application/json" }));
        await writable.close();
        notify(t("Backup saved to your device"), { tone: "success" });
        return;
      }
      const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "d0kn-distribution-backup.json";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      notify(t("Backup downloaded"), { tone: "success" });
    } catch (error) {
      if (!isAbort(error)) notify(t("Backup could not be saved."), { tone: "danger" });
    } finally {
      setFileBusy(false);
    }
  };

  const openBackup = async () => {
    const filePicker = picker();
    if (!filePicker?.showOpenFilePicker || fileBusy) return;
    setFileBusy(true);
    try {
      const handles = await filePicker.showOpenFilePicker({ types: backupTypes() });
      const handle = handles[0];
      if (!handle) return;
      const file = await handle.getFile();
      restoreFromText(await file.text());
    } catch (error) {
      if (!isAbort(error)) notify(t("Backup could not be opened."), { tone: "danger" });
    } finally {
      setFileBusy(false);
    }
  };

  const recordBackup = () => {
    setState((previous) => ({
      ...previous,
      extras: {
        ...(previous.extras ?? createExtras()),
        lastBackupAt: new Date().toISOString(),
        changeCount: 0,
      },
    }));
    setPreferences((previous) => ({ ...previous, backupReminderDismissedAt: "" }));
    notify(t("Backup recorded on this device"), { tone: "success" });
  };

  const toggleReminder = () => {
    setPreferences((previous) => ({
      ...previous,
      backupReminderDismissedAt: reminderPaused ? "" : new Date().toISOString(),
    }));
    notify(
      reminderPaused ? t("Backup reminder enabled") : t("Backup reminder paused until next backup")
    );
  };

  const saveLocalPin = async () => {
    if (!/^\d{4,12}$/.test(pin)) {
      notify(t("Use 4 to 12 digits for your PIN."), { tone: "danger" });
      return;
    }
    if (pin !== confirmPin) {
      notify(t("PIN confirmation does not match."), { tone: "danger" });
      return;
    }
    setPinBusy(true);
    try {
      const saved = await setPin(pin);
      if (saved) {
        setLockEnabled(true);
        setPinValue("");
        setConfirmPin("");
        notify(lockEnabled ? t("Local PIN updated") : t("Local PIN lock enabled"), { tone: "success" });
      } else {
        notify(t("Local PIN could not be saved in this browser."), { tone: "danger" });
      }
    } finally {
      setPinBusy(false);
    }
  };

  const disableLocalLock = () => {
    if (!window.confirm(t("Disable the local lock? Your records will stay in this browser."))) return;
    clearPin();
    setLockEnabled(false);
    setDeviceUnlock(false);
    notify(t("Local lock disabled"), { tone: "success" });
  };

  const setupDeviceUnlock = async () => {
    const registered = await registerPlatformCredential();
    if (registered) {
      setDeviceUnlock(true);
      notify(t("Device unlock enabled"), { tone: "success" });
    } else {
      notify(t("Device unlock is not available in this browser."), { tone: "danger" });
    }
  };

  if (module !== "settings") return null;

  return (
    <>
      <Phase2Panel
        title={t("Data integrity")}
        description={t("Read-only consistency checks across local records. Nothing is changed or uploaded.")}
        action={<Pill tone="info">{t("Schema {version}", { version: STORAGE_SCHEMA })}</Pill>}
      >
        <Toolbar>
          <button className="primary" type="button" onClick={runChecks}>
            {t("Run checks")}
          </button>
          {lastRun && (
            <span className="muted-text">{t("Last run {time}", { time: lastRun })}</span>
          )}
        </Toolbar>
        {issues === null ? (
          <p className="muted-text">
            {t("Run checks to see issues found in this workspace.")}
          </p>
        ) : issues.length === 0 ? (
          <p className="muted-text">{t("No integrity issues found.")}</p>
        ) : (
          <div className="phase2-rows">
            {issues.slice(0, 30).map((issue) => (
              <RowLine
                key={issue.id}
                title={`${t(issue.module)} · ${t(issue.message)}`}
                meta={t("Record {id}", { id: issue.recordId })}
                trailing={
                  <Pill tone={issue.severity === "error" ? "danger" : "warning"}>
                    {t(issue.severity)}
                  </Pill>
                }
              />
            ))}
            {issues.length > 30 && (
              <div className="phase2-empty">
                {t("{count} more issues", { count: issues.length - 30 })}
              </div>
            )}
          </div>
        )}
      </Phase2Panel>

      <Phase2Panel
        title={t("Diagnostics log")}
        description={t("Local error summaries only — no record contents, names or network activity.")}
        action={<Pill tone="info">{diagnostics.length}</Pill>}
      >
        <Toolbar>
          <button type="button" onClick={() => setDiagnostics(readDiagnostics())}>
            {t("Refresh")}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!window.confirm(t("Clear the local diagnostics log?"))) return;
              clearDiagnostics();
              setDiagnostics([]);
              notify(t("Diagnostics cleared"), { tone: "success" });
            }}
          >
            {t("Clear log")}
          </button>
        </Toolbar>
        {diagnostics.length === 0 ? (
          <div className="phase2-empty">{t("No diagnostics recorded.")}</div>
        ) : (
          <div className="phase2-rows">
            {diagnostics.slice(0, 20).map((entry) => (
              <RowLine
                key={entry.id}
                title={entry.message}
                meta={`${t(entry.kind)} · ${new Date(entry.time).toLocaleString()}`}
                trailing={
                  <Pill tone={entry.kind === "error" ? "danger" : "info"}>{t(entry.kind)}</Pill>
                }
              />
            ))}
          </div>
        )}
      </Phase2Panel>

      <Phase2Panel
        title={t("Backup reminders")}
        description={t("Track unsaved local changes and decide when to save another backup file.")}
        action={<Pill tone={reminderPaused ? "warning" : "success"}>{reminderPaused ? t("Paused") : t("Active")}</Pill>}
      >
        <StatStrip
          items={[
            { label: t("Last backup"), value: lastBackupAt },
            { label: t("Changes since backup"), value: changesSinceBackup },
            { label: t("Reminder"), value: reminderPaused ? t("Paused") : t("Active") },
          ]}
        />
        <div className="actions">
          <button type="button" onClick={recordBackup}>{t("Record backup")}</button>
          <button type="button" onClick={toggleReminder}>
            {reminderPaused ? t("Resume reminders") : t("Pause reminders")}
          </button>
        </div>
      </Phase2Panel>

      <Phase2Panel
        title={t("Backup files")}
        description={t("Save a full local backup or restore one using your device file picker when available.")}
        action={
          <Pill tone={savePickerAvailable || openPickerAvailable ? "success" : "info"}>
            {savePickerAvailable || openPickerAvailable ? t("File picker ready") : t("Paste fallback")}
          </Pill>
        }
      >
        <Toolbar>
          <button className="primary" type="button" onClick={saveBackup} disabled={fileBusy}>
            {savePickerAvailable ? t("Save backup file") : t("Download backup file")}
          </button>
          {openPickerAvailable && (
            <button type="button" onClick={openBackup} disabled={fileBusy}>
              {t("Open backup file")}
            </button>
          )}
        </Toolbar>
        <p className="muted-text">
          {openPickerAvailable
            ? t("Files are read and written only on this device. No backup is sent anywhere.")
            : t("The system file picker is unavailable here. Paste backup JSON below instead.")}
        </p>
        <Field label={t("Backup JSON")} hint={t("Paste a full workspace backup to restore it locally.")}>
          <textarea
            className="backup-textarea"
            rows={4}
            value={pastedBackup}
            onChange={(event) => setPastedBackup(event.target.value)}
            placeholder={t('Paste JSON backup here, e.g. {"company":{...},"products":[...]}')}
          />
        </Field>
        <div className="actions">
          <button
            type="button"
            onClick={() => {
              if (restoreFromText(pastedBackup)) setPastedBackup("");
            }}
          >
            {t("Restore pasted backup")}
          </button>
        </div>
      </Phase2Panel>

      <Phase2Panel
        title={t("Workspace preferences")}
        description={t("Reporting ranges and display modes are saved in this browser only.")}
      >
        <div className="field-row">
          <Field label={t("Date range")}>
            <select
              value={preferences.dateRange}
              onChange={(event) =>
                setPreferences((previous) => ({
                  ...previous,
                  dateRange: event.target.value as DateRangeKey,
                }))
              }
              aria-label={t("Date range")}
            >
              {DATE_RANGE_OPTIONS.map((option) => (
                <option key={option} value={option}>{t(DATE_LABELS[option])}</option>
              ))}
            </select>
          </Field>
          <Field label={t("View mode")}>
            <select
              value={preferences.viewMode}
              onChange={(event) =>
                setPreferences((previous) => ({
                  ...previous,
                  viewMode: event.target.value as ViewMode,
                }))
              }
              aria-label={t("View mode")}
            >
              {VIEW_MODE_OPTIONS.map((option) => (
                <option key={option} value={option}>{t(VIEW_LABELS[option])}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="preference-block">
          <span className="preference-label">{t("Compare with previous period")}</span>
          <div className="segmented" role="group" aria-label={t("Compare with previous period")}>
            {([false, true] as const).map((value) => (
              <button
                key={String(value)}
                type="button"
                className={preferences.comparePeriod === value ? "active" : undefined}
                aria-pressed={preferences.comparePeriod === value}
                onClick={() => setPreferences((previous) => ({ ...previous, comparePeriod: value }))}
              >
                {t(value ? "On" : "Off")}
              </button>
            ))}
          </div>
        </div>

        <div className="preference-block">
          <span className="preference-label">{t("Performance mode")}</span>
          <div className="segmented" role="group" aria-label={t("Performance mode")}>
            {([false, true] as const).map((value) => (
              <button
                key={String(value)}
                type="button"
                className={preferences.performanceMode === value ? "active" : undefined}
                aria-pressed={preferences.performanceMode === value}
                onClick={() => setPreferences((previous) => ({ ...previous, performanceMode: value }))}
              >
                {t(value ? "On" : "Off")}
              </button>
            ))}
          </div>
        </div>

        <div className="phase2-toolbar">
          <button type="button" onClick={() => window.dispatchEvent(new Event("d0kn-open-guide"))}>
            {t("Module guide")}
          </button>
          <button type="button" onClick={() => window.dispatchEvent(new Event("d0kn-open-shortcuts"))}>
            {t("Keyboard shortcuts")}
          </button>
        </div>
      </Phase2Panel>

      <Phase2Panel
        title={t("Local lock")}
        description={t("Optional on-device PIN and device unlock. Nothing is uploaded or synchronized.")}
        action={
          <Pill tone={lockEnabled ? "success" : "info"}>
            {lockEnabled ? t("Lock on") : t("Lock off")}
          </Pill>
        }
      >
        <StatStrip
          items={[
            { label: t("PIN"), value: lockEnabled ? t("Enabled") : t("Not set") },
            {
              label: t("Device unlock"),
              value: deviceUnlock ? t("Enabled") : deviceSupported ? t("Available") : t("Unavailable"),
            },
          ]}
        />
        <div className="field-row">
          <Field label={t("New PIN")} hint={t("4 to 12 digits")}>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={12}
              value={pin}
              onChange={(event) => setPinValue(event.target.value.replace(/\D/g, "").slice(0, 12))}
              aria-label={t("New PIN")}
            />
          </Field>
          <Field label={t("Confirm PIN")}>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={12}
              value={confirmPin}
              onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 12))}
              aria-label={t("Confirm PIN")}
            />
          </Field>
        </div>
        <div className="actions">
          <button className="primary" type="button" onClick={saveLocalPin} disabled={pinBusy}>
            {lockEnabled ? t("Update PIN") : t("Enable PIN lock")}
          </button>
          {lockEnabled && (
            <button type="button" onClick={disableLocalLock}>{t("Disable local lock")}</button>
          )}
          {deviceSupported && lockEnabled && !deviceUnlock && (
            <button type="button" onClick={setupDeviceUnlock}>{t("Enable device unlock")}</button>
          )}
        </div>
        <p className="muted-text" style={{ marginTop: 12 }}>
          {t("Only a salted SHA-256 hash is stored in this browser. WebAuthn credentials stay with your device.")}
        </p>
      </Phase2Panel>

      {share && (
        <Phase2Panel
          title={t("Share target inbox")}
          description={t("Content opened through a share link stays in this browser.")}
          action={<Pill tone="info">{t(share.kind === "json" ? "JSON" : "Text")}</Pill>}
        >
          <p
            className="muted-text"
            style={{ whiteSpace: "pre-wrap", maxHeight: 180, overflow: "auto", marginBottom: 12 }}
          >
            {share.preview}
          </p>
          {share.entries.length > 0 && (
            <div className="phase2-rows">
              {share.entries.map((entry) => (
                <RowLine key={entry.label} title={entry.label} meta={entry.value} />
              ))}
            </div>
          )}
          <div className="actions" style={{ marginTop: 12 }}>
            <button type="button" onClick={() => setTab("products")}>{t("Open Products")}</button>
          </div>
        </Phase2Panel>
      )}

      {issuesWithErrors && (
        <p className="muted-text">
          {t("Integrity errors are shown for review only; no records were modified.")}
        </p>
      )}
    </>
  );
}
