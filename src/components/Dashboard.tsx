import { useMemo } from "react";
import type { AppState } from "../types";
import { useLanguage } from "../i18n";
import { Metric, ProgressBar, SpeakSummaryButton, StatusChip } from "./Ui";
import {
  getHighRiskShipments,
  getInsights,
  getInventoryValue,
  getLowStock,
  getOutstanding,
  type Insight,
} from "../lib/intelligence";
import { compactMoney, fullDate, number, shortDate, timeOf } from "../lib/format";

interface Props {
  state: AppState;
  setTab: (tab: string) => void;
}

function severityTone(severity: Insight["severity"]): "success" | "warning" | "danger" | "info" {
  if (severity === "critical") return "danger";
  if (severity === "warning") return "warning";
  if (severity === "opportunity") return "success";
  return "info";
}

export default function Dashboard({ state, setTab }: Props) {
  const { t, language } = useLanguage();
  const currency = state.company.defaultCurrency;

  const insights = useMemo(() => getInsights(state, language), [state, language]);
  const lowStockItems = useMemo(() => getLowStock(state), [state]);
  const highRisk = useMemo(() => getHighRiskShipments(state), [state]);

  const watchlist = useMemo(() => {
    const selected = new Set(highRisk.map((shipment) => shipment.id));
    const upcoming = state.shipments
      .filter((shipment) => !selected.has(shipment.id) && !["completed", "cancelled"].includes(shipment.status))
      .sort((a, b) => a.eta.localeCompare(b.eta))
      .slice(0, Math.max(0, 4 - highRisk.length));
    return [...highRisk, ...upcoming].slice(0, 4);
  }, [state.shipments, highRisk]);

  const activeImports = state.imports.filter((batch) => !["completed", "cancelled"].includes(batch.status)).length;
  const openOrders = state.orders.filter((order) => !["completed", "cancelled"].includes(order.status)).length;
  const outstanding = getOutstanding(state);
  const inventoryValue = getInventoryValue(state);

  const supplierName = (id: string) => state.suppliers.find((supplier) => supplier.id === id)?.name ?? t("Unknown supplier");
  const importReference = (id: string) => state.imports.find((batch) => batch.id === id)?.reference ?? id;

  return (
    <>
      <div className="page-header">
        <div>
          <h2>{state.company.tradingName}</h2>
          <p>{state.company.name} · {t("Executive command center")}</p>
          <div className="meta">
            <span>{t("Currency")}: {currency}</span>
            <span>{t("Fiscal year start")}: {state.company.fiscalYearStart}</span>
            <span>{t("Source country")}: {state.company.sourceCountry} → {t("Base country")}: {state.company.baseCountry}</span>
          </div>
        </div>
        <div className="actions">
          <SpeakSummaryButton module="dashboard" />
          <button className="primary" type="button" onClick={() => setTab("intelligence")}>
            {t("Open Intelligence")}
          </button>
        </div>
      </div>

      <div className="grid cols-3">
        <Metric
          label={t("Active imports")}
          value={number(activeImports)}
          hint={t("In progress or draft batches")}
          tone="info"
        />
        <Metric
          label={t("Low stock")}
          value={number(lowStockItems.length)}
          hint={t("At or below reorder point")}
          tone="danger"
        />
        <Metric
          label={t("Open orders")}
          value={number(openOrders)}
          hint={t("Not completed or cancelled")}
        />
        <Metric
          label={t("Outstanding")}
          value={compactMoney(outstanding, currency)}
          hint={t("Unpaid invoice balance")}
          tone="warning"
        />
        <Metric
          label={t("Inventory value")}
          value={compactMoney(inventoryValue, currency)}
          hint={t("Valued at product cost")}
          tone="success"
        />
        <Metric
          label={t("High-risk shipments")}
          value={number(highRisk.length)}
          hint={t("Delay risk needs review")}
          tone="danger"
        />
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="section-title">
          <h3>{t("AI briefing")}</h3>
          <span className="chip info">{t("Rule-based signals")}</span>
        </div>
        <p className="muted-text">
          {t("Top signals from the local intelligence engine. Open a module to act on each one.")}
        </p>
        <div className="list">
          {insights.slice(0, 4).map((insight) => (
            <div className="insight-card" key={insight.id}>
              <span className={`insight-icon chip ${severityTone(insight.severity)}`}>{t(insight.severity)}</span>
              <div className="insight-body">
                <h4>{insight.title}</h4>
                <p className="muted-text">{insight.detail}</p>
                <div className="meta">
                  <strong>{t("Recommendation")}</strong>
                  <span>{insight.recommendation}</span>
                </div>
              </div>
              <div className="insight-actions">
                <button className="small" type="button" onClick={() => setTab(insight.tab)}>
                  {t("Open module")}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid cols-2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="section-title">
            <h3>{t("Shipment watchlist")}</h3>
            <button className="ghost small" type="button" onClick={() => setTab("shipments")}>
              {t("View all")}
            </button>
          </div>
          <div className="list">
            {watchlist.length === 0 && <div className="empty">{t("No active shipments")}</div>}
            {watchlist.map((shipment) => (
              <div className="row-card" key={shipment.id}>
                <div className="row-top">
                  <div>
                    <h4>{shipment.reference}</h4>
                    <div className="meta">
                      <span>{importReference(shipment.importId)}</span>
                      <span>{supplierName(state.imports.find((batch) => batch.id === shipment.importId)?.supplierId ?? "")}</span>
                    </div>
                  </div>
                  <div className="actions">
                    <StatusChip status={shipment.delayRisk} label={t(shipment.delayRisk)} />
                    <StatusChip status={shipment.status} label={t(shipment.status)} />
                  </div>
                </div>
                <div className="meta">
                  <span>{t("Carrier")}: {shipment.carrier}</span>
                  <span>{t("Mode")}: {t(shipment.mode)}</span>
                  <span>{t("ETA")}: {shortDate(shipment.eta)}</span>
                  <span>{t("Destination port")}: {shipment.destinationPort}</span>
                </div>
                <div className="actions" style={{ marginTop: 10 }}>
                  <button className="small" type="button" onClick={() => setTab("shipments")}>
                    {t("Open module")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="section-title">
            <h3>{t("Low-stock products")}</h3>
            <button className="ghost small" type="button" onClick={() => setTab("products")}>
              {t("View all")}
            </button>
          </div>
          <div className="list">
            {lowStockItems.length === 0 && <div className="empty">{t("No low-stock products")}</div>}
            {lowStockItems.slice(0, 5).map((product) => (
              <div className="row-card" key={product.id}>
                <div className="row-top">
                  <div>
                    <h4>{product.name}</h4>
                    <div className="meta">
                      <span>{product.sku}</span>
                      <span>{t("Reorder point")}: {number(product.reorderPoint)}</span>
                      <span>{t("Supplier")}: {supplierName(product.supplierId)}</span>
                    </div>
                  </div>
                  <StatusChip status={product.status} label={t(product.status)} />
                </div>
                <ProgressBar
                  value={product.stock}
                  max={Math.max(product.reorderPoint, product.stock, 1)}
                  tone={product.stock <= product.reorderPoint / 2 ? "danger" : "warning"}
                  label={`${t("Stock")}: ${number(product.stock)} / ${t("Reorder point")}: ${number(product.reorderPoint)}`}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-title">
          <h3>{t("Recent activity")}</h3>
          <span className="chip neutral">{t("Latest events")}</span>
        </div>
        <div className="activity-list timeline">
          {state.activity.slice(0, 6).map((activity) => (
            <div className="activity-item timeline-item" key={activity.id}>
              <span className={`timeline-dot ${activity.tone}`} />
              <div>
                <div className="row-top">
                  <h4>{activity.title}</h4>
                  <span className={`chip ${activity.tone}`}>{t(activity.tone)}</span>
                </div>
                <div className="meta">
                  <span>{fullDate(activity.timestamp)} · {timeOf(activity.timestamp)}</span>
                </div>
                <p className="muted-text">{activity.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="section-title">
          <h3>{t("Quick actions")}</h3>
        </div>
        <div className="actions">
          <button className="primary" type="button" onClick={() => setTab("intelligence")}>
            {t("Open Intelligence")}
          </button>
          <button type="button" onClick={() => setTab("orders")}>{t("New Order")}</button>
          <button type="button" onClick={() => setTab("imports")}>{t("Review Imports")}</button>
          <button type="button" onClick={() => setTab("search")}>{t("Search")}</button>
        </div>
      </div>
    </>
  );
}
