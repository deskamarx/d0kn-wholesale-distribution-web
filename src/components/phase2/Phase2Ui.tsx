import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { AppState } from "../../types";
import type { Preferences } from "../../lib/preferences";

export interface Phase2Props {
  module: string;
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  setTab: (tab: string) => void;
  preferences: Preferences;
  setPreferences: Dispatch<SetStateAction<Preferences>>;
  focusRecord?: string;
  shareText?: string;
}

export function Phase2Panel({
  title,
  description,
  children,
  action,
  tone,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
  tone?: "info" | "success" | "warning" | "danger";
}) {
  return (
    <section className={`card phase2-panel${tone ? ` tone-${tone}` : ""}`}>
      <div className="section-title">
        <div>
          <h3>{title}</h3>
          {description && <p className="muted-text">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="phase2-field">
      <span>{label}</span>
      {children}
      {hint && <small className="muted-text">{hint}</small>}
    </label>
  );
}

export function RecordRows({ rows, empty, children }: { rows: unknown[]; empty: string; children: ReactNode }) {
  if (rows.length === 0) return <div className="phase2-empty">{empty}</div>;
  return <div className="phase2-rows">{children}</div>;
}

export function RowLine({
  title,
  meta,
  trailing,
  onClick,
  icon,
}: {
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  icon?: ReactNode;
}) {
  return (
    <div className={`phase2-row${onClick ? " clickable" : ""}`} onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}>
      {icon && <span className="phase2-row-icon" aria-hidden="true">{icon}</span>}
      <div className="phase2-row-main">
        <strong>{title}</strong>
        {meta && <span className="muted-text">{meta}</span>}
      </div>
      {trailing && <div className="phase2-row-trailing">{trailing}</div>}
    </div>
  );
}

export function Pill({ children, tone }: { children: ReactNode; tone?: "info" | "success" | "warning" | "danger" }) {
  return <span className={`chip ${tone ?? "info"}`}>{children}</span>;
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="phase2-toolbar">{children}</div>;
}

export function StatStrip({ items }: { items: Array<{ label: string; value: ReactNode; hint?: string }> }) {
  return (
    <div className="phase2-stats">
      {items.map((item) => (
        <div key={item.label} className="phase2-stat">
          <span className="label">{item.label}</span>
          <strong>{item.value}</strong>
          {item.hint && <small className="muted-text">{item.hint}</small>}
        </div>
      ))}
    </div>
  );
}

export function voiceSummary(module: string): void {
  window.dispatchEvent(new CustomEvent("d0kn-voice-summary", { detail: { module } }));
}

export function openRecord(module: string, id: string, setTab: (tab: string) => void): void {
  const url = new URL(window.location.href);
  url.searchParams.set("module", module);
  url.searchParams.set("record", id);
  url.hash = `#${module}`;
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  setTab(module);
  window.dispatchEvent(new CustomEvent("d0kn-focus-record", { detail: { module, id } }));
}
