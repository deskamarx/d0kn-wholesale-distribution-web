import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AppState } from "../../types";
import type { Preferences } from "../../lib/preferences";
import { openRecord, Phase2Panel, Pill, Toolbar } from "./Phase2Ui";
import { useToast, useUndoDelete } from "../Feedback";
import { useLanguage } from "../../i18n";
import { updateExtras } from "../../lib/extras";
import { downloadText, sortRows, toCsv, type SortState } from "../../lib/tableTools";

export interface ExplorerColumn<T> {
  key: string;
  label: string;
  value: (row: T) => string | number;
  render?: (row: T) => ReactNode;
  editable?: "text" | "number" | "select";
  options?: string[];
  link?: { module: string; id: (row: T) => string };
}

export interface ExplorerConfig<T> {
  module: string;
  title: string;
  description: string;
  rows: T[];
  columns: ExplorerColumn<T>[];
  id: (row: T) => string;
  statusKey: string;
  statusOptions: string[];
  primaryLabel: (row: T) => string;
  onPatch: (id: string, patch: Record<string, unknown>) => void;
  onDelete: (ids: string[]) => void;
  onRestore?: (rows: T[]) => void;
  setTab: (tab: string) => void;
}

export default function RecordExplorer<T>({
  config,
  state,
  setState,
  preferences,
  setPreferences,
  focusRecord,
}: {
  config: ExplorerConfig<T>;
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  preferences: Preferences;
  setPreferences: React.Dispatch<React.SetStateAction<Preferences>>;
  focusRecord?: string;
}) {
  const { t } = useLanguage();
  const { notify } = useToast();
  const undoDelete = useUndoDelete();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewName, setViewName] = useState("");
  const [sort, setSort] = useState<SortState | null>(() => {
    const stored = preferences.tableSorts[config.module];
    if (!stored) return null;
    const [key, direction] = stored.split(":");
    return key ? { key, direction: direction === "desc" ? "desc" : "asc" } : null;
  });
  const views = state.extras.savedViews.filter((view) => view.id.startsWith(`${config.module}:`));

  useEffect(() => {
    const stored = preferences.tableSorts[config.module];
    if (!stored) return;
    const [key, direction] = stored.split(":");
    if (key) setSort({ key, direction: direction === "desc" ? "desc" : "asc" });
  }, [config.module, preferences.tableSorts]);

  useEffect(() => {
    if (!focusRecord) return;
    setQuery("");
    setStatus("all");
    const frame = window.requestAnimationFrame(() => {
      const target = Array.from(document.querySelectorAll<HTMLElement>("[data-record-id]"))
        .find((node) => node.dataset.recordId === focusRecord);
      target?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusRecord]);

  const setSortState = (next: SortState | null) => {
    setSort(next);
    setPreferences((previous) => ({
      ...previous,
      tableSorts: {
        ...previous.tableSorts,
        [config.module]: next ? `${next.key}:${next.direction}` : "",
      },
    }));
  };

  const toggleSort = (key: string) => {
    if (sort?.key !== key) setSortState({ key, direction: "asc" });
    else if (sort.direction === "asc") setSortState({ key, direction: "desc" });
    else setSortState(null);
  };

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const rows = config.rows.filter((row) => {
      const matchesQuery = !needle || config.columns.some((column) => String(column.value(row)).toLocaleLowerCase().includes(needle));
      const matchesStatus = status === "all" || String((row as Record<string, unknown>)[config.statusKey] ?? "") === status;
      return matchesQuery && matchesStatus;
    });
    return sortRows(rows, sort, (row, key) => config.columns.find((column) => column.key === key)?.value(row) ?? "");
  }, [config, query, status, sort]);

  const allSelected = filtered.length > 0 && filtered.every((row) => selected.has(config.id(row)));

  const toggleAll = () => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (allSelected) filtered.forEach((row) => next.delete(config.id(row)));
      else filtered.forEach((row) => next.add(config.id(row)));
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const saveView = () => {
    const name = viewName.trim();
    if (!name) {
      notify(t("Enter a view name first."), { tone: "warning" });
      return;
    }
    updateExtras(setState, (extras) => ({
      ...extras,
      savedViews: [
        ...extras.savedViews.filter((view) => view.id !== `${config.module}:${name}`),
        {
          id: `${config.module}:${name}`,
          name,
          filters: { query, status },
          sort: sort ? `${sort.key}:${sort.direction}` : "",
          view: preferences.viewMode,
        },
      ],
    }));
    setViewName("");
    notify(t("View saved"), { tone: "success" });
  };

  const applyView = (id: string) => {
    const view = state.extras.savedViews.find((entry) => entry.id === id);
    if (!view) return;
    setQuery(view.filters.query ?? "");
    setStatus(view.filters.status ?? "all");
    setPreferences((previous) => ({ ...previous, viewMode: view.view === "table" ? "table" : "card" }));
    const [key, direction] = view.sort.split(":");
    setSortState(key ? { key, direction: direction === "desc" ? "desc" : "asc" } : null);
  };

  const deleteView = (id: string) => {
    updateExtras(setState, (extras) => ({ ...extras, savedViews: extras.savedViews.filter((view) => view.id !== id) }));
  };

  const exportSelected = () => {
    const rows = config.rows
      .filter((row) => selected.has(config.id(row)))
      .map((row) => Object.fromEntries(config.columns.map((column) => [column.label, column.value(row)])));
    if (rows.length === 0) return;
    downloadText(`d0kn-${config.module}-selection.csv`, toCsv(rows, config.columns.map((column) => column.label)), "text/csv");
    notify(t("Exported {count} records", { count: rows.length }), { tone: "success" });
  };

  const bulkPatch = (patch: Record<string, unknown>) => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    ids.forEach((id) => config.onPatch(id, patch));
    notify(t("Updated {count} records", { count: ids.length }), { tone: "success" });
    setSelected(new Set());
  };

  const bulkDelete = () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!window.confirm(t("Delete {count} selected records?", { count: ids.length }))) return;
    const removed = config.rows.filter((row) => ids.includes(config.id(row)));
    undoDelete(
      () => config.onDelete(ids),
      () => config.onRestore?.(removed)
    );
    setSelected(new Set());
  };

  const inlineCell = (row: T, column: ExplorerColumn<T>): ReactNode => {
    if (!column.editable) return column.render ? column.render(row) : String(column.value(row));
    const id = config.id(row);
    const value = String(column.value(row));
    if (column.editable === "select") {
      return (
        <select
          className="inline-edit"
          value={value}
          aria-label={`${column.label} ${id}`}
          onChange={(event) => config.onPatch(id, { [column.key]: event.target.value })}
        >
          {(column.options ?? []).map((option) => <option key={option} value={option}>{option.replace(/_/g, " ")}</option>)}
        </select>
      );
    }
    return (
      <input
        className="inline-edit"
        key={`${id}-${column.key}-${value}`}
        type={column.editable === "number" ? "number" : "text"}
        defaultValue={value}
        aria-label={`${column.label} ${id}`}
        onBlur={(event) => {
          const next = column.editable === "number" ? Number(event.target.value) : event.target.value;
          if (String(next) !== value) config.onPatch(id, { [column.key]: next });
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    );
  };

  return (
    <Phase2Panel
      title={t("Record explorer")}
      description={t(config.description)}
      action={<Pill tone="info">{t("{count} records", { count: config.rows.length })}</Pill>}
    >
      <Toolbar>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("Search records")}
          aria-label={t("Search records")}
        />
        <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label={t("Status filter")}>
          <option value="all">{t("All statuses")}</option>
          {config.statusOptions.map((option) => <option key={option} value={option}>{option.replace(/_/g, " ")}</option>)}
        </select>
        <select
          value={sort ? `${sort.key}:${sort.direction}` : ""}
          onChange={(event) => {
            const value = event.target.value;
            if (!value) setSortState(null);
            else {
              const [key, direction] = value.split(":");
              setSortState({ key, direction: direction === "desc" ? "desc" : "asc" });
            }
          }}
          aria-label={t("Sort records")}
        >
          <option value="">{t("Default order")}</option>
          {config.columns.map((column) => (
            <option key={column.key} value={`${column.key}:asc`}>{t(column.label)} ↑</option>
          ))}
        </select>
        <div className="segmented" role="group" aria-label={t("View mode")}>
          {(["card", "table"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={preferences.viewMode === mode ? "active" : undefined}
              aria-pressed={preferences.viewMode === mode}
              onClick={() => setPreferences((previous) => ({ ...previous, viewMode: mode }))}
            >
              {t(mode === "card" ? "Cards" : "Table")}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={viewName}
          onChange={(event) => setViewName(event.target.value)}
          placeholder={t("View name")}
          aria-label={t("View name")}
        />
        <button type="button" className="button subtle" onClick={saveView}>{t("Save view")}</button>
      </Toolbar>

      {views.length > 0 && (
        <div className="saved-views" aria-label={t("Saved views")}>
          <span className="label">{t("Saved views")}</span>
          {views.map((view) => (
            <span key={view.id} className="saved-view">
              <button type="button" className="link-button" onClick={() => applyView(view.id)}>{view.name}</button>
              <button type="button" className="icon-button" onClick={() => deleteView(view.id)} aria-label={t("Delete view {name}", { name: view.name })}>×</button>
            </span>
          ))}
        </div>
      )}

      {selected.size > 0 && (
        <div className="bulk-bar">
          <strong>{t("{count} selected", { count: selected.size })}</strong>
          <select
            defaultValue=""
            aria-label={t("Bulk status update")}
            onChange={(event) => {
              if (!event.target.value) return;
              bulkPatch({ [config.statusKey]: event.target.value });
              event.target.value = "";
            }}
          >
            <option value="">{t("Set status")}</option>
            {config.statusOptions.map((option) => <option key={option} value={option}>{option.replace(/_/g, " ")}</option>)}
          </select>
          <button type="button" className="button subtle" onClick={exportSelected}>{t("Export selected")}</button>
          <button type="button" className="button danger" onClick={bulkDelete}>{t("Delete selected")}</button>
          <button type="button" className="link-button" onClick={() => setSelected(new Set())}>{t("Clear")}</button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="phase2-empty">{t("No records match these filters.")}</div>
      ) : preferences.viewMode === "table" ? (
        <div className="table-wrap sticky-first">
          <table>
            <thead>
              <tr>
                <th aria-label={t("Select all")}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label={t("Select all")} />
                </th>
                {config.columns.map((column) => (
                  <th key={column.key}>
                    <button type="button" className="sort-header" onClick={() => toggleSort(column.key)}>
                      {t(column.label)}
                      <span aria-hidden="true">{sort?.key === column.key ? (sort.direction === "asc" ? " ↑" : " ↓") : " ↕"}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const id = config.id(row);
                return (
                  <tr key={id} data-record-id={id} className={focusRecord === id ? "focused-row" : undefined}>
                    <td><input type="checkbox" checked={selected.has(id)} onChange={() => toggleOne(id)} aria-label={`${t("Select")} ${id}`} /></td>
                    {config.columns.map((column, index) => (
                      <td key={column.key}>
                        {inlineCell(row, column)}
                        {index === 0 && column.link && (
                          <button type="button" className="link-button mini" onClick={() => openRecord(column.link!.module, column.link!.id(row), config.setTab)}>
                            {t("Open")}
                          </button>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="phase2-rows">
          {filtered.map((row) => {
            const id = config.id(row);
            return (
              <div key={id} data-record-id={id} className={`phase2-row${focusRecord === id ? " focused-row" : ""}`}>
                <input type="checkbox" checked={selected.has(id)} onChange={() => toggleOne(id)} aria-label={`${t("Select")} ${id}`} />
                <div className="phase2-row-main">
                  <strong>{config.primaryLabel(row)}</strong>
                  <span className="muted-text">
                    {config.columns.slice(0, 4).map((column) => `${column.label}: ${column.value(row)}`).join(" · ")}
                  </span>
                </div>
                <div className="phase2-row-trailing">
                  {config.columns.find((column) => column.key === config.statusKey) && (
                    <Pill>{String((row as Record<string, unknown>)[config.statusKey] ?? "").replace(/_/g, " ")}</Pill>
                  )}
                  <button type="button" className="link-button" onClick={() => openRecord(config.module, id, config.setTab)}>{t("Open")}</button>
                  {config.columns.find((column) => column.link)?.link && (
                    <button
                      type="button"
                      className="link-button mini"
                      onClick={() => {
                        const link = config.columns.find((column) => column.link)?.link!;
                        openRecord(link.module, link.id(row), config.setTab);
                      }}
                    >
                      {t("Related")}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Phase2Panel>
  );
}
