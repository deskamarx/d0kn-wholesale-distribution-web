import type { ReactNode } from "react";
import { useLanguage } from "../i18n";

interface EmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: ReactNode;
}

export function EmptyState({ title, description, actionLabel, onAction, icon }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon" aria-hidden="true">{icon ?? "+"}</div>
      <strong>{title}</strong>
      {description && <p>{description}</p>}
      {actionLabel && onAction && (
        <button type="button" className="primary small" onClick={onAction}>{actionLabel}</button>
      )}
    </div>
  );
}

interface ValidationSummaryProps {
  errors: string[];
}

export function ValidationSummary({ errors }: ValidationSummaryProps) {
  const { t } = useLanguage();
  if (errors.length === 0) return null;
  return (
    <div className="validation-summary" role="alert" tabIndex={-1}>
      <strong>{t("Please fix the following")}</strong>
      <ul>
        {errors.map((error) => <li key={error}>{error}</li>)}
      </ul>
    </div>
  );
}

interface RequiredProgressProps {
  complete: number;
  total: number;
  label?: string;
}

export function RequiredProgress({ complete, total, label }: RequiredProgressProps) {
  const { t } = useLanguage();
  const safeTotal = Math.max(total, 0);
  const percent = safeTotal === 0 ? 100 : Math.round((complete / safeTotal) * 100);
  return (
    <div className="required-progress" aria-label={`${label ?? t("Required fields")}: ${complete}/${safeTotal}`}>
      <div className="required-progress-label">
        <span>{label ?? t("Required fields")}</span>
        <strong>{complete}/{safeTotal}</strong>
      </div>
      <div className="progress-track">
        <div className={`progress-fill ${percent === 100 ? "success" : "primary"}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
