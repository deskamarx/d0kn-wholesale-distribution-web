import { useMemo } from "react";
import type { AppState } from "../types";
import { compactMoney, money, number, percent } from "../lib/format";
import {
  getCategoryMix,
  getCustomerExposure,
  getForecast,
  getInventoryValue,
  getOrderMargin,
  getOutstanding,
  getRevenue,
  getSupplierScore,
  getTopProducts,
  getWholesaleInventoryValue,
} from "../lib/intelligence";
import { useLanguage } from "../i18n";
import { BarList, Metric, ProgressBar, SpeakSummaryButton, StatusChip } from "./Ui";

interface Props {
  state: AppState;
}

const DONUT_COLORS = ["#2443d8", "#12805c", "#b54708", "#175cd3", "#7a5af8", "#e5527a"];

export default function Analytics({ state }: Props) {
  const { t } = useLanguage();

  const headline = useMemo(() => {
    const revenue = getRevenue(state);
    const outstanding = getOutstanding(state);
    const inventoryValue = getInventoryValue(state);
    const wholesaleValue = getWholesaleInventoryValue(state);
    const completedOrders = state.orders.filter((order) => order.status === "completed");
    const avgMargin = completedOrders.length
      ? completedOrders.reduce((sum, order) => sum + getOrderMargin(order, state.products), 0) / completedOrders.length
      : 0;
    const capacity = state.warehouses.reduce((sum, warehouse) => sum + warehouse.capacity, 0);
    const used = state.warehouses.reduce((sum, warehouse) => sum + warehouse.used, 0);
    return {
      revenue,
      outstanding,
      inventoryValue,
      wholesaleValue,
      avgMargin,
      capacity,
      used,
      utilization: capacity ? (used / capacity) * 100 : 0,
    };
  }, [state]);

  const categoryMix = useMemo(() => {
    let cursor = 0;
    return getCategoryMix(state).map((item, index) => {
      const start = cursor;
      cursor = Math.min(100, cursor + item.share);
      return {
        ...item,
        color: DONUT_COLORS[index % DONUT_COLORS.length],
        start: Number(start.toFixed(2)),
        end: Number(cursor.toFixed(2)),
      };
    });
  }, [state]);

  const donutBackground = categoryMix.length
    ? `conic-gradient(${categoryMix.map((item) => `${item.color} ${item.start}% ${item.end}%`).join(", ")})`
    : "conic-gradient(var(--border) 0% 100%)";

  const topProducts = useMemo(() => getTopProducts(state, 6), [state]);

  const forecastRows = useMemo(
    () =>
      topProducts.map(({ product }) => {
        const forecast = getForecast(state, product.id);
        const signal = product.stock < forecast ? "Reorder" : product.stock <= product.reorderPoint ? "Watch" : "Healthy";
        return { product, forecast, signal };
      }),
    [state, topProducts]
  );

  const supplierRows = useMemo(
    () => [...state.suppliers].sort((a, b) => getSupplierScore(b) - getSupplierScore(a)),
    [state.suppliers]
  );

  const exposureRows = useMemo(
    () =>
      state.customers
        .map((customer) => ({ customer, exposure: getCustomerExposure(state, customer.id) }))
        .filter((row) => row.exposure > 0)
        .sort((a, b) => b.exposure - a.exposure)
        .slice(0, 6),
    [state]
  );

  return (
    <>
      <div className="page-header">
        <div>
          <h2>{t("Analytics")}</h2>
          <p>{t("Advanced commercial and operational intelligence across the wholesale network.")}</p>
        </div>
        <SpeakSummaryButton module="analytics" />
      </div>

      <div className="grid cols-4">
        <Metric label={t("Completed revenue")} value={compactMoney(headline.revenue, state.company.defaultCurrency)} hint={t("From completed orders")} tone="success" />
        <Metric label={t("Outstanding")} value={compactMoney(headline.outstanding, state.company.defaultCurrency)} hint={t("Open invoice balance")} tone="warning" />
        <Metric label={t("Inventory value")} value={compactMoney(headline.inventoryValue, state.company.defaultCurrency)} hint={t("At product cost")} />
        <Metric label={t("Wholesale inventory value")} value={compactMoney(headline.wholesaleValue, state.company.defaultCurrency)} hint={t("At wholesale price")} tone="info" />
        <Metric label={t("Average margin")} value={percent(headline.avgMargin)} hint={t("Completed orders")} tone="success" />
        <Metric label={t("Total SKUs")} value={number(state.products.length)} hint={t("Products in catalogue")} />
        <Metric label={t("Warehouse utilization")} value={percent(headline.utilization)} hint={`${compactMoney(headline.used)} / ${compactMoney(headline.capacity)}`} tone={headline.utilization >= 85 ? "danger" : headline.utilization >= 70 ? "warning" : "info"} />
        <Metric label={t("Supplier count")} value={number(state.suppliers.length)} hint={t("China sourcing partners")} />
      </div>

      <div className="grid cols-2 mt-4">
        <div className="card">
          <div className="section-title">
            <h3>{t("Category mix")}</h3>
            <span className="muted-text">{t("Share of order value")}</span>
          </div>
          <div className="donut-wrap">
            <div className="donut" style={{ background: donutBackground }}>
              <div className="donut-center">
                <span>{t("Order value")}</span>
                <strong>{compactMoney(headline.revenue, state.company.defaultCurrency)}</strong>
              </div>
            </div>
          </div>
          <div className="legend">
            {categoryMix.length === 0 && <div className="empty">{t("No category data available")}</div>}
            {categoryMix.map((item) => (
              <div className="legend-item" key={item.label}>
                <span className="legend-swatch" style={{ background: item.color }} />
                <span className="legend-grow">{item.label}</span>
                <strong>{percent(item.share)}</strong>
                <span className="muted-text">{compactMoney(item.value, state.company.defaultCurrency)}</span>
              </div>
            ))}
          </div>
          <div className="detail-grid mt-4">
            <div className="detail-item">
              <span className="muted-text">{t("Inventory value")}</span>
              <strong>{compactMoney(headline.inventoryValue, state.company.defaultCurrency)}</strong>
            </div>
            <div className="detail-item">
              <span className="muted-text">{t("Wholesale inventory value")}</span>
              <strong>{compactMoney(headline.wholesaleValue, state.company.defaultCurrency)}</strong>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="section-title">
            <h3>{t("Top products")}</h3>
            <span className="muted-text">{t("By order revenue")}</span>
          </div>
          {topProducts.length === 0 ? (
            <div className="empty">{t("No product revenue available")}</div>
          ) : (
            <BarList
              items={topProducts.map(({ product, revenue }) => ({
                label: product.name,
                value: revenue,
                tone: revenue > 0 ? "primary" : "neutral",
              }))}
              maxLabel={(value) => compactMoney(value, state.company.defaultCurrency)}
            />
          )}
          <p className="muted-text mt-4 mb-0">
            {t("Ranked by invoiced order lines, excluding cancelled orders.")}
          </p>
        </div>
      </div>

      <div className="grid cols-2 mt-4">
        <div className="card">
          <div className="section-title">
            <h3>{t("Supplier health")}</h3>
            <span className="muted-text">{t("Composite score out of 100")}</span>
          </div>
          <div className="list">
            {supplierRows.length === 0 && <div className="empty">{t("No suppliers available")}</div>}
            {supplierRows.slice(0, 6).map((supplier) => {
              const score = getSupplierScore(supplier);
              return (
                <div className="row-card" key={supplier.id}>
                  <div className="row-top">
                    <div>
                      <h4>{supplier.name}</h4>
                      <div className="meta">
                        <span>{supplier.city}, {supplier.country}</span>
                        <span>{t("Lead time days")}: {supplier.leadTimeDays}</span>
                      </div>
                    </div>
                    <div className="actions">
                      <strong>{score}/100</strong>
                      <StatusChip status={supplier.status} label={t(supplier.status)} />
                    </div>
                  </div>
                  <ProgressBar
                    value={score}
                    max={100}
                    tone={score >= 90 ? "success" : score >= 80 ? "warning" : "danger"}
                    label={t("Supplier score")}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="section-title">
            <h3>{t("Warehouse utilization")}</h3>
            <span className="muted-text">{percent(headline.utilization)} {t("network-wide")}</span>
          </div>
          <div className="list">
            {state.warehouses.map((warehouse) => {
              const usage = warehouse.capacity ? (warehouse.used / warehouse.capacity) * 100 : 0;
              return (
                <div className="row-card" key={warehouse.id}>
                  <div className="row-top">
                    <div>
                      <h4>{warehouse.name}</h4>
                      <div className="meta">
                        <span>{warehouse.code}</span>
                        <span>{warehouse.city}</span>
                        <span>{number(warehouse.used)} / {number(warehouse.capacity)}</span>
                      </div>
                    </div>
                    <StatusChip status={warehouse.status} label={t(warehouse.status)} />
                  </div>
                  <ProgressBar
                    value={warehouse.used}
                    max={warehouse.capacity}
                    tone={usage >= 90 ? "danger" : usage >= 75 ? "warning" : "primary"}
                    label={t("Used capacity")}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid cols-2 mt-4">
        <div className="card">
          <div className="section-title">
            <h3>{t("Credit exposure watchlist")}</h3>
            <span className="muted-text">{t("Against customer credit limits")}</span>
          </div>
          <div className="list">
            {exposureRows.length === 0 && <div className="empty">{t("No open customer exposure")}</div>}
            {exposureRows.map(({ customer, exposure }) => {
              const ratio = customer.creditLimit ? (exposure / customer.creditLimit) * 100 : 100;
              return (
                <div className="row-card" key={customer.id}>
                  <div className="row-top">
                    <div>
                      <h4>{customer.company}</h4>
                      <div className="meta">
                        <span>{customer.country}</span>
                        <span>{t("Credit limit")}: {compactMoney(customer.creditLimit, state.company.defaultCurrency)}</span>
                      </div>
                    </div>
                    <div className="actions">
                      <strong>{money(exposure, state.company.defaultCurrency)}</strong>
                      {ratio >= 80 && <span className="chip danger">{t("High exposure")}</span>}
                    </div>
                  </div>
                  <ProgressBar
                    value={exposure}
                    max={customer.creditLimit || 1}
                    tone={ratio >= 90 ? "danger" : ratio >= 70 ? "warning" : "primary"}
                    label={t("Exposure")}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="section-title">
            <h3>{t("Demand forecast")}</h3>
            <span className="muted-text">{t("30-day demand vs available stock")}</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("Product")}</th>
                  <th>{t("30-day forecast")}</th>
                  <th>{t("Stock")}</th>
                  <th>{t("Reorder point")}</th>
                  <th>{t("Signal")}</th>
                </tr>
              </thead>
              <tbody>
                {forecastRows.length === 0 && (
                  <tr>
                    <td colSpan={5}><div className="empty">{t("No forecast data available")}</div></td>
                  </tr>
                )}
                {forecastRows.map(({ product, forecast, signal }) => (
                  <tr key={product.id}>
                    <td>{product.name}</td>
                    <td>{number(forecast)}</td>
                    <td>{number(product.stock)}</td>
                    <td>{number(product.reorderPoint)}</td>
                    <td>
                      <span className={`chip ${signal === "Reorder" ? "danger" : signal === "Watch" ? "warning" : "success"}`}>
                        {t(signal)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
