import type { Dispatch, SetStateAction } from "react";
import type { AppState, Status } from "../types";

export type ApprovalState = "draft" | "reviewed" | "approved";
export type CountState = "planned" | "approved" | "rejected";
export type TransferState = "in_transit" | "completed";
export type BackorderState = "open" | "fulfilled";

export interface SupplierTrendPoint {
  id: string;
  supplierId: string;
  date: string;
  reliability: number;
  quality: number;
}

export interface SupplierContract {
  id: string;
  supplierId: string;
  incoterm: string;
  paymentTerms: string;
  signedDate: string;
  renewalDate: string;
  notes: string;
}

export interface ProductVariant {
  id: string;
  productId: string;
  name: string;
  sku: string;
  priceDelta: number;
  stock: number;
}

export interface Attachment {
  id: string;
  ownerType: string;
  ownerId: string;
  name: string;
  dataUrl: string;
  note: string;
}

export interface CostPoint {
  id: string;
  sku: string;
  date: string;
  cost: number;
  importId: string;
}

export interface ContainerLine {
  id: string;
  importId: string;
  container: string;
  pallet: string;
  description: string;
  value: number;
}

export interface ImportApproval {
  id: string;
  importId: string;
  status: ApprovalState;
  reviewer: string;
  note: string;
}

export interface Milestone {
  id: string;
  shipmentId: string;
  label: string;
  date: string;
  done: boolean;
}

export interface DocumentCheck {
  id: string;
  shipmentId: string;
  label: string;
  received: boolean;
}

export interface Bin {
  id: string;
  warehouseId: string;
  code: string;
  zone: string;
  rack: string;
  shelf: string;
  stock: number;
}

export interface CycleCount {
  id: string;
  warehouseId: string;
  productId: string;
  date: string;
  counted: number;
  system: number;
  status: CountState;
}

export interface Transfer {
  id: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  productId: string;
  quantity: number;
  date: string;
  status: TransferState;
}

export interface PricingRule {
  id: string;
  tier: string;
  productId: string;
  price: number;
}

export interface QuotationRevision {
  id: string;
  quotationId: string;
  version: number;
  date: string;
  amount: number;
  status: string;
  note: string;
}

export interface FulfillmentLine {
  productId: string;
  packed: number;
  shipped: number;
}

export interface Backorder {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  eta: string;
  status: BackorderState;
}

export interface RecurringInvoice {
  id: string;
  customerId: string;
  amount: number;
  frequency: "monthly" | "quarterly";
  nextDate: string;
  note: string;
}

export interface BankPayment {
  id: string;
  date: string;
  reference: string;
  amount: number;
  matchedPaymentId: string;
}

export interface RenewalRule {
  id: string;
  complianceId: string;
  leadDays: number;
  renewTo: string;
}

export interface SavedView {
  id: string;
  name: string;
  filters: Record<string, string>;
  sort: string;
  view: string;
}

export interface DiagnosticEntry {
  id: string;
  time: string;
  kind: "error" | "rejection";
  message: string;
}

export interface LineTemplate {
  id: string;
  name: string;
  lines: Array<{ productId: string; quantity: number; price: number }>;
}

export interface Phase2Extras {
  supplierTrends: SupplierTrendPoint[];
  supplierContracts: SupplierContract[];
  productVariants: ProductVariant[];
  attachments: Attachment[];
  costHistory: CostPoint[];
  containerLines: ContainerLine[];
  importApprovals: ImportApproval[];
  milestones: Milestone[];
  documentChecks: DocumentCheck[];
  bins: Bin[];
  cycleCounts: CycleCount[];
  transfers: Transfer[];
  customerTiers: Record<string, string>;
  pricingRules: PricingRule[];
  quotationRevisions: QuotationRevision[];
  fulfillment: Record<string, FulfillmentLine[]>;
  backorders: Backorder[];
  recurringInvoices: RecurringInvoice[];
  paymentAllocations: Record<string, number[]>;
  bankPayments: BankPayment[];
  renewalRules: RenewalRule[];
  savedViews: SavedView[];
  lineTemplates: LineTemplate[];
  diagnostics: DiagnosticEntry[];
  lastBackupAt: string;
  changeCount: number;
}

export function createExtras(): Phase2Extras {
  return {
    supplierTrends: [
      { id: "TRD-001", supplierId: "SUP-001", date: "2026-06-30", reliability: 88, quality: 91 },
      { id: "TRD-002", supplierId: "SUP-001", date: "2026-09-30", reliability: 92, quality: 93 },
      { id: "TRD-003", supplierId: "SUP-001", date: "2026-11-30", reliability: 95, quality: 94 },
      { id: "TRD-004", supplierId: "SUP-002", date: "2026-06-30", reliability: 82, quality: 86 },
      { id: "TRD-005", supplierId: "SUP-002", date: "2026-11-30", reliability: 78, quality: 84 },
    ],
    supplierContracts: [
      { id: "CTR-001", supplierId: "SUP-001", incoterm: "FOB Shenzhen", paymentTerms: "30% deposit / 70% B/L", signedDate: "2026-01-10", renewalDate: "2027-01-10", notes: "Annual manufacturing agreement." },
      { id: "CTR-002", supplierId: "SUP-002", incoterm: "EXW Ningbo", paymentTerms: "Net 30", signedDate: "2026-03-01", renewalDate: "2026-12-31", notes: "Renewal pending credit review." },
    ],
    productVariants: [
      { id: "VAR-001", productId: "PRD-1001", name: "128 GB / Midnight", sku: "PRD-1001-128-MB", priceDelta: 0, stock: 42 },
      { id: "VAR-002", productId: "PRD-1001", name: "256 GB / Silver", sku: "PRD-1001-256-SV", priceDelta: 90, stock: 18 },
    ],
    attachments: [],
    costHistory: [
      { id: "COST-001", sku: "PRD-1001", date: "2026-03-15", cost: 312, importId: "IMP-2026-012" },
      { id: "COST-002", sku: "PRD-1001", date: "2026-08-12", cost: 328, importId: "IMP-2026-014" },
      { id: "COST-003", sku: "PRD-2002", date: "2026-09-02", cost: 184, importId: "IMP-2026-013" },
    ],
    containerLines: [
      { id: "CON-001", importId: "IMP-2026-012", container: "CSNU4821190", pallet: "P-01", description: "Titan M5 handsets", value: 62400 },
      { id: "CON-002", importId: "IMP-2026-012", container: "CSNU4821190", pallet: "P-02", description: "Chargers and cables", value: 12800 },
    ],
    importApprovals: [
      { id: "APP-001", importId: "IMP-2026-012", status: "approved", reviewer: "Owner", note: "Documents verified." },
      { id: "APP-002", importId: "IMP-2026-015", status: "reviewed", reviewer: "Owner", note: "Awaiting duty confirmation." },
    ],
    milestones: [
      { id: "MS-001", shipmentId: "SHP-012", label: "Booked", date: "2026-10-02", done: true },
      { id: "MS-002", shipmentId: "SHP-012", label: "Departed", date: "2026-10-08", done: true },
      { id: "MS-003", shipmentId: "SHP-012", label: "Arrived", date: "2026-11-14", done: true },
      { id: "MS-004", shipmentId: "SHP-012", label: "Cleared", date: "2026-11-17", done: false },
      { id: "MS-005", shipmentId: "SHP-012", label: "Delivered", date: "2026-11-20", done: false },
    ],
    documentChecks: [
      { id: "DOC-001", shipmentId: "SHP-012", label: "Bill of lading", received: true },
      { id: "DOC-002", shipmentId: "SHP-012", label: "Commercial invoice", received: true },
      { id: "DOC-003", shipmentId: "SHP-012", label: "Packing list", received: false },
      { id: "DOC-004", shipmentId: "SHP-012", label: "Import licence", received: false },
    ],
    bins: [
      { id: "BIN-001", warehouseId: "WH-001", code: "A-01-02", zone: "A", rack: "01", shelf: "02", stock: 60 },
      { id: "BIN-002", warehouseId: "WH-001", code: "B-04-01", zone: "B", rack: "04", shelf: "01", stock: 35 },
      { id: "BIN-003", warehouseId: "WH-002", code: "C-02-03", zone: "C", rack: "02", shelf: "03", stock: 28 },
    ],
    cycleCounts: [
      { id: "CNT-001", warehouseId: "WH-001", productId: "PRD-1001", date: "2026-11-20", counted: 92, system: 95, status: "planned" },
    ],
    transfers: [
      { id: "TRF-001", fromWarehouseId: "WH-001", toWarehouseId: "WH-002", productId: "PRD-2002", quantity: 20, date: "2026-11-25", status: "in_transit" },
    ],
    customerTiers: { "CUS-001": "Gold", "CUS-002": "Silver", "CUS-003": "Bronze" },
    pricingRules: [
      { id: "PRICE-001", tier: "Gold", productId: "PRD-1001", price: 398 },
      { id: "PRICE-002", tier: "Silver", productId: "PRD-2002", price: 218 },
    ],
    quotationRevisions: [
      { id: "REV-001", quotationId: "QUO-2026-028", version: 1, date: "2026-11-02", amount: 8200, status: "sent", note: "Initial quote." },
      { id: "REV-002", quotationId: "QUO-2026-028", version: 2, date: "2026-11-06", amount: 7950, status: "approved", note: "Volume discount applied." },
    ],
    fulfillment: {
      "ORD-2026-016": [
        { productId: "PRD-1001", packed: 10, shipped: 8 },
        { productId: "PRD-2002", packed: 4, shipped: 4 },
      ],
    },
    backorders: [
      { id: "BO-001", orderId: "ORD-2026-018", productId: "PRD-4002", quantity: 12, eta: "2026-12-10", status: "open" },
    ],
    recurringInvoices: [
      { id: "RINV-001", customerId: "CUS-001", amount: 2500, frequency: "monthly", nextDate: "2026-12-01", note: "Monthly retainer." },
    ],
    paymentAllocations: {},
    bankPayments: [
      { id: "BANK-001", date: "2026-11-22", reference: "PAY-001", amount: 15000, matchedPaymentId: "PAY-001" },
    ],
    renewalRules: [
      { id: "REN-001", complianceId: "CMP-001", leadDays: 30, renewTo: "evidence" },
    ],
    savedViews: [],
    lineTemplates: [
      {
        id: "TPL-001",
        name: "Starter handset bundle",
        lines: [
          { productId: "PRD-1001", quantity: 10, price: 420 },
          { productId: "PRD-2002", quantity: 5, price: 230 },
        ],
      },
    ],
    diagnostics: [],
    lastBackupAt: "",
    changeCount: 0,
  };
}

const ARRAY_KEYS = [
  "supplierTrends", "supplierContracts", "productVariants", "attachments", "costHistory",
  "containerLines", "importApprovals", "milestones", "documentChecks", "bins", "cycleCounts",
  "transfers", "pricingRules", "quotationRevisions", "backorders", "recurringInvoices",
  "bankPayments", "renewalRules", "savedViews", "lineTemplates", "diagnostics",
] as const;

const OBJECT_KEYS = ["customerTiers", "fulfillment", "paymentAllocations"] as const;

/** Fills missing Phase 2 keys so old backups and installed local data stay usable. */
export function normalizeExtras(raw: unknown): Phase2Extras {
  const extras = createExtras();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return extras;
  const source = raw as Partial<Phase2Extras>;
  for (const key of ARRAY_KEYS) {
    if (Array.isArray(source[key])) (extras[key] as unknown[]) = source[key] as unknown[];
  }
  for (const key of OBJECT_KEYS) {
    if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
      (extras[key] as Record<string, unknown>) = source[key] as Record<string, unknown>;
    }
  }
  if (typeof source.lastBackupAt === "string") extras.lastBackupAt = source.lastBackupAt;
  if (typeof source.changeCount === "number" && Number.isFinite(source.changeCount)) extras.changeCount = source.changeCount;
  return extras;
}

export function withExtras(state: AppState): AppState {
  const candidate = state as Partial<AppState> & { extras?: unknown };
  return { ...state, extras: normalizeExtras(candidate.extras) };
}

export function bumpChangeCount(extras: Phase2Extras): Phase2Extras {
  return { ...extras, changeCount: extras.changeCount + 1 };
}

/** Every Phase 2 write goes through this so pending-change and backup signals stay accurate. */
export function updateExtras(
  setState: Dispatch<SetStateAction<AppState>>,
  updater: (extras: Phase2Extras) => Phase2Extras
): void {
  setState((previous) => ({
    ...previous,
    extras: bumpChangeCount(updater(previous.extras ?? createExtras())),
  }));
}

export function statusLabel(status: Status): string {
  return String(status).replace(/_/g, " ");
}

export function nextId(prefix: string, items: Array<{ id: string }>): string {
  let index = items.length + 1;
  let id = `${prefix}-${String(index).padStart(3, "0")}`;
  while (items.some((item) => item.id === id)) {
    index += 1;
    id = `${prefix}-${String(index).padStart(3, "0")}`;
  }
  return id;
}
