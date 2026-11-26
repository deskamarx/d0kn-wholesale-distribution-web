import type { AppState } from "../types";

export interface IntegrityIssue {
  id: string;
  severity: "error" | "warning";
  module: string;
  message: string;
  recordId: string;
}

function validDate(value: string | undefined): boolean {
  if (!value) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  values.forEach((value) => {
    if (!value) return;
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  });
  return Array.from(repeated);
}

/** Local-only consistency report; it never fixes or uploads data. */
export function checkIntegrity(state: AppState): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const add = (severity: IntegrityIssue["severity"], module: string, message: string, recordId: string) =>
    issues.push({ id: `${module}-${recordId}-${issues.length}`, severity, module, message, recordId });

  const productIds = new Set(state.products.map((item) => item.id));
  const supplierIds = new Set(state.suppliers.map((item) => item.id));
  const customerIds = new Set(state.customers.map((item) => item.id));
  const orderIds = new Set(state.orders.map((item) => item.id));
  const invoiceIds = new Set(state.invoices.map((item) => item.id));
  const importIds = new Set(state.imports.map((item) => item.id));
  const warehouseIds = new Set(state.warehouses.map((item) => item.id));

  state.products.forEach((product) => {
    if (!productIds.has(product.supplierId)) add("error", "Products", `Unknown supplier ${product.supplierId}`, product.id);
    if (product.stock < 0) add("error", "Products", "Negative stock level", product.id);
    if (product.cost < 0 || product.wholesalePrice < 0) add("warning", "Products", "Negative cost or price", product.id);
  });
  state.imports.forEach((batch) => {
    if (!supplierIds.has(batch.supplierId)) add("error", "Imports", `Unknown supplier ${batch.supplierId}`, batch.id);
    batch.items.forEach((item) => {
      if (!productIds.has(item.productId)) add("error", "Imports", `Unknown product ${item.productId}`, batch.id);
    });
    if (!validDate(batch.orderDate) || !validDate(batch.eta)) add("warning", "Imports", "Missing or invalid date", batch.id);
  });
  state.shipments.forEach((shipment) => {
    if (!importIds.has(shipment.importId)) add("error", "Shipments", `Unknown import ${shipment.importId}`, shipment.id);
    if (!validDate(shipment.eta) || !validDate(shipment.departureDate)) add("warning", "Shipments", "Missing or invalid date", shipment.id);
  });
  state.movements.forEach((movement) => {
    if (!productIds.has(movement.productId)) add("error", "Warehouse", `Unknown product ${movement.productId}`, movement.id);
    if (!warehouseIds.has(movement.warehouseId)) add("error", "Warehouse", `Unknown warehouse ${movement.warehouseId}`, movement.id);
  });
  state.quotations.forEach((quote) => {
    if (!customerIds.has(quote.customerId)) add("error", "Quotations", `Unknown customer ${quote.customerId}`, quote.id);
    quote.items.forEach((item) => {
      if (!productIds.has(item.productId)) add("error", "Quotations", `Unknown product ${item.productId}`, quote.id);
    });
  });
  state.orders.forEach((order) => {
    if (!customerIds.has(order.customerId)) add("error", "Orders", `Unknown customer ${order.customerId}`, order.id);
    if (!warehouseIds.has(order.warehouseId)) add("warning", "Orders", `Unknown warehouse ${order.warehouseId}`, order.id);
    order.items.forEach((item) => {
      if (!productIds.has(item.productId)) add("error", "Orders", `Unknown product ${item.productId}`, order.id);
      if (item.quantity < 0 || item.unitPrice < 0) add("warning", "Orders", "Negative quantity or price", order.id);
    });
  });
  state.invoices.forEach((invoice) => {
    if (!customerIds.has(invoice.customerId)) add("error", "Invoices", `Unknown customer ${invoice.customerId}`, invoice.id);
    if (invoice.orderId && !orderIds.has(invoice.orderId)) add("warning", "Invoices", `Unknown order ${invoice.orderId}`, invoice.id);
    if (invoice.paidAmount > invoice.amount) add("error", "Invoices", "Paid amount exceeds invoice total", invoice.id);
    if (!validDate(invoice.issueDate) || !validDate(invoice.dueDate)) add("warning", "Invoices", "Missing or invalid date", invoice.id);
  });
  state.payments.forEach((payment) => {
    if (!invoiceIds.has(payment.invoiceId)) add("error", "Payments", `Unknown invoice ${payment.invoiceId}`, payment.id);
    if (payment.amount <= 0) add("warning", "Payments", "Non-positive payment amount", payment.id);
  });
  state.compliance.forEach((record) => {
    if (!validDate(record.expiryDate)) add("warning", "Compliance", "Missing or invalid expiry date", record.id);
    const owner =
      record.entityType === "product" ? productIds :
      record.entityType === "supplier" ? supplierIds :
      record.entityType === "customer" ? customerIds :
      record.entityType === "order" ? orderIds :
      record.entityType === "invoice" ? invoiceIds : null;
    if (owner && !owner.has(record.entityId)) add("error", "Compliance", `Unknown ${record.entityType} ${record.entityId}`, record.id);
  });

  duplicates(state.products.map((item) => item.sku)).forEach((value) => add("warning", "Products", `Duplicate SKU ${value}`, value));
  duplicates(state.invoices.map((item) => item.number)).forEach((value) => add("warning", "Invoices", `Duplicate invoice number ${value}`, value));
  duplicates(state.orders.map((item) => item.number)).forEach((value) => add("warning", "Orders", `Duplicate order number ${value}`, value));
  duplicates(state.imports.map((item) => item.reference)).forEach((value) => add("warning", "Imports", `Duplicate reference ${value}`, value));
  duplicates(state.shipments.map((item) => item.reference)).forEach((value) => add("warning", "Shipments", `Duplicate reference ${value}`, value));

  return issues;
}
