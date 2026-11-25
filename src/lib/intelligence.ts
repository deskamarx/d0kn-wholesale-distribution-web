import type {
  AppState,
  ImportBatch,
  Order,
  OrderLine,
  Product,
  Shipment,
  Supplier,
} from "../types";
import { translate, type Language } from "../i18n";
import { compactMoney, daysUntil, money, number, shortDate } from "./format";

export interface Insight {
  id: string;
  severity: "critical" | "warning" | "opportunity" | "info";
  title: string;
  detail: string;
  recommendation: string;
  tab: string;
}

export interface MixItem {
  label: string;
  value: number;
  share: number;
}

export function lineAmount(line: OrderLine): number {
  return line.quantity * line.unitPrice * (1 - line.discountPercent / 100);
}

export function getOrderTotal(order: Order, _products: Product[]): number {
  return order.items.reduce((sum, item) => sum + lineAmount(item), 0);
}

export function getOrderCost(order: Order, products: Product[]): number {
  return order.items.reduce((sum, item) => {
    const product = products.find((entry) => entry.id === item.productId);
    return sum + item.quantity * (product?.cost ?? 0);
  }, 0);
}

export function getOrderMargin(order: Order, products: Product[]): number {
  const revenue = getOrderTotal(order, products);
  const cost = getOrderCost(order, products);
  if (!revenue) return 0;
  return ((revenue - cost) / revenue) * 100;
}

export function getImportTotals(batch: ImportBatch, products: Product[]) {
  const goodsCost = batch.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
  const duty = goodsCost * (batch.dutyPercent / 100);
  const landedCost = goodsCost + duty + batch.freightCost + batch.insuranceCost;
  const units = batch.items.reduce((sum, item) => sum + item.quantity, 0);

  return {
    goodsCost,
    duty,
    landedCost,
    units,
    landedUnitCost: units ? landedCost / units : 0,
    wholesaleValue: batch.items.reduce((sum, item) => {
      const product = products.find((entry) => entry.id === item.productId);
      return sum + item.quantity * (product?.wholesalePrice ?? 0);
    }, 0),
  };
}

export function getSupplierScore(supplier: Supplier): number {
  const leadFactor = Math.max(0, 100 - supplier.leadTimeDays * 0.8);
  const complianceFactor = supplier.complianceStatus === "active" ? 100 : supplier.complianceStatus === "pending" ? 60 : 20;
  return Math.round(
    supplier.reliability * 0.35 + supplier.qualityScore * 0.35 + leadFactor * 0.15 + complianceFactor * 0.15
  );
}

export function getInventoryValue(state: AppState): number {
  return state.products.reduce((sum, product) => sum + product.stock * product.cost, 0);
}

export function getWholesaleInventoryValue(state: AppState): number {
  return state.products.reduce((sum, product) => sum + product.stock * product.wholesalePrice, 0);
}

export function getRevenue(state: AppState): number {
  return state.orders
    .filter((order) => order.status === "completed")
    .reduce((sum, order) => sum + getOrderTotal(order, state.products), 0);
}

export function getOutstanding(state: AppState): number {
  return state.invoices
    .filter((invoice) => !["paid", "cancelled"].includes(invoice.status))
    .reduce((sum, invoice) => sum + Math.max(0, invoice.amount - invoice.paidAmount), 0);
}

export function getCustomerExposure(state: AppState, customerId: string): number {
  return state.invoices
    .filter((invoice) => invoice.customerId === customerId && !["paid", "cancelled"].includes(invoice.status))
    .reduce((sum, invoice) => sum + Math.max(0, invoice.amount - invoice.paidAmount), 0);
}

export function getLowStock(state: AppState): Product[] {
  return state.products
    .filter((product) => product.status === "active" && product.stock <= product.reorderPoint)
    .sort((a, b) => a.stock / Math.max(a.reorderPoint, 1) - b.stock / Math.max(b.reorderPoint, 1));
}

export function getHighRiskShipments(state: AppState): Shipment[] {
  return state.shipments.filter(
    (shipment) => shipment.delayRisk === "high" && !["completed", "cancelled"].includes(shipment.status)
  );
}

export function getExpiringCompliance(state: AppState) {
  return state.compliance
    .map((record) => ({ record, days: daysUntil(record.expiryDate) }))
    .filter((entry) => entry.days !== null && entry.days <= 30 && entry.record.status !== "cancelled")
    .sort((a, b) => (a.days ?? 999) - (b.days ?? 999));
}

export function getForecast(state: AppState, productId: string, windowDays = 90): number {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);
  const quantity = state.orders
    .filter((order) => new Date(`${order.date}T00:00:00`) >= cutoff && order.status !== "cancelled")
    .flatMap((order) => order.items)
    .filter((item) => item.productId === productId)
    .reduce((sum, item) => sum + item.quantity, 0);
  return Math.round((quantity / windowDays) * 30);
}

export function getTopProducts(state: AppState, limit = 5) {
  const totals = new Map<string, { product: Product; quantity: number; revenue: number }>();
  for (const order of state.orders) {
    if (order.status === "cancelled") continue;
    for (const item of order.items) {
      const product = state.products.find((entry) => entry.id === item.productId);
      if (!product) continue;
      const current = totals.get(product.id) ?? { product, quantity: 0, revenue: 0 };
      current.quantity += item.quantity;
      current.revenue += lineAmount(item);
      totals.set(product.id, current);
    }
  }
  return Array.from(totals.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

export function getCategoryMix(state: AppState): MixItem[] {
  const totals = new Map<string, number>();
  for (const order of state.orders) {
    if (order.status === "cancelled") continue;
    for (const item of order.items) {
      const product = state.products.find((entry) => entry.id === item.productId);
      if (!product) continue;
      totals.set(product.category, (totals.get(product.category) ?? 0) + lineAmount(item));
    }
  }
  const total = Array.from(totals.values()).reduce((sum, value) => sum + value, 0);
  return Array.from(totals.entries())
    .map(([label, value]) => ({ label, value, share: total ? (value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}

export function statusTone(status: string): string {
  const value = status.toLowerCase();
  if (["active", "completed", "paid", "approved", "low"].includes(value)) return "success";
  if (["pending", "partial", "sent", "in_progress", "medium"].includes(value)) return "warning";
  if (["overdue", "blocked", "cancelled", "expired", "high", "critical"].includes(value)) return "danger";
  if (["draft", "scheduled", "in_transit"].includes(value)) return "info";
  return "neutral";
}

export function getInsights(state: AppState, language: Language = "en"): Insight[] {
  const t = (key: string, vars?: Record<string, string | number>) => translate(language, key, vars);
  const insights: Insight[] = [];
  const lowStock = getLowStock(state);
  const riskyShipments = getHighRiskShipments(state);
  const overdue = state.invoices.filter((invoice) => invoice.status === "overdue");
  const expiring = getExpiringCompliance(state);
  const weakSuppliers = state.suppliers.filter((supplier) => getSupplierScore(supplier) < 85);
  const expiringQuotes = state.quotations.filter((quote) => {
    const days = daysUntil(quote.validUntil);
    return quote.status === "sent" && days !== null && days <= 7;
  });

  for (const product of lowStock.slice(0, 3)) {
    const forecast = getForecast(state, product.id);
    insights.push({
      id: `stock-${product.id}`,
      severity: product.stock === 0 ? "critical" : "warning",
      title: t("Low stock: {name}", { name: product.name }),
      detail: t(
        "{stock} {unit}s available against a reorder point of {reorderPoint}. 30-day demand signal: {forecast} {unit}s.",
        {
          stock: number(product.stock),
          unit: product.unit,
          reorderPoint: number(product.reorderPoint),
          forecast: number(forecast),
        }
      ),
      recommendation: t("Raise a purchase order for at least {quantity} units.", {
        quantity: number(Math.max(product.reorderPoint - product.stock, forecast)),
      }),
      tab: "products",
    });
  }

  for (const shipment of riskyShipments) {
    insights.push({
      id: `shipment-${shipment.id}`,
      severity: "critical",
      title: t("Delay risk: {reference}", { reference: shipment.reference }),
      detail: t("{carrier} shipment to {destination} has a high delay risk. ETA {eta}.", {
        carrier: shipment.carrier,
        destination: shipment.destinationPort,
        eta: shortDate(shipment.eta),
      }),
      recommendation: t("Contact the forwarder, confirm berth allocation, and prepare customer communication."),
      tab: "shipments",
    });
  }

  if (overdue.length > 0) {
    const amount = overdue.reduce((sum, invoice) => sum + invoice.amount - invoice.paidAmount, 0);
    insights.push({
      id: "overdue-invoices",
      severity: "warning",
      title: t("{count} overdue invoices", { count: overdue.length }),
      detail: t("{amount} is past due across {count} accounts.", {
        amount: compactMoney(amount),
        count: overdue.length,
      }),
      recommendation: t("Escalate collections and pause new credit releases where exposure is high."),
      tab: "invoices",
    });
  }

  for (const entry of expiring.slice(0, 2)) {
    insights.push({
      id: `compliance-${entry.record.id}`,
      severity: (entry.days ?? 0) <= 7 ? "critical" : "warning",
      title: t("{type} expires in {days} days", { type: t(entry.record.type), days: entry.days ?? 0 }),
      detail: t("{reference} ({authority}) requires renewal.", {
        reference: entry.record.reference,
        authority: entry.record.authority,
      }),
      recommendation: t("Start renewal now to avoid customs or product-release delays."),
      tab: "compliance",
    });
  }

  for (const supplier of weakSuppliers.slice(0, 2)) {
    insights.push({
      id: `supplier-${supplier.id}`,
      severity: "opportunity",
      title: t("Supplier review: {name}", { name: supplier.name }),
      detail: t("Composite score {score}/100. Reliability {reliability}, quality {quality}.", {
        score: getSupplierScore(supplier),
        reliability: supplier.reliability,
        quality: supplier.qualityScore,
      }),
      recommendation: t("Run a corrective-action review before increasing order volume."),
      tab: "suppliers",
    });
  }

  for (const quote of expiringQuotes) {
    const customer = state.customers.find((entry) => entry.id === quote.customerId);
    insights.push({
      id: `quote-${quote.id}`,
      severity: "opportunity",
      title: t("Quote expiring: {number}", { number: quote.number }),
      detail: t("{customer} has not converted {amount} in quoted value.", {
        customer: customer?.company ?? t("Customer"),
        amount: money(quote.items.reduce((sum, item) => sum + lineAmount(item), 0)),
      }),
      recommendation: t("Send a refreshed quote and confirm stock availability."),
      tab: "quotations",
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: "all-clear",
      severity: "info",
      title: t("Operations are stable"),
      detail: t("No critical stock, shipment, compliance, or collections exceptions detected."),
      recommendation: t("Continue monitoring the command center for new signals."),
      tab: "dashboard",
    });
  }

  return insights;
}
