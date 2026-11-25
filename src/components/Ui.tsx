import type { ReactNode } from "react";
import { statusTone } from "../lib/intelligence";
import { titleCase } from "../lib/format";
import { useLanguage } from "../i18n";
import NavIcon from "./NavIcon";

interface MetricProps {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "success" | "warning" | "danger" | "info";
}

export function Metric({ label, value, hint, tone }: MetricProps) {
  return (
    <div className={`card stat-card${tone ? ` tone-${tone}` : ""}`}>
      <span className="label">{label}</span>
      <span className="value">{value}</span>
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

interface StatusChipProps {
  status: string;
  label?: string;
}

export function StatusChip({ status, label }: StatusChipProps) {
  return <span className={`chip ${statusTone(status)}`}>{label ?? titleCase(status)}</span>;
}

interface ProgressBarProps {
  value: number;
  max: number;
  tone?: "primary" | "success" | "warning" | "danger";
  label?: string;
}

export function ProgressBar({ value, max, tone = "primary", label }: ProgressBarProps) {
  const width = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="progress-block">
      {label && <div className="progress-label"><span>{label}</span><strong>{Math.round(width)}%</strong></div>}
      <div className="progress-track"><div className={`progress-fill ${tone}`} style={{ width: `${width}%` }} /></div>
    </div>
  );
}

interface BarProps {
  items: Array<{ label: string; value: number; tone?: string }>;
  maxLabel?: (value: number) => string;
}

export function BarList({ items, maxLabel }: BarProps) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <div className="bar-list">
      {items.map((item) => (
        <div className="bar-row" key={item.label}>
          <div className="bar-meta">
            <span>{item.label}</span>
            <strong>{maxLabel ? maxLabel(item.value) : item.value.toLocaleString()}</strong>
          </div>
          <div className="progress-track"><div className={`progress-fill ${item.tone ?? "primary"}`} style={{ width: `${(item.value / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

interface SpeakSummaryButtonProps {
  module: string;
  label?: string;
}

export function SpeakSummaryButton({ module, label }: SpeakSummaryButtonProps) {
  const { t } = useLanguage();
  const text = label ?? t("Speak summary");
  return (
    <button
      type="button"
      className="summary-voice-action"
      title={text}
      aria-label={text}
      onClick={() => window.dispatchEvent(new CustomEvent("d0kn-voice-summary", { detail: { module } }))}
    >
      <NavIcon name="volume" size={16} />
      <span>{text}</span>
    </button>
  );
}
