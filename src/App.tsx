import { useCallback, useEffect, useRef, useState } from "react";
import Dashboard from "./components/Dashboard";
import Intelligence from "./components/Intelligence";
import Analytics from "./components/Analytics";
import Products from "./components/Products";
import Suppliers from "./components/Suppliers";
import Imports from "./components/Imports";
import Shipments from "./components/Shipments";
import Warehouse from "./components/Warehouse";
import Customers from "./components/Customers";
import Quotations from "./components/Quotations";
import Orders from "./components/Orders";
import Invoices from "./components/Invoices";
import Payments from "./components/Payments";
import Compliance from "./components/Compliance";
import Search from "./components/Search";
import Settings from "./components/Settings";
import NavIcon, { type NavIconName } from "./components/NavIcon";
import VoiceAssistant from "./components/VoiceAssistant";
import { useDeviceProfile, type PreviewMode } from "./hooks/useDeviceProfile";
import { LANGUAGE_NAMES, useLanguage, type Language } from "./i18n";
import { initialState } from "./seed";
import type { AppState } from "./types";

const STORAGE_KEY = "d0kn-distribution-v1";
const THEME_KEY = "d0kn-distribution-theme-v1";

type Theme = "light" | "dark";

function loadTheme(): Theme {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    if (value === "light" || value === "dark") return value;
    if (document.documentElement.dataset.theme === "dark") return "dark";
    if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) return "dark";
  } catch {
    // Ignore unavailable storage or media queries.
  }
  return "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute(
    "content",
    theme === "dark" ? "#080d1c" : "#14245c"
  );
}

interface NavItem {
  id: string;
  label: string;
  short: string;
  icon: NavIconName;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Command center",
    items: [
      { id: "dashboard", label: "Dashboard", short: "DB", icon: "dashboard" },
      { id: "intelligence", label: "Intelligence", short: "AI", icon: "intelligence" },
      { id: "analytics", label: "Analytics", short: "AN", icon: "analytics" },
    ],
  },
  {
    label: "China supply",
    items: [
      { id: "suppliers", label: "Suppliers", short: "SU", icon: "suppliers" },
      { id: "products", label: "Products", short: "PR", icon: "products" },
      { id: "imports", label: "Imports", short: "IM", icon: "imports" },
      { id: "shipments", label: "Shipments", short: "SH", icon: "shipments" },
    ],
  },
  {
    label: "Distribution",
    items: [
      { id: "warehouse", label: "Warehouse", short: "WH", icon: "warehouse" },
      { id: "customers", label: "Customers", short: "CU", icon: "customers" },
      { id: "quotations", label: "Quotations", short: "QU", icon: "quotations" },
      { id: "orders", label: "Orders", short: "OR", icon: "orders" },
    ],
  },
  {
    label: "Finance & control",
    items: [
      { id: "invoices", label: "Invoices", short: "IN", icon: "invoices" },
      { id: "payments", label: "Payments", short: "PA", icon: "payments" },
      { id: "compliance", label: "Compliance", short: "CO", icon: "compliance" },
    ],
  },
  {
    label: "System",
    items: [
      { id: "search", label: "Search", short: "SE", icon: "search" },
      { id: "settings", label: "Settings", short: "ST", icon: "settings" },
    ],
  },
];

const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);
const PRIMARY_MOBILE_TABS = ["dashboard", "products", "orders", "search"];

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed && parsed.company && Array.isArray(parsed.products) && Array.isArray(parsed.orders)) {
        return { ...initialState, ...parsed };
      }
    }
  } catch {
    // Ignore malformed local state and start fresh.
  }
  return initialState;
}

function tabFromHash(): string {
  const id = window.location.hash.replace(/^#/, "");
  return ALL_NAV_ITEMS.some((item) => item.id === id) ? id : "dashboard";
}

export default function App() {
  const [state, setState] = useState<AppState>(loadState);
  const [tab, setTabState] = useState<string>(tabFromHash);
  const [moreOpen, setMoreOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const moreSheetRef = useRef<HTMLDivElement>(null);
  const { device, previewOverride, setPreviewOverride } = useDeviceProfile();
  const { language, setLanguage, t } = useLanguage();

  const setTab = useCallback((next: string) => {
    setTabState(next);
    setMoreOpen(false);
    if (window.location.hash !== `#${next}`) {
      window.history.pushState(null, "", `#${next}`);
    }
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    document.title = t("App title");
  }, [t]);

  useEffect(() => {
    const onHashChange = () => {
      const id = window.location.hash.replace(/^#/, "");
      if (ALL_NAV_ITEMS.some((item) => item.id === id)) setTabState(id);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    moreSheetRef.current?.querySelector<HTMLElement>("button")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMoreOpen(false);
        return;
      }
      if (event.key !== "Tab" || !moreSheetRef.current) return;
      const focusables = Array.from(
        moreSheetRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => element.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [moreOpen]);

  const activeItem = ALL_NAV_ITEMS.find((item) => item.id === tab) ?? ALL_NAV_ITEMS[0];
  const isPrimaryMobileTab = PRIMARY_MOBILE_TABS.includes(tab);

  const renderTab = () => {
    switch (tab) {
      case "intelligence": return <Intelligence state={state} setTab={setTab} />;
      case "analytics": return <Analytics state={state} />;
      case "products": return <Products state={state} setState={setState} />;
      case "suppliers": return <Suppliers state={state} setState={setState} />;
      case "imports": return <Imports state={state} setState={setState} />;
      case "shipments": return <Shipments state={state} setState={setState} />;
      case "warehouse": return <Warehouse state={state} setState={setState} />;
      case "customers": return <Customers state={state} setState={setState} />;
      case "quotations": return <Quotations state={state} setState={setState} />;
      case "orders": return <Orders state={state} setState={setState} />;
      case "invoices": return <Invoices state={state} setState={setState} />;
      case "payments": return <Payments state={state} setState={setState} />;
      case "compliance": return <Compliance state={state} setState={setState} />;
      case "search": return <Search state={state} setTab={setTab} />;
      case "settings":
        return (
          <Settings
            state={state}
            setState={setState}
            device={device}
            previewOverride={previewOverride}
            setPreviewOverride={setPreviewOverride}
          />
        );
      case "dashboard":
      default:
        return <Dashboard state={state} setTab={setTab} />;
    }
  };

  const renderSidebarNav = () => (
    <nav className="sidebar-nav" aria-label={t("Primary navigation")}>
      {NAV_GROUPS.map((group) => (
        <div className="nav-group" key={group.label}>
          <div className="nav-group-label">{t(group.label)}</div>
          <div className="nav-list">
            {group.items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`nav-item${tab === item.id ? " active" : ""}`}
                onClick={() => setTab(item.id)}
                title={t(item.label)}
                aria-label={t(item.label)}
                aria-current={tab === item.id ? "page" : undefined}
              >
                <NavIcon name={item.icon} />
                <span className="nav-label">{t(item.label)}</span>
                <span className="nav-short">{item.short}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );

  const languageSelect = (className = "language-control") => (
    <label className={className}>
      <span>{t("Language")}</span>
      <select
        value={language}
        onChange={(event) => setLanguage(event.target.value as Language)}
        aria-label={t("Language")}
        title={t("Choose your preferred language")}
      >
        {(Object.keys(LANGUAGE_NAMES) as Language[]).map((code) => (
          <option key={code} value={code}>
            {LANGUAGE_NAMES[code]}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="app" data-device={device.effective} data-preview={previewOverride}>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          const main = document.getElementById("main-content");
          main?.focus();
          main?.scrollIntoView({ block: "start" });
        }}
      >
        {t("Skip to content")}
      </a>

      <aside className="sidebar" aria-label={t("Application sidebar")}>
        <div className="brand">
          <div className="brand-mark">D0K</div>
          <div className="brand-text">
            <strong>{t("D0K@N Global Distribution")}</strong>
            <span>{t("Wholesale · Import · Logistics")}</span>
          </div>
        </div>

        {renderSidebarNav()}

        <div className="sidebar-footer">
          <div className="device-summary">
            <div className="device-summary-icon"><NavIcon name="device" size={18} /></div>
            <div>
              <strong>{t(device.detectedLabel)} {t("detected")}</strong>
              <span>{t(device.layoutLabel)}</span>
            </div>
          </div>
          <div className="sidebar-version">{t("Distribution OS v2.1 · local workspace")}</div>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-title">
            <span className="topbar-eyebrow">{t("Distribution OS")} / {t(activeItem.label)}</span>
            <h1>
              <span className="title-long">{t("D0K@N Global Distribution")}</span>
              <span className="title-short">{t("D0K@N Global")}</span>
            </h1>
            <p>{t("China sourcing, import logistics, wholesale distribution, and intelligent operations control.")}</p>
          </div>

          <div className="topbar-actions">
            <span
              className="device-chip"
              title={`${t("Detected")}: ${t(device.detectedLabel)} · ${device.userAgentHint} · ${device.width}×${device.height}`}
            >
              <NavIcon name="device" size={15} />
              <span>{t(device.effectiveLabel)}</span>
              {previewOverride !== "auto" && <em>{t("Preview")}</em>}
            </span>

            {languageSelect()}

            <label className="preview-control">
              <span>{t("Preview")}</span>
              <select
                value={previewOverride}
                onChange={(event) => setPreviewOverride(event.target.value as PreviewMode)}
                aria-label={t("Preview layout")}
              >
                <option value="auto">{t("Auto")}</option>
                <option value="mobile">{t("Mobile")}</option>
                <option value="tablet">{t("Tablet")}</option>
                <option value="desktop">{t("Desktop")}</option>
              </select>
            </label>

            <button
              className="icon-button command-button"
              type="button"
              onClick={() => window.dispatchEvent(new Event("d0kn-voice-summary"))}
              aria-label={t("Speak summary")}
              title={t("Speak summary")}
            >
              <NavIcon name="volume" size={18} />
            </button>
            <button
              className="icon-button voice-button"
              type="button"
              onClick={() => setVoiceOpen(!voiceOpen)}
              aria-label={t("Voice control")}
              title={t("Voice control")}
              aria-expanded={voiceOpen}
            >
              <NavIcon name="mic" size={18} />
            </button>
            <button
              className="icon-button theme-button"
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label={theme === "dark" ? t("Light theme") : t("Dark theme")}
              title={t("Toggle color theme")}
            >
              <NavIcon name={theme === "dark" ? "sun" : "moon"} size={18} />
            </button>
            <button className="icon-button" type="button" onClick={() => setTab("search")} aria-label={t("Open search")}>
              <NavIcon name="search" size={18} />
            </button>
          </div>
        </header>

        <main className="main" id="main-content" tabIndex={-1}>{renderTab()}</main>

        <footer className="app-footer">{t("D0K@N Global Distribution · intelligent wholesale operations · v2.1")}</footer>
      </div>

      <nav className="mobile-bottom-nav" aria-label={t("Mobile navigation")}>
        {ALL_NAV_ITEMS.filter((item) => PRIMARY_MOBILE_TABS.includes(item.id)).map((item) => (
          <button
            key={item.id}
            type="button"
            className={`bottom-item${tab === item.id ? " active" : ""}`}
            onClick={() => setTab(item.id)}
            aria-current={tab === item.id ? "page" : undefined}
          >
            <NavIcon name={item.icon} size={21} />
            <span>{t(item.label)}</span>
          </button>
        ))}
        <button
          type="button"
          className={`bottom-item${!isPrimaryMobileTab || moreOpen ? " active" : ""}`}
          onClick={() => setMoreOpen(true)}
          aria-label={t("Open more sections")}
          aria-expanded={moreOpen}
        >
          <NavIcon name="more" size={21} />
          <span>{t("More")}</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="mobile-sheet-layer" role="dialog" aria-modal="true" aria-label={t("All sections")}>
          <button className="sheet-backdrop" type="button" aria-label={t("Close")} onClick={() => setMoreOpen(false)} />
          <div className="mobile-sheet" ref={moreSheetRef}>
            <div className="sheet-handle" />
            <div className="sheet-header">
              <div>
                <strong>{t("All sections")}</strong>
                <span>{t(device.detectedLabel)} · {t(device.layoutLabel)}</span>
              </div>
              <button className="icon-button" type="button" onClick={() => setMoreOpen(false)} aria-label={t("Close")}>×</button>
            </div>
            <div className="sheet-language">{languageSelect("sheet-language-control")}</div>
            {NAV_GROUPS.map((group) => (
              <div className="sheet-group" key={group.label}>
                <div className="nav-group-label">{t(group.label)}</div>
                <div className="sheet-grid">
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`sheet-item${tab === item.id ? " active" : ""}`}
                      onClick={() => setTab(item.id)}
                    >
                      <NavIcon name={item.icon} size={18} />
                      <span>{t(item.label)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <VoiceAssistant
        state={state}
        tab={tab}
        setTab={setTab}
        open={voiceOpen}
        setOpen={setVoiceOpen}
      />
    </div>
  );
}
