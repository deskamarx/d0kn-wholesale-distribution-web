import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { AppState, Shipment, ShipmentMode, Status } from "../types";
import { daysUntil, number, shortDate, titleCase } from "../lib/format";
import { getHighRiskShipments } from "../lib/intelligence";
import { removeById, uid, updateById, upsert } from "../lib/store";
import { useLanguage } from "../i18n";
import { duplicateExists, readErrorsAloud, useDirtyForm } from "../lib/forms";
import { EmptyState, RequiredProgress, ValidationSummary } from "./Common";
import { useToast, useUndoDelete } from "./Feedback";
import { Metric, StatusChip } from "./Ui";

interface Props {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
}

type ShipmentForm = Omit<Shipment, "id" | "status"> & { status: Status | "scheduled" };

const SHIPMENT_STATUSES: Array<Status | "scheduled"> = ["draft", "scheduled", "in_progress", "completed", "cancelled"];
const DOCUMENT_STATUSES: Status[] = ["pending", "sent", "approved", "expired"];
const MODES: ShipmentMode[] = ["sea", "air", "rail", "truck"];
const RISK_LEVELS: Shipment["delayRisk"][] = ["low", "medium", "high"];

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function blankShipment(importId: string): ShipmentForm {
  return {
    reference: "",
    importId,
    carrier: "",
    mode: "sea",
    originPort: "",
    destinationPort: "",
    departureDate: isoToday(),
    eta: isoToday(),
    status: "draft",
    trackingNumber: "",
    containers: 0,
    documentsStatus: "pending",
    delayRisk: "low",
    notes: "",
  };
}

export default function Shipments({ state, setState }: Props) {
  const { t, language } = useLanguage();
  const { notify } = useToast();
  const undoDelete = useUndoDelete();
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ShipmentForm>(() => blankShipment(state.imports[0]?.id ?? ""));
  const [errors, setErrors] = useState<string[]>([]);
  const [formKey, setFormKey] = useState(0);
  const { confirmDiscard } = useDirtyForm(form, showForm ? `${editingId ?? "new"}-${formKey}` : "closed");

  const activeShipments = state.shipments.filter(
    (shipment) => !["completed", "cancelled"].includes(shipment.status)
  );
  const highRisk = getHighRiskShipments(state);
  const documentsPending = state.shipments.filter((shipment) => shipment.documentsStatus === "pending").length;
  const containersInTransit = activeShipments.reduce((sum, shipment) => sum + shipment.containers, 0);

  const importReference = (id: string) => state.imports.find((batch) => batch.id === id)?.reference ?? t("Not linked");

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return state.shipments;
    return state.shipments.filter((shipment) =>
      [
        shipment.reference,
        shipment.carrier,
        shipment.originPort,
        shipment.destinationPort,
        shipment.trackingNumber,
        importReference(shipment.importId),
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [state.shipments, state.imports, query, t]);

  const patch = (changes: Partial<ShipmentForm>) => setForm((prev) => ({ ...prev, ...changes }));

  const openAdd = () => {
    const recent = state.shipments[0];
    setForm({
      ...blankShipment(state.imports[0]?.id ?? ""),
      carrier: recent?.carrier ?? "",
      mode: recent?.mode ?? "sea",
      originPort: recent?.originPort ?? "",
      destinationPort: recent?.destinationPort ?? "",
    });
    setErrors([]);
    setEditingId(null);
    setFormKey((current) => current + 1);
    setShowForm(true);
  };

  const startEdit = (shipment: Shipment) => {
    setForm({ ...shipment });
    setErrors([]);
    setEditingId(shipment.id);
    setFormKey((current) => current + 1);
    setShowForm(true);
  };

  const closeForm = (force = false) => {
    if (force !== true && !confirmDiscard(t("Discard unsaved changes?"))) return;
    setErrors([]);
    setEditingId(null);
    setShowForm(false);
  };

  const saveShipment = () => {
    const found: string[] = [];
    if (!form.reference.trim()) found.push(t("Reference is required"));
    if (duplicateExists(state.shipments, "reference", form.reference, editingId ?? undefined)) {
      found.push(t("A shipment with this reference already exists"));
    }
    if (!form.importId) found.push(t("Link this shipment to an import batch"));
    if (form.eta && form.departureDate && form.eta < form.departureDate) {
      found.push(t("ETA cannot be earlier than the departure date"));
    }
    if (found.length) {
      setErrors(found);
      void readErrorsAloud(found, language);
      return;
    }
    setErrors([]);
    const shipment: Shipment = {
      ...form,
      id: editingId ?? uid("SHP"),
      reference: form.reference.trim(),
      carrier: form.carrier.trim(),
      originPort: form.originPort.trim(),
      destinationPort: form.destinationPort.trim(),
      trackingNumber: form.trackingNumber.trim(),
      status: form.status as Status,
      notes: form.notes.trim(),
    };
    setState((prev) => ({ ...prev, shipments: upsert(prev.shipments, shipment) }));
    closeForm(true);
  };

  const removeShipment = (id: string) => {
    const shipment = state.shipments.find((item) => item.id === id);
    if (!shipment || !window.confirm(t("Delete this shipment? This cannot be undone."))) return;
    undoDelete(
      () => setState((prev) => ({ ...prev, shipments: removeById(prev.shipments, id) })),
      () => setState((prev) => ({ ...prev, shipments: upsert(prev.shipments, shipment) }))
    );
    if (editingId === id) {
      setEditingId(null);
      setShowForm(false);
    }
  };

  const setRisk = (shipment: Shipment, delayRisk: Shipment["delayRisk"]) => {
    if (shipment.delayRisk === delayRisk) return;
    setState((prev) => ({
      ...prev,
      shipments: updateById(prev.shipments, shipment.id, { delayRisk }),
    }));
    notify(`${shipment.reference}: ${t("Delay risk")} → ${t(delayRisk)}`, { tone: delayRisk === "high" ? "danger" : "info" });
  };

  const cycleRisk = (shipment: Shipment) => {
    const index = RISK_LEVELS.indexOf(shipment.delayRisk);
    setRisk(shipment, RISK_LEVELS[(index + 1) % RISK_LEVELS.length]);
  };

  const cycleDocuments = (shipment: Shipment) => {
    const next: Status =
      shipment.documentsStatus === "pending" ? "sent" : shipment.documentsStatus === "sent" ? "approved" : "pending";
    setState((prev) => ({
      ...prev,
      shipments: updateById(prev.shipments, shipment.id, { documentsStatus: next }),
    }));
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h2>{t("Shipments")}</h2>
          <p>{t("Carrier bookings, routes, documents, delay risk, and container movements.")}</p>
        </div>
        <button className="primary" type="button" onClick={openAdd}>{t("Add shipment")}</button>
      </div>

      {showForm && (
        <section className="card">
          <div className="section-title">
            <h3>{editingId ? t("Edit shipment") : t("Add shipment")}</h3>
            <button className="small" type="button" onClick={() => closeForm()}>{t("Cancel")}</button>
          </div>
          <p className="muted-text">{t("Link the booking to an import so the shipment watchlist stays in sync.")}</p>
          <ValidationSummary errors={errors} />
          <RequiredProgress
            complete={(form.reference.trim() ? 1 : 0) + (form.importId ? 1 : 0)}
            total={2}
          />
          <div className="inline-calculator" aria-live="polite">
            <div><span>{t("ETA")}</span><strong>{form.eta ? shortDate(form.eta) : "—"}</strong></div>
            <div><span>{t("Days to ETA")}</span><strong>{form.eta ? number(daysUntil(form.eta) ?? 0) : "—"}</strong></div>
            <div><span>{t("Delay risk")}</span><strong>{t(form.delayRisk)}</strong></div>
          </div>

          <div className="field-row">
            <div className="field"><label>{t("Reference")}</label><input aria-label={t("Reference")} value={form.reference} onChange={(event) => patch({ reference: event.target.value })} placeholder={t("SHP-014")} /></div>
            <div className="field">
              <label>{t("Import")}</label>
              <select aria-label={t("Import")} value={form.importId} onChange={(event) => patch({ importId: event.target.value })}>
                <option value="">{t("Not linked")}</option>
                {state.imports.map((batch) => (
                  <option key={batch.id} value={batch.id}>{batch.reference}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field"><label>{t("Carrier")}</label><input list="d0kn-carriers" aria-label={t("Carrier")} value={form.carrier} onChange={(event) => patch({ carrier: event.target.value })} /></div>
            <div className="field">
              <label>{t("Mode")}</label>
              <select aria-label={t("Mode")} value={form.mode} onChange={(event) => patch({ mode: event.target.value as ShipmentMode })}>
                {MODES.map((mode) => <option key={mode} value={mode}>{t(titleCase(mode))}</option>)}
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field"><label>{t("Origin port")}</label><input list="d0kn-origin-ports" aria-label={t("Origin port")} value={form.originPort} onChange={(event) => patch({ originPort: event.target.value })} /></div>
            <div className="field"><label>{t("Destination port")}</label><input list="d0kn-destination-ports" aria-label={t("Destination port")} value={form.destinationPort} onChange={(event) => patch({ destinationPort: event.target.value })} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>{t("Departure date")}</label><input aria-label={t("Departure date")} type="date" value={form.departureDate} onChange={(event) => patch({ departureDate: event.target.value })} /></div>
            <div className="field"><label>{t("ETA")}</label><input aria-label={t("ETA")} type="date" value={form.eta} onChange={(event) => patch({ eta: event.target.value })} /></div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>{t("Status")}</label>
              <select aria-label={t("Status")} value={form.status} onChange={(event) => patch({ status: event.target.value as Status | "scheduled" })}>
                {SHIPMENT_STATUSES.map((status) => <option key={status} value={status}>{t(status)}</option>)}
              </select>
            </div>
            <div className="field"><label>{t("Tracking number")}</label><input aria-label={t("Tracking number")} value={form.trackingNumber} onChange={(event) => patch({ trackingNumber: event.target.value })} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>{t("Containers")}</label><input aria-label={t("Containers")} type="number" min="0" value={form.containers} onChange={(event) => patch({ containers: Number(event.target.value) })} /></div>
            <div className="field">
              <label>{t("Documents status")}</label>
              <select aria-label={t("Documents status")} value={form.documentsStatus} onChange={(event) => patch({ documentsStatus: event.target.value as Status })}>
                {DOCUMENT_STATUSES.map((status) => <option key={status} value={status}>{t(status)}</option>)}
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>{t("Delay risk")}</label>
              <select aria-label={t("Delay risk")} value={form.delayRisk} onChange={(event) => patch({ delayRisk: event.target.value as Shipment["delayRisk"] })}>
                {RISK_LEVELS.map((risk) => <option key={risk} value={risk}>{t(risk)}</option>)}
              </select>
            </div>
          </div>
          <div className="field"><label>{t("Notes")}</label><textarea aria-label={t("Notes")} value={form.notes} onChange={(event) => patch({ notes: event.target.value })} /></div>
          <div className="actions">
            <button className="primary" type="button" disabled={!form.reference.trim()} onClick={saveShipment}>
              {editingId ? t("Save changes") : t("Save shipment")}
            </button>
            <button type="button" onClick={() => closeForm()}>{t("Cancel")}</button>
          </div>
        </section>
      )}

      <div className="grid cols-4">
        <Metric label={t("Active shipments")} value={number(activeShipments.length)} hint={t("Not completed or cancelled")} tone="info" />
        <Metric
          label={t("High-risk count")}
          value={number(highRisk.length)}
          hint={t("Open shipments at high risk")}
          tone={highRisk.length > 0 ? "danger" : "success"}
        />
        <Metric
          label={t("Documents pending")}
          value={number(documentsPending)}
          hint={t("Awaiting document approval")}
          tone={documentsPending > 0 ? "warning" : "success"}
        />
        <Metric label={t("Containers in transit")} value={number(containersInTransit)} hint={t("Across active shipments")} />
      </div>

      <section className="card">
        <div className="section-title">
          <h3>{t("Shipment register")}</h3>
          <span className="chip neutral">{number(filtered.length)} {t("shown")}</span>
        </div>
        <div className="toolbar">
          <input aria-label={t("Search reference, carrier, route, tracking...")}
            placeholder={t("Search reference, carrier, route, tracking...")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="list">
          {filtered.length === 0 && (
            <EmptyState
              title={t("No shipments match the current search.")}
              description={t("Try another reference, carrier or route, or add a shipment above.")}
              actionLabel={query ? t("Clear search") : undefined}
              onAction={query ? () => setQuery("") : undefined}
            />
          )}
          {filtered.map((shipment) => {
            const risky = shipment.delayRisk === "high" && !["completed", "cancelled"].includes(shipment.status);
            return (
              <div
                className={`row-card${risky ? " tone-danger" : ""}`}
                key={shipment.id}
                data-preview={`${shipment.reference} · ${shipment.carrier || t("Carrier")} · ${t("ETA")} ${shortDate(shipment.eta)}`}
              >
                <div className="row-top">
                  <div>
                    <h4>
                      {shipment.reference}{" "}
                      <span className="chip info">{t(titleCase(shipment.mode))}</span>
                      {risky && <span className="chip danger">{t("high risk")}</span>}
                    </h4>
                    <div className="meta">
                      <span>{t("Import")} <strong>{importReference(shipment.importId)}</strong></span>
                      <span>{t("Carrier")} <strong>{shipment.carrier || "—"}</strong></span>
                      <span>{t("ETA")} <strong>{shortDate(shipment.eta)}</strong></span>
                      <span>{t("Containers")} <strong>{number(shipment.containers)}</strong></span>
                    </div>
                  </div>
                  <div className="actions">
                    <StatusChip status={shipment.status} label={t(shipment.status)} />
                    <span className={`chip ${shipment.delayRisk === "high" ? "danger" : shipment.delayRisk === "medium" ? "warning" : "success"}`}>
                      {t(shipment.delayRisk)} {t("risk")}
                    </span>
                    <StatusChip status={shipment.documentsStatus} label={`${t("Documents status")}: ${t(shipment.documentsStatus)}`} />
                  </div>
                </div>

                <div className="meta mt-1">
                  <span>{t("Origin port")} <strong>{shipment.originPort || "—"}</strong></span>
                  <span>{t("Destination port")} <strong>{shipment.destinationPort || "—"}</strong></span>
                  <span>{t("Tracking number")} <strong>{shipment.trackingNumber || "—"}</strong></span>
                </div>
                {shipment.notes && <p className="muted-text mt-1 mb-0">{shipment.notes}</p>}

                <div className="actions mt-2">
                  <label className="inline-control">
                    <span>{t("Override risk")}</span>
                    <select
                      aria-label={`${t("Override risk")}: ${shipment.reference}`}
                      value={shipment.delayRisk}
                      onChange={(event) => setRisk(shipment, event.target.value as Shipment["delayRisk"])}
                    >
                      {RISK_LEVELS.map((risk) => <option key={risk} value={risk}>{t(risk)}</option>)}
                    </select>
                  </label>
                  <button
                    className="small"
                    type="button"
                    title={`${t("Next")}: ${t(RISK_LEVELS[(RISK_LEVELS.indexOf(shipment.delayRisk) + 1) % RISK_LEVELS.length])}`}
                    onClick={() => cycleRisk(shipment)}
                  >
                    {t("Cycle risk")}
                  </button>
                  <button
                    className="small"
                    type="button"
                    title={`${t("Next")}: ${t(shipment.documentsStatus === "pending" ? "sent" : shipment.documentsStatus === "sent" ? "approved" : "pending")}`}
                    onClick={() => cycleDocuments(shipment)}
                  >
                    {t("Cycle documents")}
                  </button>
                  <button className="small" type="button" onClick={() => startEdit(shipment)}>{t("Edit")}</button>
                  <button className="small" type="button" onClick={() => removeShipment(shipment.id)}>{t("Delete")}</button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
