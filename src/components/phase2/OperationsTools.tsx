import { useEffect, useState } from "react";
import type { AppState, Customer, Order, OrderLine, Product, Quotation, Status, StockMovement } from "../../types";
import {
  Field,
  openRecord,
  Phase2Panel,
  Pill,
  RecordRows,
  RowLine,
  StatStrip,
  Toolbar,
  type Phase2Props,
} from "./Phase2Ui";
import RecordExplorer, { type ExplorerConfig } from "./RecordExplorer";
import { useToast } from "../Feedback";
import { useLanguage } from "../../i18n";
import { useDraft } from "../../hooks/useDraft";
import { parseLineItems } from "../../lib/imports";
import { getCustomerExposure, lineAmount } from "../../lib/intelligence";
import { daysUntil, money, number as fmtNumber, shortDate } from "../../lib/format";
import { removeById, uid, updateById, upsert } from "../../lib/store";
import {
  nextId,
  updateExtras,
  type Backorder,
  type Bin,
  type CycleCount,
  type FulfillmentLine,
  type LineTemplate,
  type PricingRule,
  type QuotationRevision,
  type Transfer,
} from "../../lib/extras";

type QuoteDraft = {
  activeId: string;
  paste: string;
  revisionAmount: string;
  revisionStatus: string;
  revisionNote: string;
  templateName: string;
};

type OrderDraft = {
  activeId: string;
  paste: string;
  templateName: string;
};

const tierOptions = ["Gold", "Silver", "Bronze", "Standard"];
const countStatuses = ["planned", "approved", "rejected"];
const transferStatuses = ["in_transit", "completed"];
const quoteStatuses = ["draft", "sent", "approved", "expired", "cancelled"];
const orderStatuses = ["draft", "in_progress", "completed", "cancelled", "blocked"];
const shippingStatuses = ["pending", "in_progress", "completed", "cancelled"];
const customerStatuses = ["active", "pending", "in_progress", "blocked", "cancelled"];

const todayIso = (): string => new Date().toISOString().slice(0, 10);

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function whole(value: number | string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function amount(value: number | string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function totalOf(lines: OrderLine[]): number {
  return lines.reduce((sum, line) => sum + lineAmount(line), 0);
}

function productLabel(products: Product[], id: string, fallback: string): string {
  return products.find((product) => product.id === id)?.name || id || fallback;
}

function warehouseLabel(state: AppState, id: string, fallback: string): string {
  const warehouse = state.warehouses.find((entry) => entry.id === id);
  return warehouse ? `${warehouse.code} · ${warehouse.name}` : id || fallback;
}

function customerLabel(state: AppState, id: string, fallback: string): string {
  return state.customers.find((customer) => customer.id === id)?.company || id || fallback;
}

function pastedLines(text: string, products: Product[]): { lines: OrderLine[]; missing: number } {
  let missing = 0;
  const lines = parseLineItems(text).map((parsed) => {
    const product = products.find(
      (entry) => entry.sku.toLowerCase() === parsed.sku.toLowerCase() || entry.id.toLowerCase() === parsed.sku.toLowerCase()
    );
    if (!product) missing += 1;
    return {
      productId: product?.id ?? "",
      quantity: Math.max(1, whole(parsed.quantity)),
      unitPrice: parsed.price > 0 ? parsed.price : product?.wholesalePrice ?? 0,
      discountPercent: 0,
    };
  });
  return { lines, missing };
}

function linesFromTemplate(template: LineTemplate, products: Product[]): OrderLine[] {
  return template.lines.map((line) => {
    const product = products.find((entry) => entry.id === line.productId);
    return {
      productId: line.productId,
      quantity: Math.max(1, whole(line.quantity)),
      unitPrice: line.price > 0 ? line.price : product?.wholesalePrice ?? 0,
      discountPercent: 0,
    };
  });
}

function makeTemplate(name: string, items: OrderLine[], existing: LineTemplate[]): LineTemplate {
  return {
    id: nextId("TPL", existing),
    name: name.trim(),
    lines: items.map((item) => ({ productId: item.productId, quantity: item.quantity, price: item.unitPrice })),
  };
}

function makeEmptyOrder(state: AppState): Order {
  const day = todayIso();
  return {
    id: "",
    number: `ORD-${new Date().getFullYear()}-${String(state.orders.length + 1).padStart(3, "0")}`,
    customerId: state.customers[0]?.id ?? "",
    date: day,
    status: "draft",
    warehouseId: state.warehouses[0]?.id ?? "",
    shippingStatus: "pending",
    items: [],
    notes: "",
  };
}

function toneForRatio(ratio: number): "success" | "warning" | "danger" {
  if (ratio > 80) return "danger";
  if (ratio > 60) return "warning";
  return "success";
}

export default function OperationsTools(props: Phase2Props) {
  if (props.module === "warehouse") return <WarehouseTools {...props} />;
  if (props.module === "customers") return <CustomersTools {...props} />;
  if (props.module === "quotations") return <QuotationsTools {...props} />;
  if (props.module === "orders") return <OrdersTools {...props} />;
  return null;
}

function WarehouseTools({ state, setState, setTab, preferences, setPreferences, focusRecord }: Phase2Props) {
  const { t } = useLanguage();
  const { notify } = useToast();
  const extras = state.extras;
  const firstWarehouse = state.warehouses[0]?.id ?? "";
  const firstProduct = state.products[0]?.id ?? "";
  const unknownProduct = t("Unknown product");
  const unknownWarehouse = t("Unknown warehouse");

  const [binForm, setBinForm] = useState({
    id: "",
    warehouseId: firstWarehouse,
    code: "",
    zone: "",
    rack: "",
    shelf: "",
    stock: 0,
  });
  const [countForm, setCountForm] = useState({
    id: "",
    warehouseId: firstWarehouse,
    productId: firstProduct,
    date: todayIso(),
    counted: 0,
    system: 0,
  });
  const [transferForm, setTransferForm] = useState({
    id: "",
    fromWarehouseId: firstWarehouse,
    toWarehouseId: state.warehouses[1]?.id ?? firstWarehouse,
    productId: firstProduct,
    quantity: 1,
    date: todayIso(),
  });

  const resetBin = () => setBinForm({ id: "", warehouseId: firstWarehouse, code: "", zone: "", rack: "", shelf: "", stock: 0 });
  const resetCount = () => setCountForm({ id: "", warehouseId: firstWarehouse, productId: firstProduct, date: todayIso(), counted: 0, system: 0 });
  const resetTransfer = () =>
    setTransferForm({
      id: "",
      fromWarehouseId: firstWarehouse,
      toWarehouseId: state.warehouses[1]?.id ?? firstWarehouse,
      productId: firstProduct,
      quantity: 1,
      date: todayIso(),
    });

  const saveBin = () => {
    if (!binForm.code.trim() || !binForm.warehouseId) {
      notify(t("Bin code and warehouse are required."), { tone: "danger" });
      return;
    }
    const bin: Bin = {
      id: binForm.id || nextId("BIN", extras.bins),
      warehouseId: binForm.warehouseId,
      code: binForm.code.trim(),
      zone: binForm.zone.trim(),
      rack: binForm.rack.trim(),
      shelf: binForm.shelf.trim(),
      stock: whole(binForm.stock),
    };
    updateExtras(setState, (previous) => ({ ...previous, bins: upsert(previous.bins, bin) }));
    resetBin();
    notify(t("Bin saved"), { tone: "success" });
  };

  const deleteBin = (bin: Bin) => {
    if (!window.confirm(t("Delete bin {code}?", { code: bin.code }))) return;
    updateExtras(setState, (previous) => ({ ...previous, bins: removeById(previous.bins, bin.id) }));
    if (binForm.id === bin.id) resetBin();
  };

  const saveCount = () => {
    if (!countForm.warehouseId || !countForm.productId) {
      notify(t("Select a warehouse and product for the count."), { tone: "danger" });
      return;
    }
    const previous = extras.cycleCounts.find((count) => count.id === countForm.id);
    const count: CycleCount = {
      id: countForm.id || nextId("CNT", extras.cycleCounts),
      warehouseId: countForm.warehouseId,
      productId: countForm.productId,
      date: countForm.date || todayIso(),
      counted: whole(countForm.counted),
      system: whole(countForm.system),
      status: previous?.status ?? "planned",
    };
    updateExtras(setState, (current) => ({ ...current, cycleCounts: upsert(current.cycleCounts, count) }));
    resetCount();
    notify(t("Cycle count saved"), { tone: "success" });
  };

  const deleteCount = (count: CycleCount) => {
    if (!window.confirm(t("Delete this cycle count?"))) return;
    updateExtras(setState, (previous) => ({ ...previous, cycleCounts: removeById(previous.cycleCounts, count.id) }));
    if (countForm.id === count.id) resetCount();
  };

  const decideCount = (count: CycleCount, status: "approved" | "rejected") => {
    updateExtras(setState, (previous) => ({
      ...previous,
      cycleCounts: updateById(previous.cycleCounts, count.id, { status }),
    }));
    notify(t("Count marked {status}", { status: t(status) }), { tone: status === "approved" ? "success" : "info" });
  };

  const saveTransfer = () => {
    if (!transferForm.fromWarehouseId || !transferForm.toWarehouseId || !transferForm.productId) {
      notify(t("Select both warehouses and a product."), { tone: "danger" });
      return;
    }
    if (transferForm.fromWarehouseId === transferForm.toWarehouseId) {
      notify(t("Source and destination warehouses must differ."), { tone: "danger" });
      return;
    }
    const transfer: Transfer = {
      id: transferForm.id || nextId("TRF", extras.transfers),
      fromWarehouseId: transferForm.fromWarehouseId,
      toWarehouseId: transferForm.toWarehouseId,
      productId: transferForm.productId,
      quantity: whole(transferForm.quantity),
      date: transferForm.date || todayIso(),
      status: "in_transit",
    };
    if (transfer.quantity <= 0) {
      notify(t("Transfer quantity must be greater than zero."), { tone: "danger" });
      return;
    }
    updateExtras(setState, (previous) => ({ ...previous, transfers: upsert(previous.transfers, transfer) }));
    resetTransfer();
    notify(t("Transfer added as in transit"), { tone: "success" });
  };

  const deleteTransfer = (transfer: Transfer) => {
    if (!window.confirm(t("Delete this in-transit transfer?"))) return;
    updateExtras(setState, (previous) => ({ ...previous, transfers: removeById(previous.transfers, transfer.id) }));
    if (transferForm.id === transfer.id) resetTransfer();
  };

  const completeTransfer = (transfer: Transfer) => {
    if (transfer.status === "completed") return;
    setState((previous) => {
      const movement: StockMovement = {
        id: uid("MOV"),
        productId: transfer.productId,
        warehouseId: transfer.toWarehouseId,
        type: "transfer",
        quantity: transfer.quantity,
        date: transfer.date || todayIso(),
        reference: transfer.id,
        notes: t("Completed warehouse transfer"),
      };
      return {
        ...previous,
        warehouses: previous.warehouses.map((warehouse) => {
          if (warehouse.id === transfer.fromWarehouseId) {
            return { ...warehouse, used: Math.max(0, warehouse.used - transfer.quantity) };
          }
          if (warehouse.id === transfer.toWarehouseId) return { ...warehouse, used: warehouse.used + transfer.quantity };
          return warehouse;
        }),
        movements: upsert(previous.movements, movement),
      };
    });
    updateExtras(setState, (previous) => {
      let sourceAdjusted = false;
      let destinationAdjusted = false;
      const bins = previous.bins.map((bin) => {
        if (!sourceAdjusted && bin.warehouseId === transfer.fromWarehouseId) {
          sourceAdjusted = true;
          return { ...bin, stock: Math.max(0, bin.stock - transfer.quantity) };
        }
        if (!destinationAdjusted && bin.warehouseId === transfer.toWarehouseId) {
          destinationAdjusted = true;
          return { ...bin, stock: bin.stock + transfer.quantity };
        }
        return bin;
      });
      return {
        ...previous,
        transfers: updateById(previous.transfers, transfer.id, { status: "completed" }),
        bins,
      };
    });
    notify(t("Transfer completed"), { tone: "success" });
  };

  const zones = Array.from(new Set(extras.bins.map((bin) => bin.zone).filter(Boolean)));
  const plannedCounts = extras.cycleCounts.filter((count) => count.status === "planned").length;
  const inTransit = extras.transfers.filter((transfer) => transfer.status === "in_transit").length;
  const binStock = extras.bins.reduce((sum, bin) => sum + bin.stock, 0);

  const binConfig: ExplorerConfig<Bin> = {
    module: "warehouse",
    title: t("Bin locations"),
    description: t("Track warehouse zones, racks, shelves, and stock."),
    rows: extras.bins,
    columns: [
      { key: "code", label: t("Bin"), value: (bin) => bin.code, editable: "text" },
      { key: "warehouse", label: t("Warehouse"), value: (bin) => warehouseLabel(state, bin.warehouseId, unknownWarehouse) },
      { key: "zone", label: t("Zone"), value: (bin) => bin.zone, editable: "text" },
      { key: "rack", label: t("Rack"), value: (bin) => bin.rack, editable: "text" },
      { key: "shelf", label: t("Shelf"), value: (bin) => bin.shelf, editable: "text" },
      { key: "stock", label: t("Stock"), value: (bin) => bin.stock, editable: "number" },
    ],
    id: (bin) => bin.id,
    statusKey: "zone",
    statusOptions: zones,
    primaryLabel: (bin) => bin.code,
    onPatch: (id, patch) =>
      updateExtras(setState, (previous) => ({ ...previous, bins: updateById(previous.bins, id, patch as Partial<Bin>) })),
    onDelete: (ids) => updateExtras(setState, (previous) => ({ ...previous, bins: previous.bins.filter((bin) => !ids.includes(bin.id)) })),
    onRestore: (rows) => updateExtras(setState, (previous) => ({ ...previous, bins: rows.reduce((list, bin) => upsert(list, bin), previous.bins) })),
    setTab,
  };

  const countConfig: ExplorerConfig<CycleCount> = {
    module: "warehouse",
    title: t("Cycle counts"),
    description: t("Record a count, review the variance, then approve or reject it."),
    rows: extras.cycleCounts,
    columns: [
      { key: "product", label: t("Product"), value: (count) => productLabel(state.products, count.productId, unknownProduct) },
      { key: "warehouse", label: t("Warehouse"), value: (count) => warehouseLabel(state, count.warehouseId, unknownWarehouse) },
      { key: "date", label: t("Date"), value: (count) => shortDate(count.date) },
      { key: "counted", label: t("Counted"), value: (count) => count.counted, editable: "number" },
      { key: "system", label: t("System"), value: (count) => count.system, editable: "number" },
      {
        key: "variance",
        label: t("Variance"),
        value: (count) => count.counted - count.system,
        render: (count) => {
          const variance = count.counted - count.system;
          return <Pill tone={variance === 0 ? "success" : variance > 0 ? "info" : "danger"}>{`${variance > 0 ? "+" : ""}${fmtNumber(variance)}`}</Pill>;
        },
      },
      {
        key: "status",
        label: t("Status"),
        value: (count) => count.status,
        render: (count) => (
          <Pill tone={count.status === "approved" ? "success" : count.status === "rejected" ? "danger" : "info"}>{t(count.status)}</Pill>
        ),
      },
      {
        key: "decision",
        label: t("Decision"),
        value: (count) => count.status,
        render: (count) =>
          count.status === "planned" ? (
            <div className="actions">
              <button type="button" className="small" onClick={() => decideCount(count, "approved")}>{t("Approve")}</button>
              <button type="button" className="small" onClick={() => decideCount(count, "rejected")}>{t("Reject")}</button>
            </div>
          ) : (
            <span className="muted-text">—</span>
          ),
      },
    ],
    id: (count) => count.id,
    statusKey: "status",
    statusOptions: countStatuses,
    primaryLabel: (count) => `${productLabel(state.products, count.productId, unknownProduct)} · ${shortDate(count.date)}`,
    onPatch: (id, patch) => {
      const current = extras.cycleCounts.find((count) => count.id === id);
      if (current && current.status !== "planned" && ("counted" in patch || "system" in patch)) {
        notify(t("Decided counts are locked."), { tone: "danger" });
        return;
      }
      updateExtras(setState, (previous) => ({ ...previous, cycleCounts: updateById(previous.cycleCounts, id, patch as Partial<CycleCount>) }));
    },
    onDelete: (ids) =>
      updateExtras(setState, (previous) => ({ ...previous, cycleCounts: previous.cycleCounts.filter((count) => !ids.includes(count.id)) })),
    onRestore: (rows) =>
      updateExtras(setState, (previous) => ({ ...previous, cycleCounts: rows.reduce((list, count) => upsert(list, count), previous.cycleCounts) })),
    setTab,
  };

  const transferConfig: ExplorerConfig<Transfer> = {
    module: "warehouse",
    title: t("Warehouse transfers"),
    description: t("Stock moves only when an in-transit transfer is completed."),
    rows: extras.transfers,
    columns: [
      { key: "product", label: t("Product"), value: (transfer) => productLabel(state.products, transfer.productId, unknownProduct) },
      { key: "from", label: t("From"), value: (transfer) => warehouseLabel(state, transfer.fromWarehouseId, unknownWarehouse) },
      { key: "to", label: t("To"), value: (transfer) => warehouseLabel(state, transfer.toWarehouseId, unknownWarehouse) },
      { key: "quantity", label: t("Quantity"), value: (transfer) => transfer.quantity, editable: "number" },
      { key: "date", label: t("Date"), value: (transfer) => shortDate(transfer.date) },
      {
        key: "status",
        label: t("Status"),
        value: (transfer) => transfer.status,
        render: (transfer) => (
          <div className="actions">
            <Pill tone={transfer.status === "completed" ? "success" : "info"}>{t(transfer.status)}</Pill>
            {transfer.status === "in_transit" && (
              <button type="button" className="small" onClick={() => completeTransfer(transfer)}>{t("Complete")}</button>
            )}
          </div>
        ),
      },
    ],
    id: (transfer) => transfer.id,
    statusKey: "status",
    statusOptions: transferStatuses,
    primaryLabel: (transfer) => `${productLabel(state.products, transfer.productId, unknownProduct)} · ${fmtNumber(transfer.quantity)}`,
    onPatch: (id, patch) =>
      updateExtras(setState, (previous) => ({ ...previous, transfers: updateById(previous.transfers, id, patch as Partial<Transfer>) })),
    onDelete: (ids) =>
      updateExtras(setState, (previous) => ({ ...previous, transfers: previous.transfers.filter((transfer) => !ids.includes(transfer.id)) })),
    onRestore: (rows) =>
      updateExtras(setState, (previous) => ({ ...previous, transfers: rows.reduce((list, transfer) => upsert(list, transfer), previous.transfers) })),
    setTab,
  };

  return (
    <>
      <StatStrip
        items={[
          { label: t("Bins"), value: fmtNumber(extras.bins.length) },
          { label: t("Bin stock"), value: fmtNumber(binStock) },
          { label: t("Planned counts"), value: fmtNumber(plannedCounts) },
          { label: t("In transit"), value: fmtNumber(inTransit), hint: t("Complete to adjust stock") },
        ]}
      />

      <Phase2Panel title={binForm.id ? t("Edit bin") : t("Add bin")} description={t("Give each location a code, zone, rack, and shelf.")}>
        <div className="field-row">
          <Field label={t("Warehouse")}>
            <select value={binForm.warehouseId} onChange={(event) => setBinForm({ ...binForm, warehouseId: event.target.value })}>
              <option value="">{t("Select warehouse")}</option>
              {state.warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>
              ))}
            </select>
          </Field>
          <Field label={t("Code")}>
            <input value={binForm.code} onChange={(event) => setBinForm({ ...binForm, code: event.target.value })} />
          </Field>
          <Field label={t("Zone")}>
            <input value={binForm.zone} onChange={(event) => setBinForm({ ...binForm, zone: event.target.value })} />
          </Field>
          <Field label={t("Rack")}>
            <input value={binForm.rack} onChange={(event) => setBinForm({ ...binForm, rack: event.target.value })} />
          </Field>
          <Field label={t("Shelf")}>
            <input value={binForm.shelf} onChange={(event) => setBinForm({ ...binForm, shelf: event.target.value })} />
          </Field>
          <Field label={t("Stock")}>
            <input type="number" min={0} value={binForm.stock} onChange={(event) => setBinForm({ ...binForm, stock: whole(event.target.value) })} />
          </Field>
        </div>
        <Toolbar>
          <button type="button" className="primary" onClick={saveBin}>{binForm.id ? t("Save changes") : t("Add bin")}</button>
          {binForm.id && (
            <>
              <button type="button" onClick={resetBin}>{t("Cancel")}</button>
              <button type="button" onClick={() => deleteBin({ ...binForm })}>{t("Delete")}</button>
            </>
          )}
          {extras.bins.map((bin) => (
            <button key={bin.id} type="button" className="link-button" onClick={() => setBinForm({ ...bin })}>{bin.code}</button>
          ))}
        </Toolbar>
      </Phase2Panel>

      <Phase2Panel title={countForm.id ? t("Edit cycle count") : t("Plan cycle count")} description={t("Variance is counted minus system stock.")}>
        <div className="field-row">
          <Field label={t("Warehouse")}>
            <select value={countForm.warehouseId} onChange={(event) => setCountForm({ ...countForm, warehouseId: event.target.value })}>
              <option value="">{t("Select warehouse")}</option>
              {state.warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>
              ))}
            </select>
          </Field>
          <Field label={t("Product")}>
            <select value={countForm.productId} onChange={(event) => setCountForm({ ...countForm, productId: event.target.value })}>
              <option value="">{t("Select product")}</option>
              {state.products.map((product) => (
                <option key={product.id} value={product.id}>{product.name}</option>
              ))}
            </select>
          </Field>
          <Field label={t("Date")}>
            <input type="date" value={countForm.date} onChange={(event) => setCountForm({ ...countForm, date: event.target.value })} />
          </Field>
          <Field label={t("Counted")}>
            <input type="number" min={0} value={countForm.counted} onChange={(event) => setCountForm({ ...countForm, counted: whole(event.target.value) })} />
          </Field>
          <Field label={t("System")}>
            <input type="number" min={0} value={countForm.system} onChange={(event) => setCountForm({ ...countForm, system: whole(event.target.value) })} />
          </Field>
          <Field label={t("Variance")}>
            <input readOnly value={fmtNumber(countForm.counted - countForm.system)} />
          </Field>
        </div>
        <Toolbar>
          <button type="button" className="primary" onClick={saveCount}>{countForm.id ? t("Save changes") : t("Plan count")}</button>
          {countForm.id && <button type="button" onClick={resetCount}>{t("Cancel")}</button>}
          {extras.cycleCounts.filter((count) => count.status === "planned").map((count) => (
            <button
              key={count.id}
              type="button"
              className="link-button"
              onClick={() => setCountForm({ id: count.id, warehouseId: count.warehouseId, productId: count.productId, date: count.date, counted: count.counted, system: count.system })}
            >
              {productLabel(state.products, count.productId, unknownProduct)}
            </button>
          ))}
        </Toolbar>
      </Phase2Panel>

      <Phase2Panel title={transferForm.id ? t("Edit transfer") : t("Add transfer")} description={t("Transfers stay in transit until you complete them.")}>
        <div className="field-row">
          <Field label={t("From")}>
            <select value={transferForm.fromWarehouseId} onChange={(event) => setTransferForm({ ...transferForm, fromWarehouseId: event.target.value })}>
              <option value="">{t("Select warehouse")}</option>
              {state.warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>
              ))}
            </select>
          </Field>
          <Field label={t("To")}>
            <select value={transferForm.toWarehouseId} onChange={(event) => setTransferForm({ ...transferForm, toWarehouseId: event.target.value })}>
              <option value="">{t("Select warehouse")}</option>
              {state.warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>
              ))}
            </select>
          </Field>
          <Field label={t("Product")}>
            <select value={transferForm.productId} onChange={(event) => setTransferForm({ ...transferForm, productId: event.target.value })}>
              <option value="">{t("Select product")}</option>
              {state.products.map((product) => (
                <option key={product.id} value={product.id}>{product.name}</option>
              ))}
            </select>
          </Field>
          <Field label={t("Quantity")}>
            <input type="number" min={1} value={transferForm.quantity} onChange={(event) => setTransferForm({ ...transferForm, quantity: whole(event.target.value) })} />
          </Field>
          <Field label={t("Date")}>
            <input type="date" value={transferForm.date} onChange={(event) => setTransferForm({ ...transferForm, date: event.target.value })} />
          </Field>
        </div>
        <Toolbar>
          <button type="button" className="primary" onClick={saveTransfer}>{transferForm.id ? t("Save changes") : t("Add transfer")}</button>
          {transferForm.id && <button type="button" onClick={resetTransfer}>{t("Cancel")}</button>}
        </Toolbar>
      </Phase2Panel>

      <RecordExplorer config={binConfig} {...{ state, setState, setTab, preferences, setPreferences, focusRecord }} />
      <RecordExplorer config={countConfig} {...{ state, setState, setTab, preferences, setPreferences, focusRecord }} />
      <RecordExplorer config={transferConfig} {...{ state, setState, setTab, preferences, setPreferences, focusRecord }} />

      <Phase2Panel title={t("Cycle count decisions")} description={t("Approve or reject planned counts from the explorer above.")}>
        <RecordRows rows={extras.cycleCounts} empty={t("No cycle counts yet.")}>
          {extras.cycleCounts.map((count) => {
            const variance = count.counted - count.system;
            return (
              <RowLine
                key={count.id}
                title={`${productLabel(state.products, count.productId, unknownProduct)} · ${warehouseLabel(state, count.warehouseId, unknownWarehouse)}`}
                meta={`${shortDate(count.date)} · ${t("Variance")}: ${fmtNumber(variance)}`}
                trailing={
                  <div className="actions">
                    <Pill tone={count.status === "approved" ? "success" : count.status === "rejected" ? "danger" : "info"}>{t(count.status)}</Pill>
                    {count.status === "planned" && (
                      <>
                        <button type="button" className="small" onClick={() => decideCount(count, "approved")}>{t("Approve")}</button>
                        <button type="button" className="small" onClick={() => decideCount(count, "rejected")}>{t("Reject")}</button>
                      </>
                    )}
                    <button type="button" className="small" onClick={() => deleteCount(count)}>{t("Delete")}</button>
                  </div>
                }
              />
            );
          })}
        </RecordRows>
      </Phase2Panel>

      <Phase2Panel title={t("Transfer completion")} description={t("Completing a transfer moves warehouse stock and appends a base movement.")}>
        <RecordRows rows={extras.transfers} empty={t("No transfers yet.")}>
          {extras.transfers.map((transfer) => (
            <RowLine
              key={transfer.id}
              title={`${productLabel(state.products, transfer.productId, unknownProduct)} · ${fmtNumber(transfer.quantity)}`}
              meta={`${warehouseLabel(state, transfer.fromWarehouseId, unknownWarehouse)} → ${warehouseLabel(state, transfer.toWarehouseId, unknownWarehouse)} · ${shortDate(transfer.date)}`}
              trailing={
                <div className="actions">
                  <Pill tone={transfer.status === "completed" ? "success" : "info"}>{t(transfer.status)}</Pill>
                  {transfer.status === "in_transit" && (
                    <button type="button" className="small" onClick={() => completeTransfer(transfer)}>{t("Complete")}</button>
                  )}
                  <button type="button" className="small" onClick={() => deleteTransfer(transfer)}>{t("Delete")}</button>
                </div>
              }
            />
          ))}
        </RecordRows>
      </Phase2Panel>
    </>
  );
}

function CustomersTools({ state, setState, setTab, preferences, setPreferences }: Phase2Props) {
  const { t } = useLanguage();
  const { notify } = useToast();
  const extras = state.extras;
  const currency = state.company.defaultCurrency || "USD";
  const unknownCustomer = t("Unknown customer");
  const [tierForm, setTierForm] = useState({ customerId: state.customers[0]?.id ?? "", tier: tierOptions[3] });
  const [ruleForm, setRuleForm] = useState({ id: "", tier: tierOptions[0], productId: state.products[0]?.id ?? "", price: 0 });

  const saveTier = () => {
    if (!tierForm.customerId) {
      notify(t("Select a customer first."), { tone: "danger" });
      return;
    }
    updateExtras(setState, (previous) => ({
      ...previous,
      customerTiers: { ...previous.customerTiers, [tierForm.customerId]: tierForm.tier },
    }));
    notify(t("Tier saved"), { tone: "success" });
  };

  const clearTier = (customerId: string) => {
    if (!window.confirm(t("Remove this tier assignment?"))) return;
    updateExtras(setState, (previous) => {
      const customerTiers = { ...previous.customerTiers };
      delete customerTiers[customerId];
      return { ...previous, customerTiers };
    });
  };

  const saveRule = () => {
    if (!ruleForm.tier || !ruleForm.productId) {
      notify(t("Tier and product are required."), { tone: "danger" });
      return;
    }
    const rule: PricingRule = {
      id: ruleForm.id || nextId("PRICE", extras.pricingRules),
      tier: ruleForm.tier,
      productId: ruleForm.productId,
      price: amount(ruleForm.price),
    };
    updateExtras(setState, (previous) => ({ ...previous, pricingRules: upsert(previous.pricingRules, rule) }));
    setRuleForm({ id: "", tier: tierOptions[0], productId: state.products[0]?.id ?? "", price: 0 });
    notify(t("Pricing rule saved"), { tone: "success" });
  };

  const deleteRule = (rule: PricingRule) => {
    if (!window.confirm(t("Delete this pricing rule?"))) return;
    updateExtras(setState, (previous) => ({ ...previous, pricingRules: removeById(previous.pricingRules, rule.id) }));
    if (ruleForm.id === rule.id) setRuleForm({ id: "", tier: tierOptions[0], productId: state.products[0]?.id ?? "", price: 0 });
  };

  const alerts = state.customers.filter((customer) => {
    const exposure = getCustomerExposure(state, customer.id);
    return (customer.creditLimit > 0 && exposure > customer.creditLimit * 0.8) || (customer.creditLimit <= 0 && exposure > 0);
  });
  const totalLimit = state.customers.reduce((sum, customer) => sum + customer.creditLimit, 0);
  const totalExposure = state.customers.reduce((sum, customer) => sum + getCustomerExposure(state, customer.id), 0);

  const customerConfig: ExplorerConfig<Customer> = {
    module: "customers",
    title: t("Customer accounts"),
    description: t("Tiers, credit limits, and open invoice exposure."),
    rows: state.customers,
    columns: [
      { key: "company", label: t("Company"), value: (customer) => customer.company, editable: "text" },
      { key: "type", label: t("Type"), value: (customer) => customer.type, editable: "select", options: ["distributor", "retailer", "corporate", "export"] },
      {
        key: "tier",
        label: t("Tier"),
        value: (customer) => extras.customerTiers[customer.id] ?? tierOptions[3],
        editable: "select",
        options: tierOptions,
        render: (customer) => <Pill tone="info">{t(extras.customerTiers[customer.id] ?? tierOptions[3])}</Pill>,
      },
      { key: "creditLimit", label: t("Credit limit"), value: (customer) => customer.creditLimit, editable: "number", render: (customer) => money(customer.creditLimit, currency) },
      {
        key: "exposure",
        label: t("Exposure"),
        value: (customer) => getCustomerExposure(state, customer.id),
        render: (customer) => {
          const exposure = getCustomerExposure(state, customer.id);
          const ratio = customer.creditLimit > 0 ? (exposure / customer.creditLimit) * 100 : exposure > 0 ? 100 : 0;
          return <Pill tone={toneForRatio(ratio)}>{money(exposure, currency)}</Pill>;
        },
      },
      { key: "status", label: t("Status"), value: (customer) => customer.status, editable: "select", options: customerStatuses },
    ],
    id: (customer) => customer.id,
    statusKey: "status",
    statusOptions: customerStatuses,
    primaryLabel: (customer) => customer.company,
    onPatch: (id, patch) => {
      if ("tier" in patch) {
        updateExtras(setState, (previous) => ({ ...previous, customerTiers: { ...previous.customerTiers, [id]: String(patch.tier) } }));
        return;
      }
      setState((previous) => ({ ...previous, customers: updateById(previous.customers, id, patch as Partial<Customer>) }));
    },
    onDelete: (ids) => {
      setState((previous) => ({ ...previous, customers: previous.customers.filter((customer) => !ids.includes(customer.id)) }));
      updateExtras(setState, (previous) => {
        const customerTiers = { ...previous.customerTiers };
        ids.forEach((id) => delete customerTiers[id]);
        return { ...previous, customerTiers };
      });
    },
    onRestore: (rows) => setState((previous) => ({ ...previous, customers: rows.reduce((list, customer) => upsert(list, customer), previous.customers) })),
    setTab,
  };

  return (
    <>
      <StatStrip
        items={[
          { label: t("Accounts"), value: fmtNumber(state.customers.length) },
          { label: t("Total credit limit"), value: money(totalLimit, currency) },
          { label: t("Total exposure"), value: money(totalExposure, currency) },
          { label: t("Credit alerts"), value: fmtNumber(alerts.length), hint: t("Above 80% of limit") },
        ]}
      />

      <Phase2Panel title={t("Customer tiers")} description={t("Assign a tier to a customer account.")} tone="info">
        <div className="field-row">
          <Field label={t("Customer")}>
            <select value={tierForm.customerId} onChange={(event) => setTierForm({ ...tierForm, customerId: event.target.value })}>
              <option value="">{t("Select customer")}</option>
              {state.customers.map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.company}</option>
              ))}
            </select>
          </Field>
          <Field label={t("Tier")}>
            <select value={tierForm.tier} onChange={(event) => setTierForm({ ...tierForm, tier: event.target.value })}>
              {tierOptions.map((tier) => (
                <option key={tier} value={tier}>{t(tier)}</option>
              ))}
            </select>
          </Field>
        </div>
        <Toolbar>
          <button type="button" className="primary" onClick={saveTier}>{t("Save tier")}</button>
        </Toolbar>
        <RecordRows rows={Object.keys(extras.customerTiers)} empty={t("No tier assignments yet.")}>
          {Object.entries(extras.customerTiers).map(([customerId, tier]) => (
            <RowLine
              key={customerId}
              title={customerLabel(state, customerId, unknownCustomer)}
              meta={`${t("Tier")}: ${t(tier)}`}
              trailing={
                <div className="actions">
                  <button type="button" className="small" onClick={() => setTierForm({ customerId, tier })}>{t("Edit")}</button>
                  <button type="button" className="small" onClick={() => clearTier(customerId)}>{t("Remove")}</button>
                </div>
              }
            />
          ))}
        </RecordRows>
      </Phase2Panel>

      <Phase2Panel title={ruleForm.id ? t("Edit pricing rule") : t("Add pricing rule")} description={t("Tier pricing is local to this workspace.")}>
        <div className="field-row">
          <Field label={t("Tier")}>
            <select value={ruleForm.tier} onChange={(event) => setRuleForm({ ...ruleForm, tier: event.target.value })}>
              {tierOptions.map((tier) => (
                <option key={tier} value={tier}>{t(tier)}</option>
              ))}
            </select>
          </Field>
          <Field label={t("Product")}>
            <select value={ruleForm.productId} onChange={(event) => setRuleForm({ ...ruleForm, productId: event.target.value })}>
              <option value="">{t("Select product")}</option>
              {state.products.map((product) => (
                <option key={product.id} value={product.id}>{product.name}</option>
              ))}
            </select>
          </Field>
          <Field label={t("Price")}>
            <input type="number" min={0} value={ruleForm.price} onChange={(event) => setRuleForm({ ...ruleForm, price: amount(event.target.value) })} />
          </Field>
        </div>
        <Toolbar>
          <button type="button" className="primary" onClick={saveRule}>{ruleForm.id ? t("Save changes") : t("Add pricing rule")}</button>
          {ruleForm.id && <button type="button" onClick={() => setRuleForm({ id: "", tier: tierOptions[0], productId: state.products[0]?.id ?? "", price: 0 })}>{t("Cancel")}</button>}
        </Toolbar>
        <RecordRows rows={extras.pricingRules} empty={t("No pricing rules yet.")}>
          {extras.pricingRules.map((rule) => (
            <RowLine
              key={rule.id}
              title={`${t(rule.tier)} · ${productLabel(state.products, rule.productId, t("Unknown product"))}`}
              meta={t("Tier pricing")}
              trailing={
                <div className="actions">
                  <strong>{money(rule.price, currency)}</strong>
                  <button type="button" className="small" onClick={() => setRuleForm({ ...rule })}>{t("Edit")}</button>
                  <button type="button" className="small" onClick={() => deleteRule(rule)}>{t("Delete")}</button>
                </div>
              }
            />
          ))}
        </RecordRows>
      </Phase2Panel>

      <RecordExplorer config={customerConfig} {...{ state, setState, setTab, preferences, setPreferences }} />

      <Phase2Panel title={t("Credit alerts")} description={t("Exposure is unpaid invoice balance for each account.")} tone={alerts.length ? "warning" : "success"}>
        <RecordRows rows={alerts} empty={t("No credit alerts.")}>
          {alerts.map((customer) => {
            const exposure = getCustomerExposure(state, customer.id);
            return (
              <RowLine
                key={customer.id}
                title={customer.company}
                meta={`${t("Credit limit")}: ${money(customer.creditLimit, currency)} · ${t("Exposure")}: ${money(exposure, currency)}`}
                trailing={<Pill tone="danger">{t("Credit alert")}</Pill>}
                onClick={() => openRecord("customers", customer.id, setTab)}
              />
            );
          })}
        </RecordRows>
      </Phase2Panel>
    </>
  );
}

function QuotationsTools({ state, setState, setTab, focusRecord, preferences, setPreferences }: Phase2Props) {
  const { t } = useLanguage();
  const { notify } = useToast();
  const extras = state.extras;
  const currency = state.company.defaultCurrency || "USD";
  const quoteDraft = useDraft<QuoteDraft>("phase2-quotations", {
    activeId: "",
    paste: "",
    revisionAmount: "",
    revisionStatus: "",
    revisionNote: "",
    templateName: "",
  });
  const unknownCustomer = t("Unknown customer");

  const draftId = quoteDraft.value.activeId;
  const activeId = state.quotations.some((quote) => quote.id === draftId)
    ? draftId
    : focusRecord && state.quotations.some((quote) => quote.id === focusRecord)
      ? focusRecord
      : state.quotations[0]?.id ?? "";
  const activeQuote = state.quotations.find((quote) => quote.id === activeId);
  const activeTotal = activeQuote ? totalOf(activeQuote.items) : 0;
  const revisions = extras.quotationRevisions.filter((revision) => revision.quotationId === activeId);
  const soon = state.quotations
    .map((quote) => ({ quote, days: daysUntil(quote.validUntil) }))
    .filter((entry) => entry.days !== null && entry.days >= 0 && entry.days <= 14 && !["expired", "cancelled"].includes(entry.quote.status))
    .sort((a, b) => (a.days ?? 999) - (b.days ?? 999));

  const patchQuote = (id: string, patch: Partial<Quotation>) =>
    setState((previous) => ({ ...previous, quotations: updateById(previous.quotations, id, patch) }));

  const createQuote = (): string => {
    const day = todayIso();
    const id = uid("QUO");
    const quote: Quotation = {
      id,
      number: `QUO-${new Date().getFullYear()}-${String(state.quotations.length + 1).padStart(3, "0")}`,
      customerId: state.customers[0]?.id ?? "",
      date: day,
      validUntil: addDays(day, 30),
      status: "draft",
      items: [],
      notes: "",
    };
    setState((previous) => ({ ...previous, quotations: [quote, ...previous.quotations] }));
    quoteDraft.setValue((previous) => ({ ...previous, activeId: id }));
    return id;
  };

  const applyLines = (lines: OrderLine[], missing: number) => {
    if (lines.length === 0) {
      notify(t("No usable lines to add."), { tone: "danger" });
      return;
    }
    const id = activeQuote?.id ?? createQuote();
    setState((previous) => ({
      ...previous,
      quotations: previous.quotations.map((quote) => (quote.id === id ? { ...quote, items: [...quote.items, ...lines] } : quote)),
    }));
    quoteDraft.setValue((previous) => ({ ...previous, paste: "" }));
    notify(t("Added {count} lines", { count: lines.length }), { tone: "success" });
    if (missing > 0) notify(t("{count} SKUs not found", { count: missing }), { tone: "danger" });
  };

  const saveRevision = () => {
    if (!activeQuote) {
      notify(t("Select or create a quotation first."), { tone: "danger" });
      return;
    }
    const version = revisions.reduce((max, revision) => Math.max(max, revision.version), 0) + 1;
    const revision: QuotationRevision = {
      id: nextId("REV", extras.quotationRevisions),
      quotationId: activeQuote.id,
      version,
      date: todayIso(),
      amount: quoteDraft.value.revisionAmount.trim() ? amount(quoteDraft.value.revisionAmount) : activeTotal,
      status: quoteDraft.value.revisionStatus || activeQuote.status,
      note: quoteDraft.value.revisionNote.trim(),
    };
    updateExtras(setState, (previous) => ({ ...previous, quotationRevisions: upsert(previous.quotationRevisions, revision) }));
    quoteDraft.setValue((previous) => ({ ...previous, revisionAmount: "", revisionStatus: "", revisionNote: "" }));
    notify(t("Revision {version} saved", { version }), { tone: "success" });
  };

  const saveTemplate = () => {
    const name = quoteDraft.value.templateName.trim();
    if (!name) {
      notify(t("Enter a template name first."), { tone: "danger" });
      return;
    }
    if (!activeQuote || activeQuote.items.length === 0) {
      notify(t("Add line items before saving a template."), { tone: "danger" });
      return;
    }
    const template = makeTemplate(name, activeQuote.items, extras.lineTemplates);
    updateExtras(setState, (previous) => ({ ...previous, lineTemplates: upsert(previous.lineTemplates, template) }));
    quoteDraft.setValue((previous) => ({ ...previous, templateName: "" }));
    notify(t("Template saved"), { tone: "success" });
  };

  const deleteTemplate = (template: LineTemplate) => {
    if (!window.confirm(t("Delete template {name}?", { name: template.name }))) return;
    updateExtras(setState, (previous) => ({ ...previous, lineTemplates: removeById(previous.lineTemplates, template.id) }));
  };

  const quoteConfig: ExplorerConfig<Quotation> = {
    module: "quotations",
    title: t("Quotation explorer"),
    description: t("Statuses, values, revisions, and customer links."),
    rows: state.quotations,
    columns: [
      {
        key: "customer",
        label: t("Customer"),
        value: (quote) => customerLabel(state, quote.customerId, unknownCustomer),
        link: { module: "customers", id: (quote: Quotation) => quote.customerId },
      },
      { key: "number", label: t("Number"), value: (quote) => quote.number, editable: "text" },
      { key: "date", label: t("Date"), value: (quote) => shortDate(quote.date) },
      { key: "validUntil", label: t("Valid until"), value: (quote) => shortDate(quote.validUntil) },
      { key: "status", label: t("Status"), value: (quote) => quote.status, editable: "select", options: quoteStatuses },
      { key: "amount", label: t("Amount"), value: (quote) => totalOf(quote.items), render: (quote) => money(totalOf(quote.items), currency) },
      { key: "lines", label: t("Lines"), value: (quote) => quote.items.length },
      {
        key: "revisions",
        label: t("Revisions"),
        value: (quote) => extras.quotationRevisions.filter((revision) => revision.quotationId === quote.id).length,
      },
    ],
    id: (quote) => quote.id,
    statusKey: "status",
    statusOptions: quoteStatuses,
    primaryLabel: (quote) => quote.number,
    onPatch: (id, patch) => patchQuote(id, patch as Partial<Quotation>),
    onDelete: (ids) => setState((previous) => ({ ...previous, quotations: previous.quotations.filter((quote) => !ids.includes(quote.id)) })),
    onRestore: (rows) => setState((previous) => ({ ...previous, quotations: rows.reduce((list, quote) => upsert(list, quote), previous.quotations) })),
    setTab,
  };

  return (
    <>
      <StatStrip
        items={[
          { label: t("Quotations"), value: fmtNumber(state.quotations.length) },
          { label: t("Active value"), value: money(activeTotal, currency), hint: activeQuote ? activeQuote.number : t("New quotation") },
          { label: t("Revisions"), value: fmtNumber(revisions.length) },
          { label: t("Expiring soon"), value: fmtNumber(soon.length), hint: t("Within 14 days") },
        ]}
      />

      <Phase2Panel
        title={t("Active quotation")}
        description={t("Paste CSV lines, save revisions, and reuse line templates.")}
        action={<button type="button" className="button subtle" onClick={createQuote}>{t("New quotation")}</button>}
      >
        <Toolbar>
          <select aria-label={t("Active quotation")} value={activeId} onChange={(event) => quoteDraft.setValue((previous) => ({ ...previous, activeId: event.target.value }))}>
            <option value="">{t("Select quotation")}</option>
            {state.quotations.map((quote) => (
              <option key={quote.id} value={quote.id}>{quote.number} · {customerLabel(state, quote.customerId, unknownCustomer)}</option>
            ))}
          </select>
          {activeQuote && <button type="button" className="link-button" onClick={() => openRecord("quotations", activeQuote.id, setTab)}>{t("Open")}</button>}
          <Pill tone="info">{money(activeTotal, currency)}</Pill>
        </Toolbar>
      </Phase2Panel>

      <Phase2Panel title={t("Paste line items")} description={t("CSV or tab-separated: SKU, quantity, price, name.")}>
        <Field label={t("Line items")}>
          <textarea
            rows={4}
            value={quoteDraft.value.paste}
            onChange={(event) => quoteDraft.setValue((previous) => ({ ...previous, paste: event.target.value }))}
            placeholder={t("PRD-1001, 10, 420")}
          />
        </Field>
        <Toolbar>
          <button
            type="button"
            className="primary"
            onClick={() => {
              const parsed = pastedLines(quoteDraft.value.paste, state.products);
              applyLines(parsed.lines, parsed.missing);
            }}
          >
            {t("Add pasted lines")}
          </button>
          <button type="button" onClick={() => quoteDraft.setValue((previous) => ({ ...previous, paste: "" }))}>{t("Clear")}</button>
        </Toolbar>
      </Phase2Panel>

      <Phase2Panel title={t("Save revision")} description={t("Amount and status start from the active quotation.")}>
        <div className="field-row">
          <Field label={t("Amount")}>
            <input
              type="number"
              min={0}
              value={quoteDraft.value.revisionAmount}
              placeholder={String(activeTotal)}
              onChange={(event) => quoteDraft.setValue((previous) => ({ ...previous, revisionAmount: event.target.value }))}
            />
          </Field>
          <Field label={t("Status")}>
            <select
              value={quoteDraft.value.revisionStatus || activeQuote?.status || "draft"}
              onChange={(event) => quoteDraft.setValue((previous) => ({ ...previous, revisionStatus: event.target.value }))}
            >
              {quoteStatuses.map((status) => (
                <option key={status} value={status}>{t(status)}</option>
              ))}
            </select>
          </Field>
          <Field label={t("Note")}>
            <input value={quoteDraft.value.revisionNote} onChange={(event) => quoteDraft.setValue((previous) => ({ ...previous, revisionNote: event.target.value }))} />
          </Field>
        </div>
        <Toolbar>
          <button type="button" className="primary" onClick={saveRevision}>{t("Save revision")}</button>
        </Toolbar>
        <RecordRows rows={revisions} empty={t("No revisions saved yet.")}>
          {revisions.slice().reverse().map((revision) => (
            <RowLine
              key={revision.id}
              title={`${t("Version")} ${revision.version} · ${money(revision.amount, currency)}`}
              meta={`${shortDate(revision.date)} · ${t(revision.status)}${revision.note ? ` · ${revision.note}` : ""}`}
              trailing={<Pill tone="info">{t(revision.status)}</Pill>}
            />
          ))}
        </RecordRows>
      </Phase2Panel>

      <Phase2Panel title={t("Expiry reminders")} description={t("Quotations expiring within 14 days.")} tone={soon.length ? "warning" : "success"}>
        <RecordRows rows={soon} empty={t("No quotes expiring soon.")}>
          {soon.map(({ quote, days }) => (
            <RowLine
              key={quote.id}
              title={quote.number}
              meta={`${customerLabel(state, quote.customerId, unknownCustomer)} · ${t("Valid until")}: ${shortDate(quote.validUntil)}`}
              trailing={
                <div className="actions">
                  <Pill tone="warning">{t("{days} days left", { days: days ?? 0 })}</Pill>
                  <button type="button" className="small" onClick={() => patchQuote(quote.id, { status: "expired" })}>{t("Mark expired")}</button>
                  <button type="button" className="small" onClick={() => openRecord("quotations", quote.id, setTab)}>{t("Open")}</button>
                </div>
              }
            />
          ))}
        </RecordRows>
      </Phase2Panel>

      <Phase2Panel title={t("Line templates")} description={t("Save reusable items from the active quotation.")}>
        <Toolbar>
          <input
            value={quoteDraft.value.templateName}
            onChange={(event) => quoteDraft.setValue((previous) => ({ ...previous, templateName: event.target.value }))}
            placeholder={t("Template name")}
            aria-label={t("Template name")}
          />
          <button type="button" className="primary" onClick={saveTemplate}>{t("Save template")}</button>
        </Toolbar>
        <RecordRows rows={extras.lineTemplates} empty={t("No templates yet.")}>
          {extras.lineTemplates.map((template) => (
            <RowLine
              key={template.id}
              title={template.name}
              meta={`${fmtNumber(template.lines.length)} ${t("lines")}`}
              trailing={
                <div className="actions">
                  <button type="button" className="small" onClick={() => applyLines(linesFromTemplate(template, state.products), 0)}>{t("Apply")}</button>
                  <button type="button" className="small" onClick={() => deleteTemplate(template)}>{t("Delete")}</button>
                </div>
              }
            />
          ))}
        </RecordRows>
      </Phase2Panel>

      <RecordExplorer config={quoteConfig} {...{ state, setState, setTab, preferences, setPreferences, focusRecord }} />
    </>
  );
}

function OrdersTools({ state, setState, setTab, focusRecord, preferences, setPreferences }: Phase2Props) {
  const { t } = useLanguage();
  const { notify } = useToast();
  const extras = state.extras;
  const currency = state.company.defaultCurrency || "USD";
  const orderDraft = useDraft<OrderDraft>("phase2-orders", { activeId: "", paste: "", templateName: "" });
  const [form, setForm] = useState<Order>(() => {
    const initial =
      state.orders.find((order) => order.id === orderDraft.value.activeId) ??
      state.orders.find((order) => order.id === focusRecord) ??
      state.orders[0];
    return initial ? { ...initial, items: initial.items.map((item) => ({ ...item })) } : makeEmptyOrder(state);
  });
  const [backorderForm, setBackorderForm] = useState({
    orderId: state.orders[0]?.id ?? "",
    productId: state.products[0]?.id ?? "",
    quantity: 1,
    eta: "",
  });
  const unknownCustomer = t("Unknown customer");
  const unknownProduct = t("Unknown product");
  const unknownWarehouse = t("Unknown warehouse");

  useEffect(() => {
    if (!focusRecord) return;
    const order = state.orders.find((entry) => entry.id === focusRecord);
    if (!order) return;
    setForm({ ...order, items: order.items.map((item) => ({ ...item })) });
    orderDraft.setValue((previous) => ({ ...previous, activeId: order.id }));
  }, [focusRecord]);

  const formCustomer = state.customers.find((customer) => customer.id === form.customerId);
  const formExposure = formCustomer ? getCustomerExposure(state, formCustomer.id) : 0;
  const formProjected = formExposure + totalOf(form.items);
  const creditAlert = formCustomer ? formCustomer.creditLimit <= 0 || formProjected > formCustomer.creditLimit : false;

  const guardCredit = (customerId: string, orderTotal: number): boolean => {
    const customer = state.customers.find((entry) => entry.id === customerId);
    if (!customer) {
      notify(t("Select a customer first."), { tone: "danger" });
      return false;
    }
    const projected = getCustomerExposure(state, customer.id) + Math.max(0, orderTotal);
    if (customer.creditLimit <= 0) {
      return window.confirm(t("{company} has no credit limit. Continue anyway?", { company: customer.company }));
    }
    if (projected > customer.creditLimit) {
      return window.confirm(
        t("{company} credit limit {limit} is below exposure plus this order ({projected}). Continue?", {
          company: customer.company,
          limit: money(customer.creditLimit, currency),
          projected: money(projected, currency),
        })
      );
    }
    return true;
  };

  const selectOrder = (id: string) => {
    orderDraft.setValue((previous) => ({ ...previous, activeId: id }));
    const order = state.orders.find((entry) => entry.id === id);
    setForm(order ? { ...order, items: order.items.map((item) => ({ ...item })) } : makeEmptyOrder(state));
  };

  const updateLine = (index: number, patch: Partial<OrderLine>) => {
    setForm((previous) => ({ ...previous, items: previous.items.map((item, position) => (position === index ? { ...item, ...patch } : item)) }));
  };

  const selectLineProduct = (index: number, productId: string) => {
    const product = state.products.find((entry) => entry.id === productId);
    updateLine(index, { productId, unitPrice: product?.wholesalePrice ?? 0 });
  };

  const addLine = () => {
    const product = state.products[0];
    setForm((previous) => ({
      ...previous,
      items: [
        ...previous.items,
        { productId: product?.id ?? "", quantity: 1, unitPrice: product?.wholesalePrice ?? 0, discountPercent: 0 },
      ],
    }));
  };

  const saveOrder = () => {
    if (!form.number.trim() || !form.customerId || form.items.length === 0) {
      notify(t("Number, customer, and at least one line are required."), { tone: "danger" });
      return;
    }
    if (!guardCredit(form.customerId, totalOf(form.items))) {
      notify(t("Order not saved after credit check."), { tone: "info" });
      return;
    }
    const id = form.id && state.orders.some((order) => order.id === form.id) ? form.id : uid("ORD");
    const order: Order = {
      ...form,
      id,
      number: form.number.trim(),
      items: form.items.map((item) => ({
        ...item,
        quantity: whole(item.quantity),
        unitPrice: amount(item.unitPrice),
        discountPercent: Math.min(100, amount(item.discountPercent)),
      })),
    };
    setState((previous) => ({ ...previous, orders: upsert(previous.orders, order) }));
    orderDraft.setValue((previous) => ({ ...previous, activeId: id, paste: "" }));
    setForm(order);
    notify(t("Order saved"), { tone: "success" });
  };

  const patchOrder = (id: string, patch: Record<string, unknown>) => {
    const current = state.orders.find((order) => order.id === id);
    if (!current) return;
    const next = { ...current, ...(patch as Partial<Order>) };
    if ("customerId" in patch || "status" in patch || "items" in patch) {
      if (!guardCredit(next.customerId, totalOf(next.items))) {
        notify(t("Order not updated after credit check."), { tone: "info" });
        return;
      }
    }
    setState((previous) => ({ ...previous, orders: updateById(previous.orders, id, patch as Partial<Order>) }));
    if (form.id === id) setForm(next);
  };

  const applyPaste = () => {
    const parsed = pastedLines(orderDraft.value.paste, state.products);
    if (parsed.lines.length === 0) {
      notify(t("No usable lines to add."), { tone: "danger" });
      return;
    }
    setForm((previous) => ({ ...previous, items: [...previous.items, ...parsed.lines] }));
    orderDraft.setValue((previous) => ({ ...previous, paste: "" }));
    notify(t("Added {count} lines", { count: parsed.lines.length }), { tone: "success" });
    if (parsed.missing > 0) notify(t("{count} SKUs not found", { count: parsed.missing }), { tone: "danger" });
  };

  const saveTemplate = () => {
    const name = orderDraft.value.templateName.trim();
    if (!name) {
      notify(t("Enter a template name first."), { tone: "danger" });
      return;
    }
    if (form.items.length === 0) {
      notify(t("Add line items before saving a template."), { tone: "danger" });
      return;
    }
    updateExtras(setState, (previous) => ({
      ...previous,
      lineTemplates: upsert(previous.lineTemplates, makeTemplate(name, form.items, previous.lineTemplates)),
    }));
    orderDraft.setValue((previous) => ({ ...previous, templateName: "" }));
    notify(t("Template saved"), { tone: "success" });
  };

  const deleteTemplate = (template: LineTemplate) => {
    if (!window.confirm(t("Delete template {name}?", { name: template.name }))) return;
    updateExtras(setState, (previous) => ({ ...previous, lineTemplates: removeById(previous.lineTemplates, template.id) }));
  };

  const fulfillment = form.id ? extras.fulfillment[form.id] ?? [] : [];
  const fulfillmentFor = (productId: string): FulfillmentLine =>
    fulfillment.find((line) => line.productId === productId) ?? { productId, packed: 0, shipped: 0 };

  const patchFulfillment = (productId: string, field: "packed" | "shipped", value: string) => {
    if (!form.id) {
      notify(t("Save the order before packing lines."), { tone: "danger" });
      return;
    }
    const nextValue = whole(value);
    updateExtras(setState, (previous) => {
      const lines = [...(previous.fulfillment[form.id] ?? [])];
      const index = lines.findIndex((line) => line.productId === productId);
      const base = index >= 0 ? lines[index] : { productId, packed: 0, shipped: 0 };
      const nextLine: FulfillmentLine = field === "packed" ? { ...base, packed: nextValue } : { ...base, shipped: nextValue };
      if (index >= 0) lines[index] = nextLine;
      else lines.push(nextLine);
      return { ...previous, fulfillment: { ...previous.fulfillment, [form.id]: lines } };
    });
  };

  const saveBackorder = () => {
    if (!backorderForm.orderId || !backorderForm.productId) {
      notify(t("Select an order and product for the backorder."), { tone: "danger" });
      return;
    }
    const backorder: Backorder = {
      id: nextId("BO", extras.backorders),
      orderId: backorderForm.orderId,
      productId: backorderForm.productId,
      quantity: whole(backorderForm.quantity),
      eta: backorderForm.eta,
      status: "open",
    };
    if (backorder.quantity <= 0) {
      notify(t("Backorder quantity must be greater than zero."), { tone: "danger" });
      return;
    }
    updateExtras(setState, (previous) => ({ ...previous, backorders: upsert(previous.backorders, backorder) }));
    setBackorderForm({ ...backorderForm, quantity: 1, eta: "" });
    notify(t("Backorder added"), { tone: "success" });
  };

  const patchBackorder = (id: string, patch: Partial<Backorder>) =>
    updateExtras(setState, (previous) => ({ ...previous, backorders: updateById(previous.backorders, id, patch) }));

  const deleteBackorder = (backorder: Backorder) => {
    if (!window.confirm(t("Delete this backorder?"))) return;
    updateExtras(setState, (previous) => ({ ...previous, backorders: removeById(previous.backorders, backorder.id) }));
  };

  const totalValue = state.orders.reduce((sum, order) => sum + totalOf(order.items), 0);
  const openBackorders = extras.backorders.filter((backorder) => backorder.status === "open").length;
  const creditAlerts = state.orders.filter((order) => {
    const customer = state.customers.find((entry) => entry.id === order.customerId);
    return customer ? customer.creditLimit > 0 && getCustomerExposure(state, customer.id) + totalOf(order.items) > customer.creditLimit : false;
  }).length;

  const orderConfig: ExplorerConfig<Order> = {
    module: "orders",
    title: t("Order explorer"),
    description: t("Customer links, credit checks, totals, and packing progress."),
    rows: state.orders,
    columns: [
      {
        key: "customer",
        label: t("Customer"),
        value: (order) => customerLabel(state, order.customerId, unknownCustomer),
        link: { module: "customers", id: (order: Order) => order.customerId },
      },
      { key: "number", label: t("Number"), value: (order) => order.number, editable: "text" },
      { key: "date", label: t("Date"), value: (order) => shortDate(order.date) },
      { key: "status", label: t("Status"), value: (order) => order.status, editable: "select", options: orderStatuses },
      { key: "shippingStatus", label: t("Shipping"), value: (order) => order.shippingStatus, editable: "select", options: shippingStatuses },
      { key: "total", label: t("Total"), value: (order) => totalOf(order.items), render: (order) => money(totalOf(order.items), currency) },
      {
        key: "packed",
        label: t("Packed"),
        value: (order) => (extras.fulfillment[order.id] ?? []).reduce((sum, line) => sum + line.packed, 0),
      },
      {
        key: "credit",
        label: t("Credit"),
        value: (order) => {
          const customer = state.customers.find((entry) => entry.id === order.customerId);
          return customer ? getCustomerExposure(state, customer.id) + totalOf(order.items) : 0;
        },
        render: (order) => {
          const customer = state.customers.find((entry) => entry.id === order.customerId);
          if (!customer) return <Pill tone="danger">{t("No customer")}</Pill>;
          const projected = getCustomerExposure(state, customer.id) + totalOf(order.items);
          const over = customer.creditLimit <= 0 || projected > customer.creditLimit;
          return <Pill tone={over ? "danger" : "success"}>{over ? t("Credit alert") : money(projected, currency)}</Pill>;
        },
      },
    ],
    id: (order) => order.id,
    statusKey: "status",
    statusOptions: orderStatuses,
    primaryLabel: (order) => order.number,
    onPatch: patchOrder,
    onDelete: (ids) => {
      setState((previous) => ({ ...previous, orders: previous.orders.filter((order) => !ids.includes(order.id)) }));
      if (form.id && ids.includes(form.id)) {
        setForm(makeEmptyOrder(state));
        orderDraft.setValue((previous) => ({ ...previous, activeId: "" }));
      }
    },
    onRestore: (rows) => setState((previous) => ({ ...previous, orders: rows.reduce((list, order) => upsert(list, order), previous.orders) })),
    setTab,
  };

  return (
    <>
      <StatStrip
        items={[
          { label: t("Orders"), value: fmtNumber(state.orders.length) },
          { label: t("Order value"), value: money(totalValue, currency) },
          { label: t("Credit alerts"), value: fmtNumber(creditAlerts) },
          { label: t("Open backorders"), value: fmtNumber(openBackorders) },
        ]}
      />

      <Phase2Panel title={t("Active order")} description={t("Credit is checked before every create or edit.")} tone={creditAlert ? "warning" : "info"}>
        <Toolbar>
          <select aria-label={t("Active order")} value={form.id} onChange={(event) => selectOrder(event.target.value)}>
            <option value="">{t("New order")}</option>
            {state.orders.map((order) => (
              <option key={order.id} value={order.id}>{order.number} · {customerLabel(state, order.customerId, unknownCustomer)}</option>
            ))}
          </select>
          <Pill tone={creditAlert ? "danger" : "success"}>
            {creditAlert
              ? t("Credit limit {limit} · projected {projected}", { limit: money(formCustomer?.creditLimit ?? 0, currency), projected: money(formProjected, currency) })
              : t("Within credit limit")}
          </Pill>
        </Toolbar>
        <div className="field-row">
          <Field label={t("Number")}>
            <input value={form.number} onChange={(event) => setForm({ ...form, number: event.target.value })} />
          </Field>
          <Field label={t("Customer")}>
            <select value={form.customerId} onChange={(event) => setForm({ ...form, customerId: event.target.value })}>
              <option value="">{t("Select customer")}</option>
              {state.customers.map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.company}</option>
              ))}
            </select>
          </Field>
          <Field label={t("Date")}>
            <input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
          </Field>
          <Field label={t("Warehouse")}>
            <select value={form.warehouseId} onChange={(event) => setForm({ ...form, warehouseId: event.target.value })}>
              <option value="">{t("Select warehouse")}</option>
              {state.warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>
              ))}
            </select>
          </Field>
          <Field label={t("Status")}>
            <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Status })}>
              {orderStatuses.map((status) => (
                <option key={status} value={status}>{t(status)}</option>
              ))}
            </select>
          </Field>
          <Field label={t("Shipping status")}>
            <select value={form.shippingStatus} onChange={(event) => setForm({ ...form, shippingStatus: event.target.value as Status })}>
              {shippingStatuses.map((status) => (
                <option key={status} value={status}>{t(status)}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={t("Notes")}>
          <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </Field>
        <Toolbar>
          <button type="button" className="primary" onClick={saveOrder}>{t("Save order")}</button>
          <button type="button" onClick={() => selectOrder("")}>{t("New order")}</button>
          <strong>{money(totalOf(form.items), currency)}</strong>
        </Toolbar>
      </Phase2Panel>

      <Phase2Panel title={t("Order lines and packing")} description={t("Packed and shipped numbers are saved per line in local extras.")}>
        <div className="order-lines">
          {form.items.length === 0 && <div className="phase2-empty">{t("No line items yet.")}</div>}
          {form.items.map((item, index) => {
            const packed = fulfillmentFor(item.productId);
            return (
              <div className="line-row" key={`${item.productId}-${index}`}>
                <Field label={t("Product")}>
                  <select value={item.productId} onChange={(event) => selectLineProduct(index, event.target.value)}>
                    <option value="">{t("Select product")}</option>
                    {state.products.map((product) => (
                      <option key={product.id} value={product.id}>{product.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label={t("Quantity")}>
                  <input type="number" min={0} value={item.quantity} onChange={(event) => updateLine(index, { quantity: whole(event.target.value) })} />
                </Field>
                <Field label={t("Unit price")}>
                  <input type="number" min={0} value={item.unitPrice} onChange={(event) => updateLine(index, { unitPrice: amount(event.target.value) })} />
                </Field>
                <Field label={t("Discount %")}>
                  <input type="number" min={0} max={100} value={item.discountPercent} onChange={(event) => updateLine(index, { discountPercent: Math.min(100, amount(event.target.value)) })} />
                </Field>
                <Field label={t("Packed")}>
                  <input type="number" min={0} value={packed.packed} onChange={(event) => patchFulfillment(item.productId, "packed", event.target.value)} />
                </Field>
                <Field label={t("Shipped")}>
                  <input type="number" min={0} value={packed.shipped} onChange={(event) => patchFulfillment(item.productId, "shipped", event.target.value)} />
                </Field>
                <Field label={t("Amount")}>
                  <input readOnly value={money(lineAmount(item), currency)} />
                </Field>
                <div className="field">
                  <button type="button" className="small" onClick={() => setForm((previous) => ({ ...previous, items: previous.items.filter((_, position) => position !== index) }))}>{t("Remove")}</button>
                </div>
              </div>
            );
          })}
        </div>
        <Toolbar>
          <button type="button" onClick={addLine}>{t("Add item")}</button>
        </Toolbar>
      </Phase2Panel>

      <Phase2Panel title={t("Paste line items")} description={t("CSV or tab-separated: SKU, quantity, price, name.")}>
        <Field label={t("Line items")}>
          <textarea
            rows={4}
            value={orderDraft.value.paste}
            onChange={(event) => orderDraft.setValue((previous) => ({ ...previous, paste: event.target.value }))}
            placeholder={t("PRD-1001, 10, 420")}
          />
        </Field>
        <Toolbar>
          <button type="button" className="primary" onClick={applyPaste}>{t("Add pasted lines")}</button>
          <button type="button" onClick={() => orderDraft.setValue((previous) => ({ ...previous, paste: "" }))}>{t("Clear")}</button>
        </Toolbar>
      </Phase2Panel>

      <Phase2Panel title={t("Line templates")} description={t("Save and apply reusable lines to the active order.")}>
        <Toolbar>
          <input
            value={orderDraft.value.templateName}
            onChange={(event) => orderDraft.setValue((previous) => ({ ...previous, templateName: event.target.value }))}
            placeholder={t("Template name")}
            aria-label={t("Template name")}
          />
          <button type="button" className="primary" onClick={saveTemplate}>{t("Save template")}</button>
        </Toolbar>
        <RecordRows rows={extras.lineTemplates} empty={t("No templates yet.")}>
          {extras.lineTemplates.map((template) => (
            <RowLine
              key={template.id}
              title={template.name}
              meta={`${fmtNumber(template.lines.length)} ${t("lines")}`}
              trailing={
                <div className="actions">
                  <button type="button" className="small" onClick={() => setForm((previous) => ({ ...previous, items: [...previous.items, ...linesFromTemplate(template, state.products)] }))}>
                    {t("Apply")}
                  </button>
                  <button type="button" className="small" onClick={() => deleteTemplate(template)}>{t("Delete")}</button>
                </div>
              }
            />
          ))}
        </RecordRows>
      </Phase2Panel>

      <Phase2Panel title={t("Add backorder")} description={t("Track unpaid supply with an ETA and status.")}>
        <div className="field-row">
          <Field label={t("Order")}>
            <select value={backorderForm.orderId} onChange={(event) => setBackorderForm({ ...backorderForm, orderId: event.target.value })}>
              <option value="">{t("Select order")}</option>
              {state.orders.map((order) => (
                <option key={order.id} value={order.id}>{order.number}</option>
              ))}
            </select>
          </Field>
          <Field label={t("Product")}>
            <select value={backorderForm.productId} onChange={(event) => setBackorderForm({ ...backorderForm, productId: event.target.value })}>
              <option value="">{t("Select product")}</option>
              {state.products.map((product) => (
                <option key={product.id} value={product.id}>{product.name}</option>
              ))}
            </select>
          </Field>
          <Field label={t("Quantity")}>
            <input type="number" min={1} value={backorderForm.quantity} onChange={(event) => setBackorderForm({ ...backorderForm, quantity: whole(event.target.value) })} />
          </Field>
          <Field label={t("ETA")}>
            <input type="date" value={backorderForm.eta} onChange={(event) => setBackorderForm({ ...backorderForm, eta: event.target.value })} />
          </Field>
        </div>
        <Toolbar>
          <button type="button" className="primary" onClick={saveBackorder}>{t("Add backorder")}</button>
        </Toolbar>
        <RecordRows rows={extras.backorders} empty={t("No backorders yet.")}>
          {extras.backorders.map((backorder) => (
            <RowLine
              key={backorder.id}
              title={`${productLabel(state.products, backorder.productId, unknownProduct)} · ${fmtNumber(backorder.quantity)}`}
              meta={`${t("Order")}: ${state.orders.find((order) => order.id === backorder.orderId)?.number ?? backorder.orderId} · ${t("ETA")}: ${shortDate(backorder.eta)}`}
              trailing={
                <div className="actions">
                  <select
                    aria-label={t("Backorder status")}
                    value={backorder.status}
                    onChange={(event) => patchBackorder(backorder.id, { status: event.target.value as Backorder["status"] })}
                  >
                    <option value="open">{t("open")}</option>
                    <option value="fulfilled">{t("fulfilled")}</option>
                  </select>
                  <input type="date" aria-label={t("ETA")} value={backorder.eta} onChange={(event) => patchBackorder(backorder.id, { eta: event.target.value })} />
                  <button type="button" className="link-button" onClick={() => openRecord("orders", backorder.orderId, setTab)}>{t("Open order")}</button>
                  <button type="button" className="small" onClick={() => deleteBackorder(backorder)}>{t("Delete")}</button>
                </div>
              }
            />
          ))}
        </RecordRows>
      </Phase2Panel>

      <RecordExplorer config={orderConfig} {...{ state, setState, setTab, preferences, setPreferences, focusRecord }} />

      <Phase2Panel title={t("Fulfillment overview")} description={t("Packed and shipped progress by order.")}>
        <RecordRows rows={state.orders} empty={t("No orders yet.")}>
          {state.orders.map((order) => {
            const lines = extras.fulfillment[order.id] ?? [];
            const packed = lines.reduce((sum, line) => sum + line.packed, 0);
            const shipped = lines.reduce((sum, line) => sum + line.shipped, 0);
            const ordered = order.items.reduce((sum, line) => sum + line.quantity, 0);
            return (
              <RowLine
                key={order.id}
                title={order.number}
                meta={`${customerLabel(state, order.customerId, unknownCustomer)} · ${warehouseLabel(state, order.warehouseId, unknownWarehouse)}`}
                trailing={
                  <div className="actions">
                    <Pill tone={packed >= ordered && packed > 0 ? "success" : "info"}>{t("Packed {packed} of {total}", { packed, total: ordered })}</Pill>
                    <Pill tone={shipped >= ordered && shipped > 0 ? "success" : "info"}>{t("Shipped {shipped} of {total}", { shipped, total: ordered })}</Pill>
                    <button type="button" className="small" onClick={() => selectOrder(order.id)}>{t("Edit")}</button>
                  </div>
                }
              />
            );
          })}
        </RecordRows>
      </Phase2Panel>
    </>
  );
}
