import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { AppState, Customer, CustomerType, Status } from "../types";
import { money, number, percent, titleCase } from "../lib/format";
import { getCustomerExposure } from "../lib/intelligence";
import { removeById, uid, upsert } from "../lib/store";
import { useLanguage } from "../i18n";
import { Metric, ProgressBar, StatusChip } from "./Ui";

interface Props {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
}

const emptyCustomer: Customer = {
  id: "",
  company: "",
  contact: "",
  phone: "",
  email: "",
  country: "",
  city: "",
  type: "distributor",
  creditLimit: 0,
  paymentTerms: "Net 30",
  status: "active",
  notes: "",
};

function creditTone(utilization: number): "success" | "warning" | "danger" {
  if (utilization > 80) return "danger";
  if (utilization > 60) return "warning";
  return "success";
}

export default function Customers({ state, setState }: Props) {
  const { t } = useLanguage();
  const [form, setForm] = useState<Customer>(emptyCustomer);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const totalCreditLimit = state.customers.reduce((sum, customer) => sum + customer.creditLimit, 0);
  const activeAccounts = state.customers.filter((customer) => customer.status === "active").length;
  const totalExposure = state.customers.reduce(
    (sum, customer) => sum + getCustomerExposure(state, customer.id),
    0
  );

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return state.customers;
    return state.customers.filter((customer) =>
      [customer.company, customer.contact, customer.phone, customer.email, customer.country, customer.city, customer.type]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [state.customers, query]);

  const saveCustomer = () => {
    if (!form.company.trim() || !form.contact.trim()) {
      alert(t("Company and contact are required."));
      return;
    }
    const customer: Customer = {
      ...form,
      id: editingId ?? uid("CUS"),
      company: form.company.trim(),
      contact: form.contact.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      country: form.country.trim(),
      city: form.city.trim(),
      paymentTerms: form.paymentTerms.trim(),
      notes: form.notes.trim(),
      creditLimit: Math.max(0, form.creditLimit),
    };
    setState((prev) => ({ ...prev, customers: upsert(prev.customers, customer) }));
    setForm(emptyCustomer);
    setEditingId(null);
  };

  const editCustomer = (customer: Customer) => {
    setForm({ ...customer });
    setEditingId(customer.id);
  };

  const cancelEdit = () => {
    setForm(emptyCustomer);
    setEditingId(null);
  };

  const deleteCustomer = (customer: Customer) => {
    if (!window.confirm(`${t("Delete customer")} ${customer.company}?`)) return;
    setState((prev) => ({ ...prev, customers: removeById(prev.customers, customer.id) }));
    if (editingId === customer.id) cancelEdit();
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h2>{t("Customers")}</h2>
          <p>{t("Wholesale accounts, credit terms, contacts, and exposure monitoring.")}</p>
        </div>
      </div>

      <div className="grid cols-4">
        <Metric label={t("Customer count")} value={number(state.customers.length)} hint={`${number(state.customers.length)} ${t("records")}`} tone="info" />
        <Metric label={t("Active accounts")} value={number(activeAccounts)} hint={`${number(activeAccounts)} ${t("active")}`} tone="success" />
        <Metric label={t("Total credit limit")} value={money(totalCreditLimit)} hint={t("Across all accounts")} />
        <Metric label={t("Total exposure")} value={money(totalExposure)} hint={t("Open invoice balances")} tone={totalExposure > 0 ? "warning" : "success"} />
      </div>

      <div className="card">
        <div className="section-title">
          <h3>{editingId ? t("Edit customer") : t("Add customer")}</h3>
          <span className="chip info">{`${number(state.customers.length)} ${t("accounts")}`}</span>
        </div>
        <div className="field-row">
          <div className="field">
            <label>{t("Company")}</label>
            <input aria-label={t("Company")} value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} />
          </div>
          <div className="field">
            <label>{t("Contact")}</label>
            <input aria-label={t("Contact")} value={form.contact} onChange={(event) => setForm({ ...form, contact: event.target.value })} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>{t("Phone")}</label>
            <input aria-label={t("Phone")} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
          </div>
          <div className="field">
            <label>{t("Email")}</label>
            <input aria-label={t("Email")} type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>{t("Country")}</label>
            <input aria-label={t("Country")} value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })} />
          </div>
          <div className="field">
            <label>{t("City")}</label>
            <input aria-label={t("City")} value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>{t("Type")}</label>
            <select aria-label={t("Type")} value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as CustomerType })}>
              <option value="distributor">{t("distributor")}</option>
              <option value="retailer">{t("retailer")}</option>
              <option value="corporate">{t("corporate")}</option>
              <option value="export">{t("export")}</option>
            </select>
          </div>
          <div className="field">
            <label>{t("Credit limit")}</label>
            <input aria-label={t("Credit limit")} type="number" min={0} value={form.creditLimit} onChange={(event) => setForm({ ...form, creditLimit: Math.max(0, Number(event.target.value)) })} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>{t("Payment terms")}</label>
            <input aria-label={t("Payment terms")} value={form.paymentTerms} onChange={(event) => setForm({ ...form, paymentTerms: event.target.value })} placeholder={t("Net 30")} />
          </div>
          <div className="field">
            <label>{t("Status")}</label>
            <select aria-label={t("Status")} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Status })}>
              <option value="active">{t("active")}</option>
              <option value="pending">{t("pending")}</option>
              <option value="in_progress">{t("in_progress")}</option>
              <option value="blocked">{t("blocked")}</option>
              <option value="cancelled">{t("cancelled")}</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label>{t("Notes")}</label>
          <textarea aria-label={t("Notes")} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </div>
        <div className="actions">
          <button className="primary" type="button" onClick={saveCustomer}>{editingId ? t("Save changes") : t("Add customer")}</button>
          {editingId && <button type="button" onClick={cancelEdit}>{t("Cancel")}</button>}
        </div>
      </div>

      <div className="card">
        <div className="section-title">
          <h3>{t("Customer accounts")}</h3>
          <span className="chip warning">{`${number(activeAccounts)} ${t("active")}`}</span>
        </div>
        <div className="toolbar">
          <input aria-label={t("Search customers...")} placeholder={t("Search customers...")} value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <div className="list">
          {filtered.length === 0 && <div className="empty">{t("No customers found.")}</div>}
          {filtered.map((customer) => {
            const exposure = getCustomerExposure(state, customer.id);
            const utilization = customer.creditLimit > 0 ? (exposure / customer.creditLimit) * 100 : exposure > 0 ? 100 : 0;
            const highRisk = utilization > 80;
            return (
              <div className="row-card" key={customer.id} style={highRisk ? { borderColor: "var(--danger)" } : undefined}>
                <div className="row-top">
                  <div>
                    <h4>{customer.company}</h4>
                    <div className="meta">
                      <span className={`chip ${customer.type === "export" ? "info" : "neutral"}`}>{t(titleCase(customer.type))}</span>
                      <span>{[customer.city, customer.country].filter(Boolean).join(", ") || t("Location not set")}</span>
                      <span>{`${t("Contact")}: ${customer.contact}`}</span>
                      <span>{customer.phone}</span>
                      <span>{customer.email}</span>
                    </div>
                  </div>
                  <div className="actions">
                    <StatusChip status={customer.status} label={t(customer.status)} />
                    {highRisk && <span className="chip danger">{t("Credit alert")}</span>}
                    <button className="small" type="button" onClick={() => editCustomer(customer)}>{t("Edit")}</button>
                    <button className="small" type="button" onClick={() => deleteCustomer(customer)}>{t("Delete")}</button>
                  </div>
                </div>
                <div className="detail-grid auto-fit mt-3">
                  <div className="detail-item"><span>{t("Credit limit")}</span><strong>{money(customer.creditLimit)}</strong></div>
                  <div className="detail-item"><span>{t("Exposure")}</span><strong>{money(exposure)}</strong></div>
                  <div className="detail-item"><span>{t("Payment terms")}</span><strong>{customer.paymentTerms || "—"}</strong></div>
                </div>
                <ProgressBar
                  value={exposure}
                  max={Math.max(customer.creditLimit, exposure, 1)}
                  tone={creditTone(utilization)}
                  label={`${t("Credit utilization")} ${percent(utilization)}`}
                />
              </div>
            );
          })}
        </div>
        <p className="muted-text mt-3 mb-0">
          {t("Accounts above 80% credit utilization are highlighted for review.")}
        </p>
      </div>
    </>
  );
}
