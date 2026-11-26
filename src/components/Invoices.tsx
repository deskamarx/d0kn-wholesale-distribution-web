import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { AppState, Invoice, Payment, Status } from "../types";
import { compactMoney, daysUntil, money, shortDate } from "../lib/format";
import { uid, upsert } from "../lib/store";
import { useLanguage } from "../i18n";
import { Metric, StatusChip } from "./Ui";

interface Props {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
}

const INVOICE_STATUSES: Status[] = ["draft", "sent", "partial", "paid", "overdue", "cancelled"];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function blankInvoice(customerId: string, orderId: string, currency: string): Invoice {
  const today = todayISO();
  return {
    id: "",
    number: "",
    customerId,
    orderId,
    issueDate: today,
    dueDate: today,
    amount: 0,
    paidAmount: 0,
    currency,
    status: "draft",
    notes: "",
  };
}

function resolveStatus(invoice: Invoice): Status {
  if (invoice.status === "cancelled") return "cancelled";
  const paid = Math.min(Math.max(invoice.paidAmount, 0), invoice.amount);
  if (invoice.amount > 0 && paid >= invoice.amount) return "paid";
  if (paid > 0) return "partial";
  const days = daysUntil(invoice.dueDate);
  if (days !== null && days < 0) return "overdue";
  return "sent";
}

function overdueDays(invoice: Invoice): number {
  if (["paid", "cancelled"].includes(invoice.status)) return 0;
  const days = daysUntil(invoice.dueDate);
  return days !== null && days < 0 ? Math.abs(days) : 0;
}

export default function Invoices({ state, setState }: Props) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState<Invoice>(() =>
    blankInvoice(state.customers[0]?.id ?? "", state.orders[0]?.id ?? "", state.company.defaultCurrency)
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [paymentAmounts, setPaymentAmounts] = useState<Record<string, string>>({});

  const resetForm = () => {
    setForm(blankInvoice(state.customers[0]?.id ?? "", state.orders[0]?.id ?? "", state.company.defaultCurrency));
    setEditingId(null);
  };

  const customerName = (id: string) => state.customers.find((entry) => entry.id === id)?.company ?? t("Unknown customer");
  const orderNumber = (id: string) => state.orders.find((entry) => entry.id === id)?.number ?? "—";

  const stats = useMemo(() => {
    const totalBilled = state.invoices.reduce((sum, invoice) => sum + invoice.amount, 0);
    const outstanding = state.invoices
      .filter((invoice) => !["paid", "cancelled"].includes(invoice.status))
      .reduce((sum, invoice) => sum + Math.max(0, invoice.amount - invoice.paidAmount), 0);
    return {
      count: state.invoices.length,
      totalBilled,
      outstanding,
      overdueCount: state.invoices.filter((invoice) => overdueDays(invoice) > 0).length,
    };
  }, [state.invoices]);

  const filteredInvoices = useMemo(() => {
    const term = query.trim().toLowerCase();
    return state.invoices
      .filter((invoice) => statusFilter === "all" || invoice.status === statusFilter)
      .filter((invoice) => {
        if (!term) return true;
        const customer = state.customers.find((entry) => entry.id === invoice.customerId)?.company ?? "";
        const order = state.orders.find((entry) => entry.id === invoice.orderId)?.number ?? "";
        return [invoice.number, customer, order, invoice.notes].join(" ").toLowerCase().includes(term);
      })
      .sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.number.localeCompare(a.number));
  }, [state.invoices, state.customers, state.orders, query, statusFilter]);

  const saveInvoice = () => {
    if (!form.number.trim() || !form.customerId || form.amount <= 0) return;
    const paidAmount = form.status === "paid" ? form.amount : Math.min(Math.max(form.paidAmount, 0), form.amount);
    const next: Invoice = {
      ...form,
      id: editingId ?? uid("INV"),
      number: form.number.trim(),
      paidAmount,
      notes: form.notes.trim(),
    };
    next.status = resolveStatus(next);
    setState((prev) => ({ ...prev, invoices: upsert(prev.invoices, next) }));
    resetForm();
  };

  const startEdit = (invoice: Invoice) => {
    setForm({ ...invoice });
    setEditingId(invoice.id);
    setPendingDeleteId(null);
  };

  const deleteInvoice = (id: string) => {
    setState((prev) => ({ ...prev, invoices: prev.invoices.filter((invoice) => invoice.id !== id) }));
    setPendingDeleteId(null);
    if (editingId === id) resetForm();
  };

  const recordPayment = (invoice: Invoice) => {
    const balance = Math.max(0, invoice.amount - invoice.paidAmount);
    const raw = paymentAmounts[invoice.id] ?? String(balance);
    const amount = Math.min(Math.max(Number(raw) || 0, 0), balance);
    if (amount <= 0) return;
    const payment: Payment = {
      id: uid("PAY"),
      invoiceId: invoice.id,
      date: todayISO(),
      amount,
      method: "Bank transfer",
      reference: `QUICK-${uid("Q").slice(-6)}`,
      status: "completed",
      notes: t("Quick payment recorded against {number}.", { number: invoice.number }),
    };
    const updated: Invoice = { ...invoice, paidAmount: Math.min(invoice.amount, invoice.paidAmount + amount) };
    updated.status = resolveStatus(updated);
    setState((prev) => ({
      ...prev,
      payments: [payment, ...prev.payments],
      invoices: prev.invoices.map((entry) => (entry.id === invoice.id ? updated : entry)),
    }));
    const remaining = Math.max(0, updated.amount - updated.paidAmount);
    setPaymentAmounts((prev) => ({ ...prev, [invoice.id]: remaining > 0 ? String(remaining) : "" }));
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h2>{t("Invoices")}</h2>
          <p>{t("Issue customer invoices, track balances, and record incoming payments.")}</p>
        </div>
        <button className="primary" type="button" onClick={resetForm}>{t("Add invoice")}</button>
      </div>

      <div className="grid cols-4">
        <Metric label={t("Invoice count")} value={stats.count} hint={t("Total documents on file")} />
        <Metric label={t("Total billed")} value={compactMoney(stats.totalBilled, state.company.defaultCurrency)} hint={t("Across all invoices")} tone="info" />
        <Metric label={t("Outstanding")} value={compactMoney(stats.outstanding, state.company.defaultCurrency)} hint={t("Unpaid, non-cancelled balance")} tone="warning" />
        <Metric label={t("Overdue count")} value={stats.overdueCount} hint={t("Past due and still open")} tone="danger" />
      </div>

      <div className="card">
        <div className="section-title">
          <h3>{editingId ? t("Edit invoice") : t("New invoice")}</h3>
          {editingId && <span className="muted-text">{t("Editing")} {form.number}</span>}
        </div>
        <div className="field-row">
          <div className="field">
            <label>{t("Invoice number")}</label>
            <input aria-label={t("Invoice number")} value={form.number} onChange={(event) => setForm({ ...form, number: event.target.value })} placeholder={t("INV-2026-089")} />
          </div>
          <div className="field">
            <label>{t("Customer")}</label>
            <select aria-label={t("Customer")} value={form.customerId} onChange={(event) => setForm({ ...form, customerId: event.target.value })}>
              {state.customers.map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.company}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>{t("Linked order")}</label>
            <select aria-label={t("Linked order")} value={form.orderId} onChange={(event) => setForm({ ...form, orderId: event.target.value })}>
              <option value="">{t("No linked order")}</option>
              {state.orders.map((order) => (
                <option key={order.id} value={order.id}>{order.number}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t("Currency")}</label>
            <input aria-label={t("Currency")} value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} maxLength={3} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>{t("Issue date")}</label>
            <input aria-label={t("Issue date")} type="date" value={form.issueDate} onChange={(event) => setForm({ ...form, issueDate: event.target.value })} />
          </div>
          <div className="field">
            <label>{t("Due date")}</label>
            <input aria-label={t("Due date")} type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>{t("Amount")}</label>
            <input aria-label={t("Amount")} type="number" min={0} step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: Number(event.target.value) })} />
          </div>
          <div className="field">
            <label>{t("Paid amount")}</label>
            <input aria-label={t("Paid amount")} type="number" min={0} step="0.01" value={form.paidAmount} onChange={(event) => setForm({ ...form, paidAmount: Number(event.target.value) })} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>{t("Status")}</label>
            <select aria-label={t("Status")} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Status })}>
              {INVOICE_STATUSES.map((status) => (
                <option key={status} value={status}>{t(status)}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t("Balance")}</label>
            <input aria-label={t("Balance")} readOnly value={money(Math.max(0, form.amount - form.paidAmount), form.currency)} />
          </div>
        </div>
        <div className="field">
          <label>{t("Notes")}</label>
          <textarea aria-label={t("Notes")} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder={t("Payment terms, reminders, or settlement details")} />
        </div>
        <div className="actions">
          <button className="primary" type="button" onClick={saveInvoice}>{editingId ? t("Save changes") : t("Add invoice")}</button>
          {editingId && <button type="button" onClick={resetForm}>{t("Cancel")}</button>}
        </div>
      </div>

      <div className="card">
        <div className="section-title">
          <h3>{t("Invoice register")}</h3>
          <span className="muted-text">{filteredInvoices.length} / {state.invoices.length} {t("Invoices")}</span>
        </div>
        <div className="toolbar">
          <input aria-label={t("Search invoices, customers, orders...")} placeholder={t("Search invoices, customers, orders...")} value={query} onChange={(event) => setQuery(event.target.value)} />
          <select aria-label={t("Status")} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">{t("All statuses")}</option>
            {INVOICE_STATUSES.map((status) => (
              <option key={status} value={status}>{t(status)}</option>
            ))}
          </select>
        </div>
        <div className="list">
          {filteredInvoices.length === 0 && <div className="empty">{t("No invoices match the current filter.")}</div>}
          {filteredInvoices.map((invoice) => {
            const balance = Math.max(0, invoice.amount - invoice.paidAmount);
            const daysOverdue = overdueDays(invoice);
            return (
              <div className="row-card" key={invoice.id}>
                <div className="row-top">
                  <div>
                    <h4>{invoice.number}</h4>
                    <div className="meta">
                      <span>{customerName(invoice.customerId)}</span>
                      <span>{t("Order")} {orderNumber(invoice.orderId)}</span>
                      <span>{t("Issued")} {shortDate(invoice.issueDate)}</span>
                      <span>{t("Due")} {shortDate(invoice.dueDate)}</span>
                    </div>
                  </div>
                  <div className="actions">
                    <StatusChip status={invoice.status} label={t(invoice.status)} />
                    {daysOverdue > 0 && <span className="chip danger">{t("{days}d overdue", { days: daysOverdue })}</span>}
                    {pendingDeleteId === invoice.id ? (
                      <>
                        <span className="chip danger">{t("Delete invoice?")}</span>
                        <button className="small" type="button" onClick={() => deleteInvoice(invoice.id)}>{t("Confirm delete")}</button>
                        <button className="small" type="button" onClick={() => setPendingDeleteId(null)}>{t("Cancel")}</button>
                      </>
                    ) : (
                      <>
                        <button className="small" type="button" onClick={() => startEdit(invoice)}>{t("Edit")}</button>
                        <button className="small" type="button" onClick={() => setPendingDeleteId(invoice.id)}>{t("Delete")}</button>
                      </>
                    )}
                  </div>
                </div>
                <div className="meta mt-1">
                  <span>{t("Billed")} <strong>{money(invoice.amount, invoice.currency)}</strong></span>
                  <span>{t("Paid")} <strong>{money(invoice.paidAmount, invoice.currency)}</strong></span>
                  <span>{t("Balance")} <strong>{money(balance, invoice.currency)}</strong></span>
                </div>
                {invoice.notes && <p className="muted-text mt-2 mb-0">{invoice.notes}</p>}
                {balance > 0 && invoice.status !== "cancelled" && (
                  <div className="actions mt-2 align-end">
                    <div className="field mb-0 max-190">
                      <label>{t("Payment amount")}</label>
                      <input aria-label={t("Payment amount")}
                        type="number"
                        min={0}
                        max={balance}
                        step="0.01"
                        value={paymentAmounts[invoice.id] ?? String(balance)}
                        onChange={(event) => setPaymentAmounts((prev) => ({ ...prev, [invoice.id]: event.target.value }))}
                      />
                    </div>
                    <button className="small primary" type="button" onClick={() => recordPayment(invoice)}>{t("Record payment")}</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
