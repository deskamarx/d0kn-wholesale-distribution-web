import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { AppState, ImportBatch, ImportItem, Status } from "../types";
import { compactMoney, money, number, percent, shortDate } from "../lib/format";
import { getImportTotals } from "../lib/intelligence";
import { removeById, uid, upsert } from "../lib/store";
import { useLanguage } from "../i18n";
import { Metric, StatusChip } from "./Ui";

interface Props {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
}

type ImportForm = Omit<ImportBatch, "id">;

const IMPORT_STATUSES: Status[] = ["draft", "pending", "in_progress", "completed", "cancelled"];
const CUSTOMS_STATUSES: Status[] = ["pending", "in_progress", "approved", "completed"];
const CURRENCIES = ["USD", "EUR", "CNY", "GBP", "AED"];

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function Imports({ state, setState }: Props) {
  const { t } = useLanguage();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ImportForm>(() => ({
    reference: "",
    supplierId: state.suppliers[0]?.id ?? "",
    orderDate: isoToday(),
    eta: isoToday(),
    status: "draft",
    customsStatus: "pending",
    currency: state.company.defaultCurrency || "USD",
    exchangeRate: 1,
    dutyPercent: 5,
    freightCost: 0,
    insuranceCost: 0,
    items: [],
    notes: "",
  }));

  const totalsById = useMemo(
    () => new Map(state.imports.map((batch) => [batch.id, getImportTotals(batch, state.products)])),
    [state.imports, state.products]
  );

  const activeImports = state.imports.filter((batch) => !["completed", "cancelled"].includes(batch.status));
  const totalLanded = state.imports.reduce((sum, batch) => sum + (totalsById.get(batch.id)?.landedCost ?? 0), 0);
  const unitsOnOrder = activeImports.reduce((sum, batch) => sum + (totalsById.get(batch.id)?.units ?? 0), 0);
  const customsPending = state.imports.filter((batch) => batch.customsStatus === "pending").length;
  const currency = state.company.defaultCurrency || "USD";

  const patch = (changes: Partial<ImportForm>) => setForm((prev) => ({ ...prev, ...changes }));

  const openAdd = () => {
    setForm({
      reference: "",
      supplierId: state.suppliers[0]?.id ?? "",
      orderDate: isoToday(),
      eta: isoToday(),
      status: "draft",
      customsStatus: "pending",
      currency,
      exchangeRate: 1,
      dutyPercent: 5,
      freightCost: 0,
      insuranceCost: 0,
      items: [],
      notes: "",
    });
    setEditingId(null);
    setShowForm(true);
  };

  const startEdit = (batch: ImportBatch) => {
    setForm({ ...batch, items: batch.items.map((item) => ({ ...item })) });
    setEditingId(batch.id);
    setShowForm(true);
  };

  const closeForm = () => {
    setEditingId(null);
    setShowForm(false);
  };

  const addItem = () => {
    const product = state.products[0];
    setForm((prev) => ({
      ...prev,
      items: [...prev.items, { productId: product?.id ?? "", quantity: 1, unitCost: product?.cost ?? 0 }],
    }));
  };

  const updateItem = (index: number, changes: Partial<ImportItem>) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item, position) => (position === index ? { ...item, ...changes } : item)),
    }));
  };

  const removeItem = (index: number) => {
    setForm((prev) => ({ ...prev, items: prev.items.filter((_, position) => position !== index) }));
  };

  const saveImport = () => {
    if (!form.reference.trim() || form.items.length === 0) return;
    const batch: ImportBatch = {
      ...form,
      id: editingId ?? uid("IMP"),
      reference: form.reference.trim(),
      notes: form.notes.trim(),
      items: form.items.map((item) => ({
        productId: item.productId,
        quantity: Math.max(0, item.quantity),
        unitCost: Math.max(0, item.unitCost),
      })),
    };
    setState((prev) => ({ ...prev, imports: upsert(prev.imports, batch) }));
    closeForm();
  };

  const removeImport = (id: string) => {
    if (!window.confirm(t("Delete this import? This cannot be undone."))) return;
    setState((prev) => ({ ...prev, imports: removeById(prev.imports, id) }));
    if (editingId === id) closeForm();
  };

  const supplierName = (id: string) => state.suppliers.find((supplier) => supplier.id === id)?.name ?? t("Unassigned");

  return (
    <>
      <div className="page-header">
        <div>
          <h2>{t("Imports")}</h2>
          <p>{t("Supplier orders, landed cost build-up, customs clearance, and order item control.")}</p>
        </div>
        <button className="primary" type="button" onClick={openAdd}>{t("Add import")}</button>
      </div>

      {showForm && (
        <section className="card">
          <div className="section-title">
            <h3>{editingId ? t("Edit import") : t("Add import")}</h3>
            <button className="small" type="button" onClick={closeForm}>{t("Cancel")}</button>
          </div>
          <p className="muted-text">{t("Set the commercial terms first, then add the product lines for landed cost calculation.")}</p>

          <div className="field-row">
            <div className="field"><label>{t("Reference")}</label><input value={form.reference} onChange={(event) => patch({ reference: event.target.value })} placeholder={t("IMP-2026-014")} /></div>
            <div className="field">
              <label>{t("Supplier")}</label>
              <select value={form.supplierId} onChange={(event) => patch({ supplierId: event.target.value })}>
                <option value="">{t("Unassigned")}</option>
                {state.suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field"><label>{t("Order date")}</label><input type="date" value={form.orderDate} onChange={(event) => patch({ orderDate: event.target.value })} /></div>
            <div className="field"><label>{t("ETA")}</label><input type="date" value={form.eta} onChange={(event) => patch({ eta: event.target.value })} /></div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>{t("Status")}</label>
              <select value={form.status} onChange={(event) => patch({ status: event.target.value as Status })}>
                {IMPORT_STATUSES.map((status) => <option key={status} value={status}>{t(status)}</option>)}
              </select>
            </div>
            <div className="field">
              <label>{t("Customs status")}</label>
              <select value={form.customsStatus} onChange={(event) => patch({ customsStatus: event.target.value as Status })}>
                {CUSTOMS_STATUSES.map((status) => <option key={status} value={status}>{t(status)}</option>)}
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>{t("Currency")}</label>
              <select value={form.currency} onChange={(event) => patch({ currency: event.target.value })}>
                {CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
              </select>
            </div>
            <div className="field"><label>{t("Exchange rate")}</label><input type="number" min="0" step="0.01" value={form.exchangeRate} onChange={(event) => patch({ exchangeRate: Number(event.target.value) })} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>{t("Duty %")}</label><input type="number" min="0" step="0.1" value={form.dutyPercent} onChange={(event) => patch({ dutyPercent: Number(event.target.value) })} /></div>
            <div className="field"><label>{t("Freight cost")}</label><input type="number" min="0" step="0.01" value={form.freightCost} onChange={(event) => patch({ freightCost: Number(event.target.value) })} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>{t("Insurance cost")}</label><input type="number" min="0" step="0.01" value={form.insuranceCost} onChange={(event) => patch({ insuranceCost: Number(event.target.value) })} /></div>
          </div>

          <div className="section-title" style={{ marginTop: 12 }}>
            <h4>{t("Items")}</h4>
            <button className="small" type="button" onClick={addItem}>{t("Add item")}</button>
          </div>
          {form.items.length === 0 ? (
            <div className="empty">{t("No items added yet.")}</div>
          ) : (
            form.items.map((item, index) => (
              <div className="field-row" key={`${item.productId}-${index}`}>
                <div className="field">
                  <label>{t("Product")}</label>
                  <select value={item.productId} onChange={(event) => updateItem(index, { productId: event.target.value })}>
                    <option value="">{t("Select product")}</option>
                    {state.products.map((product) => (
                      <option key={product.id} value={product.id}>{product.sku} · {product.name}</option>
                    ))}
                  </select>
                </div>
                <div className="field"><label>{t("Quantity")}</label><input type="number" min="0" value={item.quantity} onChange={(event) => updateItem(index, { quantity: Number(event.target.value) })} /></div>
                <div className="field"><label>{t("Unit cost")}</label><input type="number" min="0" step="0.01" value={item.unitCost} onChange={(event) => updateItem(index, { unitCost: Number(event.target.value) })} /></div>
                <div className="field"><label>{t("Remove")}</label><button className="small" type="button" onClick={() => removeItem(index)}>{t("Remove")}</button></div>
              </div>
            ))
          )}

          <div className="field"><label>{t("Notes")}</label><textarea value={form.notes} onChange={(event) => patch({ notes: event.target.value })} /></div>
          <div className="actions">
            <button
              className="primary"
              type="button"
              disabled={!form.reference.trim() || form.items.length === 0}
              onClick={saveImport}
            >
              {editingId ? t("Save changes") : t("Save import")}
            </button>
            <button type="button" onClick={closeForm}>{t("Cancel")}</button>
          </div>
        </section>
      )}

      <div className="grid cols-4">
        <Metric label={t("Active imports")} value={number(activeImports.length)} hint={t("Draft or in progress")} tone="info" />
        <Metric label={t("Total landed cost")} value={compactMoney(totalLanded, currency)} hint={t("All import batches")} />
        <Metric label={t("Units on order")} value={number(unitsOnOrder)} hint={t("Active batches only")} />
        <Metric
          label={t("Customs pending count")}
          value={number(customsPending)}
          hint={t("Awaiting clearance")}
          tone={customsPending > 0 ? "warning" : "success"}
        />
      </div>

      <section className="card">
        <div className="section-title">
          <h3>{t("Import batches")}</h3>
          <span className="chip neutral">{number(state.imports.length)} {t("shown")}</span>
        </div>
        <div className="list">
          {state.imports.length === 0 && <div className="empty">{t("No imports found. Add your first import above.")}</div>}
          {state.imports.map((batch) => {
            const totals = totalsById.get(batch.id) ?? getImportTotals(batch, state.products);
            const margin = totals.wholesaleValue > 0
              ? ((totals.wholesaleValue - totals.landedCost) / totals.wholesaleValue) * 100
              : 0;
            return (
              <div className="row-card" key={batch.id}>
                <div className="row-top">
                  <div>
                    <h4>{batch.reference}</h4>
                    <div className="meta">
                      <span>{supplierName(batch.supplierId)}</span>
                      <span>{t("ETA")} {shortDate(batch.eta)}</span>
                      <span>{t("Units on order")} {number(totals.units)}</span>
                      <span>{t("Item count")} {batch.items.length}</span>
                    </div>
                  </div>
                  <div className="actions">
                    <StatusChip status={batch.status} label={t(batch.status)} />
                    <StatusChip status={batch.customsStatus} label={`${t("Customs status")}: ${t(batch.customsStatus)}`} />
                    <span className="chip neutral">{t("Landed cost")} {money(totals.landedCost, batch.currency)}</span>
                    <span className={`chip ${margin >= 20 ? "success" : margin >= 0 ? "warning" : "danger"}`}>
                      {t("Gross margin")} {percent(margin)}
                    </span>
                  </div>
                </div>

                <div className="detail-grid" style={{ marginTop: 10 }}>
                  <div className="detail-item"><span>{t("Goods cost")}</span><strong>{money(totals.goodsCost, batch.currency)}</strong></div>
                  <div className="detail-item"><span>{t("Duty")}</span><strong>{money(totals.duty, batch.currency)}</strong></div>
                  <div className="detail-item"><span>{t("Freight cost")}</span><strong>{money(batch.freightCost, batch.currency)}</strong></div>
                  <div className="detail-item"><span>{t("Insurance cost")}</span><strong>{money(batch.insuranceCost, batch.currency)}</strong></div>
                  <div className="detail-item"><span>{t("Landed cost")}</span><strong>{money(totals.landedCost, batch.currency)}</strong></div>
                  <div className="detail-item"><span>{t("Landed unit cost")}</span><strong>{money(totals.landedUnitCost, batch.currency)}</strong></div>
                  <div className="detail-item"><span>{t("Wholesale value")}</span><strong>{money(totals.wholesaleValue, batch.currency)}</strong></div>
                  <div className="detail-item"><span>{t("Gross margin")}</span><strong>{percent(margin)}</strong></div>
                </div>
                {batch.notes && <p className="muted-text" style={{ marginTop: 8, marginBottom: 0 }}>{batch.notes}</p>}

                <div className="actions" style={{ marginTop: 10 }}>
                  <button className="small" type="button" onClick={() => startEdit(batch)}>{t("Edit")}</button>
                  <button className="small" type="button" onClick={() => removeImport(batch.id)}>{t("Delete")}</button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
