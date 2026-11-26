import { useMemo, useState } from "react";
import type { ComplianceRecord, Invoice, Payment } from "../../types";
import type { DateRangeKey } from "../../lib/preferences";
import { DATE_RANGE_OPTIONS } from "../../lib/preferences";
import type { DateRange } from "../../lib/period";
import { filterInRange, percentageChange, resolveRange } from "../../lib/period";
import {
  getExpiringCompliance,
  getHighRiskShipments,
  getImportTotals,
  getInsights,
  getLowStock,
  getOrderTotal,
  getOutstanding,
  getRevenue,
  getSupplierScore,
  lineAmount,
} from "../../lib/intelligence";
import { compactMoney, daysUntil, money, number, shortDate } from "../../lib/format";
import { parseBankStatement, type BankRow } from "../../lib/imports";
import { nextId, updateExtras, type RenewalRule } from "../../lib/extras";
import { removeById, uid, updateById, upsert } from "../../lib/store";
import { useLanguage } from "../../i18n";
import { useToast } from "../Feedback";
import RecordExplorer, { type ExplorerColumn, type ExplorerConfig } from "./RecordExplorer";
import {
  Field,
  Phase2Panel,
  Pill,
  RecordRows,
  RowLine,
  StatStrip,
  Toolbar,
  openRecord,
  voiceSummary,
} from "./Phase2Ui";
import type { Phase2Props } from "./Phase2Ui";

type Translator = (key: string, vars?: Record<string, string | number>) => string;
type ToastTone = "info" | "success" | "danger";

const INVOICE_STATUSES = ["draft", "sent", "partial", "paid", "overdue", "cancelled"];
const PAYMENT_STATUSES = ["pending", "completed", "cancelled"];
const COMPLIANCE_STATUSES = ["active", "pending", "approved", "expired", "blocked", "cancelled"];
const COMPLIANCE_TYPES = ["customs", "import-licence", "certificate", "insurance", "quality-audit", "contract"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const ENTITY_MODULES: Record<string, string> = {
  product: "products",
  products: "products",
  supplier: "suppliers",
  suppliers: "suppliers",
  import: "imports",
  imports: "imports",
  shipment: "shipments",
  shipments: "shipments",
  customer: "customers",
  customers: "customers",
  order: "orders",
  orders: "orders",
  invoice: "invoices",
  invoices: "invoices",
  payment: "payments",
  payments: "payments",
  warehouse: "warehouse",
  warehouses: "warehouse",
};

const RANGE_LABELS: Record<DateRangeKey, string> = {
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "this-month": "This month",
  "last-month": "Last month",
  quarter: "This quarter",
  all: "All time",
};

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function today(): string {
  return isoDate(new Date());
}

function addMonths(value: string, months: number): string {
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return today();
  date.setMonth(date.getMonth() + months);
  return isoDate(date);
}

function statusText(value: string, t: Translator): string {
  return t(value.replace(/_/g, " "));
}

function outstandingBalance(invoice: Invoice): number {
  return Math.max(0, invoice.amount - invoice.paidAmount);
}

function entityModule(record: ComplianceRecord): string {
  const key = record.entityType.trim().toLowerCase();
  return ENTITY_MODULES[key] ?? key ?? "compliance";
}

function compareHint(t: Translator, current: number, previous: number, enabled: boolean): string | undefined {
  if (!enabled) return undefined;
  const change = percentageChange(current, previous);
  if (change === null) return t("No prior period data");
  return `${change >= 0 ? "+" : ""}${Math.round(change)}% ${t("vs previous period")}`;
}

function severityTone(severity: string): "info" | "success" | "warning" | "danger" {
  if (severity === "critical") return "danger";
  if (severity === "warning") return "warning";
  if (severity === "opportunity") return "success";
  return "info";
}

function matchPaymentId(row: BankRow, state: Phase2Props["state"]): string {
  const reference = row.reference.trim().toLowerCase();
  const exact = state.payments.find(
    (payment) =>
      payment.reference.trim().toLowerCase() === reference && Math.abs(payment.amount - row.amount) < 0.005
  );
  if (exact) return exact.id;
  const byInvoiceNumber = state.payments.find((payment) => {
    const invoice = state.invoices.find((entry) => entry.id === payment.invoiceId);
    return (
      Boolean(invoice) &&
      invoice!.number.trim().toLowerCase() === reference &&
      Math.abs(payment.amount - row.amount) < 0.005
    );
  });
  return byInvoiceNumber?.id ?? "";
}

function bankRowKey(row: { date: string; reference: string; amount: number }): string {
  return `${row.date}|${row.reference.trim().toLowerCase()}|${row.amount.toFixed(2)}`;
}

/** Shared allocation editor: writes straight to extras.paymentAllocations by invoice id. */
function AllocationPanel({
  state,
  setState,
  invoiceId,
  onInvoiceChange,
}: {
  state: Phase2Props["state"];
  setState: Phase2Props["setState"];
  invoiceId: string;
  onInvoiceChange: (id: string) => void;
}) {
  const { t } = useLanguage();
  const { notify } = useToast();
  const invoice = state.invoices.find((entry) => entry.id === invoiceId);
  const order = state.orders.find((entry) => entry.id === invoice?.orderId);
  const lines = invoice
    ? order && order.items.length > 0
      ? order.items.map((item) => ({
          key: item.productId,
          label: state.products.find((product) => product.id === item.productId)?.name ?? item.productId,
          amount: lineAmount(item),
        }))
      : [{ key: "total", label: t("Invoice total"), amount: invoice.amount }]
    : [];
  const allocations = invoice ? state.extras.paymentAllocations[invoice.id] ?? [] : [];
  const allocated = allocations
    .slice(0, lines.length)
    .reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
  const remaining = (invoice?.amount ?? 0) - allocated;

  const writeAllocation = (index: number, value: number) => {
    if (!invoice) return;
    updateExtras(setState, (extras) => {
      const next = [...(extras.paymentAllocations[invoice.id] ?? [])];
      while (next.length < lines.length) next.push(0);
      next[index] = Math.max(0, Number.isFinite(value) ? value : 0);
      return { ...extras, paymentAllocations: { ...extras.paymentAllocations, [invoice.id]: next } };
    });
  };

  return (
    <Phase2Panel
      title={t("Payment allocation")}
      description={t("Allocate received amounts to invoice lines. Values stay in this browser.")}
    >
      <Toolbar>
        <Field label={t("Invoice")}>
          <select
            value={invoice?.id ?? ""}
            onChange={(event) => onInvoiceChange(event.target.value)}
            aria-label={t("Invoice")}
          >
            <option value="">{t("Select an invoice")}</option>
            {state.invoices.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.number} · {money(outstandingBalance(entry))}
              </option>
            ))}
          </select>
        </Field>
        <Pill tone={Math.abs(remaining) < 0.005 ? "success" : "warning"}>
          {t("Allocated {amount} of {total}", {
            amount: money(allocated),
            total: money(invoice?.amount ?? 0),
          })}
        </Pill>
        <button
          type="button"
          className="small"
          onClick={() => {
            if (!invoice) {
              notify(t("Select an invoice first."), { tone: "warning" as ToastTone });
              return;
            }
            if (Math.abs(remaining) < 0.005) {
              notify(t("Allocation matches the invoice total."), { tone: "success" as ToastTone });
            } else {
              notify(t("Remaining to allocate: {amount}", { amount: money(remaining) }), {
                tone: "warning" as ToastTone,
              });
            }
          }}
        >
          {t("Verify allocation")}
        </button>
      </Toolbar>
      <RecordRows rows={lines} empty={t("No invoice lines available.")}>
        {lines.map((line, index) => (
          <RowLine
            key={line.key}
            title={line.label}
            meta={`${t("Line")} ${index + 1} · ${money(line.amount)}`}
            trailing={
              <input
                className="inline-edit"
                type="number"
                min={0}
                step="0.01"
                value={allocations[index] ?? 0}
                aria-label={`${t("Allocation")} ${line.label}`}
                onChange={(event) => writeAllocation(index, Number(event.target.value))}
              />
            }
          />
        ))}
      </RecordRows>
    </Phase2Panel>
  );
}

function InvoicesTools(props: Phase2Props) {
  const { state, setState, setTab, focusRecord } = props;
  const { t } = useLanguage();
  const { notify } = useToast();
  const [customerId, setCustomerId] = useState(state.customers[0]?.id ?? "");
  const [amount, setAmount] = useState(0);
  const [frequency, setFrequency] = useState<"monthly" | "quarterly">("monthly");
  const [nextDate, setNextDate] = useState(today());
  const [note, setNote] = useState("");
  const [editingTemplateId, setEditingTemplateId] = useState("");
  const [allocationId, setAllocationId] = useState(state.invoices[0]?.id ?? "");

  const resetTemplateForm = () => {
    setCustomerId(state.customers[0]?.id ?? "");
    setAmount(0);
    setFrequency("monthly");
    setNextDate(today());
    setNote("");
    setEditingTemplateId("");
  };

  const saveTemplate = () => {
    if (!customerId || amount <= 0 || !nextDate) {
      notify(t("Customer, amount and next date are required."), { tone: "warning" as ToastTone });
      return;
    }
    if (editingTemplateId) {
      updateExtras(setState, (extras) => ({
        ...extras,
        recurringInvoices: updateById(extras.recurringInvoices, editingTemplateId, {
          customerId,
          amount,
          frequency,
          nextDate,
          note,
        }),
      }));
      notify(t("Recurring invoice updated"), { tone: "success" as ToastTone });
    } else {
      updateExtras(setState, (extras) => ({
        ...extras,
        recurringInvoices: [
          {
            id: nextId("RINV", extras.recurringInvoices),
            customerId,
            amount,
            frequency,
            nextDate,
            note,
          },
          ...extras.recurringInvoices,
        ],
      }));
      notify(t("Recurring invoice added"), { tone: "success" as ToastTone });
    }
    resetTemplateForm();
  };

  const editTemplate = (id: string) => {
    const template = state.extras.recurringInvoices.find((entry) => entry.id === id);
    if (!template) return;
    setCustomerId(template.customerId);
    setAmount(template.amount);
    setFrequency(template.frequency);
    setNextDate(template.nextDate);
    setNote(template.note);
    setEditingTemplateId(template.id);
  };

  const deleteTemplate = (id: string) => {
    if (!window.confirm(t("Delete this recurring invoice template?"))) return;
    updateExtras(setState, (extras) => ({
      ...extras,
      recurringInvoices: extras.recurringInvoices.filter((entry) => entry.id !== id),
    }));
    if (editingTemplateId === id) resetTemplateForm();
    notify(t("Recurring invoice deleted"), { tone: "success" as ToastTone });
  };

  const generateInvoice = (templateId: string) => {
    const template = state.extras.recurringInvoices.find((entry) => entry.id === templateId);
    if (!template) return;
    const issueDate = today();
    const id = uid("INV");
    const invoice: Invoice = {
      id,
      number: `INV-${issueDate.slice(0, 7).replace("-", "")}-${id.slice(-4)}`,
      customerId: template.customerId,
      orderId: "",
      issueDate,
      dueDate: addMonths(issueDate, 1),
      amount: template.amount,
      paidAmount: 0,
      currency: state.company.defaultCurrency || "USD",
      status: "draft",
      notes: template.note,
    };
    setState((previous) => ({ ...previous, invoices: [invoice, ...previous.invoices] }));
    updateExtras(setState, (extras) => ({
      ...extras,
      recurringInvoices: updateById(extras.recurringInvoices, templateId, {
        nextDate: addMonths(template.nextDate, template.frequency === "monthly" ? 1 : 3),
      }),
    }));
    notify(t("Draft invoice created from template"), { tone: "success" as ToastTone });
  };

  const patchInvoice = (id: string, patch: Record<string, unknown>) => {
    setState((previous) => ({
      ...previous,
      invoices: updateById(previous.invoices, id, patch as Partial<Invoice>),
    }));
  };

  const deleteInvoices = (ids: string[]) => {
    setState((previous) => ({
      ...previous,
      invoices: ids.reduce((items, id) => removeById(items, id), previous.invoices),
    }));
  };

  const restoreInvoices = (rows: Invoice[]) => {
    setState((previous) => ({
      ...previous,
      invoices: rows.reduce((items, row) => upsert(items, row), previous.invoices),
    }));
  };

  const columns: ExplorerColumn<Invoice>[] = [
    {
      key: "number",
      label: t("Invoice number"),
      value: (row) => row.number,
      editable: "text",
      link: { module: "customers", id: (row) => row.customerId },
    },
    {
      key: "customerId",
      label: t("Customer"),
      value: (row) => state.customers.find((entry) => entry.id === row.customerId)?.company ?? row.customerId,
      render: (row) => (
        <button
          type="button"
          className="link-button mini"
          onClick={() => openRecord("customers", row.customerId, setTab)}
        >
          {state.customers.find((entry) => entry.id === row.customerId)?.company ?? row.customerId}
        </button>
      ),
    },
    {
      key: "orderId",
      label: t("Linked order"),
      value: (row) => row.orderId,
      render: (row) =>
        row.orderId ? (
          <button type="button" className="link-button mini" onClick={() => openRecord("orders", row.orderId, setTab)}>
            {row.orderId}
          </button>
        ) : (
          <span className="muted-text">{t("No linked order")}</span>
        ),
    },
    { key: "issueDate", label: t("Issue date"), value: (row) => row.issueDate, render: (row) => shortDate(row.issueDate) },
    { key: "dueDate", label: t("Due date"), value: (row) => row.dueDate, render: (row) => shortDate(row.dueDate) },
    {
      key: "amount",
      label: t("Amount"),
      value: (row) => row.amount,
      render: (row) => money(row.amount),
      editable: "number",
    },
    {
      key: "paidAmount",
      label: t("Paid amount"),
      value: (row) => row.paidAmount,
      render: (row) => money(row.paidAmount),
      editable: "number",
    },
    {
      key: "status",
      label: t("Status"),
      value: (row) => statusText(row.status, t),
      editable: "select",
      options: INVOICE_STATUSES,
    },
  ];

  const config: ExplorerConfig<Invoice> = {
    module: "invoices",
    title: t("Invoices"),
    description: t("Issue customer invoices, track balances, and record incoming payments."),
    rows: state.invoices,
    columns,
    id: (row) => row.id,
    statusKey: "status",
    statusOptions: INVOICE_STATUSES,
    primaryLabel: (row) => row.number,
    onPatch: patchInvoice,
    onDelete: deleteInvoices,
    onRestore: restoreInvoices,
    setTab,
  };

  return (
    <>
      <Toolbar>
        <button type="button" className="summary-voice-action" onClick={() => voiceSummary("invoices")}>
          {t("Voice summary")}
        </button>
        <Pill tone="info">{t("{count} invoices", { count: state.invoices.length })}</Pill>
      </Toolbar>
      <div className="grid cols-2">
        <Phase2Panel
          title={t("Recurring invoices")}
          description={t("Templates create draft invoices without leaving this workspace.")}
        >
          <div className="field-row">
            <Field label={t("Customer")}>
              <select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
                <option value="">{t("Select a customer")}</option>
                {state.customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.company}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("Amount")}>
              <input
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(Number(event.target.value))}
              />
            </Field>
          </div>
          <div className="field-row">
            <Field label={t("Frequency")}>
              <select
                value={frequency}
                onChange={(event) => setFrequency(event.target.value as "monthly" | "quarterly")}
              >
                <option value="monthly">{t("Monthly")}</option>
                <option value="quarterly">{t("Quarterly")}</option>
              </select>
            </Field>
            <Field label={t("Next date")}>
              <input type="date" value={nextDate} onChange={(event) => setNextDate(event.target.value)} />
            </Field>
          </div>
          <Field label={t("Note")}>
            <input type="text" value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
          <div className="actions">
            <button type="button" className="primary" onClick={saveTemplate}>
              {editingTemplateId ? t("Save changes") : t("Add template")}
            </button>
            {editingTemplateId && (
              <button type="button" onClick={resetTemplateForm}>
                {t("Cancel")}
              </button>
            )}
          </div>
          <RecordRows rows={state.extras.recurringInvoices} empty={t("No recurring templates yet.")}>
            {state.extras.recurringInvoices.map((template) => (
              <RowLine
                key={template.id}
                title={`${state.customers.find((entry) => entry.id === template.customerId)?.company ?? template.customerId} · ${money(template.amount)}`}
                meta={`${t(template.frequency)} · ${t("Next")} ${shortDate(template.nextDate)}${template.note ? ` · ${template.note}` : ""}`}
                trailing={
                  <div className="actions">
                    <button type="button" className="small primary" onClick={() => generateInvoice(template.id)}>
                      {t("Generate now")}
                    </button>
                    <button type="button" className="small" onClick={() => editTemplate(template.id)}>
                      {t("Edit")}
                    </button>
                    <button type="button" className="small" onClick={() => deleteTemplate(template.id)}>
                      {t("Delete")}
                    </button>
                  </div>
                }
              />
            ))}
          </RecordRows>
        </Phase2Panel>
        <AllocationPanel
          state={state}
          setState={setState}
          invoiceId={allocationId}
          onInvoiceChange={setAllocationId}
        />
      </div>
      <RecordExplorer
        config={config}
        state={state}
        setState={setState}
        preferences={props.preferences}
        setPreferences={props.setPreferences}
        focusRecord={focusRecord}
      />
    </>
  );
}

function PaymentsTools(props: Phase2Props) {
  const { state, setState, setTab, focusRecord } = props;
  const { t } = useLanguage();
  const { notify } = useToast();
  const [statement, setStatement] = useState("");
  const [bankInvoiceChoice, setBankInvoiceChoice] = useState<Record<string, string>>({});
  const [allocationId, setAllocationId] = useState(state.invoices[0]?.id ?? "");
  const parsed = useMemo(() => parseBankStatement(statement), [statement]);
  const openInvoices = state.invoices.filter((invoice) => !["paid", "cancelled"].includes(invoice.status));
  const bankRows = state.extras.bankPayments;
  const unmatched = bankRows.filter((row) => !row.matchedPaymentId);
  const matched = bankRows.filter((row) => Boolean(row.matchedPaymentId));

  const importStatement = () => {
    const rows = parseBankStatement(statement);
    if (rows.length === 0) {
      notify(t("No bank rows found. Check the pasted columns."), { tone: "warning" as ToastTone });
      return;
    }
    const knownKeys = new Set(state.extras.bankPayments.map((row) => bankRowKey(row)));
    const duplicates = rows.filter((row) => knownKeys.has(bankRowKey(row))).length;
    const matchedCount = rows.filter((row) => Boolean(matchPaymentId(row, state))).length;
    updateExtras(setState, (extras) => {
      const seen = new Set(extras.bankPayments.map((row) => bankRowKey(row)));
      const additions = rows
        .filter((row) => !seen.has(bankRowKey(row)))
        .map((row) => ({
          id: uid("BANK"),
          date: row.date,
          reference: row.reference,
          amount: row.amount,
          matchedPaymentId: matchPaymentId(row, state),
        }));
      return { ...extras, bankPayments: [...additions, ...extras.bankPayments] };
    });
    setStatement("");
    notify(t("Imported {count} rows ({matched} matched)", { count: rows.length - duplicates, matched: matchedCount }), {
      tone: "success" as ToastTone,
    });
  };

  const createPayment = (row: (typeof bankRows)[number]) => {
    const invoiceId = bankInvoiceChoice[row.id] ?? openInvoices[0]?.id ?? "";
    if (!invoiceId) {
      notify(t("Select an invoice first."), { tone: "warning" as ToastTone });
      return;
    }
    const payment: Payment = {
      id: uid("PAY"),
      invoiceId,
      date: row.date || today(),
      amount: row.amount,
      method: t("Bank transfer"),
      reference: row.reference,
      status: "completed",
      notes: t("Imported from bank statement"),
    };
    setState((previous) => {
      const invoice = previous.invoices.find((entry) => entry.id === invoiceId);
      const paidAmount = (invoice?.paidAmount ?? 0) + payment.amount;
      const status = invoice && paidAmount >= invoice.amount ? ("paid" as const) : ("partial" as const);
      return {
        ...previous,
        payments: [payment, ...previous.payments],
        invoices: updateById(previous.invoices, invoiceId, { paidAmount, status }),
      };
    });
    updateExtras(setState, (extras) => ({
      ...extras,
      bankPayments: updateById(extras.bankPayments, row.id, { matchedPaymentId: payment.id }),
    }));
    notify(t("Payment created from bank row"), { tone: "success" as ToastTone });
  };

  const patchPayment = (id: string, patch: Record<string, unknown>) => {
    setState((previous) => ({
      ...previous,
      payments: updateById(previous.payments, id, patch as Partial<Payment>),
    }));
  };

  const deletePayments = (ids: string[]) => {
    setState((previous) => ({
      ...previous,
      payments: ids.reduce((items, id) => removeById(items, id), previous.payments),
    }));
  };

  const restorePayments = (rows: Payment[]) => {
    setState((previous) => ({
      ...previous,
      payments: rows.reduce((items, row) => upsert(items, row), previous.payments),
    }));
  };

  const columns: ExplorerColumn<Payment>[] = [
    {
      key: "reference",
      label: t("Reference"),
      value: (row) => row.reference,
      editable: "text",
      link: { module: "invoices", id: (row) => row.invoiceId },
    },
    {
      key: "invoiceId",
      label: t("Invoice"),
      value: (row) => state.invoices.find((entry) => entry.id === row.invoiceId)?.number ?? row.invoiceId,
      render: (row) => (
        <button
          type="button"
          className="link-button mini"
          onClick={() => openRecord("invoices", row.invoiceId, setTab)}
        >
          {state.invoices.find((entry) => entry.id === row.invoiceId)?.number ?? row.invoiceId}
        </button>
      ),
    },
    { key: "date", label: t("Date"), value: (row) => row.date, render: (row) => shortDate(row.date) },
    {
      key: "amount",
      label: t("Amount"),
      value: (row) => row.amount,
      render: (row) => money(row.amount),
      editable: "number",
    },
    { key: "method", label: t("Method"), value: (row) => row.method, editable: "text" },
    {
      key: "status",
      label: t("Status"),
      value: (row) => statusText(row.status, t),
      editable: "select",
      options: PAYMENT_STATUSES,
    },
  ];

  const config: ExplorerConfig<Payment> = {
    module: "payments",
    title: t("Payments"),
    description: t("Receipts allocated to invoices with method, reference and status."),
    rows: state.payments,
    columns,
    id: (row) => row.id,
    statusKey: "status",
    statusOptions: PAYMENT_STATUSES,
    primaryLabel: (row) => row.reference,
    onPatch: patchPayment,
    onDelete: deletePayments,
    onRestore: restorePayments,
    setTab,
  };

  return (
    <>
      <Toolbar>
        <button type="button" className="summary-voice-action" onClick={() => voiceSummary("payments")}>
          {t("Voice summary")}
        </button>
        <Pill tone="info">{t("{count} bank rows", { count: bankRows.length })}</Pill>
      </Toolbar>
      <div className="grid cols-2">
        <Phase2Panel
          title={t("Bank statement import")}
          description={t("Paste CSV or TSV rows to match receipts by reference and amount.")}
        >
          <Field
            label={t("Paste CSV or TSV rows")}
            hint={t("Expected columns: date, reference, amount, description")}
          >
            <textarea
              rows={5}
              value={statement}
              onChange={(event) => setStatement(event.target.value)}
              placeholder={t("Example: 2026-11-24, PAY-104, 1250, Customer transfer")}
            />
          </Field>
          <div className="actions">
            <button type="button" className="primary" onClick={importStatement}>
              {t("Import statement")}
            </button>
            <button type="button" onClick={() => setStatement("")}>
              {t("Clear")}
            </button>
            <span className="muted-text">{t("{count} rows parsed", { count: parsed.length })}</span>
          </div>
          <h4>{t("Unmatched rows")}</h4>
          <RecordRows rows={unmatched} empty={t("All imported bank rows are matched.")}>
            {unmatched.map((row) => (
              <RowLine
                key={row.id}
                title={`${row.reference} · ${money(row.amount)}`}
                meta={`${shortDate(row.date)} · ${t("Bank transfer")}`}
                trailing={
                  <div className="actions">
                    <select
                      value={bankInvoiceChoice[row.id] ?? openInvoices[0]?.id ?? ""}
                      onChange={(event) =>
                        setBankInvoiceChoice((previous) => ({ ...previous, [row.id]: event.target.value }))
                      }
                      aria-label={t("Invoice")}
                    >
                      <option value="">{t("Select an invoice")}</option>
                      {openInvoices.map((invoice) => (
                        <option key={invoice.id} value={invoice.id}>
                          {invoice.number}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="small primary" onClick={() => createPayment(row)}>
                      {t("Create payment")}
                    </button>
                  </div>
                }
              />
            ))}
          </RecordRows>
          {matched.length > 0 && (
            <p className="muted-text">{t("{count} matched bank rows", { count: matched.length })}</p>
          )}
        </Phase2Panel>
        <AllocationPanel
          state={state}
          setState={setState}
          invoiceId={allocationId}
          onInvoiceChange={setAllocationId}
        />
      </div>
      <RecordExplorer
        config={config}
        state={state}
        setState={setState}
        preferences={props.preferences}
        setPreferences={props.setPreferences}
        focusRecord={focusRecord}
      />
    </>
  );
}

function ComplianceTools(props: Phase2Props) {
  const { state, setState, setTab, focusRecord } = props;
  const { t } = useLanguage();
  const { notify } = useToast();
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [ruleComplianceId, setRuleComplianceId] = useState(state.compliance[0]?.id ?? "");
  const [leadDays, setLeadDays] = useState(30);
  const [renewTo, setRenewTo] = useState("");
  const [editingRuleId, setEditingRuleId] = useState("");

  const calendar = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const leading = new Date(year, month, 1).getDay();
    const count = new Date(year, month + 1, 0).getDate();
    const byDay = new Map<number, ComplianceRecord[]>();
    for (const record of state.compliance) {
      if (!record.expiryDate || record.status === "cancelled") continue;
      const expiry = new Date(`${record.expiryDate.slice(0, 10)}T00:00:00`);
      if (Number.isNaN(expiry.getTime()) || expiry.getFullYear() !== year || expiry.getMonth() !== month) continue;
      const items = byDay.get(expiry.getDate()) ?? [];
      items.push(record);
      byDay.set(expiry.getDate(), items);
    }
    return { year, month, leading, count, byDay };
  }, [state.compliance]);

  const queue: Array<{ rule: RenewalRule; record: ComplianceRecord; days: number }> = [];
  for (const rule of state.extras.renewalRules) {
    const record = state.compliance.find((entry) => entry.id === rule.complianceId);
    const days = daysUntil(record?.expiryDate);
    if (
      record &&
      days !== null &&
      days <= rule.leadDays &&
      !["cancelled", "expired"].includes(record.status)
    ) {
      queue.push({ rule, record, days });
    }
  }
  queue.sort((a, b) => a.days - b.days);

  const resetRuleForm = () => {
    setRuleComplianceId(state.compliance[0]?.id ?? "");
    setLeadDays(30);
    setRenewTo("");
    setEditingRuleId("");
  };

  const saveRule = () => {
    if (!ruleComplianceId || leadDays < 0) {
      notify(t("Select a compliance record and a valid lead time."), { tone: "warning" as ToastTone });
      return;
    }
    if (editingRuleId) {
      updateExtras(setState, (extras) => ({
        ...extras,
        renewalRules: updateById(extras.renewalRules, editingRuleId, { complianceId: ruleComplianceId, leadDays, renewTo }),
      }));
      notify(t("Renewal rule updated"), { tone: "success" as ToastTone });
    } else {
      updateExtras(setState, (extras) => ({
        ...extras,
        renewalRules: [
          {
            id: nextId("REN", extras.renewalRules),
            complianceId: ruleComplianceId,
            leadDays,
            renewTo,
          },
          ...extras.renewalRules,
        ],
      }));
      notify(t("Renewal rule added"), { tone: "success" as ToastTone });
    }
    resetRuleForm();
  };

  const editRule = (id: string) => {
    const rule = state.extras.renewalRules.find((entry) => entry.id === id);
    if (!rule) return;
    setRuleComplianceId(rule.complianceId);
    setLeadDays(rule.leadDays);
    setRenewTo(rule.renewTo);
    setEditingRuleId(rule.id);
  };

  const deleteRule = (id: string) => {
    if (!window.confirm(t("Delete this renewal rule?"))) return;
    updateExtras(setState, (extras) => ({
      ...extras,
      renewalRules: extras.renewalRules.filter((entry) => entry.id !== id),
    }));
    if (editingRuleId === id) resetRuleForm();
    notify(t("Renewal rule deleted"), { tone: "success" as ToastTone });
  };

  const extendExpiry = (record: ComplianceRecord) => {
    setState((previous) => ({
      ...previous,
      compliance: updateById(previous.compliance, record.id, {
        expiryDate: addMonths(record.expiryDate, 12),
        status: "active",
      }),
    }));
    notify(t("Compliance extended by one year"), { tone: "success" as ToastTone });
  };

  const patchCompliance = (id: string, patch: Record<string, unknown>) => {
    setState((previous) => ({
      ...previous,
      compliance: updateById(previous.compliance, id, patch as Partial<ComplianceRecord>),
    }));
  };

  const deleteCompliance = (ids: string[]) => {
    setState((previous) => ({
      ...previous,
      compliance: ids.reduce((items, id) => removeById(items, id), previous.compliance),
    }));
  };

  const restoreCompliance = (rows: ComplianceRecord[]) => {
    setState((previous) => ({
      ...previous,
      compliance: rows.reduce((items, row) => upsert(items, row), previous.compliance),
    }));
  };

  const columns: ExplorerColumn<ComplianceRecord>[] = [
    {
      key: "reference",
      label: t("Reference"),
      value: (row) => row.reference,
      editable: "text",
      link: { module: "compliance", id: (row) => row.id },
    },
    {
      key: "type",
      label: t("Type"),
      value: (row) => t(row.type),
      editable: "select",
      options: COMPLIANCE_TYPES,
    },
    {
      key: "entityId",
      label: t("Linked entity"),
      value: (row) => row.entityId,
      render: (row) => (
        <button
          type="button"
          className="link-button mini"
          onClick={() => openRecord(entityModule(row), row.entityId, setTab)}
        >
          {row.entityId}
        </button>
      ),
    },
    { key: "authority", label: t("Authority"), value: (row) => row.authority, editable: "text" },
    {
      key: "expiryDate",
      label: t("Expiry date"),
      value: (row) => row.expiryDate,
      render: (row) => shortDate(row.expiryDate),
    },
    {
      key: "daysRemaining",
      label: t("Days remaining"),
      value: (row) => daysUntil(row.expiryDate) ?? 0,
      render: (row) => {
        const days = daysUntil(row.expiryDate);
        return (
          <Pill tone={days === null ? "info" : days <= 7 ? "danger" : days <= 30 ? "warning" : "success"}>
            {days === null ? t("No expiry") : t("{days} days", { days })}
          </Pill>
        );
      },
    },
    {
      key: "status",
      label: t("Status"),
      value: (row) => statusText(row.status, t),
      editable: "select",
      options: COMPLIANCE_STATUSES,
    },
  ];

  const config: ExplorerConfig<ComplianceRecord> = {
    module: "compliance",
    title: t("Compliance"),
    description: t("Customs, licences, certificates, insurance, audits and contracts with expiry tracking."),
    rows: state.compliance,
    columns,
    id: (row) => row.id,
    statusKey: "status",
    statusOptions: COMPLIANCE_STATUSES,
    primaryLabel: (row) => `${row.reference} · ${t(row.type)}`,
    onPatch: patchCompliance,
    onDelete: deleteCompliance,
    onRestore: restoreCompliance,
    setTab,
  };

  const monthLabel = new Date(calendar.year, calendar.month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const selectedRecords = selectedDay === null ? [] : calendar.byDay.get(selectedDay) ?? [];

  return (
    <>
      <Toolbar>
        <button type="button" className="summary-voice-action" onClick={() => voiceSummary("compliance")}>
          {t("Voice summary")}
        </button>
        <Pill tone="info">{t("{count} compliance records", { count: state.compliance.length })}</Pill>
      </Toolbar>
      <div className="grid cols-2">
        <Phase2Panel
          title={t("Expiry calendar")}
          description={t("Expiring items are marked on the current month.")}
          action={<Pill tone="info">{monthLabel}</Pill>}
        >
          <div
            role="grid"
            aria-label={t("Expiry calendar")}
            style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 6 }}
          >
            {WEEKDAYS.map((weekday) => (
              <span key={weekday} className="muted-text" style={{ textAlign: "center" }}>
                {t(weekday)}
              </span>
            ))}
            {Array.from({ length: calendar.leading }, (_, index) => (
              <span key={`pad-${index}`} />
            ))}
            {Array.from({ length: calendar.count }, (_, index) => {
              const day = index + 1;
              const items = calendar.byDay.get(day) ?? [];
              const urgent = items.some((record) => (daysUntil(record.expiryDate) ?? 999) <= 7);
              return (
                <button
                  key={day}
                  type="button"
                  className={`small${selectedDay === day ? " primary" : ""}`}
                  style={{
                    minHeight: 46,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 2,
                  }}
                  aria-label={t("Day {day}: {count} expiring", { day, count: items.length })}
                  onClick={() => setSelectedDay(selectedDay === day ? null : day)}
                >
                  <span>{day}</span>
                  {items.length > 0 && (
                    <span className={`chip ${urgent ? "danger" : "warning"}`}>{items.length}</span>
                  )}
                </button>
              );
            })}
          </div>
          {selectedDay !== null && (
            <div style={{ marginTop: 12 }}>
              <h4>{t("Expiring on day {day}", { day: selectedDay })}</h4>
              <RecordRows rows={selectedRecords} empty={t("No expiring items on this day.")}>
                {selectedRecords.map((record) => (
                  <RowLine
                    key={record.id}
                    title={`${record.reference} · ${t(record.type)}`}
                    meta={`${record.authority} · ${shortDate(record.expiryDate)}`}
                    trailing={
                      <button
                        type="button"
                        className="link-button mini"
                        onClick={() => openRecord(entityModule(record), record.entityId, setTab)}
                      >
                        {t("Open")}
                      </button>
                    }
                  />
                ))}
              </RecordRows>
            </div>
          )}
        </Phase2Panel>
        <Phase2Panel
          title={t("Renewal queue")}
          description={t("Rules keep lead time and the renewal note beside each expiry.")}
        >
          <div className="field-row">
            <Field label={t("Compliance record")}>
              <select value={ruleComplianceId} onChange={(event) => setRuleComplianceId(event.target.value)}>
                <option value="">{t("Select a record")}</option>
                {state.compliance.map((record) => (
                  <option key={record.id} value={record.id}>
                    {record.reference} · {t(record.type)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("Lead days")}>
              <input
                type="number"
                min={0}
                value={leadDays}
                onChange={(event) => setLeadDays(Number(event.target.value))}
              />
            </Field>
          </div>
          <Field label={t("Renew to note")}>
            <input type="text" value={renewTo} onChange={(event) => setRenewTo(event.target.value)} />
          </Field>
          <div className="actions">
            <button type="button" className="primary" onClick={saveRule}>
              {editingRuleId ? t("Save changes") : t("Add rule")}
            </button>
            {editingRuleId && (
              <button type="button" onClick={resetRuleForm}>
                {t("Cancel")}
              </button>
            )}
          </div>
          <RecordRows rows={queue} empty={t("No renewals are due yet.")}>
            {queue.map(({ rule, record, days }) => (
              <RowLine
                key={rule.id}
                title={`${record.reference} · ${t(record.type)}`}
                meta={`${t("{days} days", { days })} · ${t("Lead")} ${rule.leadDays} · ${t("Renew to")}: ${rule.renewTo || "—"}`}
                trailing={
                  <div className="actions">
                    <button type="button" className="small" onClick={() => editRule(rule.id)}>
                      {t("Edit")}
                    </button>
                    <button type="button" className="small" onClick={() => deleteRule(rule.id)}>
                      {t("Delete")}
                    </button>
                    <button type="button" className="small primary" onClick={() => extendExpiry(record)}>
                      {t("Extend 1 year")}
                    </button>
                  </div>
                }
              />
            ))}
          </RecordRows>
        </Phase2Panel>
      </div>
      <RecordExplorer
        config={config}
        state={state}
        setState={setState}
        preferences={props.preferences}
        setPreferences={props.setPreferences}
        focusRecord={focusRecord}
      />
    </>
  );
}

interface DrillRow {
  title: string;
  meta: string;
  module: string;
  id: string;
  trailing: string;
}

type MetricKey = "revenue" | "outstanding" | "lowStock" | "shipments" | "compliance";

/** Shared reporting section for dashboard, analytics, intelligence and search. */
export function ReportsTools(props: Phase2Props) {
  const { module, state, preferences, setPreferences, setTab } = props;
  const { t, language } = useLanguage();
  const { notify } = useToast();
  const [metric, setMetric] = useState<MetricKey>("revenue");
  const range = useMemo(() => resolveRange(preferences.dateRange), [preferences.dateRange]);
  const previousRange: DateRange = {
    ...range,
    start: range.previousStart,
    end: range.previousEnd,
    previousStart: "1900-01-01",
    previousEnd: "1900-01-01",
  };

  const completedOrders = state.orders.filter((order) => order.status === "completed");
  const currentOrders = filterInRange(completedOrders, (order) => order.date, range);
  const previousOrders = filterInRange(completedOrders, (order) => order.date, previousRange);
  const currentInvoices = filterInRange(state.invoices, (invoice) => invoice.issueDate, range);
  const previousInvoices = filterInRange(state.invoices, (invoice) => invoice.issueDate, previousRange);
  const currentPayments = filterInRange(state.payments, (payment) => payment.date, range);
  const previousPayments = filterInRange(state.payments, (payment) => payment.date, previousRange);

  const revenue = currentOrders.reduce((sum, order) => sum + getOrderTotal(order, state.products), 0);
  const previousRevenue = previousOrders.reduce((sum, order) => sum + getOrderTotal(order, state.products), 0);
  const billed = currentInvoices.reduce((sum, invoice) => sum + invoice.amount, 0);
  const previousBilled = previousInvoices.reduce((sum, invoice) => sum + invoice.amount, 0);
  const received = currentPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const previousReceived = previousPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const periodOutstanding = currentInvoices
    .filter((invoice) => !["paid", "cancelled"].includes(invoice.status))
    .reduce((sum, invoice) => sum + outstandingBalance(invoice), 0);
  const previousOutstanding = previousInvoices
    .filter((invoice) => !["paid", "cancelled"].includes(invoice.status))
    .reduce((sum, invoice) => sum + outstandingBalance(invoice), 0);
  const lowStock = getLowStock(state);
  const riskyShipments = getHighRiskShipments(state);
  const expiringCompliance = getExpiringCompliance(state);
  const insights = getInsights(state, language).slice(0, 5);

  const metricRows: DrillRow[] = (() => {
    if (metric === "revenue") {
      const orderRows = currentOrders.map((order) => ({
        title: order.number,
        meta: `${shortDate(order.date)} · ${state.customers.find((entry) => entry.id === order.customerId)?.company ?? order.customerId}`,
        module: "orders",
        id: order.id,
        trailing: money(getOrderTotal(order, state.products)),
      }));
      const invoiceRows = currentInvoices.map((invoice) => ({
        title: invoice.number,
        meta: `${shortDate(invoice.issueDate)} · ${statusText(invoice.status, t)}`,
        module: "invoices",
        id: invoice.id,
        trailing: money(invoice.amount),
      }));
      return [...orderRows, ...invoiceRows].slice(0, 8);
    }
    if (metric === "outstanding") {
      return state.invoices
        .filter((invoice) => outstandingBalance(invoice) > 0)
        .sort((a, b) => outstandingBalance(b) - outstandingBalance(a))
        .slice(0, 8)
        .map((invoice) => ({
          title: invoice.number,
          meta: `${shortDate(invoice.dueDate)} · ${statusText(invoice.status, t)}`,
          module: "invoices",
          id: invoice.id,
          trailing: money(outstandingBalance(invoice)),
        }));
    }
    if (metric === "lowStock") {
      return lowStock.slice(0, 8).map((product) => ({
        title: product.name,
        meta: `${product.sku} · ${t("Stock")} ${number(product.stock)} / ${number(product.reorderPoint)}`,
        module: "products",
        id: product.id,
        trailing: money(product.stock * product.cost),
      }));
    }
    if (metric === "shipments") {
      return riskyShipments.slice(0, 8).map((shipment) => ({
        title: shipment.reference,
        meta: `${shipment.carrier} · ${shortDate(shipment.eta)}`,
        module: "shipments",
        id: shipment.id,
        trailing: `${t("ETA")} ${shortDate(shipment.eta)}`,
      }));
    }
    return expiringCompliance.slice(0, 8).map(({ record, days }) => ({
      title: record.reference,
      meta: `${t(record.type)} · ${record.authority}`,
      module: "compliance",
      id: record.id,
      trailing: t("{days} days", { days: days ?? 0 }),
    }));
  })();

  const digest = [
    t("Weekly digest — {company}", { company: state.company.tradingName || state.company.name || t("Local workspace") }),
    t("Period: {start} to {end}", { start: shortDate(range.start), end: shortDate(range.end) }),
    "",
    `${t("Revenue")}: ${money(revenue)}`,
    `${t("Total billed")}: ${money(billed)}`,
    `${t("Total received")}: ${money(received)}`,
    `${t("Outstanding")}: ${money(getOutstanding(state))}`,
    `${t("All-time revenue")}: ${money(getRevenue(state))}`,
    `${t("Low stock")}: ${number(lowStock.length)} · ${t("High-risk shipments")}: ${number(riskyShipments.length)}`,
    "",
    t("Priority actions"),
    ...insights.map((insight, index) => `${index + 1}. ${insight.title} — ${insight.recommendation}`),
  ].join("\n");

  const copyDigest = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(digest);
      } else {
        const helper = document.createElement("textarea");
        helper.value = digest;
        document.body.appendChild(helper);
        helper.select();
        document.execCommand("copy");
        helper.remove();
      }
      notify(t("Digest copied"), { tone: "success" as ToastTone });
    } catch {
      notify(t("Could not copy digest"), { tone: "danger" as ToastTone });
    }
  };

  const cashWindows = [
    { label: t("Next 7 days"), min: 0, max: 7 },
    { label: t("Next 8–30 days"), min: 8, max: 30 },
    { label: t("Next 31–60 days"), min: 31, max: 60 },
    { label: t("Next 61–90 days"), min: 61, max: 90 },
    { label: t("Beyond 90 days"), min: 91, max: 3650 },
  ];
  const cashFlow = cashWindows.map((window) => {
    let receivables = 0;
    let payables = 0;
    for (const invoice of state.invoices) {
      if (["paid", "cancelled"].includes(invoice.status)) continue;
      const days = daysUntil(invoice.dueDate);
      if (days !== null && days >= window.min && days <= window.max) receivables += outstandingBalance(invoice);
    }
    for (const batch of state.imports) {
      if (["completed", "cancelled"].includes(batch.status)) continue;
      const days = daysUntil(batch.eta);
      if (days !== null && days >= window.min && days <= window.max) {
        payables += getImportTotals(batch, state.products).landedCost;
      }
    }
    return { ...window, receivables, payables, net: receivables - payables };
  });

  const agingBuckets = [
    { label: t("0–30 days"), min: 0, max: 30, inventoryCount: 0, inventoryValue: 0, receivableCount: 0, receivableValue: 0 },
    { label: t("31–60 days"), min: 31, max: 60, inventoryCount: 0, inventoryValue: 0, receivableCount: 0, receivableValue: 0 },
    { label: t("61–90 days"), min: 61, max: 90, inventoryCount: 0, inventoryValue: 0, receivableCount: 0, receivableValue: 0 },
    { label: t("90+ days"), min: 91, max: 3650, inventoryCount: 0, inventoryValue: 0, receivableCount: 0, receivableValue: 0 },
  ];
  for (const product of state.products) {
    const dates = [
      ...state.movements.filter((movement) => movement.productId === product.id).map((movement) => movement.date),
      ...state.orders
        .filter((order) => order.items.some((item) => item.productId === product.id))
        .map((order) => order.date),
    ].sort();
    const last = dates[dates.length - 1];
    const days = last ? Math.max(0, -(daysUntil(last) ?? 0)) : 91;
    const bucket = agingBuckets.find((entry) => days >= entry.min && days <= entry.max) ?? agingBuckets[3];
    bucket.inventoryCount += 1;
    bucket.inventoryValue += product.stock * product.cost;
  }
  for (const invoice of state.invoices) {
    const balance = outstandingBalance(invoice);
    if (balance <= 0) continue;
    const days = Math.max(0, -(daysUntil(invoice.dueDate) ?? 0));
    const bucket = agingBuckets.find((entry) => days >= entry.min && days <= entry.max) ?? agingBuckets[3];
    bucket.receivableCount += 1;
    bucket.receivableValue += balance;
  }

  const trendGroups = new Map<string, (typeof state.extras.supplierTrends)[number][]>();
  for (const point of state.extras.supplierTrends) {
    const points = trendGroups.get(point.supplierId) ?? [];
    points.push(point);
    trendGroups.set(point.supplierId, points);
  }
  const trendRows = Array.from(trendGroups.entries())
    .map(([supplierId, points]) => {
      const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
      const first = sorted[0];
      const latest = sorted[sorted.length - 1];
      const supplier = state.suppliers.find((entry) => entry.id === supplierId);
      return {
        id: supplierId,
        name: supplier?.name ?? supplierId,
        score: supplier ? getSupplierScore(supplier) : latest.reliability,
        delta: latest.reliability - first.reliability,
        quality: latest.quality,
        date: latest.date,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  const metricButtons: Array<{ key: MetricKey; label: string }> = [
    { key: "revenue", label: t("Revenue from orders & invoices") },
    { key: "outstanding", label: t("Outstanding invoices") },
    { key: "lowStock", label: t("Low-stock products") },
    { key: "shipments", label: t("High-risk shipments") },
    { key: "compliance", label: t("Expiring compliance") },
  ];

  return (
    <>
      <Toolbar>
        <Field label={t("Date range")}>
          <select
            value={preferences.dateRange}
            onChange={(event) =>
              setPreferences((previous) => ({ ...previous, dateRange: event.target.value as DateRangeKey }))
            }
            aria-label={t("Date range")}
          >
            {DATE_RANGE_OPTIONS.map((key) => (
              <option key={key} value={key}>
                {t(RANGE_LABELS[key])}
              </option>
            ))}
          </select>
        </Field>
        <label className="chip">
          <input
            type="checkbox"
            checked={preferences.comparePeriod}
            onChange={(event) =>
              setPreferences((previous) => ({ ...previous, comparePeriod: event.target.checked }))
            }
          />
          {t("Compare previous period")}
        </label>
        <button type="button" className="summary-voice-action" onClick={() => voiceSummary(module)}>
          {t("Voice summary")}
        </button>
      </Toolbar>
      <Phase2Panel title={t("Reporting overview")} description={t("Figures use records saved in this browser.")}>
        <StatStrip
          items={[
            {
              label: t("Revenue"),
              value: money(revenue),
              hint: compareHint(t, revenue, previousRevenue, preferences.comparePeriod),
            },
            {
              label: t("Total billed"),
              value: money(billed),
              hint: compareHint(t, billed, previousBilled, preferences.comparePeriod),
            },
            {
              label: t("Total received"),
              value: money(received),
              hint: compareHint(t, received, previousReceived, preferences.comparePeriod),
            },
            {
              label: t("Outstanding"),
              value: money(getOutstanding(state)),
              hint: compareHint(t, periodOutstanding, previousOutstanding, preferences.comparePeriod),
            },
            { label: t("Low stock"), value: number(lowStock.length) },
            { label: t("High-risk shipments"), value: number(riskyShipments.length) },
            { label: t("Expiring compliance"), value: number(expiringCompliance.length) },
          ]}
        />
      </Phase2Panel>
      <Phase2Panel title={t("Metric drill-down")} description={t("Open a row to inspect the source record.")}>
        <Toolbar>
          {metricButtons.map((button) => (
            <button
              key={button.key}
              type="button"
              className={metric === button.key ? "primary" : undefined}
              onClick={() => setMetric(button.key)}
            >
              {button.label}
            </button>
          ))}
        </Toolbar>
        <RecordRows rows={metricRows} empty={t("No records match these filters.")}>
          {metricRows.map((row) => (
            <RowLine
              key={`${row.module}-${row.id}`}
              title={row.title}
              meta={row.meta}
              trailing={row.trailing}
              onClick={() => openRecord(row.module, row.id, setTab)}
            />
          ))}
        </RecordRows>
      </Phase2Panel>
      <div className="grid cols-2">
        <Phase2Panel title={t("Weekly digest")} description={t("A copyable summary of the current local snapshot.")}>
          <Field label={t("Digest report")}>
            <textarea rows={9} readOnly value={digest} aria-label={t("Digest report")} />
          </Field>
          <button type="button" className="primary" onClick={copyDigest}>
            {t("Copy digest")}
          </button>
        </Phase2Panel>
        <Phase2Panel title={t("Cash-flow forecast")} description={t("Receivables by due date minus import payables by ETA.")}>
          <RecordRows rows={cashFlow} empty={t("No dated receivables or payables.")}>
            {cashFlow.map((window) => (
              <RowLine
                key={window.label}
                title={window.label}
                meta={`${t("Receivables")} ${money(window.receivables)} · ${t("Payables")} ${money(window.payables)}`}
                trailing={
                  <Pill tone={window.net >= 0 ? "success" : "danger"}>
                    {compactMoney(window.net)}
                  </Pill>
                }
              />
            ))}
          </RecordRows>
        </Phase2Panel>
        <Phase2Panel title={t("Inventory aging")} description={t("Days since the last movement or order date.")}>
          <RecordRows rows={agingBuckets} empty={t("No inventory to age.")}>
            {agingBuckets.map((bucket) => (
              <RowLine
                key={bucket.label}
                title={bucket.label}
                meta={t("{count} products", { count: bucket.inventoryCount })}
                trailing={money(bucket.inventoryValue)}
              />
            ))}
          </RecordRows>
        </Phase2Panel>
        <Phase2Panel title={t("Receivables aging")} description={t("Open invoice balances by days past due.")}>
          <RecordRows rows={agingBuckets} empty={t("No open receivables.")}>
            {agingBuckets.map((bucket) => (
              <RowLine
                key={bucket.label}
                title={bucket.label}
                meta={t("{count} invoices", { count: bucket.receivableCount })}
                trailing={money(bucket.receivableValue)}
              />
            ))}
          </RecordRows>
        </Phase2Panel>
        <Phase2Panel title={t("Supplier score trend")} description={t("Reliability movement from saved trend points.")}>
          <RecordRows rows={trendRows} empty={t("No supplier trend points saved.")}>
            {trendRows.map((row) => (
              <RowLine
                key={row.id}
                title={row.name}
                meta={`${t("Quality")} ${number(row.quality)} · ${t("Supplier score")} ${number(row.score)} · ${shortDate(row.date)}`}
                trailing={
                  <Pill tone={row.delta >= 0 ? "success" : "danger"}>
                    {row.delta >= 0 ? "+" : ""}
                    {t("{count} pts", { count: row.delta })}
                  </Pill>
                }
              />
            ))}
          </RecordRows>
        </Phase2Panel>
        <Phase2Panel
          title={t("Decision queue")}
          description={t("Rule-based signals recalculated from the current workspace.")}
        >
          <RecordRows rows={insights} empty={t("No insights available.")}>
            {insights.map((insight) => (
              <RowLine
                key={insight.id}
                title={insight.title}
                meta={insight.detail}
                trailing={<Pill tone={severityTone(insight.severity)}>{t(insight.severity)}</Pill>}
                onClick={() => setTab(insight.tab)}
              />
            ))}
          </RecordRows>
        </Phase2Panel>
      </div>
    </>
  );
}

export default function FinanceTools(props: Phase2Props) {
  switch (props.module) {
    case "invoices":
      return <InvoicesTools {...props} />;
    case "payments":
      return <PaymentsTools {...props} />;
    case "compliance":
      return <ComplianceTools {...props} />;
    case "dashboard":
    case "analytics":
    case "intelligence":
    case "search":
      return <ReportsTools {...props} />;
    default:
      return null;
  }
}
