export type Status = "active" | "pending" | "in_progress" | "completed" | "cancelled" | "blocked" | "draft" | "sent" | "approved" | "overdue" | "paid" | "partial" | "expired" | "scheduled" | "in_transit";

export interface CompanyProfile {
  name: string;
  tradingName: string;
  baseCountry: string;
  sourceCountry: string;
  defaultCurrency: string;
  fiscalYearStart: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  brand: string;
  model: string;
  supplierId: string;
  countryOfOrigin: string;
  hsCode: string;
  unit: string;
  cost: number;
  wholesalePrice: number;
  retailPrice: number;
  moq: number;
  stock: number;
  reorderPoint: number;
  warrantyMonths: number;
  status: Status;
  notes: string;
}

export interface Supplier {
  id: string;
  name: string;
  chineseName: string;
  city: string;
  country: string;
  contact: string;
  wechat: string;
  phone: string;
  email: string;
  paymentTerms: string;
  incoterm: string;
  leadTimeDays: number;
  reliability: number;
  qualityScore: number;
  complianceStatus: Status;
  status: Status;
  notes: string;
}

export interface ImportItem {
  productId: string;
  quantity: number;
  unitCost: number;
}

export interface ImportBatch {
  id: string;
  reference: string;
  supplierId: string;
  orderDate: string;
  eta: string;
  status: Status;
  customsStatus: Status;
  currency: string;
  exchangeRate: number;
  dutyPercent: number;
  freightCost: number;
  insuranceCost: number;
  items: ImportItem[];
  notes: string;
}

export type ShipmentMode = "sea" | "air" | "rail" | "truck";

export interface Shipment {
  id: string;
  reference: string;
  importId: string;
  carrier: string;
  mode: ShipmentMode;
  originPort: string;
  destinationPort: string;
  departureDate: string;
  eta: string;
  status: Status;
  trackingNumber: string;
  containers: number;
  documentsStatus: Status;
  delayRisk: "low" | "medium" | "high";
  notes: string;
}

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  city: string;
  capacity: number;
  used: number;
  manager: string;
  status: Status;
}

export type MovementType = "inbound" | "outbound" | "transfer" | "adjustment";

export interface StockMovement {
  id: string;
  productId: string;
  warehouseId: string;
  type: MovementType;
  quantity: number;
  date: string;
  reference: string;
  notes: string;
}

export type CustomerType = "distributor" | "retailer" | "corporate" | "export";

export interface Customer {
  id: string;
  company: string;
  contact: string;
  phone: string;
  email: string;
  country: string;
  city: string;
  type: CustomerType;
  creditLimit: number;
  paymentTerms: string;
  status: Status;
  notes: string;
}

export interface OrderLine {
  productId: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
}

export interface Quotation {
  id: string;
  number: string;
  customerId: string;
  date: string;
  validUntil: string;
  status: Status;
  items: OrderLine[];
  notes: string;
}

export interface Order {
  id: string;
  number: string;
  customerId: string;
  date: string;
  status: Status;
  warehouseId: string;
  shippingStatus: Status;
  items: OrderLine[];
  notes: string;
}

export interface Invoice {
  id: string;
  number: string;
  customerId: string;
  orderId: string;
  issueDate: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  currency: string;
  status: Status;
  notes: string;
}

export interface Payment {
  id: string;
  invoiceId: string;
  date: string;
  amount: number;
  method: string;
  reference: string;
  status: Status;
  notes: string;
}

export type ComplianceType = "customs" | "import-licence" | "certificate" | "insurance" | "quality-audit" | "contract";

export interface ComplianceRecord {
  id: string;
  type: ComplianceType;
  reference: string;
  entityType: string;
  entityId: string;
  authority: string;
  issueDate: string;
  expiryDate: string;
  status: Status;
  notes: string;
}

export interface ActivityItem {
  id: string;
  timestamp: string;
  title: string;
  detail: string;
  tone: "info" | "success" | "warning" | "danger";
}

import type { Phase2Extras } from "./lib/extras";

export interface AppState {
  company: CompanyProfile;
  products: Product[];
  suppliers: Supplier[];
  imports: ImportBatch[];
  shipments: Shipment[];
  warehouses: Warehouse[];
  movements: StockMovement[];
  customers: Customer[];
  quotations: Quotation[];
  orders: Order[];
  invoices: Invoice[];
  payments: Payment[];
  compliance: ComplianceRecord[];
  activity: ActivityItem[];
  extras: Phase2Extras;
}
