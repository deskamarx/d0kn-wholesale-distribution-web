import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { AppState, ComplianceRecord, ComplianceType, Status } from "../types";
import { daysUntil, shortDate } from "../lib/format";
import { uid, updateById, upsert } from "../lib/store";
import { useLanguage } from "../i18n";
import { Metric, StatusChip } from "./Ui";

interface Props {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
}

const COMPLIANCE_TYPES: ComplianceType[] = [
  "customs",
  "import-licence",
  "certificate",
  "insurance",
  "quality-audit",
  "contract",
];
const ENTITY_TYPES = ["product", "supplier", "shipment", "import", "customer"];
const RECORD_STATUSES: Status[] = ["active", "pending", "in_progress", "expired", "blocked", "cancelled"];

function isoDate(daysFromNow: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function entityOptions(state: AppState, entityType: string): Array<{ id: string; label: string }> {
  switch (entityType) {
    case "product":
      return state.products.map((product) => ({ id: product.id, label: `${product.name} (${product.sku})` }));
    case "supplier":
      return state.suppliers.map((supplier) => ({ id: supplier.id, label: supplier.name }));
    case "shipment":
      return state.shipments.map((shipment) => ({ id: shipment.id, label: `${shipment.reference} · ${shipment.carrier}` }));
    case "import":
      return state.imports.map((batch) => ({ id: batch.id, label: batch.reference }));
    case "customer":
      return state.customers.map((customer) => ({ id: customer.id, label: customer.company }));
    default:
      return [];
  }
}

function blankRecord(state: AppState): ComplianceRecord {
  return {
    id: "",
    type: "certificate",
    reference: "",
    entityType: "product",
    entityId: state.products[0]?.id ?? "",
    authority: "",
    issueDate: isoDate(0),
    expiryDate: isoDate(30),
    status: "active",
    notes: "",
  };
}

export default function Compliance({ state, setState }: Props) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [form, setForm] = useState<ComplianceRecord>(() => blankRecord(state));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const resetForm = () => {
    setForm(blankRecord(state));
    setEditingId(null);
  };

  const entityLabel = (record: ComplianceRecord) =>
    entityOptions(state, record.entityType).find((option) => option.id === record.entityId)?.label ??
    `${t(record.entityType)} ${record.entityId}`;

  const remainingLabel = (days: number | null) => {
    if (days === null) return t("No expiry");
    if (days < 0) return t("{days}d overdue", { days: Math.abs(days) });
    return t("{days}d left", { days });
  };

  const recordTone = (record: ComplianceRecord): "danger" | "warning" | "neutral" => {
    const days = daysUntil(record.expiryDate);
    if (["blocked", "expired"].includes(record.status) || (days !== null && days < 0)) return "danger";
    if (days !== null && days <= 30) return "warning";
    return "neutral";
  };

  const stats = useMemo(() => {
    const expiring = state.compliance.filter((record) => {
      const days = daysUntil(record.expiryDate);
      return days !== null && days >= 0 && days <= 30 && !["blocked", "expired", "cancelled"].includes(record.status);
    }).length;
    const blocked = state.compliance.filter((record) => {
      const days = daysUntil(record.expiryDate);
      return ["blocked", "expired"].includes(record.status) || (days !== null && days < 0);
    }).length;
    return {
      count: state.compliance.length,
      active: state.compliance.filter((record) => record.status === "active").length,
      expiring,
      blocked,
    };
  }, [state.compliance]);

  const filteredRecords = useMemo(() => {
    const term = query.trim().toLowerCase();
    return state.compliance
      .filter((record) => statusFilter === "all" || record.status === statusFilter)
      .filter((record) => typeFilter === "all" || record.type === typeFilter)
      .filter((record) => {
        if (!term) return true;
        const linked = entityOptions(state, record.entityType).find((option) => option.id === record.entityId)?.label ?? "";
        return [record.type, record.reference, record.authority, linked, record.notes].join(" ").toLowerCase().includes(term);
      })
      .sort((a, b) => (daysUntil(a.expiryDate) ?? 9999) - (daysUntil(b.expiryDate) ?? 9999));
  }, [state, query, statusFilter, typeFilter]);

  const saveRecord = () => {
    const options = entityOptions(state, form.entityType);
    const entityId = options.some((option) => option.id === form.entityId) ? form.entityId : options[0]?.id ?? "";
    if (!form.reference.trim() || !entityId) return;
    const next: ComplianceRecord = {
      ...form,
      id: editingId ?? uid("CMP"),
      type: form.type || "certificate",
      reference: form.reference.trim(),
      entityId,
      authority: form.authority.trim(),
      notes: form.notes.trim(),
    };
    setState((prev) => ({ ...prev, compliance: upsert(prev.compliance, next) }));
    resetForm();
  };

  const startEdit = (record: ComplianceRecord) => {
    setForm({ ...record });
    setEditingId(record.id);
    setPendingDeleteId(null);
  };

  const deleteRecord = (id: string) => {
    setState((prev) => ({ ...prev, compliance: prev.compliance.filter((record) => record.id !== id) }));
    setPendingDeleteId(null);
    if (editingId === id) resetForm();
  };

  const markStatus = (id: string, status: Status) => {
    setState((prev) => ({ ...prev, compliance: updateById(prev.compliance, id, { status }) }));
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h2>{t("Compliance")}</h2>
          <p>{t("Track licences, certificates, audits, and insurance across the supply chain.")}</p>
        </div>
        <button className="primary" type="button" onClick={resetForm}>{t("New record")}</button>
      </div>

      <div className="grid cols-4">
        <Metric label={t("Records count")} value={stats.count} hint={t("Documents on file")} />
        <Metric label={t("Active count")} value={stats.active} hint={t("Currently valid")} tone="success" />
        <Metric label={t("Expiring within 30 days")} value={stats.expiring} hint={t("Renewal window")} tone="warning" />
        <Metric label={t("Blocked/expired count")} value={stats.blocked} hint={t("Requires immediate action")} tone="danger" />
      </div>

      <div className="card">
        <div className="section-title">
          <h3>{editingId ? t("Edit record") : t("New record")}</h3>
          {editingId && <span className="muted-text">{t("Editing")} {form.reference}</span>}
        </div>
        <div className="field-row">
          <div className="field">
            <label>{t("Type")}</label>
            <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as ComplianceType })}>
              {COMPLIANCE_TYPES.map((type) => (
                <option key={type} value={type}>{t(type)}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t("Reference")}</label>
            <input value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} placeholder={t("CMP-2026-000")} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>{t("Entity type")}</label>
            <select
              value={form.entityType}
              onChange={(event) => {
                const entityType = event.target.value;
                setForm({ ...form, entityType, entityId: entityOptions(state, entityType)[0]?.id ?? "" });
              }}
            >
              {ENTITY_TYPES.map((entityType) => (
                <option key={entityType} value={entityType}>{t(entityType)}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t("Linked entity")}</label>
            <select value={form.entityId} onChange={(event) => setForm({ ...form, entityId: event.target.value })}>
              {entityOptions(state, form.entityType).length === 0 && <option value="">{t("No linked records")}</option>}
              {entityOptions(state, form.entityType).map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>{t("Authority")}</label>
            <input value={form.authority} onChange={(event) => setForm({ ...form, authority: event.target.value })} placeholder={t("Issuing authority")} />
          </div>
          <div className="field">
            <label>{t("Status")}</label>
            <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Status })}>
              {RECORD_STATUSES.map((status) => (
                <option key={status} value={status}>{t(status)}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>{t("Issue date")}</label>
            <input type="date" value={form.issueDate} onChange={(event) => setForm({ ...form, issueDate: event.target.value })} />
          </div>
          <div className="field">
            <label>{t("Expiry date")}</label>
            <input type="date" value={form.expiryDate} onChange={(event) => setForm({ ...form, expiryDate: event.target.value })} />
          </div>
        </div>
        <div className="field">
          <label>{t("Notes")}</label>
          <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder={t("Renewal conditions and document details")} />
        </div>
        <div className="actions">
          <button className="primary" type="button" onClick={saveRecord}>{editingId ? t("Save changes") : t("Add record")}</button>
          {editingId && <button type="button" onClick={resetForm}>{t("Cancel")}</button>}
        </div>
      </div>

      <div className="card">
        <div className="section-title">
          <h3>{t("Compliance register")}</h3>
          <span className="muted-text">{filteredRecords.length} / {state.compliance.length} {t("Compliance")}</span>
        </div>
        <div className="toolbar">
          <input placeholder={t("Search compliance records...")} value={query} onChange={(event) => setQuery(event.target.value)} />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">{t("All statuses")}</option>
            {RECORD_STATUSES.map((status) => (
              <option key={status} value={status}>{t(status)}</option>
            ))}
          </select>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="all">{t("All types")}</option>
            {COMPLIANCE_TYPES.map((type) => (
              <option key={type} value={type}>{t(type)}</option>
            ))}
          </select>
        </div>
        <div className="list">
          {filteredRecords.length === 0 && <div className="empty">{t("No compliance records match the current filter.")}</div>}
          {filteredRecords.map((record) => {
            const days = daysUntil(record.expiryDate);
            const tone = recordTone(record);
            const rowStyle =
              tone === "danger"
                ? { borderColor: "#f3b4ae", background: "#fff6f5" }
                : tone === "warning"
                  ? { borderColor: "#f6cf9a", background: "#fffbf4" }
                  : undefined;
            return (
              <div className="row-card" key={record.id} style={rowStyle}>
                <div className="row-top">
                  <div>
                    <h4>{t(record.type)} · {record.reference}</h4>
                    <div className="meta">
                      <span>{t("Linked entity")}: {entityLabel(record)}</span>
                      <span>{record.authority}</span>
                      <span>{t("Issued")} {shortDate(record.issueDate)}</span>
                      <span>{t("Expires")} {shortDate(record.expiryDate)}</span>
                      <span>{t("Days remaining")}: {remainingLabel(days)}</span>
                    </div>
                  </div>
                  <div className="actions">
                    <StatusChip status={record.status} label={t(record.status)} />
                    {tone === "danger" && <span className="chip danger">{t("expired")}</span>}
                    {tone === "warning" && <span className="chip warning">{t("Expiring soon")}</span>}
                    {pendingDeleteId === record.id ? (
                      <>
                        <span className="chip danger">{t("Delete record?")}</span>
                        <button className="small" type="button" onClick={() => deleteRecord(record.id)}>{t("Confirm delete")}</button>
                        <button className="small" type="button" onClick={() => setPendingDeleteId(null)}>{t("Cancel")}</button>
                      </>
                    ) : (
                      <>
                        <button className="small" type="button" onClick={() => markStatus(record.id, "active")}>{t("Mark active")}</button>
                        <button className="small" type="button" onClick={() => markStatus(record.id, "expired")}>{t("Mark expired")}</button>
                        <button className="small" type="button" onClick={() => startEdit(record)}>{t("Edit")}</button>
                        <button className="small" type="button" onClick={() => setPendingDeleteId(record.id)}>{t("Delete")}</button>
                      </>
                    )}
                  </div>
                </div>
                {record.notes && <p className="muted-text" style={{ marginTop: 10, marginBottom: 0 }}>{record.notes}</p>}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
