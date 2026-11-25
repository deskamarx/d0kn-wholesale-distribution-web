import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { initialState } from "../seed";
import type { AppState } from "../types";
import type { DeviceDisplayInfo, PreviewMode } from "../hooks/useDeviceProfile";
import { LANGUAGE_NAMES, useLanguage } from "../i18n";

const STORAGE_KEY = "d0kn-distribution-v1";
const PREVIEW_KEY = "d0kn-distribution-preview-v1";

interface Props {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  device: DeviceDisplayInfo;
  previewOverride: PreviewMode;
  setPreviewOverride: (mode: PreviewMode) => void;
}

const PREVIEW_OPTIONS: Array<{ value: PreviewMode; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "mobile", label: "Mobile" },
  { value: "tablet", label: "Tablet" },
  { value: "desktop", label: "Desktop" },
];

export default function Settings({ state, setState, device, previewOverride, setPreviewOverride }: Props) {
  const { t, language, setLanguage } = useLanguage();
  const [importText, setImportText] = useState("");
  const languageCodes = Object.keys(LANGUAGE_NAMES) as Array<keyof typeof LANGUAGE_NAMES>;

  const exportData = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "d0kn-distribution-backup.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const importData = () => {
    try {
      const parsed = JSON.parse(importText) as AppState;
      if (
        !parsed ||
        !parsed.company ||
        !Array.isArray(parsed.products) ||
        !Array.isArray(parsed.orders) ||
        !Array.isArray(parsed.suppliers)
      ) {
        throw new Error(t("Invalid backup"));
      }
      setState({ ...initialState, ...parsed });
      setImportText("");
    } catch {
      alert(t("Invalid backup file. Please paste valid app backup JSON."));
    }
  };

  const resetData = () => {
    if (window.confirm(t("Reset all local D0K@N Global Distribution data back to the sample workspace?"))) {
      setState(initialState);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h2>{t("Settings")}</h2>
          <p>{t("Local workspace data, adaptive display, backup, restore, and reset controls.")}</p>
        </div>
      </div>

      <div className="card">
        <div className="section-title">
          <h3>{t("Display & device")}</h3>
          <span className="chip info">{t(device.detectedLabel)} {t("detected")}</span>
        </div>
        <p className="muted-text">
          {t("The app automatically detects the device class and chooses the best navigation layout. Preview overrides affect only this browser and are saved locally.")}
        </p>

        <div className="device-detail-grid">
          <div className="device-detail">
            <span>{t("Detected layout")}</span>
            <strong>{t(device.detectedLabel)} · {t(device.detectedLayoutLabel)}</strong>
          </div>
          <div className="device-detail">
            <span>{t("Active layout")}</span>
            <strong>{t(device.effectiveLabel)} · {t(device.layoutLabel)}</strong>
          </div>
          <div className="device-detail">
            <span>{t("Viewport")}</span>
            <strong>{device.width} × {device.height} · {t(device.orientation)}</strong>
          </div>
          <div className="device-detail">
            <span>{t("Input")}</span>
            <strong>
              {device.pointer === "coarse" ? t("Touch") : t("Mouse / keyboard")}
              {device.touch ? ` · ${t("touch capable")}` : ""}
            </strong>
          </div>
          <div className="device-detail device-detail-wide">
            <span>{t("Device hint")}</span>
            <strong>{device.userAgentHint}</strong>
          </div>
        </div>

        <div className="preview-options" role="group" aria-label={t("Preview layout")}>
          {PREVIEW_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`preview-button${previewOverride === option.value ? " active" : ""}`}
              onClick={() => setPreviewOverride(option.value)}
            >
              {t(option.label)}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="section-title">
          <h3>{t("Language")}</h3>
          <span className="chip info">{LANGUAGE_NAMES[language]}</span>
        </div>
        <p className="muted-text">
          {t("Choose your preferred language")} · {t("Interface labels update immediately and are saved in this browser.")}
        </p>
        <div className="field">
          <label htmlFor="language-select">{t("Language")}</label>
          <select
            id="language-select"
            value={language}
            onChange={(event) => setLanguage(event.target.value as keyof typeof LANGUAGE_NAMES)}
          >
            {languageCodes.map((code) => (
              <option key={code} value={code}>{LANGUAGE_NAMES[code]}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="card">
        <div className="section-title">
          <h3>{t("Install & offline")}</h3>
          <span className="chip success">{t("PWA ready")}</span>
        </div>
        <p className="muted-text">
          {t("On a phone or tablet, use your browser menu and choose Add to Home Screen or Install app. The app shell is cached so the workspace opens without a network connection; records stay in this browser.")}
        </p>
      </div>

      <div className="card">
        <div className="section-title">
          <h3>{t("Backup")}</h3>
        </div>
        <p className="muted-text">
          {t("Export the current local workspace as JSON, or restore from pasted backup JSON.")}
        </p>
        <div className="actions">
          <button className="primary" type="button" onClick={exportData}>{t("Export backup")}</button>
        </div>
      </div>

      <div className="card">
        <div className="section-title">
          <h3>{t("Restore")}</h3>
        </div>
        <div className="field">
          <label>{t("Backup JSON")}</label>
          <textarea
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            style={{ minHeight: 140 }}
            placeholder={t('Paste JSON backup here, e.g. {"company":{...},"products":[...],"orders":[...]}')}
          />
        </div>
        <div className="actions">
          <button className="primary" type="button" onClick={importData}>{t("Restore backup")}</button>
        </div>
      </div>

      <div className="card">
        <div className="section-title">
          <h3>{t("Danger zone")}</h3>
        </div>
        <div className="actions">
          <button className="small" type="button" onClick={resetData}>{t("Reset sample data")}</button>
        </div>
      </div>

      <div className="card">
        <div className="section-title">
          <h3>{t("Workspace")}</h3>
        </div>
        <div className="meta-list">
          <span>{t("Version")}</span>
          <strong>2.0.0</strong>
          <span>{t("Storage key")}</span>
          <strong>{STORAGE_KEY}</strong>
          <span>{t("Preview key")}</span>
          <strong>{PREVIEW_KEY}</strong>
          <span>{t("Company")}</span>
          <strong>{state.company.name}</strong>
          <span>{t("Trading name")}</span>
          <strong>{state.company.tradingName}</strong>
          <span>{t("Base country")}</span>
          <strong>{state.company.baseCountry}</strong>
          <span>{t("Source country")}</span>
          <strong>{state.company.sourceCountry}</strong>
          <span>{t("Currency")}</span>
          <strong>{state.company.defaultCurrency}</strong>
          <span>{t("Fiscal year start")}</span>
          <strong>{state.company.fiscalYearStart}</strong>
        </div>
      </div>
    </>
  );
}
