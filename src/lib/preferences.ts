export const PREFERENCES_KEY = "d0kn-distribution-preferences-v1";
export const APP_VERSION = "2.1.1";
export const APK_VERSION = "2.1.0";
export const CHANGELOG_ID = "2.1.1-phase1";

export type Density = "compact" | "relaxed";
export type Accent = "indigo" | "violet" | "teal" | "amber" | "rose";
export type FontScale = "small" | "normal" | "large";

export interface Preferences {
  density: Density;
  accent: Accent;
  fontScale: FontScale;
  collapsedNav: string[];
  favoriteModules: string[];
  recentModules: string[];
  lastChangelog: string;
  installDismissed: boolean;
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
};

const ACCENTS: Accent[] = ["indigo", "violet", "teal", "amber", "rose"];
const DENSITIES: Density[] = ["compact", "relaxed"];
const SCALES: FontScale[] = ["small", "normal", "large"];

export const ACCENT_OPTIONS = ACCENTS;
export const DENSITY_OPTIONS = DENSITIES;
export const FONT_SCALE_OPTIONS = SCALES;

export const PHASE1_CHANGES = [
  "Density, accent colour and text-size controls in Settings",
  "Recent, pinned and collapsible navigation sections",
  "Breadcrumbs, module guide and keyboard shortcuts",
  "Undo on deletes, clearer empty states and validation summaries",
  "Install guidance, print layout and accessibility refinements",
];

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
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
}
