import { useCallback, useEffect, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
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
import DataLists from "./components/DataLists";
import { InstallPrompt, ModuleGuideDialog, ShortcutDialog, WhatsNewDialog } from "./components/Overlays";
import QuickAdd from "./components/QuickAdd";
import NextBestBanner from "./components/NextBestBanner";
import { DateRangeControl, OfflineBadge } from "./components/Phase2Shell";
import Phase2Tools from "./components/phase2/Phase2Tools";
import LockScreen from "./components/LockScreen";
import { useDeviceProfile, type PreviewMode } from "./hooks/useDeviceProfile";
import { LANGUAGE_NAMES, useLanguage, type Language } from "./i18n";
import { applyPreferences, CHANGELOG_ID, loadPreferences, savePreferences, type Preferences } from "./lib/preferences";
import { assertSchema, loadMigratedState } from "./lib/migration";
import { isLockEnabled } from "./lib/security";
import type { AppState } from "./types";

const STORAGE_KEY = "d0kn-distribution-v1";
const THEME_KEY = "d0kn-distribution-theme-v1";

interface InstallEventLike {
  prompt: () => void;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

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

const MODULE_GUIDES: Record<string, { description: string; points: string[] }> = {
  dashboard: {
    description: "A live snapshot of stock, receivables, shipments and the actions that need attention today.",
    points: ["Numbers come from records saved in this browser", "Use the cards to jump into the related module", "Voice summary reads the current snapshot aloud"],
  },
  intelligence: {
    description: "Cross-module signals that highlight risk, opportunity and the next sensible action.",
    points: ["Signals are recalculated from local records", "Open a signal to inspect the source module", "Low-stock and overdue signals update as you edit"],
  },
  analytics: {
    description: "Charts and breakdowns for category mix, order value, cash position and partner quality.",
    points: ["Figures use the interface language and currency", "Charts follow the active light or dark theme", "Drill into the linked modules to change the inputs"],
  },
  suppliers: {
    description: "China sourcing partners, contact channels, commercial terms and composite scorecards.",
    points: ["Reliability, quality, lead time and compliance drive the score", "Add a partner before linking products to it", "Scores below 85 are flagged for review"],
  },
  products: {
    description: "Catalogue, landed cost inputs, pricing, stock thresholds and sourcing references.",
    points: ["SKU is the product's unique local reference", "Reorder point drives low-stock signals", "Cost and price feed margin calculations"],
  },
  imports: {
    description: "Import batches, supplier invoices, duty, freight, insurance and item-level costs.",
    points: ["Exchange rate converts source currency for reporting", "Item costs feed landed-cost visibility", "Customs status is tracked separately from batch status"],
  },
  shipments: {
    description: "Containers, carriers, milestones, documents and delay-risk indicators.",
    points: ["Each shipment links to an import batch", "Documents status is tracked separately", "Delay risk can be reviewed against the source record"],
  },
  warehouse: {
    description: "Warehouse capacity and stock movements across inbound, outbound and transfers.",
    points: ["Used capacity is calculated from recorded stock", "Movements retain their own reference", "Warehouses are shared by orders and imports"],
  },
  customers: {
    description: "Wholesale accounts, contacts, credit limits and payment terms.",
    points: ["Credit limit is used by order review", "Customer type groups reporting segments", "Contact details are used on quotations and invoices"],
  },
  quotations: {
    description: "Sent and approved price proposals with validity dates and line-item pricing.",
    points: ["Convert an accepted quotation into an order", "Validity drives expiry signals", "Line totals include quantity, price and discount"],
  },
  orders: {
    description: "Customer orders, warehouse assignment, shipping status and line-level totals.",
    points: ["Stock is reserved conceptually by recorded quantities", "Order status is independent of shipping status", "Invoices can be linked back to an order"],
  },
  invoices: {
    description: "Billed amounts, due dates, partial payments and receivable status.",
    points: ["Paid amount is the sum of recorded payments", "Due date drives overdue signals", "Quick payment records a new payment instantly"],
  },
  payments: {
    description: "Receipts allocated to invoices with method, reference and status.",
    points: ["Each payment links to one invoice", "Methods are local labels, not bank integrations", "Recording a payment updates the invoice balance"],
  },
  compliance: {
    description: "Customs, licences, certificates, insurance, audits and contracts with expiry tracking.",
    points: ["Records can reference any workspace entity", "Expiry dates drive renewal signals", "Status can be changed without losing history"],
  },
  search: {
    description: "One search box across suppliers, products, imports, customers and documents.",
    points: ["Search is local and works offline", "Results link directly to their module", "Voice search can be started from the voice panel"],
  },
  settings: {
    description: "Local display preferences, language, install guidance, backup and restore.",
    points: ["All data stays in this browser", "Export a backup before clearing browser data", "Android and web storage are separate by design"],
  },
};

const SHORTCUT_MODULES = [
  "dashboard", "intelligence", "analytics", "suppliers", "products",
  "imports", "shipments", "warehouse", "customers", "quotations",
];

function launchContext(): { focusRecord?: string; shareText?: string } {
  try {
    const params = new URLSearchParams(window.location.search);
    return {
      focusRecord: params.get("record") ?? undefined,
      shareText: params.get("share") ?? params.get("title") ?? params.get("url") ?? undefined,
    };
  } catch {
    return {};
  }
}

function tabFromHash(): string {
  const id = window.location.hash.replace(/^#/, "");
  return ALL_NAV_ITEMS.some((item) => item.id === id) ? id : "dashboard";
}

function BootSkeleton() {
  return (
    <div className="boot-skeleton" aria-hidden="true">
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-grid">
        <div className="skeleton" /><div className="skeleton" /><div className="skeleton" /><div className="skeleton" />
      </div>
      <div className="skeleton skeleton-panel" />
      <div className="skeleton skeleton-panel short" />
    </div>
  );
}

export default function App() {
  const [state, setState] = useState<AppState>(loadMigratedState);
  const initialLaunch = useRef(launchContext());
  const [focusRecord, setFocusRecord] = useState<string | undefined>(initialLaunch.current.focusRecord);
  const [shareText, setShareText] = useState<string | undefined>(initialLaunch.current.shareText);
  const [locked, setLocked] = useState(() => isLockEnabled());
  const [tab, setTabState] = useState<string>(tabFromHash);
  const [moreOpen, setMoreOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const initialPreferences = useRef<Preferences | null>(null);
  if (initialPreferences.current === null) initialPreferences.current = loadPreferences();
  const [preferences, setPreferences] = useState<Preferences>(() => ({
    ...initialPreferences.current!,
    lastChangelog: CHANGELOG_ID,
  }));
  const [booting, setBooting] = useState(true);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(() => {
    const previous = initialPreferences.current?.lastChangelog;
    return previous !== CHANGELOG_ID;
  });
  const [installEvent, setInstallEvent] = useState<InstallEventLike | null>(null);
  const moreSheetRef = useRef<HTMLDivElement>(null);
  const { device, previewOverride, setPreviewOverride } = useDeviceProfile();
  const { language, setLanguage, t } = useLanguage();

  const setTab = useCallback((next: string) => {
    setTabState(next);
    setMoreOpen(false);
    setGuideOpen(false);
    setPreferences((previous) => ({
      ...previous,
      recentModules: [next, ...previous.recentModules.filter((item) => item !== next)].slice(0, 5),
    }));
    if (window.location.hash !== `#${next}`) {
      window.history.pushState(null, "", `#${next}`);
    }
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    assertSchema(state);
  }, [state]);

  useEffect(() => {
    const onFocus = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string; module?: string }>).detail;
      setFocusRecord(detail?.id ?? undefined);
    };
    window.addEventListener("d0kn-focus-record", onFocus);
    return () => window.removeEventListener("d0kn-focus-record", onFocus);
  }, []);

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    applyPreferences(preferences);
    savePreferences(preferences);
  }, [preferences]);

  useEffect(() => {
    const timer = window.setTimeout(() => setBooting(false), 320);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.title = t("App title");
  }, [t]);

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as unknown as InstallEventLike);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  useEffect(() => {
    const openFromUrl = (url: string) => {
      try {
        const parsed = new URL(url, window.location.origin);
        const fromHash = parsed.hash.replace(/^#/, "");
        const fromPath = parsed.pathname.split("/").filter(Boolean).pop() ?? "";
        const queryModule = parsed.searchParams.get("module") ?? "";
        const id = decodeURIComponent(queryModule || fromHash || fromPath);
        const record = parsed.searchParams.get("record");
        const share = parsed.searchParams.get("share") ?? parsed.searchParams.get("title") ?? parsed.searchParams.get("url");
        if (record) setFocusRecord(record);
        if (share) setShareText(share);
        if (ALL_NAV_ITEMS.some((item) => item.id === id)) setTab(id);
      } catch {
        // Ignore malformed deep-link URLs.
      }
    };
    const onAppUrl = (event: Event) => {
      const detail = (event as CustomEvent<{ url?: string } | string>).detail;
      openFromUrl(typeof detail === "string" ? detail : detail?.url ?? "");
    };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || typeof event.data !== "object" || !event.data) return;
      const url = (event.data as { url?: unknown }).url ?? (event.data as { d0knUrl?: unknown }).d0knUrl;
      if (typeof url === "string") openFromUrl(url);
    };
    let disposed = false;
    let appListener: { remove: () => void } | undefined;
    void CapacitorApp.addListener("appUrlOpen", ({ url }) => openFromUrl(url)).then((handle) => {
      if (disposed) void handle.remove();
      else appListener = handle;
    });
    window.addEventListener("d0kn-app-url-open", onAppUrl);
    window.addEventListener("message", onMessage);
    return () => {
      disposed = true;
      if (appListener) void appListener.remove();
      window.removeEventListener("d0kn-app-url-open", onAppUrl);
      window.removeEventListener("message", onMessage);
    };
  }, [setTab]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShortcutsOpen(false);
        setGuideOpen(false);
        return;
      }
      const element = event.target as HTMLElement | null;
      const typing = Boolean(
        element &&
          (element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName))
      );
      if (typing || event.ctrlKey || event.metaKey) return;
      if (event.key === "?") {
        event.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if (event.key === "/") {
        event.preventDefault();
        setTab("search");
        window.setTimeout(() => document.querySelector<HTMLElement>(".main input")?.focus(), 0);
        return;
      }
      if (event.altKey && /^[0-9]$/.test(event.key)) {
        const index = event.key === "0" ? 9 : Number(event.key) - 1;
        const target = SHORTCUT_MODULES[index];
        if (target) {
          event.preventDefault();
          setTab(target);
        }
        return;
      }
      if (event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "v") setVoiceOpen((open) => !open);
      else if (key === "t") setTheme((current) => (current === "dark" ? "light" : "dark"));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setTab]);

  useEffect(() => {
    const onHashChange = () => {
      const id = window.location.hash.replace(/^#/, "");
      if (ALL_NAV_ITEMS.some((item) => item.id === id)) setTabState(id);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    const openGuide = () => setGuideOpen(true);
    const openShortcuts = () => setShortcutsOpen(true);
    window.addEventListener("d0kn-open-guide", openGuide);
    window.addEventListener("d0kn-open-shortcuts", openShortcuts);
    return () => {
      window.removeEventListener("d0kn-open-guide", openGuide);
      window.removeEventListener("d0kn-open-shortcuts", openShortcuts);
    };
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
  const activeGroup = NAV_GROUPS.find((group) => group.items.some((item) => item.id === tab))?.label ?? "Command center";
  const isPrimaryMobileTab = PRIMARY_MOBILE_TABS.includes(tab);
  const activeGuide = MODULE_GUIDES[tab] ?? MODULE_GUIDES.dashboard;

  const handleInstall = () => {
    if (installEvent) {
      void installEvent.prompt();
      setInstallEvent(null);
    } else {
      window.alert(
        t("On a phone or tablet, use your browser menu and choose Add to Home Screen or Install app. The app shell is cached so the workspace opens without a network connection; records stay in this browser.")
      );
    }
  };

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
            preferences={preferences}
            setPreferences={setPreferences}
            theme={theme}
            setTheme={setTheme}
            onInstall={handleInstall}
            setTab={setTab}
            shareText={shareText}
          />
        );
      case "dashboard":
      default:
        return <Dashboard state={state} setTab={setTab} />;
    }
  };

  const toggleNavGroup = (label: string) => {
    setPreferences((previous) => ({
      ...previous,
      collapsedNav: previous.collapsedNav.includes(label)
        ? previous.collapsedNav.filter((item) => item !== label)
        : [...previous.collapsedNav, label],
    }));
  };

  const togglePinned = (id: string) => {
    setPreferences((previous) => ({
      ...previous,
      favoriteModules: previous.favoriteModules.includes(id)
        ? previous.favoriteModules.filter((item) => item !== id)
        : [...previous.favoriteModules, id],
    }));
  };

  const resolveNavItems = (ids: string[]) =>
    ids
      .map((id) => ALL_NAV_ITEMS.find((item) => item.id === id))
      .filter((item): item is NavItem => Boolean(item && item.id !== tab));

  const sidebarGroups: NavGroup[] = [];
  const recentItems = resolveNavItems(preferences.recentModules).slice(0, 3);
  const pinnedItems = resolveNavItems(preferences.favoriteModules);
  if (recentItems.length) sidebarGroups.push({ label: "Recent", items: recentItems });
  if (pinnedItems.length) sidebarGroups.push({ label: "Pinned", items: pinnedItems });
  sidebarGroups.push(...NAV_GROUPS);

  const renderNavButton = (item: NavItem) => (
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
  );

  const renderSidebarNav = () => (
    <nav className="sidebar-nav" aria-label={t("Primary navigation")}>
      {sidebarGroups.map((group) => {
        const collapsed = preferences.collapsedNav.includes(group.label);
        return (
          <div className={`nav-group${collapsed ? " collapsed" : ""}`} key={group.label}>
            <button
              type="button"
              className="nav-group-toggle"
              onClick={() => toggleNavGroup(group.label)}
              aria-expanded={!collapsed}
              aria-label={`${t(group.label)} — ${collapsed ? t("Expand section") : t("Collapse section")}`}
            >
              <span>{t(group.label)}</span>
              <span className="nav-group-chevron" aria-hidden="true">{collapsed ? "›" : "⌄"}</span>
            </button>
            {!collapsed && <div className="nav-list">{group.items.map(renderNavButton)}</div>}
          </div>
        );
      })}
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
          <button
            type="button"
            className={`pin-current${preferences.favoriteModules.includes(tab) ? " active" : ""}`}
            onClick={() => togglePinned(tab)}
            aria-pressed={preferences.favoriteModules.includes(tab)}
          >
            <NavIcon name="pin" size={16} />
            <span>{preferences.favoriteModules.includes(tab) ? t("Unpin this module") : t("Pin this module")}</span>
          </button>
          <div className="sidebar-version">{t("Distribution OS v2.2 · local workspace")}</div>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-title">
            <nav className="breadcrumbs" aria-label={t("Breadcrumb")}>
              <button type="button" onClick={() => setTab("dashboard")}>{t("Distribution OS")}</button>
              <span aria-hidden="true">/</span>
              <span>{t(activeGroup)}</span>
              <span aria-hidden="true">/</span>
              <span aria-current="page">{t(activeItem.label)}</span>
            </nav>
            <h1>
              <span className="title-long">{t("D0K@N Global Distribution")}</span>
              <span className="title-short">{t("D0K@N Global")}</span>
            </h1>
            <p>{t("China sourcing, import logistics, wholesale distribution, and intelligent operations control.")}</p>
          </div>

          <div className="topbar-actions">
            <QuickAdd state={state} setState={setState} setTab={setTab} />
            <OfflineBadge state={state} />
            <DateRangeControl preferences={preferences} setPreferences={setPreferences} />
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
              className="icon-button guide-button"
              type="button"
              onClick={() => setGuideOpen(true)}
              aria-label={t("About this module")}
              title={t("About this module")}
            >
              <NavIcon name="info" size={18} />
            </button>
            <button
              className="icon-button shortcuts-button"
              type="button"
              onClick={() => setShortcutsOpen(true)}
              aria-label={t("Keyboard shortcuts")}
              title={t("Keyboard shortcuts")}
            >
              <NavIcon name="keyboard" size={18} />
            </button>
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

        <main className="main" id="main-content" tabIndex={-1}>
          {booting ? <BootSkeleton /> : (
            <>
              <NextBestBanner state={state} setTab={setTab} />
              {renderTab()}
              <Phase2Tools
                module={tab}
                state={state}
                setState={setState}
                setTab={setTab}
                preferences={preferences}
                setPreferences={setPreferences}
                focusRecord={focusRecord}
                shareText={shareText}
              />
            </>
          )}
        </main>

        <footer className="app-footer">{t("D0K@N Global Distribution · intelligent wholesale operations · v2.2")}</footer>
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

      {locked && (
        <LockScreen
          onUnlock={() => setLocked(false)}
          onReset={() => {
            try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
            setState(loadMigratedState());
            setLocked(false);
          }}
        />
      )}

      <DataLists state={state} />

      <InstallPrompt
        visible={Boolean(installEvent) && !preferences.installDismissed}
        onInstall={() => {
          void installEvent?.prompt();
          setInstallEvent(null);
        }}
        onDismiss={() => setPreferences((previous) => ({ ...previous, installDismissed: true }))}
      />

      <ShortcutDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <WhatsNewDialog open={whatsNewOpen} onClose={() => setWhatsNewOpen(false)} />
      <ModuleGuideDialog
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        title={t(activeItem.label)}
        description={t(activeGuide.description)}
        points={activeGuide.points}
      />

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
