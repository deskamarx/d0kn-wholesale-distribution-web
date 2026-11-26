import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { AppState, ComplianceType, Invoice, Order, Payment, Product } from "../types";
import { Dialog } from "./Overlays";
import { useLanguage } from "../i18n";
import { useToast } from "./Feedback";
import { useDraft } from "../hooks/useDraft";
import { bumpChangeCount } from "../lib/extras";
import { uid } from "../lib/store";

type QuickType = "product" | "order" | "invoice" | "payment" | "compliance";

interface DraftShape extends Record<string, unknown> {
  type: QuickType;
  name: string;
  sku: string;
  reference: string;
  customerId: string;
  supplierId: string;
  warehouseId: string;
  productId: string;
  invoiceId: string;
  amount: string;
  quantity: string;
  price: string;
  date: string;
  dueDate: string;
  category: string;
  method: string;
  entityType: string;
  entityId: string;
  complianceType: ComplianceType;
}

const EMPTY_DRAFT: DraftShape = {
  type: "product",
  name: "",
  sku: "",
  reference: "",
  customerId: "",
  supplierId: "",
  warehouseId: "",
  productId: "",
  invoiceId: "",
  amount: "",
  quantity: "1",
  price: "",
  date: new Date().toISOString().slice(0, 10),
  dueDate: "",
  category: "General",
  method: "Bank transfer",
  entityType: "supplier",
  entityId: "",
  complianceType: "certificate",
};

const TYPES: QuickType[] = ["product", "order", "invoice", "payment", "compliance"];

export default function QuickAdd({
  state,
  setState,
  setTab,
}: {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  setTab: (tab: string) => void;
}) {
  const { t } = useLanguage();
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const { value: draft, setValue, clearDraft } = useDraft<DraftShape>("quick-add", EMPTY_DRAFT);

  const patch = (key: keyof DraftShape, value: string) => setValue((previous) => ({ ...previous, [key]: value }));
  const today = new Date().toISOString().slice(0, 10);

  const save = () => {
    const amount = Number(draft.amount) || 0;
    const quantity = Number(draft.quantity) || 1;
    const price = Number(draft.price) || 0;
    let target = "products";
    let id = "";

    if (draft.type === "product") {
      if (!draft.name.trim() || !draft.sku.trim()) {
        notify(t("Name and SKU are required."), { tone: "warning" });
        return;
      }
      if (state.products.some((item) => item.sku.toLowerCase() === draft.sku.trim().toLowerCase())) {
        notify(t("That SKU already exists."), { tone: "danger" });
        return;
      }
      const product: Product = {
        id: uid("PRD"), sku: draft.sku.trim(), name: draft.name.trim(), category: draft.category,
        brand: "", model: "", supplierId: draft.supplierId || state.suppliers[0]?.id || "",
        countryOfOrigin: state.company.sourceCountry, hsCode: "", unit: "pcs", cost: price,
        wholesalePrice: amount || price, retailPrice: 0, moq: 1, stock: quantity, reorderPoint: 10,
        warrantyMonths: 0, status: "active", notes: t("Created from quick add."),
      };
      target = "products"; id = product.id;
      setState((previous) => ({ ...previous, products: [product, ...previous.products], extras: bumpChangeCount(previous.extras) }));
    } else if (draft.type === "order") {
      if (!draft.customerId) {
        notify(t("Choose a customer first."), { tone: "warning" });
        return;
      }
      const product = state.products.find((item) => item.id === draft.productId) ?? state.products[0];
      const order: Order = {
        id: uid("ORD"), number: `ORD-${new Date().getFullYear()}-${String(state.orders.length + 1).padStart(3, "0")}`,
        customerId: draft.customerId, date: draft.date || today, status: "draft",
        warehouseId: draft.warehouseId || state.warehouses[0]?.id || "", shippingStatus: "pending",
        items: product ? [{ productId: product.id, quantity, unitPrice: price || product.wholesalePrice, discountPercent: 0 }] : [],
        notes: t("Created from quick add."),
      };
      target = "orders"; id = order.id;
      setState((previous) => ({ ...previous, orders: [order, ...previous.orders], extras: bumpChangeCount(previous.extras) }));
    } else if (draft.type === "invoice") {
      if (!draft.customerId || amount <= 0) {
        notify(t("Choose a customer and enter an amount."), { tone: "warning" });
        return;
      }
      const invoice: Invoice = {
        id: uid("INV"), number: `INV-${new Date().getFullYear()}-${String(state.invoices.length + 1).padStart(3, "0")}`,
        customerId: draft.customerId, orderId: "", issueDate: draft.date || today,
        dueDate: draft.dueDate || today, amount, paidAmount: 0, currency: state.company.defaultCurrency,
        status: "sent", notes: t("Created from quick add."),
      };
      target = "invoices"; id = invoice.id;
      setState((previous) => ({ ...previous, invoices: [invoice, ...previous.invoices], extras: bumpChangeCount(previous.extras) }));
    } else if (draft.type === "payment") {
      if (!draft.invoiceId || amount <= 0) {
        notify(t("Choose an invoice and enter an amount."), { tone: "warning" });
        return;
      }
      const payment: Payment = {
        id: uid("PAY"), invoiceId: draft.invoiceId, date: draft.date || today, amount,
        method: draft.method, reference: draft.reference || uid("REF"), status: "completed", notes: "",
      };
      target = "payments"; id = payment.id;
      setState((previous) => ({
        ...previous,
        payments: [payment, ...previous.payments],
        invoices: previous.invoices.map((invoice) =>
          invoice.id === payment.invoiceId
            ? { ...invoice, paidAmount: Math.min(invoice.amount, invoice.paidAmount + amount), status: Math.min(invoice.amount, invoice.paidAmount + amount) >= invoice.amount ? "paid" : "partial" }
            : invoice
        ),
        extras: bumpChangeCount(previous.extras),
      }));
    } else {
      if (!draft.reference.trim()) {
        notify(t("Enter a reference."), { tone: "warning" });
        return;
      }
      target = "compliance"; id = uid("CMP");
      setState((previous) => ({
        ...previous,
        compliance: [{
          id, type: draft.complianceType, reference: draft.reference.trim(), entityType: draft.entityType,
          entityId: draft.entityId || state.suppliers[0]?.id || "", authority: "", issueDate: draft.date || today,
          expiryDate: draft.dueDate || today, status: "active", notes: t("Created from quick add."),
        }, ...previous.compliance],
        extras: bumpChangeCount(previous.extras),
      }));
    }

    clearDraft();
    setOpen(false);
    notify(t("Record created"), { tone: "success" });
    setTab(target);
    window.dispatchEvent(new CustomEvent("d0kn-focus-record", { detail: { module: target, id } }));
  };

  return (
    <>
      <button type="button" className="button primary quick-add-button" onClick={() => setOpen(true)}>
        + {t("Quick add")}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t("Quick add")}>
        <div className="quick-add-form">
          <label className="phase2-field">
            <span>{t("Record type")}</span>
            <select value={draft.type} onChange={(event) => patch("type", event.target.value)}>
              {TYPES.map((type) => <option key={type} value={type}>{t(type === "product" ? "Product" : type === "order" ? "Order" : type === "invoice" ? "Invoice" : type === "payment" ? "Payment" : "Compliance")}</option>)}
            </select>
          </label>

          {(draft.type === "product" || draft.type === "compliance") && (
            <label className="phase2-field"><span>{t(draft.type === "product" ? "Product name" : "Reference")}</span>
              <input value={draft.type === "product" ? draft.name : draft.reference} onChange={(event) => patch(draft.type === "product" ? "name" : "reference", event.target.value)} />
            </label>
          )}
          {draft.type === "product" && (
            <>
              <label className="phase2-field"><span>{t("SKU")}</span><input value={draft.sku} onChange={(event) => patch("sku", event.target.value)} /></label>
              <label className="phase2-field"><span>{t("Supplier")}</span><select value={draft.supplierId} onChange={(event) => patch("supplierId", event.target.value)}><option value="">{t("Use first supplier")}</option>{state.suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label className="phase2-field"><span>{t("Category")}</span><input value={draft.category} onChange={(event) => patch("category", event.target.value)} /></label>
              <label className="phase2-field"><span>{t("Cost")}</span><input type="number" value={draft.price} onChange={(event) => patch("price", event.target.value)} /></label>
              <label className="phase2-field"><span>{t("Opening stock")}</span><input type="number" value={draft.quantity} onChange={(event) => patch("quantity", event.target.value)} /></label>
            </>
          )}
          {(draft.type === "order" || draft.type === "invoice") && (
            <label className="phase2-field"><span>{t("Customer")}</span><select value={draft.customerId} onChange={(event) => patch("customerId", event.target.value)}><option value="">{t("Choose customer")}</option>{state.customers.map((item) => <option key={item.id} value={item.id}>{item.company}</option>)}</select></label>
          )}
          {draft.type === "order" && (
            <>
              <label className="phase2-field"><span>{t("Product")}</span><select value={draft.productId} onChange={(event) => patch("productId", event.target.value)}><option value="">{t("Use first product")}</option>{state.products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label className="phase2-field"><span>{t("Warehouse")}</span><select value={draft.warehouseId} onChange={(event) => patch("warehouseId", event.target.value)}><option value="">{t("Use first warehouse")}</option>{state.warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label className="phase2-field"><span>{t("Quantity")}</span><input type="number" value={draft.quantity} onChange={(event) => patch("quantity", event.target.value)} /></label>
              <label className="phase2-field"><span>{t("Unit price")}</span><input type="number" value={draft.price} onChange={(event) => patch("price", event.target.value)} /></label>
            </>
          )}
          {(draft.type === "invoice" || draft.type === "payment") && (
            <label className="phase2-field"><span>{t("Amount")}</span><input type="number" value={draft.amount} onChange={(event) => patch("amount", event.target.value)} /></label>
          )}
          {draft.type === "payment" && (
            <>
              <label className="phase2-field"><span>{t("Invoice")}</span><select value={draft.invoiceId} onChange={(event) => patch("invoiceId", event.target.value)}><option value="">{t("Choose invoice")}</option>{state.invoices.map((item) => <option key={item.id} value={item.id}>{item.number}</option>)}</select></label>
              <label className="phase2-field"><span>{t("Method")}</span><input value={draft.method} onChange={(event) => patch("method", event.target.value)} /></label>
              <label className="phase2-field"><span>{t("Reference")}</span><input value={draft.reference} onChange={(event) => patch("reference", event.target.value)} /></label>
            </>
          )}
          {draft.type === "compliance" && (
            <>
              <label className="phase2-field"><span>{t("Type")}</span><select value={draft.complianceType} onChange={(event) => patch("complianceType", event.target.value)}><option value="customs">Customs</option><option value="import-licence">Import licence</option><option value="certificate">Certificate</option><option value="insurance">Insurance</option><option value="quality-audit">Quality audit</option><option value="contract">Contract</option></select></label>
              <label className="phase2-field"><span>{t("Entity")}</span><select value={draft.entityType} onChange={(event) => patch("entityType", event.target.value)}><option value="supplier">Supplier</option><option value="product">Product</option><option value="customer">Customer</option><option value="order">Order</option></select></label>
            </>
          )}
          <label className="phase2-field"><span>{t(draft.type === "compliance" ? "Issue date" : "Date")}</span><input type="date" value={draft.date} onChange={(event) => patch("date", event.target.value)} /></label>
          {(draft.type === "invoice" || draft.type === "compliance") && (
            <label className="phase2-field"><span>{t(draft.type === "invoice" ? "Due date" : "Expiry date")}</span><input type="date" value={draft.dueDate} onChange={(event) => patch("dueDate", event.target.value)} /></label>
          )}
          <p className="muted-text">{t("Drafts are saved locally until you save or clear this form.")}</p>
          <div className="actions">
            <button type="button" className="button subtle" onClick={() => { clearDraft(); setOpen(false); }}>{t("Discard draft")}</button>
            <button type="button" className="button primary" onClick={save}>{t("Save record")}</button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
