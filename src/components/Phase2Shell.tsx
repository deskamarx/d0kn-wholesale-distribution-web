import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { AppState } from "../types";
import { DATE_RANGE_OPTIONS, type DateRangeKey, type Preferences } from "../lib/preferences";
import { useLanguage } from "../i18n";
import NavIcon from "./NavIcon";

export function OfflineBadge({ state }: { state: AppState }) {
  const { t } = useLanguage();
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);
  const pending = state.extras.changeCount;
  const needsBackup = pending > 10 && !state.extras.lastBackupAt;
  if (online && !needsBackup) return (
    <span className="offline-badge" title={t("All records are stored in this browser.")}>
      <NavIcon name="device" size={14} />
      <span>{t("Local")}</span>
    </span>
  );
  return (
    <span className={`offline-badge${online ? " warning" : " danger"}`} title={t("Your data stays on this device and works offline.")}>
      <NavIcon name="device" size={14} />
      <span>{online ? t("{count} unsaved backups", { count: pending }) : t("Offline")}</span>
    </span>
  );
}

export function DateRangeControl({
  preferences,
  setPreferences,
}: {
  preferences: Preferences;
  setPreferences: Dispatch<SetStateAction<Preferences>>;
}) {
  const { t } = useLanguage();
  return (
    <label className="date-range-control" title={t("Applies to dashboards and reports")}>
      <span>{t("Period")}</span>
      <select
        value={preferences.dateRange}
        onChange={(event) => setPreferences((previous) => ({ ...previous, dateRange: event.target.value as DateRangeKey }))}
        aria-label={t("Date range")}
      >
        {DATE_RANGE_OPTIONS.map((option) => <option key={option} value={option}>{t(option === "30d" ? "Last 30 days" : option === "90d" ? "Last 90 days" : option === "this-month" ? "This month" : option === "last-month" ? "Last month" : option === "quarter" ? "This quarter" : "All time")}</option>)}
      </select>
      <button
        type="button"
        className={preferences.comparePeriod ? "active" : undefined}
        aria-pressed={preferences.comparePeriod}
        onClick={() => setPreferences((previous) => ({ ...previous, comparePeriod: !previous.comparePeriod }))}
      >
        {t("Compare")}
      </button>
    </label>
  );
}
