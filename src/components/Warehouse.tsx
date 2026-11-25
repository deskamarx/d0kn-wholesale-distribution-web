import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { AppState, MovementType, Product, Status, StockMovement, Warehouse } from "../types";
import { number, percent, shortDate, titleCase } from "../lib/format";
import { removeById, uid, upsert } from "../lib/store";
import { useLanguage } from "../i18n";
import { Metric, ProgressBar, StatusChip } from "./Ui";

interface Props {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
}

const todayIso = (): string => new Date().toISOString().slice(0, 10);

const emptyWarehouse: Warehouse = {
  id: "",
  code: "",
  name: "",
  city: "",
  capacity: 0,
  used: 0,
  manager: "",
  status: "active",
};

const emptyMovement = {
  productId: "",
  warehouseId: "",
  type: "inbound" as MovementType,
  quantity: 1,
  date: todayIso(),
  reference: "",
  notes: "",
};

function stockDelta(type: MovementType, quantity: number): number {
  const amount = Math.abs(quantity);
  if (type === "inbound") return amount;
  if (type === "outbound" || type === "adjustment") return -amount;
  return 0;
}

function adjustStock(products: Product[], productId: string, delta: number): Product[] {
  if (!delta) return products;
  return products.map((product) =>
    product.id === productId ? { ...product, stock: product.stock + delta } : product
  );
}

function movementTone(type: MovementType): string {
  if (type === "inbound") return "success";
  if (type === "outbound") return "warning";
  if (type === "adjustment") return "danger";
  return "info";
}

function utilizationTone(value: number): "success" | "warning" | "danger" {
  if (value >= 90) return "danger";
  if (value >= 75) return "warning";
  return "success";
}

export default function Warehouse({ state, setState }: Props) {
  const { t } = useLanguage();
  const [warehouseForm, setWarehouseForm] = useState<Warehouse>(emptyWarehouse);
  const [movementForm, setMovementForm] = useState(emptyMovement);
  const [editingWarehouseId, setEditingWarehouseId] = useState<string | null>(null);
  const [editingMovementId, setEditingMovementId] = useState<string | null>(null);
  const [warehouseQuery, setWarehouseQuery] = useState("");
  const [movementQuery, setMovementQuery] = useState("");

  const productName = (id: string): string =>
    state.products.find((product) => product.id === id)?.name ?? t("Unknown product");
  const warehouseCode = (id: string): string =>
    state.warehouses.find((warehouse) => warehouse.id === id)?.code ?? t("Unknown warehouse");

  const activeWarehouses = state.warehouses.filter((warehouse) => warehouse.status === "active").length;
  const totalCapacity = state.warehouses.reduce((sum, warehouse) => sum + warehouse.capacity, 0);
  const usedCapacity = state.warehouses.reduce((sum, warehouse) => sum + warehouse.used, 0);
  const overallUtilization = totalCapacity > 0 ? (usedCapacity / totalCapacity) * 100 : 0;

  const filteredWarehouses = useMemo(() => {
    const term = warehouseQuery.trim().toLowerCase();
    if (!term) return state.warehouses;
    return state.warehouses.filter((warehouse) =>
      [warehouse.code, warehouse.name, warehouse.city, warehouse.manager].join(" ").toLowerCase().includes(term)
    );
  }, [state.warehouses, warehouseQuery]);

  const filteredMovements = useMemo(() => {
    const term = movementQuery.trim().toLowerCase();
    if (!term) return state.movements;
    return state.movements.filter((movement) =>
      [
        state.products.find((product) => product.id === movement.productId)?.name ?? "",
        state.warehouses.find((warehouse) => warehouse.id === movement.warehouseId)?.code ?? "",
        movement.type,
        movement.reference,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [state.movements, state.products, state.warehouses, movementQuery]);

  const saveWarehouse = () => {
    if (!warehouseForm.code.trim() || !warehouseForm.name.trim()) {
      alert(t("Warehouse code and name are required."));
      return;
    }
    const capacity = Math.max(0, warehouseForm.capacity);
    const warehouse: Warehouse = {
      ...warehouseForm,
      id: editingWarehouseId ?? uid("WH"),
      code: warehouseForm.code.trim(),
      name: warehouseForm.name.trim(),
      city: warehouseForm.city.trim(),
      manager: warehouseForm.manager.trim(),
      capacity,
      used: Math.min(Math.max(0, warehouseForm.used), capacity),
    };
    setState((prev) => ({ ...prev, warehouses: upsert(prev.warehouses, warehouse) }));
    setWarehouseForm(emptyWarehouse);
    setEditingWarehouseId(null);
  };

  const editWarehouse = (warehouse: Warehouse) => {
    setWarehouseForm({ ...warehouse });
    setEditingWarehouseId(warehouse.id);
  };

  const cancelWarehouse = () => {
    setWarehouseForm(emptyWarehouse);
    setEditingWarehouseId(null);
  };

  const deleteWarehouse = (warehouse: Warehouse) => {
    if (!window.confirm(`${t("Delete warehouse")} ${warehouse.code} (${warehouse.name})?`)) return;
    setState((prev) => ({ ...prev, warehouses: removeById(prev.warehouses, warehouse.id) }));
    if (editingWarehouseId === warehouse.id) cancelWarehouse();
  };

  const saveMovement = () => {
    const productId = movementForm.productId || state.products[0]?.id || "";
    const warehouseId = movementForm.warehouseId || state.warehouses[0]?.id || "";
    if (!productId || !warehouseId) {
      alert(t("Select both a product and a warehouse before saving the movement."));
      return;
    }
    const quantity = Math.abs(movementForm.quantity);
    if (!quantity) {
      alert(t("Movement quantity must be greater than zero."));
      return;
    }
    const movement: StockMovement = {
      ...movementForm,
      id: editingMovementId ?? uid("MOV"),
      productId,
      warehouseId,
      quantity: movementForm.type === "adjustment" ? -quantity : quantity,
      date: movementForm.date || todayIso(),
      reference: movementForm.reference.trim(),
      notes: movementForm.notes.trim(),
    };
    setState((prev) => {
      const previous = prev.movements.find((entry) => entry.id === editingMovementId);
      let products = prev.products;
      if (previous) {
        products = adjustStock(products, previous.productId, -stockDelta(previous.type, previous.quantity));
      }
      products = adjustStock(products, movement.productId, stockDelta(movement.type, movement.quantity));
      return { ...prev, movements: upsert(prev.movements, movement), products };
    });
    setMovementForm({ ...emptyMovement, productId, warehouseId });
    setEditingMovementId(null);
  };

  const editMovement = (movement: StockMovement) => {
    setMovementForm({
      productId: movement.productId,
      warehouseId: movement.warehouseId,
      type: movement.type,
      quantity: Math.abs(movement.quantity),
      date: movement.date,
      reference: movement.reference,
      notes: movement.notes,
    });
    setEditingMovementId(movement.id);
  };

  const cancelMovement = () => {
    setMovementForm(emptyMovement);
    setEditingMovementId(null);
  };

  const deleteMovement = (movement: StockMovement) => {
    const detail = movement.reference || movement.id;
    if (!window.confirm(`${t("Delete movement")} ${detail}? ${t("Product stock will be restored.")}`)) {
      return;
    }
    setState((prev) => ({
      ...prev,
      movements: removeById(prev.movements, movement.id),
      products: adjustStock(prev.products, movement.productId, -stockDelta(movement.type, movement.quantity)),
    }));
    if (editingMovementId === movement.id) cancelMovement();
  };

  const projectedUsed = Math.min(Math.max(0, warehouseForm.used), Math.max(0, warehouseForm.capacity));
  const projectedUtilization = warehouseForm.capacity > 0 ? (projectedUsed / warehouseForm.capacity) * 100 : 0;

  return (
    <>
      <div className="page-header">
        <div>
          <h2>{t("Warehouse & Stock")}</h2>
          <p>{t("Distribution sites, capacity utilization, and product stock movements.")}</p>
        </div>
      </div>

      <div className="grid cols-4">
        <Metric label={t("Active warehouses")} value={number(activeWarehouses)} hint={`${number(state.warehouses.length)} ${t("sites total")}`} tone="info" />
        <Metric label={t("Total capacity")} value={number(totalCapacity)} hint={t("Units across all sites")} />
        <Metric label={t("Used capacity")} value={number(usedCapacity)} hint={t("Units currently stored")} />
        <Metric
          label={t("Utilization")}
          value={percent(overallUtilization)}
          hint={t("Used vs total capacity")}
          tone={overallUtilization >= 90 ? "danger" : overallUtilization >= 75 ? "warning" : "success"}
        />
      </div>

      <div className="grid cols-2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="section-title">
            <h3>{editingWarehouseId ? t("Edit warehouse") : t("Add warehouse")}</h3>
            <span className="chip info">{`${number(state.warehouses.length)} ${t("sites")}`}</span>
          </div>
          <div className="field-row">
            <div className="field">
              <label>{t("Code")}</label>
              <input value={warehouseForm.code} onChange={(event) => setWarehouseForm({ ...warehouseForm, code: event.target.value })} placeholder={t("WH-LAX01")} />
            </div>
            <div className="field">
              <label>{t("Name")}</label>
              <input value={warehouseForm.name} onChange={(event) => setWarehouseForm({ ...warehouseForm, name: event.target.value })} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>{t("City")}</label>
              <input value={warehouseForm.city} onChange={(event) => setWarehouseForm({ ...warehouseForm, city: event.target.value })} />
            </div>
            <div className="field">
              <label>{t("Manager")}</label>
              <input value={warehouseForm.manager} onChange={(event) => setWarehouseForm({ ...warehouseForm, manager: event.target.value })} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>{t("Capacity (units)")}</label>
              <input type="number" min={0} value={warehouseForm.capacity} onChange={(event) => setWarehouseForm({ ...warehouseForm, capacity: Math.max(0, Number(event.target.value)) })} />
            </div>
            <div className="field">
              <label>{t("Used (units)")}</label>
              <input type="number" min={0} value={warehouseForm.used} onChange={(event) => setWarehouseForm({ ...warehouseForm, used: Math.max(0, Number(event.target.value)) })} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>{t("Status")}</label>
              <select value={warehouseForm.status} onChange={(event) => setWarehouseForm({ ...warehouseForm, status: event.target.value as Status })}>
                <option value="active">{t("active")}</option>
                <option value="pending">{t("pending")}</option>
                <option value="in_progress">{t("in_progress")}</option>
                <option value="blocked">{t("blocked")}</option>
                <option value="cancelled">{t("cancelled")}</option>
              </select>
            </div>
            <div className="field">
              <label>{t("Projected utilization")}</label>
              <input readOnly value={percent(projectedUtilization)} />
            </div>
          </div>
          <div className="actions">
            <button className="primary" type="button" onClick={saveWarehouse}>{editingWarehouseId ? t("Save changes") : t("Add warehouse")}</button>
            {editingWarehouseId && <button type="button" onClick={cancelWarehouse}>{t("Cancel")}</button>}
          </div>
        </div>

        <div className="card">
          <div className="section-title">
            <h3>{editingMovementId ? t("Edit stock movement") : t("Record stock movement")}</h3>
            <span className="chip info">{`${number(state.movements.length)} ${t("movements")}`}</span>
          </div>
          <div className="field-row">
            <div className="field">
              <label>{t("Product")}</label>
              <select value={movementForm.productId} onChange={(event) => setMovementForm({ ...movementForm, productId: event.target.value })}>
                <option value="">{t("Select product")}</option>
                {state.products.map((product) => (
                  <option key={product.id} value={product.id}>{product.name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>{t("Warehouse")}</label>
              <select value={movementForm.warehouseId} onChange={(event) => setMovementForm({ ...movementForm, warehouseId: event.target.value })}>
                <option value="">{t("Select warehouse")}</option>
                {state.warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>{t("Type")}</label>
              <select value={movementForm.type} onChange={(event) => setMovementForm({ ...movementForm, type: event.target.value as MovementType })}>
                <option value="inbound">{t("inbound")}</option>
                <option value="outbound">{t("outbound")}</option>
                <option value="transfer">{t("transfer")}</option>
                <option value="adjustment">{t("adjustment")}</option>
              </select>
            </div>
            <div className="field">
              <label>{t("Quantity")}</label>
              <input type="number" min={1} value={movementForm.quantity} onChange={(event) => setMovementForm({ ...movementForm, quantity: Math.abs(Number(event.target.value)) })} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>{t("Date")}</label>
              <input type="date" value={movementForm.date} onChange={(event) => setMovementForm({ ...movementForm, date: event.target.value })} />
            </div>
            <div className="field">
              <label>{t("Reference")}</label>
              <input value={movementForm.reference} onChange={(event) => setMovementForm({ ...movementForm, reference: event.target.value })} placeholder={t("IMP-2026-014")} />
            </div>
          </div>
          <div className="field">
            <label>{t("Notes")}</label>
            <textarea value={movementForm.notes} onChange={(event) => setMovementForm({ ...movementForm, notes: event.target.value })} />
          </div>
          <div className="actions">
            <button className="primary" type="button" onClick={saveMovement}>{editingMovementId ? t("Save changes") : t("Add movement")}</button>
            {editingMovementId && <button type="button" onClick={cancelMovement}>{t("Cancel")}</button>}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-title">
          <h3>{t("Warehouses")}</h3>
          <span className="chip warning">{`${number(activeWarehouses)} ${t("active")}`}</span>
        </div>
        <div className="toolbar">
          <input placeholder={t("Search warehouses...")} value={warehouseQuery} onChange={(event) => setWarehouseQuery(event.target.value)} />
        </div>
        <div className="list">
          {filteredWarehouses.length === 0 && <div className="empty">{t("No warehouses found.")}</div>}
          {filteredWarehouses.map((warehouse) => {
            const utilization = warehouse.capacity > 0 ? (warehouse.used / warehouse.capacity) * 100 : 0;
            return (
              <div className="row-card" key={warehouse.id}>
                <div className="row-top">
                  <div>
                    <h4>{warehouse.code} · {warehouse.name}</h4>
                    <div className="meta">
                      <span>{warehouse.city || t("City not set")}</span>
                      <span>{`${t("Manager")}: ${warehouse.manager || t("Not assigned")}`}</span>
                      <StatusChip status={warehouse.status} label={t(warehouse.status)} />
                    </div>
                  </div>
                  <div className="actions">
                    <button className="small" type="button" onClick={() => editWarehouse(warehouse)}>{t("Edit")}</button>
                    <button className="small" type="button" onClick={() => deleteWarehouse(warehouse)}>{t("Delete")}</button>
                  </div>
                </div>
                <div className="detail-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginTop: 12 }}>
                  <div className="detail-item"><span>{t("Capacity")}</span><strong>{`${number(warehouse.capacity)} ${t("units")}`}</strong></div>
                  <div className="detail-item"><span>{t("Used")}</span><strong>{`${number(warehouse.used)} ${t("units")}`}</strong></div>
                  <div className="detail-item"><span>{t("Utilization")}</span><strong>{percent(utilization)}</strong></div>
                </div>
                <ProgressBar value={warehouse.used} max={warehouse.capacity || 1} tone={utilizationTone(utilization)} label={t("Capacity used")} />
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="section-title">
          <h3>{t("Stock movements")}</h3>
          <span className="chip neutral">{t("Product stock is updated on save")}</span>
        </div>
        <div className="toolbar">
          <input placeholder={t("Search products, warehouses, references...")} value={movementQuery} onChange={(event) => setMovementQuery(event.target.value)} />
        </div>
        {filteredMovements.length === 0 ? (
          <div className="empty">{t("No stock movements found.")}</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("Product")}</th>
                  <th>{t("Warehouse")}</th>
                  <th>{t("Type")}</th>
                  <th>{t("Quantity")}</th>
                  <th>{t("Date")}</th>
                  <th>{t("Reference")}</th>
                  <th>{t("Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredMovements.map((movement) => (
                  <tr key={movement.id}>
                    <td>{productName(movement.productId)}</td>
                    <td>{warehouseCode(movement.warehouseId)}</td>
                    <td><span className={`chip ${movementTone(movement.type)}`}>{t(titleCase(movement.type))}</span></td>
                    <td>{number(movement.quantity)}</td>
                    <td>{shortDate(movement.date)}</td>
                    <td>{movement.reference || "—"}</td>
                    <td>
                      <div className="actions">
                        <button className="small" type="button" onClick={() => editMovement(movement)}>{t("Edit")}</button>
                        <button className="small" type="button" onClick={() => deleteMovement(movement)}>{t("Delete")}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted-text" style={{ marginTop: 12, marginBottom: 0 }}>
          {t("Inbound increases product stock; outbound and adjustments reduce it. Transfers do not change global stock.")}
        </p>
      </div>
    </>
  );
}
