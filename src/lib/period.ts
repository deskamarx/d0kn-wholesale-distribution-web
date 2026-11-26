import type { DateRangeKey } from "./preferences";

export interface DateRange {
  key: DateRangeKey;
  start: string;
  end: string;
  previousStart: string;
  previousEnd: string;
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shift(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function resolveRange(key: DateRangeKey, now: Date = new Date()): DateRange {
  const end = iso(now);
  if (key === "all") return { key, start: "1900-01-01", end, previousStart: "1900-01-01", previousEnd: "1900-01-01" };
  if (key === "this-month" || key === "last-month") {
    const offset = key === "this-month" ? 0 : -1;
    const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const finish = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
    const previousStart = new Date(now.getFullYear(), now.getMonth() + offset - 1, 1);
    const previousEnd = new Date(now.getFullYear(), now.getMonth() + offset, 0);
    return { key, start: iso(start), end: iso(finish), previousStart: iso(previousStart), previousEnd: iso(previousEnd) };
  }
  const days = key === "30d" ? 30 : key === "quarter" ? 90 : 90;
  const start = iso(shift(now, -days + 1));
  const previousEnd = iso(shift(now, -days));
  const previousStart = iso(shift(now, -2 * days + 1));
  return { key, start, end, previousStart, previousEnd };
}

export function inRange(date: string | undefined, range: DateRange): boolean {
  if (!date) return false;
  const value = date.slice(0, 10);
  return value >= range.start && value <= range.end;
}

export function filterInRange<T>(rows: T[], getDate: (row: T) => string | undefined, range: DateRange): T[] {
  return rows.filter((row) => inRange(getDate(row), range));
}

export function percentageChange(current: number, previous: number): number | null {
  if (!previous) return current ? 100 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
