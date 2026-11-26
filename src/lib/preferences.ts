export const PREFERENCES_KEY = "d0kn-distribution-preferences-v1";
export const APP_VERSION = "2.2.0";
export const APK_VERSION = "2.1.0";
export const CHANGELOG_ID = "2.2.0-phase2";

export type Density = "compact" | "relaxed";
export type Accent = "indigo" | "violet" | "teal" | "amber" | "rose";
export type FontScale = "small" | "normal" | "large";
export type DateRangeKey = "30d" | "90d" | "this-month" | "last-month" | "quarter" | "all";
export type ViewMode = "card" | "table";

export interface Preferences {
  density: Density;
  accent: Accent;
  fontScale: FontScale;
  collapsedNav: string[];
  favoriteModules: string[];
  recentModules: string[];
  lastChangelog: string;
  installDismissed: boolean;
  dateRange: DateRangeKey;
  comparePeriod: boolean;
  performanceMode: boolean;
  viewMode: ViewMode;
  tableSorts: Record<string, string>;
  backupReminderDismissedAt: string;
}

export const DEFAULT_PREFERENCES: Preferences = {
  density: "relaxed",
  accent: "indigo",
  fontScale: "normal",
  collapsedNav: [],
  favoriteModules: [],
  recentModules: [],
  lastChangelog: "",
  installDismissed: false,
  dateRange: "90d",
  comparePeriod: false,
  performanceMode: false,
  viewMode: "card",
  tableSorts: {},
  backupReminderDismissedAt: "",
};

const ACCENTS: Accent[] = ["indigo", "violet", "teal", "amber", "rose"];
const DENSITIES: Density[] = ["compact", "relaxed"];
const SCALES: FontScale[] = ["small", "normal", "large"];
const DATE_RANGES: DateRangeKey[] = ["30d", "90d", "this-month", "last-month", "quarter", "all"];
const VIEW_MODES: ViewMode[] = ["card", "table"];

export const ACCENT_OPTIONS = ACCENTS;
export const DENSITY_OPTIONS = DENSITIES;
export const FONT_SCALE_OPTIONS = SCALES;
export const DATE_RANGE_OPTIONS = DATE_RANGES;
export const VIEW_MODE_OPTIONS = VIEW_MODES;

export const PHASE1_CHANGES = [
  "Density, accent colour and text-size controls in Settings",
  "Recent, pinned and collapsible navigation sections",
  "Breadcrumbs, module guide and keyboard shortcuts",
  "Undo on deletes, clearer empty states and validation summaries",
  "Install guidance, print layout and accessibility refinements",
];

export const PHASE2_CHANGES = [
  "Sortable, sticky, bulk-selectable tables with card/table switching",
  "Saved views and searches, quick add, and cross-module record links",
  "Date ranges with period comparison, KPI drill-down, and wider voice summaries",
  "Supplier, import, shipment, warehouse and finance workflow details",
  "Draft recovery, CSV/template entry, scanner, offline badge, and backup reminders",
  "Integrity checker, migration safety, diagnostics, tests and E2E smoke script",
];

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => typeof entry === "string")
  ) as Record<string, string>;
}

export function loadPreferences(): Preferences {
  try {
    const raw = window.localStorage.getItem(PREFERENCES_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return {
      density: DENSITIES.includes(parsed.density as Density) ? (parsed.density as Density) : DEFAULT_PREFERENCES.density,
      accent: ACCENTS.includes(parsed.accent as Accent) ? (parsed.accent as Accent) : DEFAULT_PREFERENCES.accent,
      fontScale: SCALES.includes(parsed.fontScale as FontScale) ? (parsed.fontScale as FontScale) : DEFAULT_PREFERENCES.fontScale,
      collapsedNav: stringArray(parsed.collapsedNav),
      favoriteModules: stringArray(parsed.favoriteModules),
      recentModules: stringArray(parsed.recentModules).slice(0, 5),
      lastChangelog: typeof parsed.lastChangelog === "string" ? parsed.lastChangelog : "",
      installDismissed: parsed.installDismissed === true,
      dateRange: DATE_RANGES.includes(parsed.dateRange as DateRangeKey) ? (parsed.dateRange as DateRangeKey) : DEFAULT_PREFERENCES.dateRange,
      comparePeriod: parsed.comparePeriod === true,
      performanceMode: parsed.performanceMode === true,
      viewMode: VIEW_MODES.includes(parsed.viewMode as ViewMode) ? (parsed.viewMode as ViewMode) : DEFAULT_PREFERENCES.viewMode,
      tableSorts: stringRecord(parsed.tableSorts),
      backupReminderDismissedAt: typeof parsed.backupReminderDismissedAt === "string" ? parsed.backupReminderDismissedAt : "",
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(preferences: Preferences): void {
  try {
    window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Preferences are a convenience; ignore unavailable storage.
  }
}

export function applyPreferences(preferences: Preferences): void {
  const root = document.documentElement;
  root.dataset.density = preferences.density;
  root.dataset.accent = preferences.accent;
  root.dataset.fontScale = preferences.fontScale;
  root.dataset.performance = preferences.performanceMode ? "on" : "off";
  root.dataset.view = preferences.viewMode;
}
