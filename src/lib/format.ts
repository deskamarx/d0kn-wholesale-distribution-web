export type FormatLanguage = "en" | "bn" | "zh";

const LOCALE_BY_LANGUAGE: Record<FormatLanguage, string> = {
  en: "en-US",
  bn: "bn-BD",
  zh: "zh-CN",
};

let currentLocale = LOCALE_BY_LANGUAGE.en;

export function setFormatLanguage(language: FormatLanguage): void {
  currentLocale = LOCALE_BY_LANGUAGE[language] ?? LOCALE_BY_LANGUAGE.en;
}

export function getLocale(): string {
  return currentLocale;
}

export function money(value: number, currency = "USD"): string {
  return new Intl.NumberFormat(currentLocale, {
    style: "currency",
    currency,
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value || 0);
}

export function compactMoney(value: number, currency = "USD"): string {
  return new Intl.NumberFormat(currentLocale, {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value || 0);
}

export function number(value: number): string {
  return new Intl.NumberFormat(currentLocale, { maximumFractionDigits: 0 }).format(value || 0);
}

export function percent(value: number): string {
  return `${Math.round(value || 0)}%`;
}

export function shortDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(currentLocale, { month: "short", day: "numeric" });
}

export function fullDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(currentLocale, { month: "short", day: "numeric", year: "numeric" });
}

export function daysUntil(value?: string): number | null {
  if (!value) return null;
  const target = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function timeOf(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString(currentLocale, { hour: "numeric", minute: "2-digit" });
}

export function titleCase(value: string): string {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
