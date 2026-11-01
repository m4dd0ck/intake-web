/**
 * Work out what a text column really holds, and parse its values.
 *
 * Every value is classified on its own (`valueKind`), then a column's kind is the kind most of
 * its non-blank values share. The per-value counts are kept, because a column that is 80% ISO
 * dates and 20% US dates is exactly what the format checks need to report.
 */

import { PY_SPACE, splitWhitespace, strip } from "./py";

export const BLANK_TOKENS = new Set([
  "",
  "n/a",
  "na",
  "-",
  "--",
  "null",
  "none",
  "?",
  "nan",
  "#n/a",
  "missing",
]);

const PATTERNS: readonly (readonly [string, RegExp])[] = [
  ["integer", /^[+-]?\d+$/],
  ["decimal", /^[+-]?(\d{1,3}(,\d{3})+(\.\d+)?|\d+\.\d+|\.\d+)$/],
  ["currency", /^[+-]?\s*[$€£¥]\s*[\d,]*\.?\d+$|^[+-]?[\d,]*\.?\d+\s*[$€£¥]$/],
  ["currency", /^(USD|EUR|GBP|CAD|AUD)\s*[+-]?[\d,]*\.?\d+$/i],
  ["percent", /^[+-]?\d+(\.\d+)?\s*%$/],
  ["date_iso", /^\d{4}-\d{2}-\d{2}$/],
  ["datetime", /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?/],
  ["date_slash", /^\d{1,2}\/\d{1,2}\/\d{4}$/],
  ["date_dot", /^\d{1,2}\.\d{1,2}\.\d{4}$/],
  ["date_text", /^[A-Za-z]{3,9}\.? \d{1,2},? \d{4}$/],
  ["boolean", /^(true|false|yes|no|y|n)$/i],
  ["email", /^[^@\s]+@[^@\s]+\.[^@\s]+$/],
];
export const DATE_KINDS = new Set(["date_iso", "datetime", "date_slash", "date_dot", "date_text"]);
export const NUMBER_KINDS = new Set(["integer", "decimal", "currency", "percent"]);
export const ID_NAME = /(^id$|_id$|id$|_code$|_number$|_no$|^sku$)/i;
const MAJORITY = 0.9;
const NUMBER_NOISE = new RegExp(`usd|eur|gbp|cad|aud|[$€£¥,%${PY_SPACE}]`, "giu");
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** True for empty cells and the placeholders people type for "no value". */
export function isBlank(value: string | null | undefined): boolean {
  return value == null || BLANK_TOKENS.has(strip(value).toLowerCase());
}

/** Kind of one non-blank value; `text` when nothing more specific fits. */
export function valueKind(value: string): string {
  const stripped = strip(value);
  for (const [kind, pattern] of PATTERNS) {
    if (pattern.test(stripped)) return kind;
  }
  return "text";
}

/** What a column holds: overall kind plus the evidence behind it. */
export interface ColumnAnalysis {
  kind: string;
  nonBlank: number;
  distinct: number;
  valueKinds: Map<string, number>;
  /** Placeholder text -> count, in first-seen order. */
  blankTokens: Map<string, number>;
}

function bump(counter: Map<string, number>, key: string): void {
  counter.set(key, (counter.get(key) ?? 0) + 1);
}

/** Classify a column from its name and values. */
export function analyseColumn(name: string, values: readonly (string | null)[]): ColumnAnalysis {
  const blankTokens = new Map<string, number>();
  const kinds = new Map<string, number>();
  const present = new Set<string>();
  let nonBlank = 0;
  for (const value of values) {
    if (value == null) continue;
    if (isBlank(value)) {
      bump(blankTokens, value);
      continue;
    }
    nonBlank += 1;
    present.add(strip(value));
    bump(kinds, valueKind(value));
  }
  const analysis: ColumnAnalysis = {
    kind: "empty",
    nonBlank,
    distinct: present.size,
    valueKinds: kinds,
    blankTokens,
  };
  if (nonBlank > 0) analysis.kind = overallKind(name, kinds, nonBlank, present.size);
  return analysis;
}

function overallKind(
  name: string,
  kinds: Map<string, number>,
  total: number,
  distinct: number,
): string {
  const count = (kind: string): number => kinds.get(kind) ?? 0;
  const share = (group: Set<string>): number =>
    [...group].reduce((sum, kind) => sum + count(kind), 0) / total;

  if (share(DATE_KINDS) >= MAJORITY) return "date";
  if (share(NUMBER_KINDS) >= MAJORITY) {
    if (count("currency")) return "currency";
    if (count("percent") / total >= MAJORITY) return "percent";
    const isWhole = count("integer") / total >= MAJORITY;
    if (isWhole && ID_NAME.test(name) && distinct >= 0.9 * total) return "id";
    return isWhole ? "integer" : "decimal";
  }
  // Reason: Counter.most_common(1) keeps the first-seen kind on a tie.
  let topKind = "text";
  let topCount = 0;
  for (const [kind, seen] of kinds) {
    if (seen > topCount) [topKind, topCount] = [kind, seen];
  }
  if (topCount / total >= MAJORITY && (topKind === "boolean" || topKind === "email")) {
    return topKind;
  }
  if (ID_NAME.test(name) && distinct >= 0.5 * total) return "id";
  if (distinct <= Math.max(20, Math.floor(total / 20))) return "category";
  return "text";
}

/** Number from plain, thousands-separated, currency or percent text; null if not numeric. */
export function parseNumber(value: string | null | undefined): number | null {
  if (value == null || isBlank(value)) return null;
  const kind = valueKind(value);
  if (!NUMBER_KINDS.has(kind)) return null;
  const cleaned = value.replace(NUMBER_NOISE, "");
  if (cleaned === "") return null;
  const number = Number(cleaned);
  if (Number.isNaN(number)) return null;
  return kind === "percent" ? number / 100 : number;
}

/** ISO date text for a valid calendar date (years 1-9999, like Python's `date`), else null. */
export function isoDate(year: number, month: number, day: number): string | null {
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1) return null;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const limit = month === 2 ? (leap ? 29 : 28) : (MONTH_DAYS[month - 1] ?? 0);
  if (day > limit) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Date (as YYYY-MM-DD) from ISO, slash (US unless the first part exceeds 12), dotted or "Mar 4, 2024". */
export function parseDate(value: string | null | undefined): string | null {
  if (value == null || isBlank(value)) return null;
  const text = strip(value);
  const kind = valueKind(text);
  if (kind === "date_iso" || kind === "datetime") {
    const [year, month, day] = text.slice(0, 10).split("-").map(Number);
    return isoDate(year ?? 0, month ?? 0, day ?? 0);
  }
  if (kind === "date_slash") {
    const [first = 0, second = 0, year = 0] = text.split("/").map(Number);
    return first > 12 ? isoDate(year, second, first) : isoDate(year, first, second);
  }
  if (kind === "date_dot") {
    const [day = 0, month = 0, year = 0] = text.split(".").map(Number);
    return isoDate(year, month, day);
  }
  if (kind === "date_text") {
    const [monthName = "", dayText = "", yearText = ""] = splitWhitespace(
      text.replaceAll(",", "").replaceAll(".", ""),
    );
    const month = MONTHS.indexOf(monthName.slice(0, 3).toLowerCase()) + 1;
    return month ? isoDate(Number(yearText), month, Number(dayText)) : null;
  }
  return null;
}
