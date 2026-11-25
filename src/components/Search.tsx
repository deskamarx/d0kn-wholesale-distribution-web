import { useMemo, useState } from "react";
import type { AppState } from "../types";
import { useLanguage } from "../i18n";
import { StatusChip } from "./Ui";
import { money, number, shortDate } from "../lib/format";

interface Props {
  state: AppState;
  setTab: (tab: string) => void;
}

interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  tab: string;
  status?: string;
}

interface ResultGroup {
  label: string;
  items: SearchResult[];
}

function matches(term: string, fields: Array<string | number | undefined | null>): boolean {
  return fields.some((field) => String(field ?? "").toLowerCase().includes(term));
}

export default function Search({ state, setTab }: Props) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const term = query.trim().toLowerCase();
  const currency = state.company.defaultCurrency;

  const results = useMemo<ResultGroup[]>(() => {
    if (!term) return [];

    const groups: ResultGroup[] = [];
    const add = (label: string, items: SearchResult[]) => {
      if (items.length > 0) groups.push({ label, items });
    };

    const supplierName = (id: string) =>
      state.suppliers.find((supplier) => supplier.id === id)?.name ?? t("Unknown supplier");
    const customerName = (id: string) =>
      state.customers.find((customer) => customer.id === id)?.company ?? t("Unknown customer");
    const productName = (id: string) =>
      state.products.find((product) => product.id === id)?.name ?? id;
    const invoiceNumber = (id: string) =>
      state.invoices.find((invoice) => invoice.id === id)?.number ?? id;

    add(
      t("Suppliers"),
      state.suppliers
        .filter((supplier) =>
          matches(term, [
            supplier.name,
            supplier.chineseName,
            supplier.city,
            supplier.country,
            supplier.contact,
            supplier.wechat,
            supplier.phone,
            supplier.email,
            supplier.paymentTerms,
            supplier.incoterm,
            supplier.status,
            supplier.notes,
          ])
        )
        .map((supplier) => ({
          id: supplier.id,
          title: supplier.name,
          subtitle: `${supplier.chineseName} · ${supplier.city}, ${supplier.country} · ${t(supplier.status)}`,
          tab: "suppliers",
          status: supplier.status,
        }))
    );

    add(
      t("Products"),
      state.products
        .filter((product) =>
          matches(term, [
            product.sku,
            product.name,
            product.category,
            product.brand,
            product.model,
            product.hsCode,
            product.countryOfOrigin,
            product.status,
            product.notes,
          ])
        )
        .map((product) => ({
          id: product.id,
          title: product.name,
          subtitle: `${product.sku} · ${product.category} · ${t("Stock")}: ${number(product.stock)} · ${t(product.status)}`,
          tab: "products",
          status: product.status,
        }))
    );

    add(
      t("Imports"),
      state.imports
        .filter((batch) =>
          matches(term, [
            batch.reference,
            supplierName(batch.supplierId),
            batch.status,
            batch.customsStatus,
            batch.currency,
            batch.notes,
          ])
        )
        .map((batch) => ({
          id: batch.id,
          title: batch.reference,
          subtitle: `${supplierName(batch.supplierId)} · ${t("ETA")}: ${shortDate(batch.eta)} · ${t(batch.status)}`,
          tab: "imports",
          status: batch.status,
        }))
    );

    add(
      t("Shipments"),
      state.shipments
        .filter((shipment) =>
          matches(term, [
            shipment.reference,
            shipment.carrier,
            shipment.mode,
            shipment.originPort,
            shipment.destinationPort,
            shipment.trackingNumber,
            shipment.status,
            shipment.delayRisk,
            shipment.notes,
          ])
        )
        .map((shipment) => ({
          id: shipment.id,
          title: shipment.reference,
          subtitle: `${shipment.carrier} · ${t(shipment.mode)} · ${shipment.originPort} → ${shipment.destinationPort} · ${t(shipment.delayRisk)}`,
          tab: "shipments",
          status: shipment.status,
        }))
    );

    add(
      t("Customers"),
      state.customers
        .filter((customer) =>
          matches(term, [
            customer.company,
            customer.contact,
            customer.phone,
            customer.email,
            customer.country,
            customer.city,
            customer.type,
            customer.status,
            customer.notes,
          ])
        )
        .map((customer) => ({
          id: customer.id,
          title: customer.company,
          subtitle: `${customer.contact} · ${customer.city}, ${customer.country} · ${t(customer.type)} · ${t(customer.status)}`,
          tab: "customers",
          status: customer.status,
        }))
    );

    add(
      t("Quotations"),
      state.quotations
        .filter((quotation) =>
          matches(term, [
            quotation.number,
            customerName(quotation.customerId),
            quotation.status,
            quotation.notes,
            quotation.items.map((item) => productName(item.productId)).join(" "),
          ])
        )
        .map((quotation) => ({
          id: quotation.id,
          title: quotation.number,
          subtitle: `${customerName(quotation.customerId)} · ${t("Valid until")}: ${shortDate(quotation.validUntil)} · ${t(quotation.status)}`,
          tab: "quotations",
          status: quotation.status,
        }))
    );

    add(
      t("Orders"),
      state.orders
        .filter((order) =>
          matches(term, [
            order.number,
            customerName(order.customerId),
            order.status,
            order.shippingStatus,
            order.notes,
            order.items.map((item) => productName(item.productId)).join(" "),
          ])
        )
        .map((order) => ({
          id: order.id,
          title: order.number,
          subtitle: `${customerName(order.customerId)} · ${t("Shipping status")}: ${t(order.shippingStatus)} · ${t(order.status)}`,
          tab: "orders",
          status: order.status,
        }))
    );

    add(
      t("Invoices"),
      state.invoices
        .filter((invoice) =>
          matches(term, [
            invoice.number,
            customerName(invoice.customerId),
            invoice.status,
            invoice.currency,
            invoice.notes,
          ])
        )
        .map((invoice) => ({
          id: invoice.id,
          title: invoice.number,
          subtitle: `${customerName(invoice.customerId)} · ${money(invoice.amount - invoice.paidAmount, invoice.currency)} · ${t(invoice.status)}`,
          tab: "invoices",
          status: invoice.status,
        }))
    );

    add(
      t("Payments"),
      state.payments
        .filter((payment) =>
          matches(term, [
            payment.reference,
            payment.method,
            payment.status,
            payment.notes,
            invoiceNumber(payment.invoiceId),
          ])
        )
        .map((payment) => ({
          id: payment.id,
          title: payment.reference || payment.method,
          subtitle: `${invoiceNumber(payment.invoiceId)} · ${money(payment.amount, currency)} · ${shortDate(payment.date)} · ${t(payment.status)}`,
          tab: "payments",
          status: payment.status,
        }))
    );

    add(
      t("Compliance"),
      state.compliance
        .filter((record) =>
          matches(term, [
            record.reference,
            record.type,
            record.entityType,
            record.entityId,
            record.authority,
            record.status,
            record.notes,
          ])
        )
        .map((record) => ({
          id: record.id,
          title: record.reference,
          subtitle: `${record.type} · ${record.authority} · ${t("Expiry date")}: ${shortDate(record.expiryDate)} · ${t(record.status)}`,
          tab: "compliance",
          status: record.status,
        }))
    );

    add(
      t("Warehouse"),
      state.warehouses
        .filter((warehouse) =>
          matches(term, [
            warehouse.code,
            warehouse.name,
            warehouse.city,
            warehouse.manager,
            warehouse.status,
          ])
        )
        .map((warehouse) => ({
          id: warehouse.id,
          title: `${warehouse.name} (${warehouse.code})`,
          subtitle: `${warehouse.city} · ${t("Manager")}: ${warehouse.manager} · ${number(warehouse.used)} / ${number(warehouse.capacity)} · ${t(warehouse.status)}`,
          tab: "warehouse",
          status: warehouse.status,
        }))
    );

    return groups;
  }, [state, term, t]);

  const total = results.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <>
      <div className="page-header">
        <div>
          <h2>{t("Search")}</h2>
          <p>
            {t("Search all records")} · {t("Suppliers")}, {t("Products")}, {t("Imports")}, {t("Shipments")},{" "}
            {t("Customers")}, {t("Quotations")}, {t("Orders")}, {t("Invoices")}, {t("Payments")}, {t("Compliance")},{" "}
            {t("Warehouse")}
          </p>
        </div>
        <span className={`chip ${total > 0 ? "success" : "neutral"}`}>
          {number(total)} {t("results")}
        </span>
      </div>

      <div className="card">
        <div className="field">
          <label htmlFor="global-search">{t("Search all records")}</label>
          <input
            id="global-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("Type to search the workspace")}
          />
        </div>

        {!term && (
          <div className="empty">
            {t("Start typing to search suppliers, products, imports, shipments, customers, and finance records.")}
          </div>
        )}
        {term && total === 0 && (
          <div className="empty">
            {t("No results found")} · {t("Try a SKU, reference, customer, supplier, city, or status.")}
          </div>
        )}
      </div>

      {term &&
        total > 0 &&
        results.map((group) => (
          <div className="card" key={group.label}>
            <div className="section-title">
              <h3>{group.label}</h3>
              <span className="chip info">{number(group.items.length)} {t("results")}</span>
            </div>
            <div className="list">
              {group.items.map((item) => (
                <div className="row-card" key={`${group.label}-${item.id}`}>
                  <div className="row-top">
                    <div>
                      <h4>{item.title}</h4>
                      <div className="meta"><span>{item.subtitle}</span></div>
                    </div>
                    <div className="actions">
                      {item.status && <StatusChip status={item.status} label={t(item.status)} />}
                      <button className="small" type="button" onClick={() => setTab(item.tab)}>
                        {t("Open")}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
    </>
  );
}
