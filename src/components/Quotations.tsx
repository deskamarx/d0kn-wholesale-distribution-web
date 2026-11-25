import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { AppState, Order, OrderLine, Quotation, Status } from "../types";
import { compactMoney, daysUntil, money, number, shortDate } from "../lib/format";
import { lineAmount } from "../lib/intelligence";
import { removeById, uid, updateById, upsert } from "../lib/store";
import { useLanguage } from "../i18n";
import { Metric, StatusChip } from "./Ui";

interface Props {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
}

const todayIso = (): string => new Date().toISOString().slice(0, 10);

function addDays(base: string, days: number): string {
  const value = new Date(`${base}T00:00:00`);
  value.setDate(value.getDate() + days);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function makeEmptyQuote(state: AppState): Quotation {
  const day = todayIso();
  return {
    id: "",
    number: `QUO-${new Date().getFullYear()}-${String(state.quotations.length + 1).padStart(3, "0")}`,
    customerId: state.customers[0]?.id ?? "",
    date: day,
    validUntil: addDays(day, 30),
    status: "draft",
    items: [],
    notes: "",
  };
}

function quoteTotal(items: OrderLine[]): number {
  return items.reduce((sum, item) => sum + lineAmount(item), 0);
}

export default function Quotations({ state, setState }: Props) {
  const { t } = useLanguage();
  const [form, setForm] = useState<Quotation>(() => makeEmptyQuote(state));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const customerName = (id: string): string =>
    state.customers.find((customer) => customer.id === id)?.company ?? t("Unknown customer");

  const quotedValue = state.quotations.reduce((sum, quote) => sum + quoteTotal(quote.items), 0);
  const approvedValue = state.quotations
    .filter((quote) => quote.status === "approved")
    .reduce((sum, quote) => sum + quoteTotal(quote.items), 0);
  const expiringSoon = state.quotations.filter((quote) => {
    const days = daysUntil(quote.validUntil);
    return days !== null && days >= 0 && days <= 14 && quote.status !== "expired" && quote.status !== "cancelled";
  }).length;

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return state.quotations
      .filter((quote) => statusFilter === "all" || quote.status === statusFilter)
      .filter((quote) => {
        if (!term) return true;
        const company = state.customers.find((customer) => customer.id === quote.customerId)?.company ?? "";
        return [quote.number, company, quote.status, quote.notes].join(" ").toLowerCase().includes(term);
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [state.quotations, state.customers, statusFilter, query]);

  const updateLine = (index: number, patch: Partial<OrderLine>) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item, position) => (position === index ? { ...item, ...patch } : item)),
    }));
  };

  const selectProduct = (index: number, productId: string) => {
    const product = state.products.find((entry) => entry.id === productId);
    updateLine(index, { productId, unitPrice: product?.wholesalePrice ?? 0 });
  };

  const addLine = () => {
    const first = state.products[0];
    setForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        { productId: first?.id ?? "", quantity: 1, unitPrice: first?.wholesalePrice ?? 0, discountPercent: 0 },
      ],
    }));
  };

  const removeLine = (index: number) => {
    setForm((prev) => ({ ...prev, items: prev.items.filter((_, position) => position !== index) }));
  };

  const saveQuote = () => {
    if (!form.number.trim() || !form.customerId) {
      alert(t("Quotation number and customer are required."));
      return;
    }
    const quote: Quotation = {
      ...form,
      id: editingId ?? uid("QUO"),
      number: form.number.trim(),
      items: form.items.map((item) => ({
        ...item,
        quantity: Math.max(0, item.quantity),
        unitPrice: Math.max(0, item.unitPrice),
        discountPercent: Math.min(100, Math.max(0, item.discountPercent)),
      })),
      notes: form.notes.trim(),
    };
    setState((prev) => ({ ...prev, quotations: upsert(prev.quotations, quote) }));
    setForm(makeEmptyQuote(state));
    setEditingId(null);
  };

  const editQuote = (quote: Quotation) => {
    setForm({ ...quote, items: quote.items.map((item) => ({ ...item })) });
    setEditingId(quote.id);
  };

  const cancelEdit = () => {
    setForm(makeEmptyQuote(state));
    setEditingId(null);
  };

  const deleteQuote = (quote: Quotation) => {
    if (!window.confirm(`${t("Delete quotation")} ${quote.number}?`)) return;
    setState((prev) => ({ ...prev, quotations: removeById(prev.quotations, quote.id) }));
    if (editingId === quote.id) cancelEdit();
  };

  const patchQuote = (quote: Quotation, patch: Partial<Quotation>) => {
    setState((prev) => ({ ...prev, quotations: updateById(prev.quotations, quote.id, patch) }));
  };

  const convertToOrder = (quote: Quotation) => {
    if (!state.warehouses.some((warehouse) => warehouse.status === "active")) {
      alert(t("Create an active warehouse before converting a quotation."));
      return;
    }
    setState((prev) => {
      const warehouse = prev.warehouses.find((entry) => entry.status === "active") ?? prev.warehouses[0];
      const order: Order = {
        id: uid("ORD"),
        number: `ORD-${new Date().getFullYear()}-${String(prev.orders.length + 1).padStart(3, "0")}`,
        customerId: quote.customerId,
        date: todayIso(),
        status: "draft",
        warehouseId: warehouse?.id ?? "",
        shippingStatus: "pending",
        items: quote.items.map((item) => ({ ...item })),
        notes: `${t("Converted from")} ${quote.number}${quote.notes ? ` · ${quote.notes}` : ""}`,
      };
      return { ...prev, orders: [order, ...prev.orders] };
    });
  };

  const canConvert = (quote: Quotation): boolean => {
    const days = daysUntil(quote.validUntil);
    return quote.status === "approved" && days !== null && days >= 0;
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h2>{t("Quotations")}</h2>
          <p>{t("Customer quotes, validity tracking, and order conversion.")}</p>
        </div>
      </div>

      <div className="grid cols-4">
        <Metric label={t("Quotations count")} value={number(state.quotations.length)} hint={`${number(state.quotations.length)} ${t("records")}`} tone="info" />
        <Metric label={t("Quoted value")} value={compactMoney(quotedValue)} hint={t("Across all quotes")} />
        <Metric label={t("Approved value")} value={compactMoney(approvedValue)} hint={t("Approved quotes only")} tone="success" />
        <Metric label={t("Expiring soon")} value={number(expiringSoon)} hint={t("Valid within 14 days")} tone={expiringSoon > 0 ? "warning" : "success"} />
      </div>

      <div className="card">
        <div className="section-title">
          <h3>{editingId ? t("Edit quotation") : t("Add quotation")}</h3>
          <span className="chip info">{`${number(state.quotations.length)} ${t("records")}`}</span>
        </div>
        <div className="field-row">
          <div className="field">
            <label>{t("Number")}</label>
            <input value={form.number} onChange={(event) => setForm({ ...form, number: event.target.value })} />
          </div>
          <div className="field">
            <label>{t("Customer")}</label>
            <select value={form.customerId} onChange={(event) => setForm({ ...form, customerId: event.target.value })}>
              <option value="">{t("Select customer")}</option>
              {state.customers.map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.company}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>{t("Date")}</label>
            <input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
          </div>
          <div className="field">
            <label>{t("Valid until")}</label>
            <input type="date" value={form.validUntil} onChange={(event) => setForm({ ...form, validUntil: event.target.value })} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>{t("Status")}</label>
            <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Status })}>
              <option value="draft">{t("draft")}</option>
              <option value="sent">{t("sent")}</option>
              <option value="approved">{t("approved")}</option>
              <option value="expired">{t("expired")}</option>
              <option value="cancelled">{t("cancelled")}</option>
            </select>
          </div>
          <div className="field">
            <label>{t("Quoted value")}</label>
            <input readOnly value={money(quoteTotal(form.items))} />
          </div>
        </div>
        <div className="field">
          <label>{t("Notes")}</label>
          <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </div>

        <div className="section-title">
          <h3>{t("Line items")}</h3>
          <button className="small" type="button" onClick={addLine}>{t("Add item")}</button>
        </div>
        <div className="order-lines">
          {form.items.length === 0 && <div className="empty">{t("No line items yet.")}</div>}
          {form.items.map((item, index) => (
            <div className="line-row" key={index} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, alignItems: "end", marginBottom: 8 }}>
              <div className="field">
                <label>{t("Product")}</label>
                <select value={item.productId} onChange={(event) => selectProduct(index, event.target.value)}>
                  <option value="">{t("Select product")}</option>
                  {state.products.map((product) => (
                    <option key={product.id} value={product.id}>{product.name}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>{t("Quantity")}</label>
                <input type="number" min={0} value={item.quantity} onChange={(event) => updateLine(index, { quantity: Math.max(0, Number(event.target.value)) })} />
              </div>
              <div className="field">
                <label>{t("Unit price")}</label>
                <input type="number" min={0} value={item.unitPrice} onChange={(event) => updateLine(index, { unitPrice: Math.max(0, Number(event.target.value)) })} />
              </div>
              <div className="field">
                <label>{t("Discount %")}</label>
                <input type="number" min={0} max={100} value={item.discountPercent} onChange={(event) => updateLine(index, { discountPercent: Math.min(100, Math.max(0, Number(event.target.value))) })} />
              </div>
              <div className="field">
                <label>{t("Amount")}</label>
                <input readOnly value={money(lineAmount(item))} />
              </div>
              <div className="field">
                <button className="small" type="button" onClick={() => removeLine(index)}>{t("Remove")}</button>
              </div>
            </div>
          ))}
        </div>
        <div className="actions" style={{ marginTop: 8 }}>
          <button className="primary" type="button" onClick={saveQuote}>{editingId ? t("Save changes") : t("Add quotation")}</button>
          {editingId && <button type="button" onClick={cancelEdit}>{t("Cancel")}</button>}
          <span>{`${t("Total")}: ${money(quoteTotal(form.items))}`}</span>
        </div>
      </div>

      <div className="card">
        <div className="section-title">
          <h3>{t("Quotation history")}</h3>
          <span className="chip neutral">{t("Approved and valid quotes can be converted")}</span>
        </div>
        <div className="toolbar">
          <input placeholder={t("Search quotations...")} value={query} onChange={(event) => setQuery(event.target.value)} />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">{t("All statuses")}</option>
            <option value="draft">{t("draft")}</option>
            <option value="sent">{t("sent")}</option>
            <option value="approved">{t("approved")}</option>
            <option value="expired">{t("expired")}</option>
            <option value="cancelled">{t("cancelled")}</option>
          </select>
        </div>
        <div className="list">
          {filtered.length === 0 && <div className="empty">{t("No quotations found.")}</div>}
          {filtered.map((quote) => {
            const total = quoteTotal(quote.items);
            const days = daysUntil(quote.validUntil);
            return (
              <div className="row-card" key={quote.id}>
                <div className="row-top">
                  <div>
                    <h4>{quote.number}</h4>
                    <div className="meta">
                      <span>{customerName(quote.customerId)}</span>
                      <span>{`${t("Date")}: ${shortDate(quote.date)}`}</span>
                      <span>{`${t("Valid until")}: ${shortDate(quote.validUntil)}`}</span>
                    </div>
                  </div>
                  <div className="actions">
                    <StatusChip status={quote.status} label={t(quote.status)} />
                    <strong>{money(total)}</strong>
                  </div>
                </div>
                <div className="detail-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginTop: 12 }}>
                  <div className="detail-item"><span>{t("Line items")}</span><strong>{number(quote.items.length)}</strong></div>
                  <div className="detail-item"><span>{t("Quoted total")}</span><strong>{money(total)}</strong></div>
                  <div className="detail-item">
                    <span>{t("Validity")}</span>
                    <strong>{days === null ? "—" : `${number(days)} ${t("days")}`}</strong>
                  </div>
                </div>
                <div className="actions" style={{ marginTop: 12 }}>
                  <button className="small" type="button" onClick={() => patchQuote(quote, { status: "sent" })}>{t("Mark sent")}</button>
                  <button className="small" type="button" onClick={() => patchQuote(quote, { status: "approved" })}>{t("Mark approved")}</button>
                  <button className="small" type="button" onClick={() => patchQuote(quote, { status: "expired" })}>{t("Mark expired")}</button>
                  <button className="small" type="button" disabled={!canConvert(quote)} onClick={() => convertToOrder(quote)}>{t("Convert to order")}</button>
                  <button className="small" type="button" onClick={() => editQuote(quote)}>{t("Edit")}</button>
                  <button className="small" type="button" onClick={() => deleteQuote(quote)}>{t("Delete")}</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
