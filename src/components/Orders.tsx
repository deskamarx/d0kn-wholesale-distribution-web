import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { AppState, Order, OrderLine, Product, Status } from "../types";
import { compactMoney, money, number, percent, shortDate } from "../lib/format";
import { getOrderMargin, getOrderTotal, lineAmount } from "../lib/intelligence";
import { removeById, uid, updateById, upsert } from "../lib/store";
import { useLanguage } from "../i18n";
import { duplicateExists, readErrorsAloud, useDirtyForm } from "../lib/forms";
import { EmptyState, RequiredProgress, ValidationSummary } from "./Common";
import { useUndoDelete } from "./Feedback";
import { Metric, StatusChip } from "./Ui";

interface Props {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
}

const todayIso = (): string => new Date().toISOString().slice(0, 10);

function makeEmptyOrder(state: AppState): Order {
  const day = todayIso();
  return {
    id: "",
    number: `ORD-${new Date().getFullYear()}-${String(state.orders.length + 1).padStart(3, "0")}`,
    customerId: state.customers[0]?.id ?? "",
    date: day,
    status: "draft",
    warehouseId: state.warehouses.find((warehouse) => warehouse.status === "active")?.id ?? state.warehouses[0]?.id ?? "",
    shippingStatus: "pending",
    items: [],
    notes: "",
  };
}

function stockRequirements(items: OrderLine[]): Map<string, number> {
  const requirements = new Map<string, number>();
  items.forEach((item) => {
    if (!item.productId || item.quantity <= 0) return;
    requirements.set(item.productId, (requirements.get(item.productId) ?? 0) + item.quantity);
  });
  return requirements;
}

function applyStockChange(products: Product[], delta: Map<string, number>): Product[] {
  return products.map((product) => {
    const amount = delta.get(product.id) ?? 0;
    return amount === 0 ? product : { ...product, stock: product.stock - amount };
  });
}

function orderStockDelta(order: Order, sign: number): Map<string, number> {
  const delta = new Map<string, number>();
  if (order.status !== "completed") return delta;
  stockRequirements(order.items).forEach((quantity, productId) => {
    delta.set(productId, (delta.get(productId) ?? 0) + sign * quantity);
  });
  return delta;
}

const noRequirements = new Map<string, number>();

export default function Orders({ state, setState }: Props) {
  const { t, language } = useLanguage();
  const [form, setForm] = useState<Order>(() => makeEmptyOrder(state));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [errors, setErrors] = useState<string[]>([]);
  const [formKey, setFormKey] = useState(0);
  const undoDelete = useUndoDelete();
  const { confirmDiscard } = useDirtyForm(form, `${editingId ?? "new"}-${formKey}`);

  const customerName = (id: string): string =>
    state.customers.find((customer) => customer.id === id)?.company ?? t("Unknown customer");
  const warehouseCode = (id: string): string =>
    state.warehouses.find((warehouse) => warehouse.id === id)?.code ?? t("Unknown warehouse");

  const linesTotal = (items: OrderLine[]): number => items.reduce((sum, item) => sum + lineAmount(item), 0);

  const openOrders = state.orders.filter((order) => order.status !== "cancelled");
  const orderValue = openOrders.reduce((sum, order) => sum + getOrderTotal(order, state.products), 0);
  const completedRevenue = state.orders
    .filter((order) => order.status === "completed")
    .reduce((sum, order) => sum + getOrderTotal(order, state.products), 0);
  const margins = openOrders.map((order) => getOrderMargin(order, state.products));
  const averageMargin = margins.length ? margins.reduce((sum, margin) => sum + margin, 0) / margins.length : 0;

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return state.orders
      .filter((order) => statusFilter === "all" || order.status === statusFilter)
      .filter((order) => {
        if (!term) return true;
        const company = state.customers.find((customer) => customer.id === order.customerId)?.company ?? "";
        const warehouse = state.warehouses.find((entry) => entry.id === order.warehouseId)?.code ?? "";
        return [order.number, company, warehouse, order.shippingStatus, order.notes].join(" ").toLowerCase().includes(term);
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [state.orders, state.customers, state.warehouses, statusFilter, query]);

  const validateAvailability = (items: OrderLine[], credit: Map<string, number>, reference: string): boolean => {
    const shortages: string[] = [];
    stockRequirements(items).forEach((quantity, productId) => {
      const product = state.products.find((entry) => entry.id === productId);
      const available = (product?.stock ?? 0) + (credit.get(productId) ?? 0);
      if (!product) {
        shortages.push(`${productId}: ${t("Product not found")}`);
      } else if (available < quantity) {
        shortages.push(`${product.name}: ${t("need")} ${number(quantity)}, ${t("have")} ${number(Math.max(0, available))}`);
      }
    });
    if (shortages.length === 0) return true;
    alert(`${t("Cannot complete")} ${reference}. ${t("Insufficient stock")}:\n${shortages.join("\n")}`);
    return false;
  };

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

  const saveOrder = () => {
    const found: string[] = [];
    if (!form.number.trim()) found.push(t("Order number is required"));
    if (!form.customerId) found.push(t("Customer is required"));
    if (duplicateExists(state.orders, "number", form.number, editingId ?? undefined)) {
      found.push(t("An order with this number already exists"));
    }
    if (form.items.length === 0) found.push(t("Add at least one order line"));
    form.items.forEach((item, index) => {
      if (!item.productId) found.push(t("Select a product for line {number}.", { number: index + 1 }));
      if (item.quantity <= 0) found.push(t("Quantity must be greater than zero on line {number}.", { number: index + 1 }));
    });
    if (found.length) {
      setErrors(found);
      void readErrorsAloud(found, language);
      return;
    }
    setErrors([]);
    const items = form.items.map((item) => ({
      ...item,
      quantity: Math.max(0, item.quantity),
      unitPrice: Math.max(0, item.unitPrice),
      discountPercent: Math.min(100, Math.max(0, item.discountPercent)),
    }));
    const previousOrder = editingId ? state.orders.find((order) => order.id === editingId) : undefined;
    const wasCompleted = previousOrder?.status === "completed";
    const willComplete = form.status === "completed";
    const oldRequirements = previousOrder ? stockRequirements(previousOrder.items) : noRequirements;
    const newRequirements = stockRequirements(items);

    if (willComplete && !validateAvailability(items, wasCompleted ? oldRequirements : noRequirements, form.number.trim())) {
      return;
    }

    const delta = new Map<string, number>();
    if (wasCompleted) {
      oldRequirements.forEach((quantity, productId) => delta.set(productId, (delta.get(productId) ?? 0) - quantity));
    }
    if (willComplete) {
      newRequirements.forEach((quantity, productId) => delta.set(productId, (delta.get(productId) ?? 0) + quantity));
    }

    const order: Order = {
      ...form,
      id: editingId ?? uid("ORD"),
      number: form.number.trim(),
      items,
      notes: form.notes.trim(),
    };
    setState((prev) => ({
      ...prev,
      products: applyStockChange(prev.products, delta),
      orders: upsert(prev.orders, order),
    }));
    setForm(makeEmptyOrder(state));
    setErrors([]);
    setEditingId(null);
    setFormKey((current) => current + 1);
  };

  const editOrder = (order: Order) => {
    setForm({ ...order, items: order.items.map((item) => ({ ...item })) });
    setErrors([]);
    setEditingId(order.id);
    setFormKey((current) => current + 1);
  };

  const cancelEdit = () => {
    if (!confirmDiscard(t("Discard unsaved changes?"))) return;
    setForm(makeEmptyOrder(state));
    setErrors([]);
    setEditingId(null);
    setFormKey((current) => current + 1);
  };

  const deleteOrder = (order: Order) => {
    if (!window.confirm(`${t("Delete order")} ${order.number}?`)) return;
    undoDelete(
      () => setState((prev) => ({
        ...prev,
        products: applyStockChange(prev.products, orderStockDelta(order, -1)),
        orders: removeById(prev.orders, order.id),
      })),
      () => setState((prev) => ({
        ...prev,
        products: applyStockChange(prev.products, orderStockDelta(order, 1)),
        orders: upsert(prev.orders, order),
      }))
    );
    if (editingId === order.id) {
      setForm(makeEmptyOrder(state));
      setErrors([]);
      setEditingId(null);
    }
  };

  const changeStatus = (order: Order, nextStatus: Status) => {
    if (order.status === nextStatus) return;
    const wasCompleted = order.status === "completed";
    const willComplete = nextStatus === "completed";
    const oldRequirements = stockRequirements(order.items);
    const delta = new Map<string, number>();

    if (wasCompleted) {
      oldRequirements.forEach((quantity, productId) => delta.set(productId, (delta.get(productId) ?? 0) - quantity));
    }
    if (willComplete) {
      if (!validateAvailability(order.items, wasCompleted ? oldRequirements : noRequirements, order.number)) return;
      oldRequirements.forEach((quantity, productId) => delta.set(productId, (delta.get(productId) ?? 0) + quantity));
    }

    setState((prev) => ({
      ...prev,
      products: applyStockChange(prev.products, delta),
      orders: updateById(prev.orders, order.id, { status: nextStatus }),
    }));
  };

  const changeShippingStatus = (order: Order, shippingStatus: Status) => {
    setState((prev) => ({ ...prev, orders: updateById(prev.orders, order.id, { shippingStatus }) }));
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h2>{t("Orders")}</h2>
          <p>{t("Fulfilment, shipping progress, margins, and stock-aware completion.")}</p>
        </div>
      </div>

      <div className="grid cols-4">
        <Metric label={t("Orders count")} value={number(state.orders.length)} hint={`${number(state.orders.length)} ${t("records")}`} tone="info" />
        <Metric label={t("Order value")} value={compactMoney(orderValue)} hint={t("Excludes cancelled orders")} />
        <Metric label={t("Completed revenue")} value={compactMoney(completedRevenue)} hint={t("Completed orders only")} tone="success" />
        <Metric label={t("Average margin")} value={percent(averageMargin)} hint={t("Across active orders")} tone={averageMargin < 10 ? "warning" : "success"} />
      </div>

      <div className="card">
        <div className="section-title">
          <h3>{editingId ? t("Edit order") : t("Add order")}</h3>
          <span className="chip info">{`${number(state.orders.length)} ${t("records")}`}</span>
        </div>
        <ValidationSummary errors={errors} />
        <RequiredProgress
          complete={(form.number.trim() ? 1 : 0) + (form.customerId ? 1 : 0) + (form.items.length ? 1 : 0)}
          total={3}
        />
        <div className="inline-calculator" aria-live="polite">
          <div><span>{t("Order total")}</span><strong>{money(linesTotal(form.items), state.company.defaultCurrency)}</strong></div>
          <div><span>{t("Estimated margin")}</span><strong>{percent(getOrderMargin(form, state.products))}</strong></div>
          <div><span>{t("Lines")}</span><strong>{number(form.items.length)}</strong></div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>{t("Number")}</label>
            <input aria-label={t("Number")} value={form.number} onChange={(event) => setForm({ ...form, number: event.target.value })} />
          </div>
          <div className="field">
            <label>{t("Customer")}</label>
            <select aria-label={t("Customer")} value={form.customerId} onChange={(event) => setForm({ ...form, customerId: event.target.value })}>
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
            <input aria-label={t("Date")} type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
          </div>
          <div className="field">
            <label>{t("Warehouse")}</label>
            <select aria-label={t("Warehouse")} value={form.warehouseId} onChange={(event) => setForm({ ...form, warehouseId: event.target.value })}>
              <option value="">{t("Select warehouse")}</option>
              {state.warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>{t("Status")}</label>
            <select aria-label={t("Status")} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Status })}>
              <option value="draft">{t("draft")}</option>
              <option value="in_progress">{t("in_progress")}</option>
              <option value="completed">{t("completed")}</option>
              <option value="cancelled">{t("cancelled")}</option>
              <option value="blocked">{t("blocked")}</option>
            </select>
          </div>
          <div className="field">
            <label>{t("Shipping status")}</label>
            <select aria-label={t("Shipping status")} value={form.shippingStatus} onChange={(event) => setForm({ ...form, shippingStatus: event.target.value as Status })}>
              <option value="pending">{t("pending")}</option>
              <option value="in_progress">{t("in_progress")}</option>
              <option value="completed">{t("completed")}</option>
              <option value="cancelled">{t("cancelled")}</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label>{t("Notes")}</label>
          <textarea aria-label={t("Notes")} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </div>

        <div className="section-title">
          <h3>{t("Order lines")}</h3>
          <button className="small" type="button" onClick={addLine}>{t("Add item")}</button>
        </div>
        <div className="order-lines">
          {form.items.length === 0 && (
            <EmptyState
              title={t("No line items yet.")}
              description={t("Add a product to calculate the order value and reserve stock on completion.")}
              actionLabel={t("Add item")}
              onAction={addLine}
            />
          )}
          {form.items.map((item, index) => (
            <div className="line-row" key={index}>
              <div className="field">
                <label>{t("Product")}</label>
                <select aria-label={t("Product")} value={item.productId} onChange={(event) => selectProduct(index, event.target.value)}>
                  <option value="">{t("Select product")}</option>
                  {state.products.map((product) => (
                    <option key={product.id} value={product.id}>{product.name}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>{t("Quantity")}</label>
                <input aria-label={t("Quantity")} type="number" min={0} value={item.quantity} onChange={(event) => updateLine(index, { quantity: Math.max(0, Number(event.target.value)) })} />
              </div>
              <div className="field">
                <label>{t("Unit price")}</label>
                <input aria-label={t("Unit price")} type="number" min={0} value={item.unitPrice} onChange={(event) => updateLine(index, { unitPrice: Math.max(0, Number(event.target.value)) })} />
              </div>
              <div className="field">
                <label>{t("Discount %")}</label>
                <input aria-label={t("Discount %")} type="number" min={0} max={100} value={item.discountPercent} onChange={(event) => updateLine(index, { discountPercent: Math.min(100, Math.max(0, Number(event.target.value))) })} />
              </div>
              <div className="field">
                <label>{t("Amount")}</label>
                <input aria-label={t("Amount")} readOnly value={money(lineAmount(item))} />
              </div>
              <div className="field">
                <button className="small" type="button" onClick={() => removeLine(index)}>{t("Remove")}</button>
              </div>
            </div>
          ))}
        </div>
        <div className="actions mt-1">
          <button className="primary" type="button" onClick={saveOrder}>{editingId ? t("Save changes") : t("Add order")}</button>
          {editingId && <button type="button" onClick={cancelEdit}>{t("Cancel")}</button>}
          <span>{`${t("Total")}: ${money(linesTotal(form.items))}`}</span>
        </div>
      </div>

      <div className="card">
        <div className="section-title">
          <h3>{t("Order history")}</h3>
          <span className="chip warning">{t("Stock is checked on completion")}</span>
        </div>
        <div className="toolbar">
          <input aria-label={t("Search orders...")} placeholder={t("Search orders...")} value={query} onChange={(event) => setQuery(event.target.value)} />
          <select aria-label={t("Status")} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">{t("All statuses")}</option>
            <option value="draft">{t("draft")}</option>
            <option value="in_progress">{t("in_progress")}</option>
            <option value="completed">{t("completed")}</option>
            <option value="cancelled">{t("cancelled")}</option>
            <option value="blocked">{t("blocked")}</option>
          </select>
        </div>
        <div className="list">
          {filtered.length === 0 && (
            <EmptyState
              title={t("No orders found.")}
              description={t("Try another status or search term, or create the first order above.")}
              actionLabel={query || statusFilter !== "all" ? t("Clear filters") : undefined}
              onAction={query || statusFilter !== "all" ? () => { setQuery(""); setStatusFilter("all"); } : undefined}
            />
          )}
          {filtered.map((order) => {
            const total = getOrderTotal(order, state.products);
            const margin = getOrderMargin(order, state.products);
            return (
              <div
                className="row-card"
                key={order.id}
                data-preview={`${order.number} · ${customerName(order.customerId)} · ${t("Status")}: ${t(order.status)}`}
              >
                <div className="row-top">
                  <div>
                    <h4>{order.number}</h4>
                    <div className="meta">
                      <span>{customerName(order.customerId)}</span>
                      <span>{`${t("Date")}: ${shortDate(order.date)}`}</span>
                      <span>{`${t("Warehouse")}: ${warehouseCode(order.warehouseId)}`}</span>
                      <span>{`${number(order.items.length)} ${t("lines")}`}</span>
                    </div>
                  </div>
                  <div className="actions">
                    <StatusChip status={order.status} label={t(order.status)} />
                    <StatusChip status={order.shippingStatus} label={t(order.shippingStatus)} />
                    <strong>{money(total)}</strong>
                  </div>
                </div>
                <div className="detail-grid auto-fit mt-3">
                  <div className="detail-item"><span>{t("Order value")}</span><strong>{money(total)}</strong></div>
                  <div className="detail-item">
                    <span>{t("Margin")}</span>
                    <strong style={{ color: margin < 10 ? "var(--danger)" : undefined }}>{percent(margin)}</strong>
                  </div>
                </div>
                <div className="toolbar mt-3 tight">
                  <select value={order.status} onChange={(event) => changeStatus(order, event.target.value as Status)} aria-label={t("Status")}>
                    <option value="draft">{t("draft")}</option>
                    <option value="in_progress">{t("in_progress")}</option>
                    <option value="completed">{t("completed")}</option>
                    <option value="cancelled">{t("cancelled")}</option>
                    <option value="blocked">{t("blocked")}</option>
                  </select>
                  <select value={order.shippingStatus} onChange={(event) => changeShippingStatus(order, event.target.value as Status)} aria-label={t("Shipping status")}>
                    <option value="pending">{t("pending")}</option>
                    <option value="in_progress">{t("in_progress")}</option>
                    <option value="completed">{t("completed")}</option>
                    <option value="cancelled">{t("cancelled")}</option>
                  </select>
                  <button className="small" type="button" onClick={() => editOrder(order)}>{t("Edit")}</button>
                  <button className="small" type="button" onClick={() => deleteOrder(order)}>{t("Delete")}</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
