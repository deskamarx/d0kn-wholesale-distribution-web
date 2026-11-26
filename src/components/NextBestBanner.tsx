import { useEffect, useMemo, useState } from "react";
import type { AppState } from "../types";
import { useLanguage } from "../i18n";
import { daysUntil, shortDate } from "../lib/format";
import { openRecord, Pill } from "./phase2/Phase2Ui";

const DISMISS_KEY = "d0kn-distribution-next-actions-v1";

interface Action {
  id: string;
  module: string;
  recordId?: string;
  label: string;
  detail: string;
  tone: "info" | "warning" | "danger";
}

export default function NextBestBanner({ state, setTab }: { state: AppState; setTab: (tab: string) => void }) {
  const { t } = useLanguage();
  const [dismissedDate, setDismissedDate] = useState(() => {
    try { return window.localStorage.getItem(DISMISS_KEY) ?? ""; } catch { return ""; }
  });
  const today = new Date().toISOString().slice(0, 10);
  const actions = useMemo<Action[]>(() => {
    const list: Action[] = [];
    state.quotations.filter((quote) => quote.status === "sent" && (daysUntil(quote.validUntil) ?? 999) <= 14).forEach((quote) => {
      const days = daysUntil(quote.validUntil) ?? 0;
      list.push({
        id: `quote-${quote.id}`, module: "quotations", recordId: quote.id,
        label: t("Quote expiring"), detail: t("{number} expires in {days} days", { number: quote.number, days: Math.max(0, days) }),
        tone: days < 0 ? "danger" : "warning",
      });
    });
    state.compliance.filter((item) => (daysUntil(item.expiryDate) ?? 999) <= 30 && item.status !== "expired").forEach((item) => {
      list.push({
        id: `compliance-${item.id}`, module: "compliance", recordId: item.id,
        label: t("Renewal due"), detail: t("{reference} expires {date}", { reference: item.reference, date: shortDate(item.expiryDate) }),
        tone: (daysUntil(item.expiryDate) ?? 999) < 0 ? "danger" : "warning",
      });
    });
    state.imports.filter((item) => item.status !== "completed" && !state.extras.importApprovals.some((approval) => approval.importId === item.id && approval.status === "approved")).forEach((item) => {
      list.push({
        id: `import-${item.id}`, module: "imports", recordId: item.id,
        label: t("Import needs approval"), detail: t("{reference} is waiting for review", { reference: item.reference }), tone: "info",
      });
    });
    state.shipments.filter((item) => item.delayRisk === "high").forEach((item) => {
      list.push({
        id: `shipment-${item.id}`, module: "shipments", recordId: item.id,
        label: t("High delay risk"), detail: t("{reference} needs carrier follow-up", { reference: item.reference }), tone: "danger",
      });
    });
    state.products.filter((item) => item.stock <= item.reorderPoint).slice(0, 3).forEach((item) => {
      list.push({
        id: `stock-${item.id}`, module: "products", recordId: item.id,
        label: t("Low stock"), detail: t("{name} has {stock} left", { name: item.name, stock: item.stock }), tone: "warning",
      });
    });
    state.invoices.filter((invoice) => invoice.status === "overdue" || (invoice.status !== "paid" && invoice.dueDate < today)).forEach((invoice) => {
      list.push({
        id: `invoice-${invoice.id}`, module: "invoices", recordId: invoice.id,
        label: t("Receivable overdue"), detail: t("{number} is past due", { number: invoice.number }), tone: "danger",
      });
    });
    return list.slice(0, 5);
  }, [state, t, today]);

  useEffect(() => {
    if (dismissedDate === today && actions.length > 0) {
      // Keep the count available but hide the strip for the rest of the day.
    }
  }, [actions.length, dismissedDate, today]);

  if (actions.length === 0 || dismissedDate === today) return null;

  return (
    <section className="next-best-banner" aria-label={t("Next best actions")}>
      <div className="next-best-head">
        <Pill tone="warning">{t("Needs attention")}</Pill>
        <strong>{t("Next best actions")}</strong>
        <span className="muted-text">{t("{count} items from your local records", { count: actions.length })}</span>
      </div>
      <div className="next-best-list">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            className={`next-best-item tone-${action.tone}`}
            onClick={() => action.recordId ? openRecord(action.module, action.recordId, setTab) : setTab(action.module)}
          >
            <strong>{action.label}</strong>
            <span>{action.detail}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        className="link-button"
        onClick={() => {
          try { window.localStorage.setItem(DISMISS_KEY, today); } catch { /* ignore */ }
          setDismissedDate(today);
        }}
      >
        {t("Hide today")}
      </button>
    </section>
  );
}
