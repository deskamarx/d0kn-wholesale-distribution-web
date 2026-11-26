import type { AppState } from "../types";
import { initialState } from "../seed";
import { withExtras } from "./extras";
import { recordDiagnostic } from "./diagnostics";

export const STORAGE_SCHEMA = 2;
export const SCHEMA_KEY = "d0kn-distribution-schema-v1";

const ARRAY_KEYS = [
  "products", "suppliers", "imports", "shipments", "warehouses", "movements",
  "customers", "quotations", "orders", "invoices", "payments", "compliance", "activity",
] as const;

export function isAppStateShape(value: unknown): value is AppState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const parsed = value as Record<string, unknown>;
  if (!parsed.company || typeof parsed.company !== "object" || Array.isArray(parsed.company)) return false;
  for (const key of ARRAY_KEYS) {
    if (parsed[key] !== undefined && !Array.isArray(parsed[key])) return false;
  }
  return true;
}

/** Adds schema defaults without mutating stored data. Safe to call repeatedly. */
export function migrateState(value: unknown): AppState | null {
  if (!isAppStateShape(value)) return null;
  const parsed = value as AppState;
  const merged: AppState = {
    ...initialState,
    ...parsed,
    company: { ...initialState.company, ...parsed.company },
  };
  for (const key of ARRAY_KEYS) {
    if (!Array.isArray(merged[key])) (merged[key] as unknown[]) = [];
  }
  const result = withExtras(merged);
  try {
    window.localStorage.setItem(SCHEMA_KEY, String(STORAGE_SCHEMA));
  } catch {
    // Schema marking is optional; the migrated in-memory state is still valid.
  }
  return result;
}

export function loadMigratedState(): AppState {
  try {
    const raw = window.localStorage.getItem("d0kn-distribution-v1");
    if (!raw) return withExtras(initialState);
    const migrated = migrateState(JSON.parse(raw));
    if (migrated) return migrated;
    recordDiagnostic("error", "Stored workspace failed validation; sample workspace loaded.");
  } catch {
    recordDiagnostic("error", "Stored workspace could not be read; sample workspace loaded.");
  }
  return withExtras(initialState);
}

export function assertSchema(state: AppState): void {
  try {
    window.localStorage.setItem(SCHEMA_KEY, String(STORAGE_SCHEMA));
  } catch {
    // Ignore unavailable storage.
  }
  if (!state.extras) recordDiagnostic("error", "Workspace loaded without Phase 2 defaults.");
}

type IdMap = Map<string, string>;
export interface IdMaps {
  supplierIds?: IdMap;
  productIds?: IdMap;
  importIds?: IdMap;
  shipmentIds?: IdMap;
  warehouseIds?: IdMap;
  customerIds?: IdMap;
  orderIds?: IdMap;
  invoiceIds?: IdMap;
  quotationIds?: IdMap;
  paymentIds?: IdMap;
  complianceIds?: IdMap;
}

function remap(value: string | undefined, map: IdMap | undefined): string {
  return value && map?.has(value) ? map.get(value)! : value ?? "";
}

/** Keeps Phase 2 references consistent when seed scenarios regenerate business IDs. */
export function remapExtras(state: AppState, maps: IdMaps): AppState {
  const extras = withExtras(state).extras;
  const next = {
    ...extras,
    supplierTrends: extras.supplierTrends.map((row) => ({ ...row, supplierId: remap(row.supplierId, maps.supplierIds) })),
    supplierContracts: extras.supplierContracts.map((row) => ({ ...row, supplierId: remap(row.supplierId, maps.supplierIds) })),
    productVariants: extras.productVariants.map((row) => ({ ...row, productId: remap(row.productId, maps.productIds) })),
    attachments: extras.attachments.map((row) => ({
      ...row,
      ownerId:
        row.ownerType === "product" ? remap(row.ownerId, maps.productIds) :
        row.ownerType === "supplier" ? remap(row.ownerId, maps.supplierIds) :
        row.ownerType === "shipment" ? remap(row.ownerId, maps.shipmentIds) :
        row.ownerType === "import" ? remap(row.ownerId, maps.importIds) : row.ownerId,
    })),
    costHistory: extras.costHistory.map((row) => ({ ...row, importId: remap(row.importId, maps.importIds) })),
    containerLines: extras.containerLines.map((row) => ({ ...row, importId: remap(row.importId, maps.importIds) })),
    importApprovals: extras.importApprovals.map((row) => ({ ...row, importId: remap(row.importId, maps.importIds) })),
    milestones: extras.milestones.map((row) => ({ ...row, shipmentId: remap(row.shipmentId, maps.shipmentIds) })),
    documentChecks: extras.documentChecks.map((row) => ({ ...row, shipmentId: remap(row.shipmentId, maps.shipmentIds) })),
    bins: extras.bins.map((row) => ({ ...row, warehouseId: remap(row.warehouseId, maps.warehouseIds) })),
    cycleCounts: extras.cycleCounts.map((row) => ({
      ...row,
      warehouseId: remap(row.warehouseId, maps.warehouseIds),
      productId: remap(row.productId, maps.productIds),
    })),
    transfers: extras.transfers.map((row) => ({
      ...row,
      fromWarehouseId: remap(row.fromWarehouseId, maps.warehouseIds),
      toWarehouseId: remap(row.toWarehouseId, maps.warehouseIds),
      productId: remap(row.productId, maps.productIds),
    })),
    customerTiers: Object.fromEntries(
      Object.entries(extras.customerTiers).map(([id, tier]) => [remap(id, maps.customerIds), tier])
    ),
    pricingRules: extras.pricingRules.map((row) => ({ ...row, productId: remap(row.productId, maps.productIds) })),
    quotationRevisions: extras.quotationRevisions.map((row) => ({ ...row, quotationId: remap(row.quotationId, maps.quotationIds) })),
    fulfillment: Object.fromEntries(
      Object.entries(extras.fulfillment).map(([orderId, lines]) => [
        remap(orderId, maps.orderIds),
        lines.map((line) => ({ ...line, productId: remap(line.productId, maps.productIds) })),
      ])
    ),
    backorders: extras.backorders.map((row) => ({
      ...row,
      orderId: remap(row.orderId, maps.orderIds),
      productId: remap(row.productId, maps.productIds),
    })),
    recurringInvoices: extras.recurringInvoices.map((row) => ({ ...row, customerId: remap(row.customerId, maps.customerIds) })),
    paymentAllocations: Object.fromEntries(
      Object.entries(extras.paymentAllocations).map(([invoiceId, lines]) => [remap(invoiceId, maps.invoiceIds), lines])
    ),
    bankPayments: extras.bankPayments.map((row) => ({ ...row, matchedPaymentId: remap(row.matchedPaymentId, maps.paymentIds) })),
    renewalRules: extras.renewalRules.map((row) => ({ ...row, complianceId: remap(row.complianceId, maps.complianceIds) })),
  };
  return { ...state, extras: next };
}
