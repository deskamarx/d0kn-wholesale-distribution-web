import test from "node:test";
import assert from "node:assert/strict";
import { parseBankStatement, parseLineItems } from "../src/lib/imports";
import { compareValues, sortRows, toCsv } from "../src/lib/tableTools";
import { filterInRange, percentageChange, resolveRange } from "../src/lib/period";
import { migrateState } from "../src/lib/migration";
import { initialState } from "../src/seed";
import { phase2Bn, phase2Zh } from "../src/i18n-phase2";

test("parseLineItems accepts CSV and TSV with a header row", () => {
  const rows = parseLineItems("SKU,Qty,Price,Name\nPRD-1,3,12.50,Widget\nPRD-2\t2\t9\tCable");
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { sku: "PRD-1", quantity: 3, price: 12.5, name: "Widget" });
  assert.deepEqual(rows[1], { sku: "PRD-2", quantity: 2, price: 9, name: "Cable" });
});

test("parseBankStatement ignores headers and keeps positive amounts", () => {
  const rows = parseBankStatement("Date,Reference,Amount\n2026-11-01,PAY-100,\"1,250.00\",Deposit\n2026-11-02,PAY-101,0,Skipped");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].reference, "PAY-100");
  assert.equal(rows[0].amount, 1250);
});

test("sortRows handles numbers and strings in both directions", () => {
  const rows = [{ name: "Beta", stock: 20 }, { name: "Alpha", stock: 5 }];
  assert.deepEqual(sortRows(rows, { key: "stock", direction: "asc" }, (row, key) => row[key as "stock"]).map((row) => row.name), ["Alpha", "Beta"]);
  assert.deepEqual(sortRows(rows, { key: "name", direction: "desc" }, (row, key) => row[key as "name"]).map((row) => row.name), ["Beta", "Alpha"]);
  assert.equal(compareValues(2, 10), -8);
});

test("toCsv escapes quotes and commas", () => {
  const csv = toCsv([{ Ref: 'A,"B"', Amount: 10 }], ["Ref", "Amount"]);
  assert.equal(csv, 'Ref,Amount\n"A,""B""",10');
});

test("period helpers resolve ranges and compare changes", () => {
  const now = new Date("2026-11-26T12:00:00Z");
  const range = resolveRange("30d", now);
  assert.equal(range.end, "2026-11-26");
  assert.equal(filterInRange([{ date: "2026-11-20" }, { date: "2026-09-01" }], (row) => row.date, range).length, 1);
  assert.equal(percentageChange(120, 100), 20);
  assert.equal(percentageChange(0, 0), null);
});

test("legacy phase 1 state migrates with phase 2 defaults", () => {
  const legacy = { ...initialState, extras: undefined };
  const migrated = migrateState(legacy);
  assert.ok(migrated);
  assert.ok(migrated.extras.savedViews);
  assert.ok(migrated.extras.savedViews.length >= 0);
  assert.ok(migrated.extras.supplierTrends.length > 0);
  assert.equal(migrated.products.length, initialState.products.length);
});

test("phase 2 Bengali and Chinese dictionaries have matching keys", () => {
  assert.deepEqual(Object.keys(phase2Bn).sort(), Object.keys(phase2Zh).sort());
});
