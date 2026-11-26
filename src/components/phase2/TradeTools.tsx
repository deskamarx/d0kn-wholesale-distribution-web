import { useEffect, useState, type ChangeEvent } from "react";
import type { ImportBatch, Product, Shipment, Supplier } from "../../types";
import type { Phase2Props } from "./Phase2Ui";
import { Field, openRecord, Phase2Panel, Pill, RecordRows, RowLine, StatStrip, Toolbar } from "./Phase2Ui";
import RecordExplorer, { type ExplorerColumn, type ExplorerConfig } from "./RecordExplorer";
import { useToast } from "../Feedback";
import { useLanguage } from "../../i18n";
import {
  nextId,
  updateExtras,
  type ApprovalState,
  type Attachment,
  type ContainerLine,
  type CostPoint,
  type DocumentCheck,
  type ImportApproval,
  type Milestone,
  type ProductVariant,
  type SupplierContract,
  type SupplierTrendPoint,
} from "../../lib/extras";
import { daysUntil, money, number, shortDate } from "../../lib/format";
import { getImportTotals, getSupplierScore, statusTone } from "../../lib/intelligence";
import { removeById, uid, updateById, upsert } from "../../lib/store";

type Translate = (key: string, vars?: Record<string, string | number>) => string;
type Tone = "info" | "success" | "warning" | "danger";

const MAX_ATTACHMENT_BYTES = 1_000_000;
const MILESTONE_LABELS = ["Booked", "Departed", "Arrived", "Cleared", "Delivered"];
const DOCUMENT_LABELS = ["Bill of lading", "Commercial invoice", "Packing list", "Import licence"];
const RISK_PREFIX = "Risk override:";

function labelFor(t: Translate, value: string): string {
  return t(value).replace(/_/g, " ");
}

function chipTone(value: string): Tone {
  const tone = statusTone(value);
  return tone === "success" || tone === "warning" || tone === "danger" ? tone : "info";
}

function todayInput(): string {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function toNumber(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function patchList<T extends { id: string }>(items: T[], id: string, patch: Record<string, unknown>): T[] {
  return updateById(items, id, patch as Partial<T>);
}

function removeMany<T extends { id: string }>(items: T[], ids: string[]): T[] {
  return ids.reduce((current, id) => removeById(current, id), items);
}

function restoreMany<T extends { id: string }>(items: T[], rows: T[]): T[] {
  return rows.reduce((current, row) => upsert(current, row), items);
}

function riskReason(notes: string): string {
  if (!notes.startsWith(RISK_PREFIX)) return "";
  return notes.slice(RISK_PREFIX.length).trim().split("\n")[0] ?? "";
}

function stripRiskReason(notes: string): string {
  if (!notes.startsWith(RISK_PREFIX)) return notes.trim();
  return notes.slice(RISK_PREFIX.length).trim().split("\n").slice(1).join("\n").trim();
}

function withRiskReason(notes: string, reason: string): string {
  const base = stripRiskReason(notes);
  const override = `${RISK_PREFIX} ${reason.trim()}`;
  return base ? `${override}\n${base}` : override;
}

function Sparkline({
  points,
  label,
  empty,
}: {
  points: SupplierTrendPoint[];
  label: string;
  empty: string;
}) {
  if (points.length === 0) return <div className="phase2-empty">{empty}</div>;
  const ordered = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const coordinates = (key: "reliability" | "quality") =>
    ordered
      .map((point, index) => {
        const x = ordered.length === 1 ? 50 : (index / (ordered.length - 1)) * 100;
        const value = Math.max(0, Math.min(100, point[key]));
        const y = 38 - (value / 100) * 34;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  return (
    <svg viewBox="0 0 100 42" preserveAspectRatio="none" role="img" aria-label={label} style={{ width: "100%", height: 56, display: "block" }}>
      <line x1="0" y1="38" x2="100" y2="38" stroke="var(--border)" strokeWidth="0.6" />
      <polyline points={coordinates("reliability")} fill="none" stroke="var(--primary)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      <polyline points={coordinates("quality")} fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function SupplierTools(props: Phase2Props) {
  const { t } = useLanguage();
  const { notify } = useToast();
  const { state, setState } = props;
  const extras = state.extras;

  const patchSupplier = (id: string, patch: Record<string, unknown>) =>
    setState((previous) => ({ ...previous, suppliers: patchList(previous.suppliers, id, patch) }));
  const deleteSuppliers = (ids: string[]) =>
    setState((previous) => ({ ...previous, suppliers: removeMany(previous.suppliers, ids) }));
  const restoreSuppliers = (rows: Supplier[]) =>
    setState((previous) => ({ ...previous, suppliers: restoreMany(previous.suppliers, rows) }));

  const [selectedId, setSelectedId] = useState(() =>
    props.focusRecord && state.suppliers.some((entry) => entry.id === props.focusRecord)
      ? props.focusRecord
      : state.suppliers[0]?.id ?? ""
  );
  useEffect(() => {
    if (props.focusRecord && state.suppliers.some((entry) => entry.id === props.focusRecord)) {
      setSelectedId(props.focusRecord);
    }
  }, [props.focusRecord, state.suppliers]);

  const [trendDraft, setTrendDraft] = useState({ date: todayInput(), reliability: "", quality: "" });
  const emptyContract = { id: "", incoterm: "", paymentTerms: "", signedDate: "", renewalDate: "", notes: "" };
  const [contractDraft, setContractDraft] = useState(emptyContract);

  const selected = state.suppliers.find((entry) => entry.id === selectedId) ?? state.suppliers[0];
  const trends = selected ? extras.supplierTrends.filter((point) => point.supplierId === selected.id) : [];
  const orderedTrends = [...trends].sort((a, b) => a.date.localeCompare(b.date));
  const contracts = selected ? extras.supplierContracts.filter((entry) => entry.supplierId === selected.id) : [];
  const relatedProducts = selected ? state.products.filter((product) => product.supplierId === selected.id) : [];

  const addTrend = () => {
    if (!selected) return;
    const reliability = toNumber(trendDraft.reliability, -1);
    const quality = toNumber(trendDraft.quality, -1);
    if (!trendDraft.date || reliability < 0 || reliability > 100 || quality < 0 || quality > 100) {
      notify(t("Enter a date and scores from 0 to 100."), { tone: "info" });
      return;
    }
    const point: SupplierTrendPoint = {
      id: nextId("TRD", extras.supplierTrends),
      supplierId: selected.id,
      date: trendDraft.date,
      reliability,
      quality,
    };
    updateExtras(setState, (current) => ({ ...current, supplierTrends: upsert(current.supplierTrends, point) }));
    setTrendDraft({ date: todayInput(), reliability: "", quality: "" });
    notify(t("Scorecard point added"), { tone: "success" });
  };

  const patchTrend = (id: string, patch: Record<string, unknown>) =>
    updateExtras(setState, (current) => ({ ...current, supplierTrends: patchList(current.supplierTrends, id, patch) }));

  const deleteTrend = (id: string) => {
    if (!window.confirm(t("Delete this scorecard point?"))) return;
    updateExtras(setState, (current) => ({ ...current, supplierTrends: removeById(current.supplierTrends, id) }));
    notify(t("Scorecard point deleted"), { tone: "success" });
  };

  const saveContract = () => {
    if (!selected) return;
    if (!contractDraft.incoterm.trim() || !contractDraft.renewalDate) {
      notify(t("Enter an Incoterm and renewal date."), { tone: "info" });
      return;
    }
    const contract: SupplierContract = {
      id: contractDraft.id || nextId("CTR", extras.supplierContracts),
      supplierId: selected.id,
      incoterm: contractDraft.incoterm.trim(),
      paymentTerms: contractDraft.paymentTerms.trim(),
      signedDate: contractDraft.signedDate,
      renewalDate: contractDraft.renewalDate,
      notes: contractDraft.notes.trim(),
    };
    updateExtras(setState, (current) => ({ ...current, supplierContracts: upsert(current.supplierContracts, contract) }));
    setContractDraft(emptyContract);
    notify(t(contractDraft.id ? "Contract updated" : "Contract added"), { tone: "success" });
  };

  const deleteContract = (id: string) => {
    if (!window.confirm(t("Delete this contract?"))) return;
    updateExtras(setState, (current) => ({ ...current, supplierContracts: removeById(current.supplierContracts, id) }));
    notify(t("Contract deleted"), { tone: "success" });
  };

  const first = orderedTrends[0];
  const last = orderedTrends[orderedTrends.length - 1];
  const reliabilityDelta = first && last ? last.reliability - first.reliability : 0;
  const qualityDelta = first && last ? last.quality - first.quality : 0;
  const trendSummary =
    orderedTrends.length < 2
      ? t("Add two points to see a trend")
      : t("Reliability {delta} points · Quality {quality} points", {
          delta: `${reliabilityDelta > 0 ? "+" : ""}${number(reliabilityDelta)}`,
          quality: `${qualityDelta > 0 ? "+" : ""}${number(qualityDelta)}`,
        });

  const columns: ExplorerColumn<Supplier>[] = [
    { key: "name", label: t("Name"), value: (row) => row.name, editable: "text", link: { module: "suppliers", id: (row) => row.id } },
    { key: "city", label: t("City"), value: (row) => row.city, editable: "text" },
    { key: "country", label: t("Country"), value: (row) => row.country, editable: "text" },
    { key: "leadTimeDays", label: t("Lead time days"), value: (row) => row.leadTimeDays, editable: "number" },
    { key: "reliability", label: t("Reliability"), value: (row) => row.reliability, editable: "number" },
    { key: "qualityScore", label: t("Quality score"), value: (row) => row.qualityScore, editable: "number" },
    {
      key: "complianceStatus",
      label: t("Compliance status"),
      value: (row) => row.complianceStatus,
      editable: "select",
      options: ["active", "pending", "in_progress", "blocked", "expired"],
    },
    { key: "status", label: t("Status"), value: (row) => row.status, editable: "select", options: ["active", "pending", "blocked", "cancelled"] },
  ];

  const config: ExplorerConfig<Supplier> = {
    module: "suppliers",
    title: t("Suppliers"),
    description: "Edit partner scorecards and track supplier records.",
    rows: state.suppliers,
    columns,
    id: (row) => row.id,
    statusKey: "status",
    statusOptions: ["active", "pending", "blocked", "cancelled"],
    primaryLabel: (row) => row.name,
    onPatch: patchSupplier,
    onDelete: deleteSuppliers,
    onRestore: restoreSuppliers,
    setTab: props.setTab,
  };

  return (
    <>
      <RecordExplorer<Supplier>
        config={config}
        state={state}
        setState={setState}
        preferences={props.preferences}
        setPreferences={props.setPreferences}
        focusRecord={props.focusRecord}
      />

      <Phase2Panel
        title={t("Supplier focus")}
        description={t("Scorecards, trend history and term tracking for one partner.")}
        action={selected ? <Pill tone={chipTone(selected.status)}>{labelFor(t, selected.status)}</Pill> : undefined}
      >
        <Toolbar>
          <Field label={t("Supplier")}>
            <select value={selected?.id ?? ""} onChange={(event) => setSelectedId(event.target.value)} aria-label={t("Supplier")}>
              {state.suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </select>
          </Field>
          {relatedProducts.length > 0 && (
            <button type="button" className="button subtle" onClick={() => openRecord("products", relatedProducts[0]!.id, props.setTab)}>
              {t("View related product")}
            </button>
          )}
        </Toolbar>

        {!selected ? (
          <div className="phase2-empty">{t("Add a supplier first.")}</div>
        ) : (
          <>
            <StatStrip
              items={[
                { label: t("Composite score"), value: `${getSupplierScore(selected)}/100`, hint: t("Rule-based supplier health") },
                { label: t("Reliability"), value: `${number(selected.reliability)}%` },
                { label: t("Quality score"), value: `${number(selected.qualityScore)}%` },
                { label: t("Trend points"), value: number(trends.length) },
              ]}
            />

            <div className="mt-3">
              <div className="section-title">
                <h4>{t("Scorecard trend")}</h4>
                <Pill tone={reliabilityDelta > 0 ? "success" : reliabilityDelta < 0 ? "danger" : "info"}>{trendSummary}</Pill>
              </div>
              <Sparkline points={trends} label={t("Reliability and quality trend")} empty={t("No trend data yet.")} />
              <RecordRows rows={orderedTrends} empty={t("No scorecard points for this supplier.")}>
                {orderedTrends.map((point) => (
                  <RowLine
                    key={point.id}
                    title={
                      <input
                        type="date"
                        value={point.date}
                        onChange={(event) => patchTrend(point.id, { date: event.target.value })}
                        aria-label={`${t("Date")} ${point.id}`}
                      />
                    }
                    meta={
                      <span>
                        {t("Reliability")}{" "}
                        <input
                          className="inline-edit"
                          type="number"
                          min={0}
                          max={100}
                          value={point.reliability}
                          onChange={(event) => patchTrend(point.id, { reliability: toNumber(event.target.value) })}
                          aria-label={`${t("Reliability")} ${point.id}`}
                        />
                        {" · "}{t("Quality")}{" "}
                        <input
                          className="inline-edit"
                          type="number"
                          min={0}
                          max={100}
                          value={point.quality}
                          onChange={(event) => patchTrend(point.id, { quality: toNumber(event.target.value) })}
                          aria-label={`${t("Quality")} ${point.id}`}
                        />
                      </span>
                    }
                    trailing={<button type="button" className="button danger" onClick={() => deleteTrend(point.id)}>{t("Delete")}</button>}
                  />
                ))}
              </RecordRows>
              <Toolbar>
                <Field label={t("Date")}>
                  <input type="date" value={trendDraft.date} onChange={(event) => setTrendDraft({ ...trendDraft, date: event.target.value })} />
                </Field>
                <Field label={t("Reliability")}>
                  <input type="number" min={0} max={100} value={trendDraft.reliability} onChange={(event) => setTrendDraft({ ...trendDraft, reliability: event.target.value })} />
                </Field>
                <Field label={t("Quality")}>
                  <input type="number" min={0} max={100} value={trendDraft.quality} onChange={(event) => setTrendDraft({ ...trendDraft, quality: event.target.value })} />
                </Field>
                <button type="button" className="button" onClick={addTrend}>{t("Add trend")}</button>
              </Toolbar>
            </div>
          </>
        )}
      </Phase2Panel>

      <Phase2Panel title={t("Contract & Incoterm tracker")} description={t("Terms, renewal dates and notes are kept locally.")}>
        {!selected ? (
          <div className="phase2-empty">{t("Select a supplier to manage contracts.")}</div>
        ) : (
          <>
            <RecordRows rows={contracts} empty={t("No contracts recorded for this supplier.")}>
              {contracts.map((contract) => {
                const days = daysUntil(contract.renewalDate);
                return (
                  <RowLine
                    key={contract.id}
                    title={`${contract.incoterm} · ${contract.paymentTerms || t("Terms not set")}`}
                    meta={
                      <span>
                        {t("Renewal")}: {shortDate(contract.renewalDate)}
                        {days !== null && days <= 30 && ` · ${t("Renewal soon")}`}
                        {contract.notes ? ` · ${contract.notes}` : ""}
                      </span>
                    }
                    trailing={
                      <>
                        <button
                          type="button"
                          className="button subtle"
                          onClick={() => setContractDraft({ ...contract })}
                        >
                          {t("Edit")}
                        </button>
                        <button type="button" className="button danger" onClick={() => deleteContract(contract.id)}>{t("Delete")}</button>
                      </>
                    }
                  />
                );
              })}
            </RecordRows>
            <div className="grid cols-3 mt-3">
              <Field label={t("Incoterm")}>
                <input value={contractDraft.incoterm} onChange={(event) => setContractDraft({ ...contractDraft, incoterm: event.target.value })} placeholder={t("e.g. FOB Shenzhen")} />
              </Field>
              <Field label={t("Payment terms")}>
                <input value={contractDraft.paymentTerms} onChange={(event) => setContractDraft({ ...contractDraft, paymentTerms: event.target.value })} />
              </Field>
              <Field label={t("Signed date")}>
                <input type="date" value={contractDraft.signedDate} onChange={(event) => setContractDraft({ ...contractDraft, signedDate: event.target.value })} />
              </Field>
              <Field label={t("Renewal date")}>
                <input type="date" value={contractDraft.renewalDate} onChange={(event) => setContractDraft({ ...contractDraft, renewalDate: event.target.value })} />
              </Field>
              <Field label={t("Notes")}>
                <input value={contractDraft.notes} onChange={(event) => setContractDraft({ ...contractDraft, notes: event.target.value })} />
              </Field>
            </div>
            <Toolbar>
              <button type="button" className="button" onClick={saveContract}>{t(contractDraft.id ? "Save contract" : "Add contract")}</button>
              {contractDraft.id && <button type="button" className="button subtle" onClick={() => setContractDraft(emptyContract)}>{t("Cancel")}</button>}
            </Toolbar>
          </>
        )}
      </Phase2Panel>
    </>
  );
}

function ProductTools(props: Phase2Props) {
  const { t } = useLanguage();
  const { notify } = useToast();
  const { state, setState } = props;
  const extras = state.extras;
  const currency = state.company.defaultCurrency;

  const patchProduct = (id: string, patch: Record<string, unknown>) =>
    setState((previous) => ({ ...previous, products: patchList(previous.products, id, patch) }));
  const deleteProducts = (ids: string[]) =>
    setState((previous) => ({ ...previous, products: removeMany(previous.products, ids) }));
  const restoreProducts = (rows: Product[]) =>
    setState((previous) => ({ ...previous, products: restoreMany(previous.products, rows) }));

  const [selectedId, setSelectedId] = useState(() =>
    props.focusRecord && state.products.some((entry) => entry.id === props.focusRecord)
      ? props.focusRecord
      : state.products[0]?.id ?? ""
  );
  useEffect(() => {
    if (props.focusRecord && state.products.some((entry) => entry.id === props.focusRecord)) {
      setSelectedId(props.focusRecord);
    }
  }, [props.focusRecord, state.products]);

  const emptyVariant = { id: "", name: "", sku: "", priceDelta: "", stock: "" };
  const [variantDraft, setVariantDraft] = useState(emptyVariant);
  const [costDraft, setCostDraft] = useState({ date: todayInput(), cost: "", importId: "" });
  const [attachmentNote, setAttachmentNote] = useState("");

  const selected = state.products.find((entry) => entry.id === selectedId) ?? state.products[0];
  const variants = selected ? extras.productVariants.filter((variant) => variant.productId === selected.id) : [];
  const history = selected
    ? extras.costHistory
        .filter((point) => point.sku === selected.sku || point.sku === selected.id)
        .sort((a, b) => b.date.localeCompare(a.date))
    : [];
  const attachments = selected
    ? extras.attachments.filter((entry) => entry.ownerType === "product" && entry.ownerId === selected.id)
    : [];

  const supplierName = (id: string) => state.suppliers.find((supplier) => supplier.id === id)?.name ?? id;

  const saveVariant = () => {
    if (!selected) return;
    if (!variantDraft.name.trim() || !variantDraft.sku.trim()) {
      notify(t("Enter a variant name and SKU."), { tone: "info" });
      return;
    }
    const variant: ProductVariant = {
      id: variantDraft.id || nextId("VAR", extras.productVariants),
      productId: selected.id,
      name: variantDraft.name.trim(),
      sku: variantDraft.sku.trim(),
      priceDelta: toNumber(variantDraft.priceDelta),
      stock: toNumber(variantDraft.stock),
    };
    updateExtras(setState, (current) => ({ ...current, productVariants: upsert(current.productVariants, variant) }));
    setVariantDraft(emptyVariant);
    notify(t(variantDraft.id ? "Variant updated" : "Variant added"), { tone: "success" });
  };

  const deleteVariant = (id: string) => {
    if (!window.confirm(t("Delete this variant?"))) return;
    updateExtras(setState, (current) => ({ ...current, productVariants: removeById(current.productVariants, id) }));
    notify(t("Variant deleted"), { tone: "success" });
  };

  const addCostPoint = () => {
    if (!selected) return;
    const cost = toNumber(costDraft.cost, -1);
    if (!costDraft.date || cost < 0) {
      notify(t("Enter a date and a valid landed cost."), { tone: "info" });
      return;
    }
    const point: CostPoint = {
      id: nextId("COST", extras.costHistory),
      sku: selected.sku,
      date: costDraft.date,
      cost,
      importId: costDraft.importId.trim(),
    };
    updateExtras(setState, (current) => ({ ...current, costHistory: upsert(current.costHistory, point) }));
    setCostDraft({ date: todayInput(), cost: "", importId: "" });
    notify(t("Landed cost added"), { tone: "success" });
  };

  const deleteCostPoint = (id: string) => {
    if (!window.confirm(t("Delete this cost point?"))) return;
    updateExtras(setState, (current) => ({ ...current, costHistory: removeById(current.costHistory, id) }));
    notify(t("Cost point deleted"), { tone: "success" });
  };

  const addAttachment = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !selected) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      notify(t("Files over 1 MB are not stored."), { tone: "danger" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        notify(t("Could not read this file."), { tone: "danger" });
        return;
      }
      const attachment: Attachment = {
        id: nextId("ATT", extras.attachments),
        ownerType: "product",
        ownerId: selected.id,
        name: file.name,
        dataUrl: reader.result,
        note: attachmentNote.trim(),
      };
      updateExtras(setState, (current) => ({ ...current, attachments: upsert(current.attachments, attachment) }));
      setAttachmentNote("");
      notify(t("Attachment saved locally"), { tone: "success" });
    };
    reader.onerror = () => notify(t("Could not read this file."), { tone: "danger" });
    reader.readAsDataURL(file);
  };

  const deleteAttachment = (id: string) => {
    if (!window.confirm(t("Delete this attachment?"))) return;
    updateExtras(setState, (current) => ({ ...current, attachments: removeById(current.attachments, id) }));
    notify(t("Attachment deleted"), { tone: "success" });
  };

  const columns: ExplorerColumn<Product>[] = [
    {
      key: "supplierId",
      label: t("Supplier"),
      value: (row) => row.supplierId,
      render: (row) => supplierName(row.supplierId),
      link: { module: "suppliers", id: (row) => row.supplierId },
    },
    { key: "name", label: t("Name"), value: (row) => row.name, editable: "text" },
    { key: "sku", label: t("SKU"), value: (row) => row.sku, editable: "text" },
    { key: "category", label: t("Category"), value: (row) => row.category, editable: "text" },
    { key: "cost", label: t("Cost"), value: (row) => row.cost, editable: "number" },
    { key: "wholesalePrice", label: t("Wholesale price"), value: (row) => row.wholesalePrice, editable: "number" },
    { key: "stock", label: t("Stock"), value: (row) => row.stock, editable: "number" },
    { key: "status", label: t("Status"), value: (row) => row.status, editable: "select", options: ["active", "pending", "draft", "blocked", "cancelled"] },
  ];

  const config: ExplorerConfig<Product> = {
    module: "products",
    title: t("Products"),
    description: "Edit catalogue fields and open the linked supplier.",
    rows: state.products,
    columns,
    id: (row) => row.id,
    statusKey: "status",
    statusOptions: ["active", "pending", "draft", "blocked", "cancelled"],
    primaryLabel: (row) => `${row.name} (${row.sku})`,
    onPatch: patchProduct,
    onDelete: deleteProducts,
    onRestore: restoreProducts,
    setTab: props.setTab,
  };

  return (
    <>
      <RecordExplorer<Product>
        config={config}
        state={state}
        setState={setState}
        preferences={props.preferences}
        setPreferences={props.setPreferences}
        focusRecord={props.focusRecord}
      />

      <Phase2Panel
        title={t("Variants & bundles")}
        description={t("Parent SKU, price delta and stock are stored with the product.")}
        action={selected ? <Pill tone="info">{selected.sku}</Pill> : undefined}
      >
        <Toolbar>
          <Field label={t("Product")}>
            <select value={selected?.id ?? ""} onChange={(event) => setSelectedId(event.target.value)} aria-label={t("Product")}>
              {state.products.map((product) => (
                <option key={product.id} value={product.id}>{product.name}</option>
              ))}
            </select>
          </Field>
          {selected && <button type="button" className="button subtle" onClick={() => openRecord("suppliers", selected.supplierId, props.setTab)}>{t("Open supplier")}</button>}
        </Toolbar>
        {!selected ? (
          <div className="phase2-empty">{t("Add a product first.")}</div>
        ) : (
          <>
            <RecordRows rows={variants} empty={t("No variants or bundles for this product.")}>
              {variants.map((variant) => (
                <RowLine
                  key={variant.id}
                  title={variant.name}
                  meta={`${t("Parent SKU")}: ${selected.sku} · ${variant.sku} · ${t("Price delta")}: ${money(variant.priceDelta, currency)} · ${t("Stock")}: ${number(variant.stock)}`}
                  trailing={
                    <>
                      <button type="button" className="button subtle" onClick={() => setVariantDraft({ ...variant, priceDelta: String(variant.priceDelta), stock: String(variant.stock) })}>{t("Edit")}</button>
                      <button type="button" className="button danger" onClick={() => deleteVariant(variant.id)}>{t("Delete")}</button>
                    </>
                  }
                />
              ))}
            </RecordRows>
            <div className="grid cols-4 mt-3">
              <Field label={t("Name")}>
                <input value={variantDraft.name} onChange={(event) => setVariantDraft({ ...variantDraft, name: event.target.value })} />
              </Field>
              <Field label={t("SKU")}>
                <input value={variantDraft.sku} onChange={(event) => setVariantDraft({ ...variantDraft, sku: event.target.value })} />
              </Field>
              <Field label={t("Price delta")}>
                <input type="number" value={variantDraft.priceDelta} onChange={(event) => setVariantDraft({ ...variantDraft, priceDelta: event.target.value })} />
              </Field>
              <Field label={t("Stock")}>
                <input type="number" value={variantDraft.stock} onChange={(event) => setVariantDraft({ ...variantDraft, stock: event.target.value })} />
              </Field>
            </div>
            <Toolbar>
              <button type="button" className="button" onClick={saveVariant}>{t(variantDraft.id ? "Save variant" : "Add variant")}</button>
              {variantDraft.id && <button type="button" className="button subtle" onClick={() => setVariantDraft(emptyVariant)}>{t("Cancel")}</button>}
            </Toolbar>
          </>
        )}
      </Phase2Panel>

      <Phase2Panel title={t("Landed-cost history")} description={t("Simple local cost points per SKU, with the source import when known.")}>
        {!selected ? (
          <div className="phase2-empty">{t("Select a product to review costs.")}</div>
        ) : (
          <>
            <RecordRows rows={history} empty={t("No landed-cost points recorded for this SKU.")}>
              {history.map((point) => (
                <RowLine
                  key={point.id}
                  title={money(point.cost, currency)}
                  meta={`${shortDate(point.date)} · ${point.importId || t("No import linked")}`}
                  trailing={<button type="button" className="button danger" onClick={() => deleteCostPoint(point.id)}>{t("Delete")}</button>}
                />
              ))}
            </RecordRows>
            <Toolbar>
              <Field label={t("Date")}>
                <input type="date" value={costDraft.date} onChange={(event) => setCostDraft({ ...costDraft, date: event.target.value })} />
              </Field>
              <Field label={t("Landed cost")}>
                <input type="number" value={costDraft.cost} onChange={(event) => setCostDraft({ ...costDraft, cost: event.target.value })} />
              </Field>
              <Field label={t("Import ID")}>
                <input list="trade-import-options" value={costDraft.importId} onChange={(event) => setCostDraft({ ...costDraft, importId: event.target.value })} placeholder={t("Optional")} />
                <datalist id="trade-import-options">
                  {state.imports.map((batch) => <option key={batch.id} value={batch.id}>{batch.reference}</option>)}
                </datalist>
              </Field>
              <button type="button" className="button" onClick={addCostPoint}>{t("Add cost point")}</button>
            </Toolbar>
          </>
        )}
      </Phase2Panel>

      <Phase2Panel title={t("Image & spec attachments")} description={t("Files are converted to data URLs and stay on this device.")}>
        {!selected ? (
          <div className="phase2-empty">{t("Select a product to attach files.")}</div>
        ) : (
          <>
            <Toolbar>
              <Field label={t("File")}>
                <input type="file" accept="image/*,.pdf,.txt,.csv,.json,.md" onChange={addAttachment} aria-label={t("Attach file")} />
              </Field>
              <Field label={t("Note")}>
                <input value={attachmentNote} onChange={(event) => setAttachmentNote(event.target.value)} placeholder={t("Optional")} />
              </Field>
              <Pill tone="info">{t("Max 1 MB per file")}</Pill>
            </Toolbar>
            <RecordRows rows={attachments} empty={t("No attachments yet.")}>
              {attachments.map((attachment) => (
                <RowLine
                  key={attachment.id}
                  icon={attachment.dataUrl.startsWith("data:image/") ? (
                    <img src={attachment.dataUrl} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover" }} />
                  ) : undefined}
                  title={<a href={attachment.dataUrl} download={attachment.name}>{attachment.name}</a>}
                  meta={attachment.note || t("Stored locally")}
                  trailing={<button type="button" className="button danger" onClick={() => deleteAttachment(attachment.id)}>{t("Delete")}</button>}
                />
              ))}
            </RecordRows>
          </>
        )}
      </Phase2Panel>
    </>
  );
}

function ImportTools(props: Phase2Props) {
  const { t } = useLanguage();
  const { notify } = useToast();
  const { state, setState } = props;
  const extras = state.extras;

  const patchImport = (id: string, patch: Record<string, unknown>) =>
    setState((previous) => ({ ...previous, imports: patchList(previous.imports, id, patch) }));
  const deleteImports = (ids: string[]) =>
    setState((previous) => ({ ...previous, imports: removeMany(previous.imports, ids) }));
  const restoreImports = (rows: ImportBatch[]) =>
    setState((previous) => ({ ...previous, imports: restoreMany(previous.imports, rows) }));

  const [selectedId, setSelectedId] = useState(() =>
    props.focusRecord && state.imports.some((entry) => entry.id === props.focusRecord)
      ? props.focusRecord
      : state.imports[0]?.id ?? ""
  );
  useEffect(() => {
    if (props.focusRecord && state.imports.some((entry) => entry.id === props.focusRecord)) {
      setSelectedId(props.focusRecord);
    }
  }, [props.focusRecord, state.imports]);

  const emptyLine = { id: "", container: "", pallet: "", description: "", value: "" };
  const [lineDraft, setLineDraft] = useState(emptyLine);
  const [reviewer, setReviewer] = useState(t("Owner"));
  const [approvalNote, setApprovalNote] = useState("");

  const selected = state.imports.find((entry) => entry.id === selectedId) ?? state.imports[0];
  const lines = selected ? extras.containerLines.filter((line) => line.importId === selected.id) : [];
  const approval = selected ? extras.importApprovals.find((entry) => entry.importId === selected.id) : undefined;
  const approvalStage: ApprovalState = approval?.status ?? "draft";
  const relatedShipments = selected ? state.shipments.filter((shipment) => shipment.importId === selected.id) : [];

  useEffect(() => {
    setReviewer(approval?.reviewer || t("Owner"));
    setApprovalNote(approval?.note ?? "");
  }, [approval?.id, approval?.reviewer, approval?.note, selected?.id, t]);

  const saveLine = () => {
    if (!selected) return;
    if (!lineDraft.container.trim() || !lineDraft.description.trim()) {
      notify(t("Enter a container and description."), { tone: "info" });
      return;
    }
    const line: ContainerLine = {
      id: lineDraft.id || nextId("CON", extras.containerLines),
      importId: selected.id,
      container: lineDraft.container.trim(),
      pallet: lineDraft.pallet.trim(),
      description: lineDraft.description.trim(),
      value: toNumber(lineDraft.value),
    };
    updateExtras(setState, (current) => ({ ...current, containerLines: upsert(current.containerLines, line) }));
    setLineDraft(emptyLine);
    notify(t(lineDraft.id ? "Container line updated" : "Container line added"), { tone: "success" });
  };

  const deleteLine = (id: string) => {
    if (!window.confirm(t("Delete this container line?"))) return;
    updateExtras(setState, (current) => ({ ...current, containerLines: removeById(current.containerLines, id) }));
    notify(t("Container line deleted"), { tone: "success" });
  };

  const setApprovalStage = (status: ApprovalState) => {
    if (!selected) return;
    updateExtras(setState, (current) => {
      const existing = current.importApprovals.find((entry) => entry.importId === selected.id);
      const entry: ImportApproval = {
        id: existing?.id ?? nextId("APP", current.importApprovals),
        importId: selected.id,
        status,
        reviewer: reviewer.trim() || t("Owner"),
        note: approvalNote.trim(),
      };
      return { ...current, importApprovals: upsert(current.importApprovals, entry) };
    });
    notify(t("Approval moved to {status}", { status: labelFor(t, status) }), { tone: "success" });
  };

  const supplierName = (id: string) => state.suppliers.find((supplier) => supplier.id === id)?.name ?? id;
  const totals = selected ? getImportTotals(selected, state.products) : null;
  const waterfall = totals
    ? [
        { label: t("Goods"), value: totals.goodsCost, color: "var(--primary)" },
        { label: t("Duty"), value: totals.duty, color: "var(--warning)" },
        { label: t("Freight"), value: selected!.freightCost, color: "var(--accent)" },
        { label: t("Insurance"), value: selected!.insuranceCost, color: "var(--success)" },
      ]
    : [];
  const waterfallMax = Math.max(totals?.landedCost ?? 0, 1);
  const containerValue = lines.reduce((sum, line) => sum + line.value, 0);

  const columns: ExplorerColumn<ImportBatch>[] = [
    {
      key: "supplierId",
      label: t("Supplier"),
      value: (row) => row.supplierId,
      render: (row) => supplierName(row.supplierId),
      link: { module: "suppliers", id: (row) => row.supplierId },
    },
    { key: "reference", label: t("Reference"), value: (row) => row.reference, editable: "text" },
    { key: "eta", label: t("ETA"), value: (row) => row.eta, editable: "text" },
    { key: "status", label: t("Status"), value: (row) => row.status, editable: "select", options: ["draft", "in_progress", "completed", "cancelled"] },
    { key: "customsStatus", label: t("Customs status"), value: (row) => row.customsStatus, editable: "select", options: ["pending", "in_progress", "approved", "blocked", "expired"] },
    { key: "dutyPercent", label: t("Duty %"), value: (row) => row.dutyPercent, editable: "number" },
    { key: "freightCost", label: t("Freight cost"), value: (row) => row.freightCost, editable: "number" },
    { key: "insuranceCost", label: t("Insurance cost"), value: (row) => row.insuranceCost, editable: "number" },
    { key: "items", label: t("Item count"), value: (row) => row.items.length },
  ];

  const config: ExplorerConfig<ImportBatch> = {
    module: "imports",
    title: t("Imports"),
    description: "Track import batches, suppliers and landed costs.",
    rows: state.imports,
    columns,
    id: (row) => row.id,
    statusKey: "status",
    statusOptions: ["draft", "in_progress", "completed", "cancelled"],
    primaryLabel: (row) => row.reference,
    onPatch: patchImport,
    onDelete: deleteImports,
    onRestore: restoreImports,
    setTab: props.setTab,
  };

  return (
    <>
      <RecordExplorer<ImportBatch>
        config={config}
        state={state}
        setState={setState}
        preferences={props.preferences}
        setPreferences={props.setPreferences}
        focusRecord={props.focusRecord}
      />

      <Phase2Panel
        title={t("Landed-cost waterfall")}
        description={t("Goods, duty, freight and insurance derived from this batch and its items.")}
        action={selected ? <Pill tone={chipTone(selected.customsStatus)}>{labelFor(t, selected.customsStatus)}</Pill> : undefined}
      >
        <Toolbar>
          <Field label={t("Import")}>
            <select value={selected?.id ?? ""} onChange={(event) => setSelectedId(event.target.value)} aria-label={t("Import")}>
              {state.imports.map((batch) => (
                <option key={batch.id} value={batch.id}>{batch.reference}</option>
              ))}
            </select>
          </Field>
          {relatedShipments.length > 0 && (
            <button type="button" className="button subtle" onClick={() => openRecord("shipments", relatedShipments[0]!.id, props.setTab)}>
              {t("View related shipment")}
            </button>
          )}
        </Toolbar>
        {!selected || !totals ? (
          <div className="phase2-empty">{t("Add an import batch first.")}</div>
        ) : (
          <>
            <div style={{ display: "flex", width: "100%", height: 14, borderRadius: 99, overflow: "hidden", background: "var(--surface-soft)" }} role="img" aria-label={t("Landed cost breakdown")}>
              {waterfall.map((step) => (
                <div
                  key={step.label}
                  title={`${step.label}: ${money(step.value, selected.currency)}`}
                  style={{ width: `${Math.max(0, (step.value / waterfallMax) * 100)}%`, background: step.color }}
                />
              ))}
            </div>
            <div className="bar-list mt-3">
              {waterfall.map((step) => (
                <div className="bar-row" key={step.label}>
                  <div className="bar-meta"><span>{step.label}</span><strong>{money(step.value, selected.currency)}</strong></div>
                  <div className="progress-track"><div className="progress-fill" style={{ width: `${Math.min(100, (step.value / waterfallMax) * 100)}%`, background: step.color }} /></div>
                </div>
              ))}
            </div>
            <StatStrip
              items={[
                { label: t("Total landed cost"), value: money(totals.landedCost, selected.currency) },
                { label: t("Landed unit cost"), value: money(totals.landedUnitCost, selected.currency) },
                { label: t("Units on order"), value: number(totals.units) },
                { label: t("Wholesale value"), value: money(totals.wholesaleValue, selected.currency) },
              ]}
            />
          </>
        )}
      </Phase2Panel>

      <Phase2Panel title={t("Container & pallet breakdown")} description={t("Line-level values stay with the import batch.")}>
        {!selected ? (
          <div className="phase2-empty">{t("Select an import to manage containers.")}</div>
        ) : (
          <>
            <RecordRows rows={lines} empty={t("No container lines recorded for this import.")}>
              {lines.map((line) => (
                <RowLine
                  key={line.id}
                  title={`${line.container} · ${line.pallet || t("No pallet")}`}
                  meta={`${line.description} · ${money(line.value, selected.currency)}`}
                  trailing={
                    <>
                      <button type="button" className="button subtle" onClick={() => setLineDraft({ ...line, value: String(line.value) })}>{t("Edit")}</button>
                      <button type="button" className="button danger" onClick={() => deleteLine(line.id)}>{t("Delete")}</button>
                    </>
                  }
                />
              ))}
            </RecordRows>
            <Toolbar>
              <Field label={t("Container")}>
                <input value={lineDraft.container} onChange={(event) => setLineDraft({ ...lineDraft, container: event.target.value })} />
              </Field>
              <Field label={t("Pallet")}>
                <input value={lineDraft.pallet} onChange={(event) => setLineDraft({ ...lineDraft, pallet: event.target.value })} />
              </Field>
              <Field label={t("Description")}>
                <input value={lineDraft.description} onChange={(event) => setLineDraft({ ...lineDraft, description: event.target.value })} />
              </Field>
              <Field label={t("Value")}>
                <input type="number" value={lineDraft.value} onChange={(event) => setLineDraft({ ...lineDraft, value: event.target.value })} />
              </Field>
              <button type="button" className="button" onClick={saveLine}>{t(lineDraft.id ? "Save line" : "Add line")}</button>
              {lineDraft.id && <button type="button" className="button subtle" onClick={() => setLineDraft(emptyLine)}>{t("Cancel")}</button>}
            </Toolbar>
            <p className="muted-text tight">{t("Declared line value")}: {money(containerValue, selected.currency)}</p>
          </>
        )}
      </Phase2Panel>

      <Phase2Panel
        title={t("Approval workflow")}
        description={t("Draft to reviewed to approved, stored locally with reviewer and note.")}
        action={<Pill tone={chipTone(approvalStage)}>{labelFor(t, approvalStage)}</Pill>}
      >
        {!selected ? (
          <div className="phase2-empty">{t("Select an import to approve.")}</div>
        ) : (
          <>
            <Toolbar>
              <Field label={t("Reviewer")}>
                <input value={reviewer} onChange={(event) => setReviewer(event.target.value)} />
              </Field>
              <Field label={t("Note")}>
                <input value={approvalNote} onChange={(event) => setApprovalNote(event.target.value)} placeholder={t("Optional")} />
              </Field>
            </Toolbar>
            <Toolbar>
              {approvalStage === "draft" && <button type="button" className="button" onClick={() => setApprovalStage("reviewed")}>{t("Send for review")}</button>}
              {approvalStage === "reviewed" && <button type="button" className="button" onClick={() => setApprovalStage("approved")}>{t("Approve import")}</button>}
              {approvalStage === "approved" && (
                <button
                  type="button"
                  className="button subtle"
                  onClick={() => {
                    if (!window.confirm(t("Return this approval to draft?"))) return;
                    setApprovalStage("draft");
                  }}
                >
                  {t("Return to draft")}
                </button>
              )}
            </Toolbar>
            {approval && (
              <RecordRows rows={[approval]} empty="">
                <RowLine
                  title={t("Approval record")}
                  meta={`${t("Reviewer")}: ${approval.reviewer || "—"} · ${t("Note")}: ${approval.note || "—"}`}
                />
              </RecordRows>
            )}
          </>
        )}
      </Phase2Panel>
    </>
  );
}

function ShipmentTools(props: Phase2Props) {
  const { t } = useLanguage();
  const { notify } = useToast();
  const { state, setState } = props;
  const extras = state.extras;

  const patchShipment = (id: string, patch: Record<string, unknown>) =>
    setState((previous) => ({ ...previous, shipments: patchList(previous.shipments, id, patch) }));
  const deleteShipments = (ids: string[]) =>
    setState((previous) => ({ ...previous, shipments: removeMany(previous.shipments, ids) }));
  const restoreShipments = (rows: Shipment[]) =>
    setState((previous) => ({ ...previous, shipments: restoreMany(previous.shipments, rows) }));

  const [selectedId, setSelectedId] = useState(() =>
    props.focusRecord && state.shipments.some((entry) => entry.id === props.focusRecord)
      ? props.focusRecord
      : state.shipments[0]?.id ?? ""
  );
  useEffect(() => {
    if (props.focusRecord && state.shipments.some((entry) => entry.id === props.focusRecord)) {
      setSelectedId(props.focusRecord);
    }
  }, [props.focusRecord, state.shipments]);

  const selected = state.shipments.find((entry) => entry.id === selectedId) ?? state.shipments[0];
  const milestones = selected
    ? extras.milestones
        .filter((entry) => entry.shipmentId === selected.id)
        .sort((a, b) => {
          const order = MILESTONE_LABELS.indexOf(a.label) - MILESTONE_LABELS.indexOf(b.label);
          return order !== 0 ? order : a.date.localeCompare(b.date);
        })
    : [];
  const documents = selected
    ? extras.documentChecks
        .filter((entry) => entry.shipmentId === selected.id)
        .sort((a, b) => DOCUMENT_LABELS.indexOf(a.label) - DOCUMENT_LABELS.indexOf(b.label))
    : [];

  useEffect(() => {
    if (!selected) return;
    const missingMilestones = MILESTONE_LABELS.filter(
      (label) => !extras.milestones.some((entry) => entry.shipmentId === selected.id && entry.label === label)
    );
    const missingDocuments = DOCUMENT_LABELS.filter(
      (label) => !extras.documentChecks.some((entry) => entry.shipmentId === selected.id && entry.label === label)
    );
    if (missingMilestones.length === 0 && missingDocuments.length === 0) return;
    updateExtras(setState, (current) => ({
      ...current,
      milestones: [
        ...current.milestones,
        ...missingMilestones.map((label): Milestone => ({ id: uid("MS"), shipmentId: selected.id, label, date: "", done: false })),
      ],
      documentChecks: [
        ...current.documentChecks,
        ...missingDocuments.map((label): DocumentCheck => ({ id: uid("DOC"), shipmentId: selected.id, label, received: false })),
      ],
    }));
  }, [selected?.id, setState, extras.milestones, extras.documentChecks]);

  const [riskDraft, setRiskDraft] = useState<{ level: "low" | "medium" | "high"; reason: string }>({ level: "low", reason: "" });
  useEffect(() => {
    if (!selected) return;
    setRiskDraft({ level: selected.delayRisk, reason: riskReason(selected.notes) });
  }, [selected?.id, selected?.delayRisk, selected?.notes]);

  const patchMilestone = (id: string, patch: Record<string, unknown>) =>
    updateExtras(setState, (current) => ({ ...current, milestones: patchList(current.milestones, id, patch) }));
  const patchDocument = (id: string, patch: Record<string, unknown>) =>
    updateExtras(setState, (current) => ({ ...current, documentChecks: patchList(current.documentChecks, id, patch) }));

  const applyOverride = () => {
    if (!selected) return;
    if (!riskDraft.reason.trim()) {
      notify(t("Enter a reason for the override."), { tone: "info" });
      return;
    }
    patchShipment(selected.id, { delayRisk: riskDraft.level, notes: withRiskReason(selected.notes, riskDraft.reason) });
    notify(t("Delay-risk override saved"), { tone: "success" });
  };

  const clearOverride = () => {
    if (!selected) return;
    patchShipment(selected.id, { notes: stripRiskReason(selected.notes) });
    notify(t("Override reason cleared"), { tone: "success" });
  };

  const activeReason = selected ? riskReason(selected.notes) : "";
  const importName = (id: string) => state.imports.find((batch) => batch.id === id)?.reference ?? id;
  const completedMilestones = milestones.filter((entry) => entry.done).length;
  const receivedDocuments = documents.filter((entry) => entry.received).length;

  const columns: ExplorerColumn<Shipment>[] = [
    {
      key: "importId",
      label: t("Import"),
      value: (row) => row.importId,
      render: (row) => importName(row.importId),
      link: { module: "imports", id: (row) => row.importId },
    },
    { key: "reference", label: t("Reference"), value: (row) => row.reference, editable: "text" },
    { key: "carrier", label: t("Carrier"), value: (row) => row.carrier, editable: "text" },
    { key: "mode", label: t("Mode"), value: (row) => row.mode, editable: "select", options: ["sea", "air", "rail", "truck"] },
    { key: "eta", label: t("ETA"), value: (row) => row.eta, editable: "text" },
    { key: "containers", label: t("Containers"), value: (row) => row.containers, editable: "number" },
    { key: "status", label: t("Status"), value: (row) => row.status, editable: "select", options: ["draft", "scheduled", "in_progress", "completed", "cancelled"] },
    { key: "documentsStatus", label: t("Documents status"), value: (row) => row.documentsStatus, editable: "select", options: ["pending", "approved", "blocked", "expired"] },
    { key: "delayRisk", label: t("Delay risk"), value: (row) => row.delayRisk, editable: "select", options: ["low", "medium", "high"] },
  ];

  const config: ExplorerConfig<Shipment> = {
    module: "shipments",
    title: t("Shipments"),
    description: "Track milestones, documents and delay risk per shipment.",
    rows: state.shipments,
    columns,
    id: (row) => row.id,
    statusKey: "status",
    statusOptions: ["draft", "scheduled", "in_progress", "completed", "cancelled"],
    primaryLabel: (row) => `${row.reference} · ${row.carrier}`,
    onPatch: patchShipment,
    onDelete: deleteShipments,
    onRestore: restoreShipments,
    setTab: props.setTab,
  };

  return (
    <>
      <RecordExplorer<Shipment>
        config={config}
        state={state}
        setState={setState}
        preferences={props.preferences}
        setPreferences={props.setPreferences}
        focusRecord={props.focusRecord}
      />

      <Phase2Panel
        title={t("Shipment milestones")}
        description={t("Five default stages with dates and done flags.")}
        action={selected ? <Pill tone={chipTone(selected.status)}>{labelFor(t, selected.status)}</Pill> : undefined}
      >
        <Toolbar>
          <Field label={t("Shipment")}>
            <select value={selected?.id ?? ""} onChange={(event) => setSelectedId(event.target.value)} aria-label={t("Shipment")}>
              {state.shipments.map((shipment) => (
                <option key={shipment.id} value={shipment.id}>{shipment.reference}</option>
              ))}
            </select>
          </Field>
          {selected && <button type="button" className="button subtle" onClick={() => openRecord("imports", selected.importId, props.setTab)}>{t("Open import")}</button>}
          {selected && <Pill tone="info">{t("{done} of {total} milestones", { done: number(completedMilestones), total: number(milestones.length) })}</Pill>}
        </Toolbar>
        {!selected ? (
          <div className="phase2-empty">{t("Add a shipment first.")}</div>
        ) : (
          <RecordRows rows={milestones} empty={t("No milestones for this shipment.")}>
            {milestones.map((milestone) => (
              <RowLine
                key={milestone.id}
                icon={
                  <span
                    aria-hidden="true"
                    style={{ display: "block", width: 10, height: 10, borderRadius: "50%", background: milestone.done ? "var(--success)" : "var(--border-strong)" }}
                  />
                }
                title={t(milestone.label)}
                meta={
                  <input
                    type="date"
                    value={milestone.date}
                    onChange={(event) => patchMilestone(milestone.id, { date: event.target.value })}
                    aria-label={`${t("Date")} ${t(milestone.label)}`}
                  />
                }
                trailing={
                  <button
                    type="button"
                    className={milestone.done ? "button subtle" : "button"}
                    onClick={() => patchMilestone(milestone.id, { done: !milestone.done })}
                  >
                    {milestone.done ? t("Done") : t("Mark done")}
                  </button>
                }
              />
            ))}
          </RecordRows>
        )}
      </Phase2Panel>

      <Phase2Panel
        title={t("Document checklist")}
        description={t("Bill of lading, commercial invoice, packing list and licence.")}
        action={<Pill tone={receivedDocuments === documents.length && documents.length > 0 ? "success" : "warning"}>{t("{received} of {total} received", { received: number(receivedDocuments), total: number(documents.length) })}</Pill>}
      >
        {!selected ? (
          <div className="phase2-empty">{t("Select a shipment to review documents.")}</div>
        ) : (
          <RecordRows rows={documents} empty={t("No document checks for this shipment.")}>
            {documents.map((document) => (
              <RowLine
                key={document.id}
                title={t(document.label)}
                meta={document.received ? t("Received") : t("Missing")}
                trailing={
                  <label className="inline-control">
                    <input
                      type="checkbox"
                      checked={document.received}
                      onChange={(event) => patchDocument(document.id, { received: event.target.checked })}
                      aria-label={`${t(document.label)} ${t("Received")}`}
                    />
                    {t("Received")}
                  </label>
                }
              />
            ))}
          </RecordRows>
        )}
      </Phase2Panel>

      <Phase2Panel
        title={t("Delay-risk override")}
        description={t("Reason is stored in shipment notes with the Risk override prefix.")}
        action={selected ? <Pill tone={chipTone(selected.delayRisk)}>{labelFor(t, selected.delayRisk)}</Pill> : undefined}
      >
        {!selected ? (
          <div className="phase2-empty">{t("Select a shipment to set a risk override.")}</div>
        ) : (
          <>
            {activeReason && <Pill tone="warning">{t("Risk override: {reason}", { reason: activeReason })}</Pill>}
            <Toolbar>
              <Field label={t("Delay risk")}>
                <select value={riskDraft.level} onChange={(event) => setRiskDraft({ ...riskDraft, level: event.target.value as "low" | "medium" | "high" })} aria-label={t("Delay risk")}>
                  <option value="low">{t("low")}</option>
                  <option value="medium">{t("medium")}</option>
                  <option value="high">{t("high")}</option>
                </select>
              </Field>
              <Field label={t("Reason")}>
                <input value={riskDraft.reason} onChange={(event) => setRiskDraft({ ...riskDraft, reason: event.target.value })} placeholder={t("Why the risk changed")} />
              </Field>
              <button type="button" className="button" onClick={applyOverride}>{t("Apply override")}</button>
              {activeReason && <button type="button" className="button subtle" onClick={clearOverride}>{t("Clear reason")}</button>}
            </Toolbar>
          </>
        )}
      </Phase2Panel>
    </>
  );
}

export default function TradeTools(props: Phase2Props) {
  if (props.module === "suppliers") return <SupplierTools {...props} />;
  if (props.module === "products") return <ProductTools {...props} />;
  if (props.module === "imports") return <ImportTools {...props} />;
  if (props.module === "shipments") return <ShipmentTools {...props} />;
  return null;
}
