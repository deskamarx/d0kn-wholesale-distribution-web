import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { AppState, Product, Status } from "../types";
import { compactMoney, money, number, percent } from "../lib/format";
import { getForecast, getInventoryValue, getLowStock, getWholesaleInventoryValue } from "../lib/intelligence";
import { removeById, uid, updateById, upsert } from "../lib/store";
import { useLanguage } from "../i18n";
import { BarList, Metric, ProgressBar, StatusChip } from "./Ui";

interface Props {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
}

type ProductForm = Omit<Product, "id">;

const PRODUCT_STATUSES: Status[] = ["active", "pending", "blocked"];

function emptyProduct(): ProductForm {
  return {
    sku: "",
    name: "",
    category: "Accessories",
    brand: "",
    model: "",
    supplierId: "",
    countryOfOrigin: "China",
    unit: "unit",
    hsCode: "",
    cost: 0,
    wholesalePrice: 0,
    retailPrice: 0,
    moq: 0,
    stock: 0,
    reorderPoint: 0,
    warrantyMonths: 12,
    status: "active",
    notes: "",
  };
}

export default function Products({ state, setState }: Props) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyProduct);

  const categories = useMemo(
    () => Array.from(new Set(state.products.map((product) => product.category))).sort(),
    [state.products]
  );
  const lowStock = useMemo(() => getLowStock(state), [state]);
  const lowStockIds = useMemo(() => new Set(lowStock.map((product) => product.id)), [lowStock]);
  const forecasts = useMemo(
    () => new Map(state.products.map((product) => [product.id, getForecast(state, product.id)])),
    [state]
  );

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return state.products.filter((product) => {
      const matchesCategory = !category || product.category === category;
      const matchesTerm =
        !term ||
        [product.sku, product.name, product.brand, product.category].join(" ").toLowerCase().includes(term);
      return matchesCategory && matchesTerm;
    });
  }, [state.products, query, category]);

  const patch = (changes: Partial<ProductForm>) => setForm((prev) => ({ ...prev, ...changes }));

  const openAdd = () => {
    setForm(emptyProduct());
    setEditingId(null);
    setShowForm(true);
  };

  const startEdit = (product: Product) => {
    setForm({ ...product });
    setEditingId(product.id);
    setShowForm(true);
  };

  const closeForm = () => {
    setForm(emptyProduct());
    setEditingId(null);
    setShowForm(false);
  };

  const saveProduct = () => {
    if (!form.sku.trim() || !form.name.trim()) return;
    const product: Product = {
      ...form,
      id: editingId ?? uid("PRD"),
      sku: form.sku.trim(),
      name: form.name.trim(),
      brand: form.brand.trim(),
      model: form.model.trim(),
      hsCode: form.hsCode.trim(),
      notes: form.notes.trim(),
    };
    setState((prev) => ({ ...prev, products: upsert(prev.products, product) }));
    closeForm();
  };

  const removeProduct = (id: string) => {
    if (!window.confirm(t("Delete this product? This cannot be undone."))) return;
    setState((prev) => ({ ...prev, products: removeById(prev.products, id) }));
    if (editingId === id) closeForm();
  };

  const toggleStatus = (product: Product) => {
    setState((prev) => ({
      ...prev,
      products: updateById(prev.products, product.id, {
        status: product.status === "active" ? "blocked" : "active",
      }),
    }));
  };

  const supplierName = (id: string) => state.suppliers.find((supplier) => supplier.id === id)?.name ?? t("Unassigned");

  return (
    <>
      <div className="page-header">
        <div>
          <h2>{t("Products")}</h2>
          <p>{t("Catalogue, landed cost, stock cover, and intelligent reorder signals for every SKU.")}</p>
        </div>
        <button className="primary" type="button" onClick={openAdd}>{t("Add product")}</button>
      </div>

      {showForm && (
        <section className="card">
          <div className="section-title">
            <h3>{editingId ? t("Edit product") : t("Add product")}</h3>
            <button className="small" type="button" onClick={closeForm}>{t("Cancel")}</button>
          </div>
          <p className="muted-text">
            {t("Keep cost, wholesale pricing, and reorder point aligned with the current supplier terms.")}
          </p>

          <div className="field-row">
            <div className="field"><label>{t("SKU")}</label><input value={form.sku} onChange={(event) => patch({ sku: event.target.value })} placeholder={t("PH-X9P-256")} /></div>
            <div className="field"><label>{t("Name")}</label><input value={form.name} onChange={(event) => patch({ name: event.target.value })} placeholder={t("Nova X9 Pro 256GB")} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>{t("Category")}</label><input value={form.category} onChange={(event) => patch({ category: event.target.value })} /></div>
            <div className="field"><label>{t("Brand")}</label><input value={form.brand} onChange={(event) => patch({ brand: event.target.value })} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>{t("Model")}</label><input value={form.model} onChange={(event) => patch({ model: event.target.value })} /></div>
            <div className="field"><label>{t("HS code")}</label><input value={form.hsCode} onChange={(event) => patch({ hsCode: event.target.value })} placeholder={t("8517.13")} /></div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>{t("Supplier")}</label>
              <select value={form.supplierId} onChange={(event) => patch({ supplierId: event.target.value })}>
                <option value="">{t("Unassigned")}</option>
                {state.suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                ))}
              </select>
            </div>
            <div className="field"><label>{t("Country of origin")}</label><input value={form.countryOfOrigin} onChange={(event) => patch({ countryOfOrigin: event.target.value })} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>{t("Unit")}</label><input value={form.unit} onChange={(event) => patch({ unit: event.target.value })} /></div>
            <div className="field"><label>{t("Warranty months")}</label><input type="number" min="0" value={form.warrantyMonths} onChange={(event) => patch({ warrantyMonths: Number(event.target.value) })} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>{t("Cost")}</label><input type="number" min="0" step="0.01" value={form.cost} onChange={(event) => patch({ cost: Number(event.target.value) })} /></div>
            <div className="field"><label>{t("Wholesale price")}</label><input type="number" min="0" step="0.01" value={form.wholesalePrice} onChange={(event) => patch({ wholesalePrice: Number(event.target.value) })} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>{t("Retail price")}</label><input type="number" min="0" step="0.01" value={form.retailPrice} onChange={(event) => patch({ retailPrice: Number(event.target.value) })} /></div>
            <div className="field"><label>{t("MOQ")}</label><input type="number" min="0" value={form.moq} onChange={(event) => patch({ moq: Number(event.target.value) })} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>{t("Stock")}</label><input type="number" min="0" value={form.stock} onChange={(event) => patch({ stock: Number(event.target.value) })} /></div>
            <div className="field"><label>{t("Reorder point")}</label><input type="number" min="0" value={form.reorderPoint} onChange={(event) => patch({ reorderPoint: Number(event.target.value) })} /></div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>{t("Status")}</label>
              <select value={form.status} onChange={(event) => patch({ status: event.target.value as Status })}>
                {PRODUCT_STATUSES.map((status) => <option key={status} value={status}>{t(status)}</option>)}
              </select>
            </div>
          </div>
          <div className="field"><label>{t("Notes")}</label><textarea value={form.notes} onChange={(event) => patch({ notes: event.target.value })} /></div>
          <div className="actions">
            <button className="primary" type="button" disabled={!form.sku.trim() || !form.name.trim()} onClick={saveProduct}>
              {editingId ? t("Save changes") : t("Save product")}
            </button>
            <button type="button" onClick={closeForm}>{t("Cancel")}</button>
          </div>
        </section>
      )}

      <div className="grid cols-4">
        <Metric label={t("Total SKUs")} value={number(state.products.length)} hint={t("Across all categories")} />
        <Metric
          label={t("Low stock")}
          value={number(lowStock.length)}
          hint={t("At or below reorder point")}
          tone={lowStock.length > 0 ? "danger" : "success"}
        />
        <Metric label={t("Inventory value")} value={compactMoney(getInventoryValue(state))} hint={t("At landed unit cost")} />
        <Metric label={t("Wholesale inventory value")} value={compactMoney(getWholesaleInventoryValue(state))} hint={t("At current wholesale price")} tone="info" />
      </div>

      <section className="card">
        <div className="section-title">
          <h3>{t("Reorder watch")}</h3>
          <span className={`chip ${lowStock.length > 0 ? "warning" : "success"}`}>
            {lowStock.length > 0 ? `${number(lowStock.length)} ${t("to review")}` : t("All healthy")}
          </span>
        </div>
        {lowStock.length === 0 ? (
          <div className="empty">{t("Every active SKU is above its reorder point.")}</div>
        ) : (
          <BarList
            items={lowStock.map((product) => ({
              label: `${product.sku} · ${product.name}`,
              value: forecasts.get(product.id) ?? 0,
              tone: "warning",
            }))}
            maxLabel={(value) => `${number(value)} ${t("Demand forecast")}`}
          />
        )}
      </section>

      <section className="card">
        <div className="section-title">
          <h3>{t("Product catalogue")}</h3>
          <span className="chip neutral">{number(filtered.length)} {t("shown")}</span>
        </div>
        <div className="toolbar">
          <input
            placeholder={t("Search SKU, name, brand, category...")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label={t("Filter by category")}>
            <option value="">{t("All categories")}</option>
            {categories.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
          </select>
        </div>
        <div className="list">
          {filtered.length === 0 && <div className="empty">{t("No products match the current filters.")}</div>}
          {filtered.map((product) => {
            const low = lowStockIds.has(product.id);
            const forecast = forecasts.get(product.id) ?? 0;
            const margin = product.wholesalePrice > 0
              ? ((product.wholesalePrice - product.cost) / product.wholesalePrice) * 100
              : 0;
            const needsReorder = low || forecast > product.stock;
            return (
              <div className="row-card" key={product.id}>
                <div className="row-top">
                  <div>
                    <h4>{product.name} <span className="chip neutral">{product.sku}</span></h4>
                    <div className="meta">
                      <span>{supplierName(product.supplierId)}</span>
                      <span>{product.category} · {product.brand}</span>
                      <span>{t("HS code")} {product.hsCode || "—"}</span>
                    </div>
                  </div>
                  <div className="actions">
                    {low ? <span className="chip danger">{t("low stock")}</span> : <span className="chip success">{t("healthy")}</span>}
                    {needsReorder && <span className="chip warning">{t("reorder flag")}</span>}
                    <StatusChip status={product.status} label={t(product.status)} />
                  </div>
                </div>

                <ProgressBar
                  value={product.stock}
                  max={Math.max(product.reorderPoint, product.stock, 1)}
                  tone={low ? "danger" : "success"}
                  label={`${t("Stock")} ${number(product.stock)} / ${t("Reorder point")} ${number(product.reorderPoint)}`}
                />

                <div className="meta" style={{ marginTop: 8 }}>
                  <span>{t("Cost")} <strong>{money(product.cost)}</strong></span>
                  <span>{t("Wholesale price")} <strong>{money(product.wholesalePrice)}</strong></span>
                  <span>{t("Margin")} <strong>{percent(margin)}</strong></span>
                  <span>{t("MOQ")} <strong>{number(product.moq)}</strong></span>
                  <span>{t("30d demand")} <strong>{number(forecast)}</strong></span>
                </div>
                {product.notes && <p className="muted-text" style={{ marginTop: 8, marginBottom: 0 }}>{product.notes}</p>}

                <div className="actions" style={{ marginTop: 10 }}>
                  <button className="small" type="button" onClick={() => startEdit(product)}>{t("Edit")}</button>
                  <button className="small" type="button" onClick={() => toggleStatus(product)}>
                    {product.status === "active" ? t("Block") : t("Activate")}
                  </button>
                  <button className="small" type="button" onClick={() => removeProduct(product.id)}>{t("Delete")}</button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
