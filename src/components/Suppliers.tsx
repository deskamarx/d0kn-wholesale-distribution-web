import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { AppState, Status, Supplier } from "../types";
import { number } from "../lib/format";
import { getSupplierScore } from "../lib/intelligence";
import { removeById, uid, updateById, upsert } from "../lib/store";
import { useLanguage } from "../i18n";
import { Metric, ProgressBar, StatusChip } from "./Ui";

interface Props {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
}

type SupplierForm = Omit<Supplier, "id">;

const SUPPLIER_STATUSES: Status[] = ["active", "pending", "blocked"];
const COMPLIANCE_STATUSES: Status[] = ["active", "pending", "expired"];

function emptySupplier(): SupplierForm {
  return {
    name: "",
    chineseName: "",
    city: "",
    country: "China",
    contact: "",
    wechat: "",
    phone: "",
    email: "",
    paymentTerms: "",
    incoterm: "FOB Shenzhen",
    leadTimeDays: 0,
    reliability: 80,
    qualityScore: 80,
    complianceStatus: "pending",
    status: "pending",
    notes: "",
  };
}

export default function Suppliers({ state, setState }: Props) {
  const { t } = useLanguage();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SupplierForm>(emptySupplier);

  const scorecard = useMemo(
    () =>
      state.suppliers
        .map((supplier) => ({ supplier, score: getSupplierScore(supplier) }))
        .sort((a, b) => b.score - a.score),
    [state.suppliers]
  );

  const average = (key: "reliability" | "qualityScore") =>
    state.suppliers.length === 0
      ? 0
      : Math.round(state.suppliers.reduce((sum, supplier) => sum + supplier[key], 0) / state.suppliers.length);

  const needsReview = scorecard.filter((entry) => entry.score < 85).length;

  const patch = (changes: Partial<SupplierForm>) => setForm((prev) => ({ ...prev, ...changes }));

  const openAdd = () => {
    setForm(emptySupplier());
    setEditingId(null);
    setShowForm(true);
  };

  const startEdit = (supplier: Supplier) => {
    setForm({ ...supplier });
    setEditingId(supplier.id);
    setShowForm(true);
  };

  const closeForm = () => {
    setForm(emptySupplier());
    setEditingId(null);
    setShowForm(false);
  };

  const saveSupplier = () => {
    if (!form.name.trim()) return;
    const supplier: Supplier = {
      ...form,
      id: editingId ?? uid("SUP"),
      name: form.name.trim(),
      chineseName: form.chineseName.trim(),
      city: form.city.trim(),
      contact: form.contact.trim(),
      wechat: form.wechat.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      paymentTerms: form.paymentTerms.trim(),
      notes: form.notes.trim(),
    };
    setState((prev) => ({ ...prev, suppliers: upsert(prev.suppliers, supplier) }));
    closeForm();
  };

  const removeSupplier = (id: string) => {
    if (!window.confirm(t("Delete this supplier? Linked products and imports will keep their reference."))) return;
    setState((prev) => ({ ...prev, suppliers: removeById(prev.suppliers, id) }));
    if (editingId === id) closeForm();
  };

  const toggleStatus = (supplier: Supplier) => {
    setState((prev) => ({
      ...prev,
      suppliers: updateById(prev.suppliers, supplier.id, {
        status: supplier.status === "active" ? "blocked" : "active",
      }),
    }));
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h2>{t("Suppliers")}</h2>
          <p>{t("China sourcing partners, contact channels, terms, quality signals, and composite scores.")}</p>
        </div>
        <button className="primary" type="button" onClick={openAdd}>{t("Add supplier")}</button>
      </div>

      {showForm && (
        <section className="card">
          <div className="section-title">
            <h3>{editingId ? t("Edit supplier") : t("Add supplier")}</h3>
            <button className="small" type="button" onClick={closeForm}>{t("Cancel")}</button>
          </div>
          <p className="muted-text">{t("Score inputs directly affect the partner scorecard and review flags.")}</p>

          <div className="field-row">
            <div className="field"><label>{t("Name")}</label><input aria-label={t("Name")} value={form.name} onChange={(event) => patch({ name: event.target.value })} /></div>
            <div className="field"><label>{t("Chinese name")}</label><input aria-label={t("Chinese name")} value={form.chineseName} onChange={(event) => patch({ chineseName: event.target.value })} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>{t("City")}</label><input aria-label={t("City")} value={form.city} onChange={(event) => patch({ city: event.target.value })} /></div>
            <div className="field"><label>{t("Country")}</label><input aria-label={t("Country")} value={form.country} onChange={(event) => patch({ country: event.target.value })} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>{t("Contact")}</label><input aria-label={t("Contact")} value={form.contact} onChange={(event) => patch({ contact: event.target.value })} /></div>
            <div className="field"><label>{t("WeChat")}</label><input aria-label={t("WeChat")} value={form.wechat} onChange={(event) => patch({ wechat: event.target.value })} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>{t("Phone")}</label><input aria-label={t("Phone")} value={form.phone} onChange={(event) => patch({ phone: event.target.value })} /></div>
            <div className="field"><label>{t("Email")}</label><input aria-label={t("Email")} type="email" value={form.email} onChange={(event) => patch({ email: event.target.value })} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>{t("Payment terms")}</label><input aria-label={t("Payment terms")} value={form.paymentTerms} onChange={(event) => patch({ paymentTerms: event.target.value })} /></div>
            <div className="field"><label>{t("Incoterm")}</label><input aria-label={t("Incoterm")} value={form.incoterm} onChange={(event) => patch({ incoterm: event.target.value })} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>{t("Lead time days")}</label><input aria-label={t("Lead time days")} type="number" min="0" value={form.leadTimeDays} onChange={(event) => patch({ leadTimeDays: Number(event.target.value) })} /></div>
            <div className="field"><label>{t("Reliability")}</label><input aria-label={t("Reliability")} type="number" min="0" max="100" value={form.reliability} onChange={(event) => patch({ reliability: Number(event.target.value) })} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>{t("Quality score")}</label><input aria-label={t("Quality score")} type="number" min="0" max="100" value={form.qualityScore} onChange={(event) => patch({ qualityScore: Number(event.target.value) })} /></div>
            <div className="field">
              <label>{t("Compliance status")}</label>
              <select aria-label={t("Compliance status")} value={form.complianceStatus} onChange={(event) => patch({ complianceStatus: event.target.value as Status })}>
                {COMPLIANCE_STATUSES.map((status) => <option key={status} value={status}>{t(status)}</option>)}
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>{t("Status")}</label>
              <select aria-label={t("Status")} value={form.status} onChange={(event) => patch({ status: event.target.value as Status })}>
                {SUPPLIER_STATUSES.map((status) => <option key={status} value={status}>{t(status)}</option>)}
              </select>
            </div>
          </div>
          <div className="field"><label>{t("Notes")}</label><textarea aria-label={t("Notes")} value={form.notes} onChange={(event) => patch({ notes: event.target.value })} /></div>
          <div className="actions">
            <button className="primary" type="button" disabled={!form.name.trim()} onClick={saveSupplier}>
              {editingId ? t("Save changes") : t("Save supplier")}
            </button>
            <button type="button" onClick={closeForm}>{t("Cancel")}</button>
          </div>
        </section>
      )}

      <div className="grid cols-4">
        <Metric label={t("Supplier count")} value={number(state.suppliers.length)} hint={t("Registered partners")} />
        <Metric label={t("Average reliability")} value={`${average("reliability")}/100`} hint={t("Weighted 35% in score")} tone="info" />
        <Metric label={t("Average quality")} value={`${average("qualityScore")}/100`} hint={t("Weighted 35% in score")} tone="success" />
        <Metric
          label={t("Suppliers needing review")}
          value={number(needsReview)}
          hint={t("Composite score below 85")}
          tone={needsReview > 0 ? "warning" : "success"}
        />
      </div>

      <section className="card">
        <div className="section-title">
          <h3>{t("China partner scorecard")}</h3>
          <span className="chip neutral">{t("Ranked by composite score")}</span>
        </div>
        <p className="muted-text">{t("Composite score blends reliability, quality, lead time, and compliance status.")}</p>
        {scorecard.length === 0 ? (
          <div className="empty">{t("No suppliers to score yet.")}</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("#")}</th>
                  <th>{t("Supplier")}</th>
                  <th>{t("City")}</th>
                  <th>{t("Lead time")}</th>
                  <th>{t("Score")}</th>
                </tr>
              </thead>
              <tbody>
                {scorecard.map(({ supplier, score }, index) => (
                  <tr key={supplier.id}>
                    <td>{index + 1}</td>
                    <td>
                      <strong>{supplier.name}</strong>
                      <div className="meta"><span>{supplier.chineseName || "—"}</span></div>
                    </td>
                    <td>{supplier.city || "—"}</td>
                    <td>{number(supplier.leadTimeDays)} d</td>
                    <td>
                      <span className={`chip ${score >= 85 ? "success" : score >= 70 ? "warning" : "danger"}`}>
                        {score}/100
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <div className="section-title">
          <h3>{t("Supplier directory")}</h3>
          <span className="chip neutral">{number(state.suppliers.length)} {t("partners")}</span>
        </div>
        <div className="list">
          {state.suppliers.length === 0 && <div className="empty">{t("No suppliers found. Add your first partner above.")}</div>}
          {state.suppliers.map((supplier) => {
            const score = getSupplierScore(supplier);
            return (
              <div className="row-card" key={supplier.id}>
                <div className="row-top">
                  <div>
                    <h4>{supplier.name} <span className="chip neutral">{supplier.city || "—"}</span></h4>
                    <div className="meta">
                      <span>{supplier.chineseName || t("No Chinese name")}</span>
                      <span>{t("Lead time days")} {number(supplier.leadTimeDays)} d</span>
                      <span>{supplier.paymentTerms || t("Terms TBC")}</span>
                    </div>
                  </div>
                  <div className="actions">
                    <span className={`chip ${score >= 85 ? "success" : score >= 70 ? "warning" : "danger"}`}>
                      {t("Score")} {score}/100
                    </span>
                    <StatusChip status={supplier.status} label={t(supplier.status)} />
                    <StatusChip status={supplier.complianceStatus} label={`${t("Compliance status")}: ${t(supplier.complianceStatus)}`} />
                  </div>
                </div>

                <ProgressBar
                  value={score}
                  max={100}
                  tone={score >= 85 ? "success" : score >= 70 ? "warning" : "danger"}
                  label={`${t("Partner score")} · ${t("Reliability")} ${supplier.reliability} · ${t("Quality score")} ${supplier.qualityScore}`}
                />

                <div className="meta mt-1">
                  <span>{t("Contact")} <strong>{supplier.contact || "—"}</strong></span>
                  <span>{t("WeChat")} <strong>{supplier.wechat || "—"}</strong></span>
                  <span>{t("Phone")} <strong>{supplier.phone || "—"}</strong></span>
                  <span>{t("Email")} <strong>{supplier.email || "—"}</strong></span>
                  <span>{t("Incoterm")} <strong>{supplier.incoterm || "—"}</strong></span>
                </div>
                {supplier.notes && <p className="muted-text mt-1 mb-0">{supplier.notes}</p>}

                <div className="actions mt-2">
                  <button className="small" type="button" onClick={() => startEdit(supplier)}>{t("Edit")}</button>
                  <button className="small" type="button" onClick={() => toggleStatus(supplier)}>
                    {supplier.status === "active" ? t("Block") : t("Activate")}
                  </button>
                  <button className="small" type="button" onClick={() => removeSupplier(supplier.id)}>{t("Delete")}</button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
