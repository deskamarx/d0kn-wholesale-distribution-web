export interface ParsedLine {
  sku: string;
  name: string;
  quantity: number;
  price: number;
}

export interface BankRow {
  date: string;
  reference: string;
  amount: number;
  description: string;
}

function cells(line: string): string[] {
  if (line.includes("\t")) return line.split("\t").map((cell) => cell.trim().replace(/^"|"$/g, ""));
  const result: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function numeric(value: string): number {
  const parsed = Number(String(value).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

const HEADER_WORDS = /(sku|product|item|name|qty|quantity|price|cost|date|reference|amount|description)/i;

/** Accepts pasted CSV/TSV lines: sku, quantity, price [, name]. */
export function parseLineItems(text: string): ParsedLine[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(cells)
    .filter((parts) => !HEADER_WORDS.test(parts[0] ?? ""))
    .map((parts) => ({
      sku: (parts[0] ?? "").trim(),
      quantity: numeric(parts[1] ?? "1") || 1,
      price: numeric(parts[2] ?? "0"),
      name: (parts[3] ?? "").trim(),
    }))
    .filter((line) => Boolean(line.sku));
}

/** Accepts pasted bank rows: date, reference, amount [, description]. */
export function parseBankStatement(text: string): BankRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(cells)
    .filter((parts) => !HEADER_WORDS.test(parts[0] ?? ""))
    .map((parts) => ({
      date: (parts[0] ?? "").trim(),
      reference: (parts[1] ?? "").trim(),
      amount: Math.abs(numeric(parts[2] ?? "0")),
      description: (parts[3] ?? "").trim(),
    }))
    .filter((row) => Boolean(row.reference) && row.amount > 0);
}
