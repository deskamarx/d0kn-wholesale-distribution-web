import type { AppState } from "../types";
import { translate, type Language } from "../i18n";
import {
  cancelNativeSpeech,
  createNativeSpeechRecognition,
  isNativeSpeechPlatform,
  speakWithNativeSpeech,
} from "./nativeVoice";
import {
  getExpiringCompliance,
  getHighRiskShipments,
  getInsights,
  getLowStock,
  getOutstanding,
  getRevenue,
} from "./intelligence";

export type VoiceLanguage = "auto" | Language;
export type SpeechLanguage = Language;

export const VOICE_LOCALES: Record<SpeechLanguage, string> = {
  en: "en-US",
  bn: "bn-BD",
  zh: "zh-CN",
};

const LOCALE_BY_LANGUAGE: Record<SpeechLanguage, string> = VOICE_LOCALES;

export interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}

export interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

export interface SpeechRecognitionResultListLike {
  length: number;
  [index: number]: SpeechRecognitionResultLike;
}

export interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}

export interface SpeechRecognitionErrorLike {
  error: string;
  message?: string;
}

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (isNativeSpeechPlatform()) return createNativeSpeechRecognition();
  if (typeof window === "undefined") return null;
  const candidate = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null;
}

export function hasSpeechSynthesis(): boolean {
  return isNativeSpeechPlatform() || (typeof window !== "undefined" && "speechSynthesis" in window);
}

export async function speakAloud(text: string, language: string): Promise<void> {
  if (isNativeSpeechPlatform()) {
    await speakWithNativeSpeech(text, language);
    return;
  }
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language;
  utterance.rate = 0.98;
  await new Promise<void>((resolve) => {
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}

export async function cancelSpeech(): Promise<void> {
  if (isNativeSpeechPlatform()) {
    await cancelNativeSpeech();
    return;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}

export function localeFor(language: SpeechLanguage): string {
  return LOCALE_BY_LANGUAGE[language] ?? LOCALE_BY_LANGUAGE.en;
}

export function resolveVoiceLanguage(preference: VoiceLanguage, interfaceLanguage: Language): SpeechLanguage {
  return preference === "auto" ? interfaceLanguage : preference;
}

export function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const NAV_KEYS: Record<string, string> = {
  dashboard: "Dashboard",
  intelligence: "Intelligence",
  analytics: "Analytics",
  suppliers: "Suppliers",
  products: "Products",
  imports: "Imports",
  shipments: "Shipments",
  warehouse: "Warehouse",
  customers: "Customers",
  quotations: "Quotations",
  orders: "Orders",
  invoices: "Invoices",
  payments: "Payments",
  compliance: "Compliance",
  search: "Search",
  settings: "Settings",
};

const NAV_EXTRA: Record<string, string[]> = {
  dashboard: ["home", "homepage", "main", "start", "হোম", "প্রধান", "主页", "首页"],
  intelligence: ["ai", "insights", "signals", "briefing", "ইনসাইট", "সংকেত", "洞察", "信号"],
  analytics: ["reports", "reporting", "metrics", "রিপোর্ট", "বিশ্লেষণা", "报表", "报告"],
  warehouse: ["stock", "inventory", "godown", "স্টক", "গোডাউন", "库存", "仓库"],
  search: ["find", "lookup", "query", "খোঁজা", "অনুসন্ধান", "查找", "搜索"],
  orders: ["sales order", "sales orders", "অর্ডার", "订单"],
  invoices: ["billing", "bill", "চালান", "বিল", "发票"],
  payments: ["receipts", "collections", "প্রাপ্তি", "আদায়", "收款"],
  compliance: ["certificates", "licences", "licenses", "সম্মতি", "合规"],
};

export function navLabelKeys(): string[] {
  return Object.values(NAV_KEYS);
}

export function navKeyForLabel(label: string): string | null {
  const normalized = normalizeText(label);
  for (const [id, key] of Object.entries(NAV_KEYS)) {
    if (normalizeText(translate("en", key)) === normalized) return id;
  }
  return null;
}

function navAliases(id: string): string[] {
  const key = NAV_KEYS[id];
  const aliases = (["en", "bn", "zh"] as Language[]).map((language) => translate(language, key));
  return [...aliases, ...(NAV_EXTRA[id] ?? [])].map(normalizeText).filter(Boolean);
}

export function matchModule(transcript: string): string | null {
  const normalized = normalizeText(transcript);
  let best: { id: string; length: number } | null = null;
  for (const id of Object.keys(NAV_KEYS)) {
    for (const alias of navAliases(id)) {
      if (normalized.includes(alias) && (!best || alias.length > best.length)) {
        best = { id, length: alias.length };
      }
    }
  }
  return best?.id ?? null;
}

const SUMMARIZE_WORDS: Record<Language, string[]> = {
  en: ["summarize", "summarise", "summary", "report", "briefing", "brief", "tell me the report", "read the report"],
  bn: ["সারাংশ", "সংক্ষেপ", "রিপোর্ট", "ব্রিফিং", "বলুন", "শোনান", "পড়ে"] ,
  zh: ["总结", "摘要", "报告", "简报", "朗读", "说说", "讲一下"],
};

const NAV_VERBS: Record<Language, string[]> = {
  en: ["open", "go to", "goto", "navigate to", "show", "launch", "take me to"],
  bn: ["খুলুন", "খোল", "যান", "দেখান", "চালু", "নিয়ে যান"],
  zh: ["打开", "前往", "进入", "显示", "转到", "切换到"],
};

const SEARCH_WORDS: Record<Language, string[]> = {
  en: ["search", "find", "look for", "lookup"],
  bn: ["খুঁজুন", "খোঁজা", "অনুসন্ধান", "অনুসন্ধান করুন"],
  zh: ["搜索", "查找", "找一下", "查询"],
};

const STOP_WORDS: Record<Language, string[]> = {
  en: ["stop", "cancel", "dismiss", "close voice"],
  bn: ["বন্ধ", "বাতিল", "বন্ধ করুন"],
  zh: ["停止", "取消", "关闭语音"],
};

const HELP_WORDS: Record<Language, string[]> = {
  en: ["help", "examples", "what can i say", "commands"],
  bn: ["সাহায্য", "উদাহরণ", "কমান্ড"],
  zh: ["帮助", "示例", "指令"],
};

function includesAny(normalized: string, phrases: string[]): boolean {
  return phrases.some((phrase) => {
    const value = normalizeText(phrase);
    return value.length > 0 && normalized.includes(value);
  });
}

function leadingOffset(normalized: string, phrases: string[]): number {
  let start = 0;
  while (/\s/u.test(normalized[start] ?? "")) start += 1;
  for (const phrase of phrases) {
    const value = normalizeText(phrase);
    if (value && normalized.startsWith(value, start)) {
      let end = start + value.length;
      while (/\s/u.test(normalized[end] ?? "")) end += 1;
      return end;
    }
  }
  return start;
}

function stripLeading(normalized: string, phrases: string[]): string {
  return normalized.slice(leadingOffset(normalized, phrases));
}

function normalizeWithMap(value: string): { text: string; map: number[] } {
  const source = value.normalize("NFKC").toLowerCase();
  let text = "";
  const map: number[] = [];
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (/[\p{P}\p{S}]/u.test(char)) {
      if (text && !text.endsWith(" ")) {
        text += " ";
        map.push(index);
      }
      continue;
    }
    if (/\s/u.test(char)) {
      if (text && !text.endsWith(" ")) {
        text += " ";
        map.push(index);
      }
      continue;
    }
    text += char;
    map.push(index);
  }
  let start = 0;
  let end = text.length;
  while (text[start] === " ") start += 1;
  while (text[end - 1] === " ") end -= 1;
  return { text: text.slice(start, end), map: map.slice(start, end) };
}

export type VoiceCommand =
  | { type: "stop" }
  | { type: "help" }
  | { type: "summary"; tab: string | null }
  | { type: "navigate"; tab: string }
  | { type: "search"; query: string }
  | { type: "field"; text: string };

export function detectCommand(transcript: string, language: SpeechLanguage): VoiceCommand {
  const normalized = normalizeText(transcript);
  if (!normalized) return { type: "field", text: "" };

  if (includesAny(normalized, STOP_WORDS[language])) return { type: "stop" };
  if (includesAny(normalized, HELP_WORDS[language])) return { type: "help" };

  if (includesAny(normalized, SUMMARIZE_WORDS[language])) {
    return { type: "summary", tab: matchModule(normalized) };
  }

  for (const locale of ["en", "bn", "zh"] as Language[]) {
    if (includesAny(normalized, SEARCH_WORDS[locale])) {
      const query = stripLeading(normalized, SEARCH_WORDS[locale]);
      return { type: "search", query };
    }
  }

  const module = matchModule(normalized);
  if (module) {
    const hasNavVerb = (["en", "bn", "zh"] as Language[]).some((locale) =>
      includesAny(normalized, NAV_VERBS[locale])
    );
    if (hasNavVerb || normalized.split(" ").length <= 3) {
      return { type: "navigate", tab: module };
    }
  }

  return { type: "field", text: transcript.trim() };
}

export const FIELD_KEYS = [
  "Reference", "Name", "SKU", "Brand", "Model", "Category", "Cost", "Wholesale price", "Retail price",
  "MOQ", "Stock", "Reorder point", "Warranty months", "HS code", "Country of origin", "Unit", "Supplier",
  "Chinese name", "City", "Country", "Contact", "WeChat", "Phone", "Email", "Payment terms", "Incoterm",
  "Lead time days", "Reliability", "Quality score", "Compliance status", "Notes", "ETA", "Status",
  "Customs status", "Currency", "Exchange rate", "Duty %", "Freight cost", "Insurance cost", "Quantity",
  "Carrier", "Mode", "Origin port", "Destination port", "Departure date", "Tracking number", "Containers",
  "Documents status", "Delay risk", "Code", "Capacity", "Used", "Manager", "Credit limit", "Type",
  "Issue date", "Due date", "Amount", "Paid amount", "Balance", "Method", "Authority", "Expiry date",
  "Linked entity", "Valid until", "Discount %", "Total", "Date", "Company", "Item count", "Goods cost",
  "Landed cost", "Unit cost", "Unit price", "Order date", "Invoice number", "Payment amount", "Order number",
  "Quotation number", "Warehouse", "Product", "Customer", "Search all records", "Backup JSON",
];

const FIELD_VERBS: Record<Language, string[]> = {
  en: ["set", "fill", "enter", "type", "change", "input", "field", "value", "write"],
  bn: ["সেট", "পূরণ", "লিখুন", "দিন", "ইনপুট", "মান", "ক্ষেত্র"],
  zh: ["设置", "填写", "输入", "键入", "修改", "字段", "值", "写入"],
};

const FIELD_CONNECTORS: Record<Language, string[]> = {
  en: ["is", "to", "as", "equals", "the value is", "value"],
  bn: ["হয়", "হয়", "হলো", "হিসাবে", "মান", "হচ্ছে"],
  zh: ["是", "为", "等于", "值"],
};

export interface FieldTarget {
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  label: string;
}

export function collectFields(root: ParentNode = document): FieldTarget[] {
  const wrappers = Array.from(root.querySelectorAll<HTMLElement>(".field"));
  const fields: FieldTarget[] = [];
  for (const wrapper of wrappers) {
    const element = wrapper.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      "input, textarea, select"
    );
    if (!element) continue;
    const label = wrapper.querySelector("label")?.textContent?.trim()
      ?? element.getAttribute("aria-label")
      ?? element.getAttribute("placeholder")
      ?? "";
    if (!label) continue;
    fields.push({ element, label });
  }
  return fields;
}

function aliasesForField(label: string): string[] {
  const normalizedLabel = normalizeText(label);
  const aliases = new Set<string>([normalizedLabel]);
  for (const key of FIELD_KEYS) {
    const keyNormalized = normalizeText(key);
    if (keyNormalized === normalizedLabel) {
      for (const language of ["en", "bn", "zh"] as Language[]) {
        aliases.add(normalizeText(translate(language, key)));
      }
    }
  }
  return Array.from(aliases).filter(Boolean).sort((a, b) => b.length - a.length);
}

function coerceValue(element: FieldTarget["element"], raw: string): string {
  const value = raw.trim();
  if (element instanceof HTMLSelectElement) {
    const options = Array.from(element.options);
    const normalizedValue = normalizeText(value);
    const match = options.find((option) => {
      const text = normalizeText(option.textContent ?? "");
      return text === normalizedValue || text.includes(normalizedValue) || normalizedValue.includes(text);
    });
    return match?.value ?? "";
  }
  if (element instanceof HTMLInputElement && element.type === "number") {
    const found = value.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
    return found?.[0] ?? "";
  }
  if (element instanceof HTMLInputElement && element.type === "date") {
    const iso = value.match(/\d{4}-\d{2}-\d{2}/);
    if (iso) return iso[0];
    const normalized = normalizeText(value);
    const today = new Date();
    if (normalized.includes(normalizeText("today")) || normalized.includes(normalizeText("আজ")) || normalized.includes(normalizeText("今天"))) {
      return today.toISOString().slice(0, 10);
    }
    if (normalized.includes(normalizeText("tomorrow")) || normalized.includes(normalizeText("আগামীকাল")) || normalized.includes(normalizeText("明天"))) {
      today.setDate(today.getDate() + 1);
      return today.toISOString().slice(0, 10);
    }
    return "";
  }
  return value;
}

export function parseFieldCommand(
  transcript: string,
  language: SpeechLanguage,
  fields: FieldTarget[]
): { field: FieldTarget; value: string } | null {
  const source = transcript.trim();
  const mapped = normalizeWithMap(source);
  let verbOffset = 0;
  for (const locale of [language, "en", "bn", "zh"] as Language[]) {
    verbOffset += leadingOffset(mapped.text.slice(verbOffset), FIELD_VERBS[locale]);
  }
  const normalized = mapped.text.slice(verbOffset);

  let best: { field: FieldTarget; value: string; aliasLength: number } | null = null;
  for (const field of fields) {
    for (const alias of aliasesForField(field.label)) {
      const index = normalized.indexOf(alias);
      if (index < 0) continue;
      let connectorOffset = 0;
      const remainder = normalized.slice(index + alias.length);
      for (const locale of [language, "en", "bn", "zh"] as Language[]) {
        connectorOffset += leadingOffset(remainder.slice(connectorOffset), FIELD_CONNECTORS[locale]);
      }
      const start = mapped.map[verbOffset + index + alias.length + connectorOffset];
      if (start === undefined) continue;
      const value = source.slice(start).trim();
      if (!value) continue;
      if (!best || alias.length > best.aliasLength) {
        best = { field, value, aliasLength: alias.length };
      }
    }
  }
  if (!best) return null;
  const coerced = coerceValue(best.field.element, best.value);
  if (!coerced) return null;
  return { field: best.field, value: coerced };
}

export function setNativeValue(element: FieldTarget["element"], value: string): void {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (setter) setter.call(element, value);
  else element.value = value;
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function localeNumber(language: SpeechLanguage, value: number): string {
  return new Intl.NumberFormat(localeFor(language), { maximumFractionDigits: 0 }).format(value || 0);
}

function localeMoney(language: SpeechLanguage, value: number, currency: string): string {
  return new Intl.NumberFormat(localeFor(language), {
    style: "currency",
    currency,
    notation: Math.abs(value) >= 100000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(value) >= 100000 ? 1 : 0,
  }).format(value || 0);
}

function tr(language: SpeechLanguage, key: string, vars?: Record<string, string | number>): string {
  return translate(language, key, vars);
}

export function buildSummary(state: AppState, tab: string, language: SpeechLanguage): string {
  const currency = state.company.defaultCurrency;
  const counts: Record<string, number> = {
    dashboard: state.activity.length,
    intelligence: getInsights(state, language).length,
    analytics: state.orders.length,
    suppliers: state.suppliers.length,
    products: state.products.length,
    imports: state.imports.length,
    shipments: state.shipments.length,
    warehouse: state.warehouses.length,
    customers: state.customers.length,
    quotations: state.quotations.length,
    orders: state.orders.length,
    invoices: state.invoices.length,
    payments: state.payments.length,
    compliance: state.compliance.length,
    search:
      state.suppliers.length + state.products.length + state.imports.length + state.shipments.length +
      state.customers.length + state.quotations.length + state.orders.length + state.invoices.length +
      state.payments.length + state.compliance.length,
    settings: 1,
  };

  const moduleKey = NAV_KEYS[tab] ?? "Dashboard";
  const insights = getInsights(state, language);
  const topAction = insights[0]?.recommendation ?? "";
  const parts: string[] = [
    tr(language, "Today's briefing"),
    tr(language, "{module} has {count} records.", {
      module: tr(language, moduleKey),
      count: localeNumber(language, counts[tab] ?? 0),
    }),
    `${tr(language, "Revenue")}: ${localeMoney(language, getRevenue(state), currency)}`,
    `${tr(language, "Outstanding")}: ${localeMoney(language, getOutstanding(state), currency)}`,
    `${tr(language, "Low stock")}: ${localeNumber(language, getLowStock(state).length)}`,
    `${tr(language, "High-risk shipments")}: ${localeNumber(language, getHighRiskShipments(state).length)}`,
    `${tr(language, "Expiring compliance")}: ${localeNumber(language, getExpiringCompliance(state).length)}`,
  ];

  if (topAction) parts.push(tr(language, "Top action: {text}", { text: topAction }));
  else parts.push(tr(language, "No critical exceptions detected."));

  return parts.join(". ") + ".";
}
