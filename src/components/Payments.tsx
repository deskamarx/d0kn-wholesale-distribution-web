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

const PAYMENT_STATUSES: Status[] = ["pending", "completed", "cancelled"];
const STANDARD_METHODS = ["Bank transfer", "Wise", "Cheque", "Cash", "Credit card"];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function blankPayment(invoiceId: string): Payment {
  return {
    id: "",
    invoiceId,
    date: todayISO(),
    amount: 0,
    method: STANDARD_METHODS[0],
    reference: "",
    status: "completed",
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

function applyPaymentDelta(invoices: Invoice[], payment: Payment | undefined, sign: number): Invoice[] {
  if (!payment || payment.status !== "completed" || payment.amount <= 0 || !payment.invoiceId) return invoices;
  return invoices.map((invoice) => {
    if (invoice.id !== payment.invoiceId) return invoice;
    const paidAmount = Math.min(invoice.amount, Math.max(0, invoice.paidAmount + sign * payment.amount));
    const updated: Invoice = { ...invoice, paidAmount };
    updated.status = resolveStatus(updated);
    return updated;
  });
}

export default function Payments({ state, setState }: Props) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [form, setForm] = useState<Payment>(() => blankPayment(state.invoices[0]?.id ?? ""));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const resetForm = () => {
    setForm(blankPayment(state.invoices[0]?.id ?? ""));
    setEditingId(null);
  };

  const invoiceFor = (id: string) => state.invoices.find((entry) => entry.id === id);
  const invoiceNumber = (id: string) => invoiceFor(id)?.number ?? "—";
  const currencyFor = (id: string) => invoiceFor(id)?.currency ?? state.company.defaultCurrency;

  const methods = useMemo(
    () => Array.from(new Set([...STANDARD_METHODS, ...state.payments.map((payment) => payment.method).filter(Boolean)])),
    [state.payments]
  );

  const stats = useMemo(() => {
    const totalReceived = state.payments
      .filter((payment) => payment.status === "completed")
      .reduce((sum, payment) => sum + payment.amount, 0);
    const pendingAmount = state.payments
      .filter((payment) => payment.status === "pending")
      .reduce((sum, payment) => sum + payment.amount, 0);
    const methodsCount = new Set(state.payments.map((payment) => payment.method).filter(Boolean)).size;
    return { count: state.payments.length, totalReceived, pendingAmount, methodsCount };
  }, [state.payments]);

  const filteredPayments = useMemo(() => {
    const term = query.trim().toLowerCase();
    return state.payments
      .filter((payment) => statusFilter === "all" || payment.status === statusFilter)
      .filter((payment) => methodFilter === "all" || payment.method === methodFilter)
      .filter((payment) => {
        if (!term) return true;
        const invoice = state.invoices.find((entry) => entry.id === payment.invoiceId);
        const customer = state.customers.find((entry) => entry.id === invoice?.customerId)?.company ?? "";
        return [invoice?.number ?? "", customer, payment.method, payment.reference, payment.notes]
          .join(" ")
          .toLowerCase()
          .includes(term);
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  }, [state.payments, state.invoices, state.customers, query, statusFilter, methodFilter]);

  const savePayment = () => {
    if (!form.invoiceId || form.amount <= 0) return;
    const next: Payment = {
      ...form,
      id: editingId ?? uid("PAY"),
      amount: Math.max(form.amount, 0),
      reference: form.reference.trim(),
      notes: form.notes.trim(),
    };
    setState((prev) => {
      const previous = editingId ? prev.payments.find((payment) => payment.id === editingId) : undefined;
      const invoices = applyPaymentDelta(
        applyPaymentDelta(prev.invoices, previous, -1),
        next,
        1
      );
      return { ...prev, payments: upsert(prev.payments, next), invoices };
    });
    resetForm();
  };

  const startEdit = (payment: Payment) => {
    setForm({ ...payment });
    setEditingId(payment.id);
    setPendingDeleteId(null);
  };

  const deletePayment = (id: string) => {
    setState((prev) => {
      const payment = prev.payments.find((entry) => entry.id === id);
      return {
        ...prev,
        payments: prev.payments.filter((entry) => entry.id !== id),
        invoices: applyPaymentDelta(prev.invoices, payment, -1),
      };
    });
    setPendingDeleteId(null);
    if (editingId === id) resetForm();
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h2>{t("Payments")}</h2>
          <p>{t("Record and reconcile customer receipts against invoices.")}</p>
        </div>
        <button className="primary" type="button" onClick={resetForm}>{t("New payment")}</button>
      </div>

      <div className="grid cols-4">
        <Metric label={t("Payments count")} value={stats.count} hint={t("All payment records")} />
        <Metric label={t("Total received")} value={compactMoney(stats.totalReceived, state.company.defaultCurrency)} hint={t("Completed receipts")} tone="success" />
        <Metric label={t("Pending amount")} value={compactMoney(stats.pendingAmount, state.company.defaultCurrency)} hint={t("Awaiting clearance")} tone="warning" />
        <Metric label={t("Methods count")} value={stats.methodsCount} hint={t("Distinct payment methods")} tone="info" />
      </div>

      <div className="card">
        <div className="section-title">
          <h3>{editingId ? t("Edit payment") : t("New payment")}</h3>
          {editingId && <span className="muted-text">{t("Editing")} {form.reference || form.id}</span>}
        </div>
        <div className="field-row">
          <div className="field">
            <label>{t("Invoice")}</label>
            <select value={form.invoiceId} onChange={(event) => setForm({ ...form, invoiceId: event.target.value })}>
              <option value="">{t("Select invoice")}</option>
              {state.invoices.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>{invoice.number}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t("Date")}</label>
            <input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>{t("Amount")}</label>
            <input type="number" min={0} step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: Number(event.target.value) })} />
          </div>
          <div className="field">
            <label>{t("Method")}</label>
            <select value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value })}>
              {methods.map((method) => (
                <option key={method} value={method}>{method}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>{t("Reference")}</label>
            <input value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} placeholder={t("TXN-00000")} />
          </div>
          <div className="field">
            <label>{t("Status")}</label>
            <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Status })}>
              {PAYMENT_STATUSES.map((status) => (
                <option key={status} value={status}>{t(status)}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label>{t("Notes")}</label>
          <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder={t("Payment terms, reminders, or settlement details")} />
        </div>
        <div className="actions">
          <button className="primary" type="button" onClick={savePayment}>{editingId ? t("Save changes") : t("Add payment")}</button>
          {editingId && <button type="button" onClick={resetForm}>{t("Cancel")}</button>}
        </div>
      </div>

      <div className="card">
        <div className="section-title">
          <h3>{t("Payment register")}</h3>
          <span className="muted-text">{filteredPayments.length} / {state.payments.length} {t("Payments")}</span>
        </div>
        <div className="toolbar">
          <input placeholder={t("Search payments, invoices, references...")} value={query} onChange={(event) => setQuery(event.target.value)} />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">{t("All statuses")}</option>
            {PAYMENT_STATUSES.map((status) => (
              <option key={status} value={status}>{t(status)}</option>
            ))}
          </select>
          <select value={methodFilter} onChange={(event) => setMethodFilter(event.target.value)}>
            <option value="all">{t("All methods")}</option>
            {methods.map((method) => (
              <option key={method} value={method}>{method}</option>
            ))}
          </select>
        </div>
        <div className="list">
          {filteredPayments.length === 0 && <div className="empty">{t("No payments match the current filter.")}</div>}
          {filteredPayments.map((payment) => {
            const invoice = invoiceFor(payment.invoiceId);
            const customer = state.customers.find((entry) => entry.id === invoice?.customerId)?.company ?? t("Unknown customer");
            return (
              <div className="row-card" key={payment.id}>
                <div className="row-top">
                  <div>
                    <h4>{invoiceNumber(payment.invoiceId)} · {money(payment.amount, currencyFor(payment.invoiceId))}</h4>
                    <div className="meta">
                      <span>{customer}</span>
                      <span>{shortDate(payment.date)}</span>
                      <span>{payment.method}</span>
                      <span>{payment.reference || t("No reference")}</span>
                    </div>
                  </div>
                  <div className="actions">
                    <StatusChip status={payment.status} label={t(payment.status)} />
                    {pendingDeleteId === payment.id ? (
                      <>
                        <span className="chip danger">{t("Delete payment?")}</span>
                        <button className="small" type="button" onClick={() => deletePayment(payment.id)}>{t("Confirm delete")}</button>
                        <button className="small" type="button" onClick={() => setPendingDeleteId(null)}>{t("Cancel")}</button>
                      </>
                    ) : (
                      <>
                        <button className="small" type="button" onClick={() => startEdit(payment)}>{t("Edit")}</button>
                        <button className="small" type="button" onClick={() => setPendingDeleteId(payment.id)}>{t("Delete")}</button>
                      </>
                    )}
                  </div>
                </div>
                {payment.notes && <p className="muted-text" style={{ marginTop: 10, marginBottom: 0 }}>{payment.notes}</p>}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
