import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { initialState } from "../seed";
import type { AppState } from "../types";
import type { DeviceDisplayInfo, PreviewMode } from "../hooks/useDeviceProfile";
import { LANGUAGE_NAMES, useLanguage } from "../i18n";
import { useToast } from "./Feedback";
import SettingsTools from "./phase2/SettingsTools";
import { assertSchema, migrateState, remapExtras } from "../lib/migration";
import {
  ACCENT_OPTIONS,
  APK_VERSION,
  APP_VERSION,
  DENSITY_OPTIONS,
  FONT_SCALE_OPTIONS,
  PHASE1_CHANGES,
  PHASE2_CHANGES,
  type Preferences,
} from "../lib/preferences";

const STORAGE_KEY = "d0kn-distribution-v1";
const PREVIEW_KEY = "d0kn-distribution-preview-v1";
const CONFLICT_MESSAGE = "Discard unsaved changes and load this scenario?";

interface Props {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  device: DeviceDisplayInfo;
  previewOverride: PreviewMode;
  setPreviewOverride: (mode: PreviewMode) => void;
  preferences: Preferences;
  setPreferences: Dispatch<SetStateAction<Preferences>>;
  theme: "light" | "dark";
  setTheme: (theme: "light" | "dark") => void;
  onInstall: () => void;
  setTab?: (tab: string) => void;
  shareText?: string;
}

const PREVIEW_OPTIONS: Array<{ value: PreviewMode; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "mobile", label: "Mobile" },
  { value: "tablet", label: "Tablet" },
  { value: "desktop", label: "Desktop" },
];

const EXPORT_SECTIONS: Array<{ id: keyof AppState; label: string }> = [
  { id: "company", label: "Company" },
  { id: "products", label: "Products" },
  { id: "suppliers", label: "Suppliers" },
  { id: "imports", label: "Imports" },
  { id: "shipments", label: "Shipments" },
  { id: "warehouses", label: "Warehouse" },
  { id: "customers", label: "Customers" },
  { id: "quotations", label: "Quotations" },
  { id: "orders", label: "Orders" },
  { id: "invoices", label: "Invoices" },
  { id: "payments", label: "Payments" },
  { id: "compliance", label: "Compliance" },
  { id: "activity", label: "Activity" },
];

type Scenario = "small" | "standard" | "stress";

function buildScenario(kind: Scenario): AppState {
  if (kind === "standard") return { ...initialState };
  if (kind === "small") {
    return {
      ...initialState,
      products: initialState.products.slice(0, 4),
      suppliers: initialState.suppliers.slice(0, 3),
      imports: initialState.imports.slice(0, 2),
      shipments: initialState.shipments.slice(0, 2),
      warehouses: initialState.warehouses.slice(0, 1),
      movements: initialState.movements.slice(0, 6),
      customers: initialState.customers.slice(0, 4),
      quotations: initialState.quotations.slice(0, 3),
      orders: initialState.orders.slice(0, 3),
      invoices: initialState.invoices.slice(0, 3),
      payments: initialState.payments.slice(0, 3),
      compliance: initialState.compliance.slice(0, 3),
      activity: initialState.activity.slice(0, 5),
    };
  }
  const repeatMapped = <T extends { id: string }>(
    items: T[],
    count: number,
    prefix: string,
    idMap: Map<string, string>,
    transform: (item: T, index: number, id: string) => T
  ): T[] => {
    if (items.length === 0) return [];
    return Array.from({ length: count }, (_, index) => {
      const source = items[index % items.length];
      const id = `${prefix}-STRESS-${index + 1}`;
      idMap.set(source.id, id);
      return transform(source, index, id);
    });
  };

  const supplierIds = new Map<string, string>();
  const productIds = new Map<string, string>();
  const importIds = new Map<string, string>();
  const shipmentIds = new Map<string, string>();
  const customerIds = new Map<string, string>();
  const orderIds = new Map<string, string>();
  const invoiceIds = new Map<string, string>();
  const quotationIds = new Map<string, string>();
  const paymentIds = new Map<string, string>();
  const complianceIds = new Map<string, string>();
  const unmapped = () => new Map<string, string>();

  const suppliers = repeatMapped(initialState.suppliers, 24, "SUP", supplierIds, (source, index, id) => ({
    ...source,
    id,
    name: `${source.name} ${index + 1}`,
  }));
  const products = repeatMapped(initialState.products, 120, "PRD", productIds, (source, index, id) => ({
    ...source,
    id,
    sku: `${source.sku}-S${index + 1}`,
    supplierId: supplierIds.get(source.supplierId) ?? source.supplierId,
  }));
  const imports = repeatMapped(initialState.imports, 30, "IMP", importIds, (source, index, id) => ({
    ...source,
    id,
    reference: `${source.reference}-S${index + 1}`,
    supplierId: supplierIds.get(source.supplierId) ?? source.supplierId,
    items: source.items.map((item) => ({
      ...item,
      productId: productIds.get(item.productId) ?? item.productId,
    })),
  }));
  const shipments = repeatMapped(initialState.shipments, 40, "SHP", shipmentIds, (source, index, id) => ({
    ...source,
    id,
    reference: `${source.reference}-S${index + 1}`,
    importId: importIds.get(source.importId) ?? source.importId,
    trackingNumber: `${source.trackingNumber}-S${index + 1}`,
  }));
  const movements = repeatMapped(initialState.movements, 180, "MOV", unmapped(), (source, index, id) => ({
    ...source,
    id,
    reference: `${source.reference}-S${index + 1}`,
    productId: productIds.get(source.productId) ?? source.productId,
  }));
  const customers = repeatMapped(initialState.customers, 80, "CUS", customerIds, (source, index, id) => ({
    ...source,
    id,
    company: `${source.company} ${index + 1}`,
    email: source.email ? `${id.toLowerCase()}@example.test` : source.email,
  }));
  const quotations = repeatMapped(initialState.quotations, 60, "QUO", quotationIds, (source, index, id) => ({
    ...source,
    id,
    number: `${source.number}-S${index + 1}`,
    customerId: customerIds.get(source.customerId) ?? source.customerId,
    items: source.items.map((item) => ({
      ...item,
      productId: productIds.get(item.productId) ?? item.productId,
    })),
  }));
  const orders = repeatMapped(initialState.orders, 140, "ORD", orderIds, (source, index, id) => ({
    ...source,
    id,
    number: `${source.number}-S${index + 1}`,
    customerId: customerIds.get(source.customerId) ?? source.customerId,
    items: source.items.map((item) => ({
      ...item,
      productId: productIds.get(item.productId) ?? item.productId,
    })),
  }));
  const invoices = repeatMapped(initialState.invoices, 120, "INV", invoiceIds, (source, index, id) => ({
    ...source,
    id,
    number: `${source.number}-S${index + 1}`,
    customerId: customerIds.get(source.customerId) ?? source.customerId,
    orderId: orderIds.get(source.orderId) ?? source.orderId,
  }));
  const payments = repeatMapped(initialState.payments, 90, "PAY", paymentIds, (source, index, id) => ({
    ...source,
    id,
    invoiceId: invoiceIds.get(source.invoiceId) ?? source.invoiceId,
    reference: `${source.reference || "PAY"}-S${index + 1}`,
  }));
  const compliance = repeatMapped(initialState.compliance, 40, "COM", complianceIds, (source, index, id) => ({
    ...source,
    id,
    reference: `${source.reference}-S${index + 1}`,
    entityId:
      productIds.get(source.entityId) ??
      supplierIds.get(source.entityId) ??
      customerIds.get(source.entityId) ??
      orderIds.get(source.entityId) ??
      invoiceIds.get(source.entityId) ??
      importIds.get(source.entityId) ??
      source.entityId,
  }));
  const activity = repeatMapped(initialState.activity, 120, "ACT", unmapped(), (source, index, id) => ({
    ...source,
    id,
    timestamp: new Date(Date.now() - index * 3_600_000).toISOString(),
  }));

  const scenario: AppState = {
    ...initialState,
    suppliers,
    products,
    imports,
    shipments,
    warehouses: initialState.warehouses,
    movements,
    customers,
    quotations,
    orders,
    invoices,
    payments,
    compliance,
    activity,
  };
  return remapExtras(scenario, {
    supplierIds,
    productIds,
    importIds,
    shipmentIds,
    customerIds,
    orderIds,
    invoiceIds,
    quotationIds,
    paymentIds,
    complianceIds,
  });
}

export default function Settings({
  state,
  setState,
  device,
  previewOverride,
  setPreviewOverride,
  preferences,
  setPreferences,
  theme,
  setTheme,
  onInstall,
  setTab,
  shareText,
}: Props) {
  const { t, language, setLanguage } = useLanguage();
  const { notify } = useToast();
  const [importText, setImportText] = useState("");
  const [exportSection, setExportSection] = useState<keyof AppState>("company");
  const [scenario, setScenario] = useState<Scenario>("standard");
  const languageCodes = Object.keys(LANGUAGE_NAMES) as Array<keyof typeof LANGUAGE_NAMES>;
  const navigate = setTab ?? ((tab: string) => {
    window.location.hash = `#${tab}`;
  });
  const receivedShare = shareText ?? new URLSearchParams(window.location.search).get("share") ?? undefined;

  const exportData = () => {
    const backup: AppState = { ...state, extras: state.extras };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "d0kn-distribution-backup.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const exportModule = () => {
    const payload = {
      version: APP_VERSION,
      exportedAt: new Date().toISOString(),
      section: exportSection,
      data: state[exportSection],
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `d0kn-${exportSection}-export.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const importData = () => {
    try {
      const migrated = migrateState(JSON.parse(importText) as unknown);
      if (!migrated) throw new Error(t("Invalid backup"));
      assertSchema(migrated);
      setState(migrated);
      setImportText("");
      notify(t("Restore complete"), { tone: "success" });
    } catch {
      notify(t("Invalid backup file. Please paste valid app backup JSON."), { tone: "danger" });
    }
  };

  const resetData = () => {
    if (window.confirm(t("Reset all local D0K@N Global Distribution data back to the sample workspace?"))) {
      setState(initialState);
    }
  };

  const loadScenario = () => {
    if (!window.confirm(t(CONFLICT_MESSAGE))) return;
    setState(buildScenario(scenario));
    notify(t("Scenario loaded"), { tone: "success" });
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
          <h3>{t("Appearance")}</h3>
          <span className="chip info">{t(theme === "dark" ? "Dark theme" : "Light theme")}</span>
        </div>
        <p className="muted-text">
          {t("Display preferences are saved in this browser and apply to every module.")}
        </p>

        <div className="preference-block">
          <span className="preference-label">{t("Theme")}</span>
          <div className="segmented" role="group" aria-label={t("Theme")}>
            {(["light", "dark"] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={theme === option ? "active" : undefined}
                aria-pressed={theme === option}
                onClick={() => setTheme(option)}
              >
                {t(option === "light" ? "Light theme" : "Dark theme")}
              </button>
            ))}
          </div>
        </div>

        <div className="preference-block">
          <span className="preference-label">{t("Density")}</span>
          <div className="segmented" role="group" aria-label={t("Density")}>
            {DENSITY_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                className={preferences.density === option ? "active" : undefined}
                aria-pressed={preferences.density === option}
                onClick={() => setPreferences((previous) => ({ ...previous, density: option }))}
              >
                {t(option === "compact" ? "Compact" : "Relaxed")}
              </button>
            ))}
          </div>
        </div>

        <div className="preference-block">
          <span className="preference-label">{t("Text size")}</span>
          <div className="segmented" role="group" aria-label={t("Text size")}>
            {FONT_SCALE_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                className={preferences.fontScale === option ? "active" : undefined}
                aria-pressed={preferences.fontScale === option}
                onClick={() => setPreferences((previous) => ({ ...previous, fontScale: option }))}
              >
                {t(option === "small" ? "Small" : option === "large" ? "Large" : "Normal")}
              </button>
            ))}
          </div>
        </div>

        <div className="preference-block">
          <span className="preference-label">{t("Accent colour")}</span>
          <div className="accent-options" role="group" aria-label={t("Accent colour")}>
            {ACCENT_OPTIONS.map((accent) => (
              <button
                key={accent}
                type="button"
                className={`accent-swatch accent-${accent}${preferences.accent === accent ? " active" : ""}`}
                aria-pressed={preferences.accent === accent}
                aria-label={t(accent === "indigo" ? "Indigo" : accent === "violet" ? "Violet" : accent === "teal" ? "Teal" : accent === "amber" ? "Amber" : "Rose")}
                title={t(accent === "indigo" ? "Indigo" : accent === "violet" ? "Violet" : accent === "teal" ? "Teal" : accent === "amber" ? "Amber" : "Rose")}
                onClick={() => setPreferences((previous) => ({ ...previous, accent }))}
              />
            ))}
          </div>
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
        <div className="actions">
          <button className="primary" type="button" onClick={onInstall}>{t("Install app")}</button>
        </div>
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
          <h3>{t("Module export")}</h3>
        </div>
        <p className="muted-text">{t("Export only the data shown in this module as a JSON file.")}</p>
        <div className="field">
          <label htmlFor="module-export-select">{t("Select module")}</label>
          <select
            id="module-export-select"
            value={exportSection}
            onChange={(event) => setExportSection(event.target.value as keyof AppState)}
          >
            {EXPORT_SECTIONS.map((section) => (
              <option key={section.id} value={section.id}>{t(section.label)}</option>
            ))}
          </select>
        </div>
        <div className="actions">
          <button type="button" onClick={exportModule}>{t("Export module data")}</button>
        </div>
      </div>

      <div className="card">
        <div className="section-title">
          <h3>{t("Restore")}</h3>
        </div>
        <div className="field">
          <label htmlFor="backup-json">{t("Backup JSON")}</label>
          <textarea
            id="backup-json"
            aria-label={t("Backup JSON")}
            className="backup-textarea"
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            placeholder={t('Paste JSON backup here, e.g. {"company":{...},"products":[...],"orders":[...]}')}
          />
        </div>
        <div className="actions">
          <button className="primary" type="button" onClick={importData}>{t("Restore backup")}</button>
        </div>
      </div>

      <div className="card">
        <div className="section-title">
          <h3>{t("Test scenarios")}</h3>
          <span className="chip neutral">{t("Local only")}</span>
        </div>
        <p className="muted-text">
          {t("Load a sample dataset for testing. This replaces the current workspace.")}
        </p>
        <div className="field">
          <label htmlFor="scenario-select">{t("Scenario")}</label>
          <select
            id="scenario-select"
            value={scenario}
            onChange={(event) => setScenario(event.target.value as Scenario)}
          >
            <option value="small">{t("Small dataset")}</option>
            <option value="standard">{t("Standard dataset")}</option>
            <option value="stress">{t("Stress dataset")}</option>
          </select>
        </div>
        <div className="actions">
          <button type="button" onClick={loadScenario}>{t("Load scenario")}</button>
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
          <span>{t("Web version")}</span>
          <strong>{APP_VERSION}</strong>
          <span>{t("Android package version")}</span>
          <strong>{APK_VERSION}</strong>
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

      <SettingsTools
        module="settings"
        state={state}
        setState={setState}
        setTab={navigate}
        preferences={preferences}
        setPreferences={setPreferences}
        shareText={receivedShare}
      />

      <div className="card">
        <div className="section-title">
          <h3>{t("Changelog")}</h3>
          <span className="chip neutral">{APP_VERSION}</span>
        </div>
        <ul className="changelog-list">
          {PHASE1_CHANGES.map((change) => <li key={change}>{t(change)}</li>)}
        </ul>
        <h4>{t("Phase 2")}</h4>
        <ul className="changelog-list">
          {PHASE2_CHANGES.map((change) => <li key={change}>{t(change)}</li>)}
        </ul>
      </div>
    </>
  );
}
