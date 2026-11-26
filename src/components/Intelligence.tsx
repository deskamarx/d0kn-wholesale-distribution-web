import { useMemo } from "react";
import type { AppState } from "../types";
import { useLanguage } from "../i18n";
import { Metric, ProgressBar, SpeakSummaryButton, StatusChip } from "./Ui";
import {
  getCustomerExposure,
  getForecast,
  getInsights,
  getOutstanding,
  getSupplierScore,
  getTopProducts,
  type Insight,
} from "../lib/intelligence";
import { compactMoney, money, number, percent } from "../lib/format";

interface Props {
  state: AppState;
  setTab: (tab: string) => void;
}

const SEVERITIES: Insight["severity"][] = ["critical", "warning", "opportunity", "info"];

function severityTone(severity: Insight["severity"]): "success" | "warning" | "danger" | "info" {
  if (severity === "critical") return "danger";
  if (severity === "warning") return "warning";
  if (severity === "opportunity") return "success";
  return "info";
}

const SIGNALS = [
  {
    title: "Demand signal",
    detail: "30-day order velocity from non-cancelled orders, compared with available stock.",
  },
  {
    title: "Supplier health",
    detail: "Composite score from reliability, quality score, lead time, and compliance status.",
  },
  {
    title: "Shipment risk",
    detail: "Carrier delay flags, document status, and ETA pressure on active import legs.",
  },
  {
    title: "Credit risk",
    detail: "Open invoice balances measured against customer credit limits.",
  },
  {
    title: "Compliance expiry",
    detail: "Certificates, licences, and audits expiring within the next 30 days.",
  },
  {
    title: "Margin opportunity",
    detail: "Wholesale-cost spread on products with healthy stock and active demand.",
  },
];

export default function Intelligence({ state, setTab }: Props) {
  const { t, language } = useLanguage();
  const currency = state.company.defaultCurrency;

  const insights = useMemo(() => getInsights(state, language), [state, language]);
  const grouped = useMemo(() => {
    const groups: Record<Insight["severity"], Insight[]> = {
      critical: [],
      warning: [],
      opportunity: [],
      info: [],
    };
    for (const insight of insights) groups[insight.severity].push(insight);
    return groups;
  }, [insights]);

  const suppliers = useMemo(
    () => [...state.suppliers].sort((a, b) => getSupplierScore(b) - getSupplierScore(a)),
    [state.suppliers]
  );

  const topProducts = useMemo(() => getTopProducts(state, 6), [state]);

  const creditWatch = useMemo(
    () =>
      state.customers
        .map((customer) => ({
          customer,
          exposure: getCustomerExposure(state, customer.id),
        }))
        .filter((entry) => entry.exposure > 0)
        .sort((a, b) => b.exposure - a.exposure)
        .slice(0, 6),
    [state]
  );

  const marginOpportunities = useMemo(
    () =>
      state.products
        .filter((product) => product.status === "active" && product.stock > product.reorderPoint)
        .map((product) => ({
          product,
          spread: product.wholesalePrice - product.cost,
          margin: product.wholesalePrice
            ? ((product.wholesalePrice - product.cost) / product.wholesalePrice) * 100
            : 0,
        }))
        .sort((a, b) => b.spread - a.spread)
        .slice(0, 6),
    [state.products]
  );

  const outstanding = getOutstanding(state);
  const supplierName = (id: string) => state.suppliers.find((supplier) => supplier.id === id)?.name ?? t("Unknown supplier");

  return (
    <>
      <div className="page-header">
        <div>
          <h2>{t("Intelligence Engine")}</h2>
          <p>{t("Local rule-based signals across sourcing, logistics, inventory, credit, and compliance.")}</p>
        </div>
        <div className="actions">
          <SpeakSummaryButton module="intelligence" />
          <span className="chip success">{t("No external AI service")}</span>
        </div>
      </div>

      <div className="card">
        <div className="section-title">
          <h3>{t("Rule-based signals")}</h3>
          <span className="chip info">{number(SIGNALS.length)} {t("signals")}</span>
        </div>
        <p className="muted-text">
          {t("Every signal is calculated in this browser from the current workspace. No external AI service is called.")}
        </p>
        <div className="grid cols-3">
          {SIGNALS.map((signal) => (
            <div className="card" key={signal.title}>
              <div className="detail-grid">
                <div className="detail-item"><strong>{t(signal.title)}</strong></div>
                <div className="detail-item"><span className="muted-text">{t(signal.detail)}</span></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card mt-4">
        <div className="section-title">
          <h3>{t("Decision queue")}</h3>
          <span className={`chip ${grouped.critical.length > 0 ? "danger" : "success"}`}>
            {grouped.critical.length > 0 ? t("Needs attention") : t("All clear")}
          </span>
        </div>
        <p className="muted-text">
          {t("Prioritise the queue below, then open the owning module to resolve each signal.")}
        </p>
        <div className="grid cols-4">
          {SEVERITIES.map((severity) => (
            <Metric
              key={severity}
              label={t(severity)}
              value={number(grouped[severity].length)}
              hint={t("Insights")}
              tone={severityTone(severity)}
            />
          ))}
        </div>
        <div className="actions mt-3">
          <button type="button" onClick={() => setTab("products")}>{t("Products")}</button>
          <button type="button" onClick={() => setTab("shipments")}>{t("Shipments")}</button>
          <button type="button" onClick={() => setTab("invoices")}>{t("Invoices")}</button>
          <button type="button" onClick={() => setTab("compliance")}>{t("Compliance")}</button>
        </div>
      </div>

      {SEVERITIES.map((severity) => (
        <div className="card" key={severity}>
          <div className="section-title">
            <h3>{t(severity)}</h3>
            <span className={`chip ${severityTone(severity)}`}>
              {number(grouped[severity].length)} {t("insights")}
            </span>
          </div>
          <div className="list">
            {grouped[severity].length === 0 && <div className="empty">{t("No insights in this group")}</div>}
            {grouped[severity].map((insight) => (
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
      ))}

      <div className="card">
        <div className="section-title">
          <h3>{t("Supplier health scorecards")}</h3>
          <button className="ghost small" type="button" onClick={() => setTab("suppliers")}>
            {t("View all")}
          </button>
        </div>
        <p className="muted-text">
          {t("Scores blend reliability, quality, lead time, and compliance status for each China partner.")}
        </p>
        <div className="list">
          {suppliers.map((supplier) => {
            const score = getSupplierScore(supplier);
            const tone = score >= 85 ? "success" : score >= 70 ? "warning" : "danger";
            return (
              <div className="row-card" key={supplier.id}>
                <div className="row-top">
                  <div>
                    <h4>{supplier.name}</h4>
                    <div className="meta">
                      <span>{supplier.city}, {supplier.country}</span>
                      <span>{t("Lead time days")}: {number(supplier.leadTimeDays)}</span>
                    </div>
                  </div>
                  <div className="actions">
                    <StatusChip status={supplier.status} label={t(supplier.status)} />
                    <span className={`chip ${tone}`}>{t("Supplier health")}: {number(score)}</span>
                  </div>
                </div>
                <ProgressBar
                  value={score}
                  max={100}
                  tone={tone}
                  label={`${t("Reliability")}: ${number(supplier.reliability)} · ${t("Quality score")}: ${number(supplier.qualityScore)}`}
                />
                <div className="meta">
                  <span>{t("Compliance status")}</span>
                  <StatusChip status={supplier.complianceStatus} label={t(supplier.complianceStatus)} />
                </div>
                <div className="actions mt-2">
                  <button className="small" type="button" onClick={() => setTab("suppliers")}>
                    {t("Open module")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="section-title">
          <h3>{t("Demand forecast")}</h3>
          <span className="chip info">{t("Top products")}</span>
        </div>
        <p className="muted-text">
          {t("A 30-day demand signal derived from recent non-cancelled order quantities.")}
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("Product")}</th>
                <th>{t("SKU")}</th>
                <th>{t("Category")}</th>
                <th>{t("Demand forecast")}</th>
                <th>{t("Stock")}</th>
                <th>{t("Reorder point")}</th>
                <th>{t("Completed revenue")}</th>
              </tr>
            </thead>
            <tbody>
              {topProducts.map((entry) => (
                <tr key={entry.product.id}>
                  <td>{entry.product.name}</td>
                  <td>{entry.product.sku}</td>
                  <td>{entry.product.category}</td>
                  <td>
                    <strong>{number(getForecast(state, entry.product.id))}</strong>
                  </td>
                  <td>
                    <div className="meta">
                      <span>{number(entry.product.stock)}</span>
                      {entry.product.stock <= entry.product.reorderPoint && (
                        <span className="chip danger">{t("Low stock")}</span>
                      )}
                    </div>
                  </td>
                  <td>{number(entry.product.reorderPoint)}</td>
                  <td>{compactMoney(entry.revenue, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="section-title">
          <h3>{t("Credit exposure watchlist")}</h3>
          <span className="chip warning">{t("Outstanding")}: {compactMoney(outstanding, currency)}</span>
        </div>
        <p className="muted-text">
          {t("Open invoice balances ranked against each customer's approved credit limit.")}
        </p>
        <div className="list">
          {creditWatch.length === 0 && <div className="empty">{t("No credit exposure found")}</div>}
          {creditWatch.map((entry) => {
            const ratio = entry.customer.creditLimit ? entry.exposure / entry.customer.creditLimit : 1;
            const tone = ratio >= 0.8 ? "danger" : ratio >= 0.5 ? "warning" : "success";
            return (
              <div className="row-card" key={entry.customer.id}>
                <div className="row-top">
                  <div>
                    <h4>{entry.customer.company}</h4>
                    <div className="meta">
                      <span>{t("Type")}: {t(entry.customer.type)}</span>
                      <span>{t("Payment terms")}: {entry.customer.paymentTerms}</span>
                    </div>
                  </div>
                  <div className="actions">
                    <span className={`chip ${tone}`}>{t("Exposure")}: {compactMoney(entry.exposure, currency)}</span>
                    <StatusChip status={entry.customer.status} label={t(entry.customer.status)} />
                  </div>
                </div>
                <ProgressBar
                  value={entry.exposure}
                  max={Math.max(entry.customer.creditLimit, entry.exposure, 1)}
                  tone={tone}
                  label={`${t("Credit limit")}: ${compactMoney(entry.customer.creditLimit, currency)}`}
                />
                <div className="actions mt-2">
                  <button className="small" type="button" onClick={() => setTab("customers")}>
                    {t("Open module")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="section-title">
          <h3>{t("Margin opportunity")}</h3>
          <button className="ghost small" type="button" onClick={() => setTab("products")}>
            {t("View all")}
          </button>
        </div>
        <p className="muted-text">
          {t("Best wholesale-cost spreads on products with stock above the reorder point.")}
        </p>
        <div className="list">
          {marginOpportunities.length === 0 && <div className="empty">{t("No margin opportunities found")}</div>}
          {marginOpportunities.map((entry) => (
            <div className="row-card" key={entry.product.id}>
              <div className="row-top">
                <div>
                  <h4>{entry.product.name}</h4>
                  <div className="meta">
                    <span>{entry.product.sku}</span>
                    <span>{t("Category")}: {entry.product.category}</span>
                    <span>{t("Stock")}: {number(entry.product.stock)}</span>
                  </div>
                </div>
                <div className="actions">
                  <span className="chip success">{money(entry.spread, currency)}</span>
                  <span className="chip info">{percent(entry.margin)}</span>
                </div>
              </div>
              <div className="meta">
                <span>{t("Cost")}: {money(entry.product.cost, currency)}</span>
                <span>{t("Wholesale price")}: {money(entry.product.wholesalePrice, currency)}</span>
                <span>{t("Supplier")}: {supplierName(entry.product.supplierId)}</span>
              </div>
              <div className="actions mt-2">
                <button className="small" type="button" onClick={() => setTab("products")}>
                  {t("Open module")}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
