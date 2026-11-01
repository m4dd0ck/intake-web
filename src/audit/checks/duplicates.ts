/** Duplicates: repeated rows, keys that should be unique, and near-duplicate records. */

import { counted, examples, values as columnValues, type TableContext } from "../context";
import { maxRatio, tokenSortRatio } from "../fuzz";
import { ID_NAME, isBlank } from "../kinds";
import { finding, type Finding } from "../models";
import { collapseSpaces, sortedText, strip } from "../py";

const NAME_LIKE = /(name|customer|client|company|contact)/i;
const SIMILARITY = 92;
const DIGITS = /\d+/g;
export const MAX_FUZZY_VALUES = 3000;
const MAX_NAME_LENGTH = 200;

export function check(ctx: TableContext): Finding[] {
  // Reason: one pass builds both views of the rows; this check is the slowest on big files.
  const unique = new Map<string, NormalisedRow>();
  for (const row of normalisedRows(ctx)) unique.set(rowKey(row), row);
  return [
    ...duplicateRows(ctx, unique.size),
    ...duplicateKeys(ctx, unique),
    ...nearDuplicates(ctx),
  ];
}

type NormalisedRow = string[];

function normalisedRows(ctx: TableContext): NormalisedRow[] {
  return ctx.table.rows.map((row) => row.map((cell) => (cell === null ? "" : strip(cell))));
}

function rowKey(row: NormalisedRow): string {
  return JSON.stringify(row);
}

function duplicateRows(ctx: TableContext, uniqueCount: number): Finding[] {
  const extra = ctx.table.rows.length - uniqueCount;
  if (!extra) return [];
  return [
    finding({
      code: "duplicate_rows",
      severity: "critical",
      table: ctx.table.name,
      title: "Rows repeated exactly",
      detail: counted(extra, "row is an exact copy", "rows are exact copies") + " of another row.",
      impact: "Every count and total from this file is overstated until copies are removed.",
      affected_rows: extra,
    }),
  ];
}

/** Key-like columns that are nearly unique but repeat on rows that disagree. */
function duplicateKeys(ctx: TableContext, uniqueRows: Map<string, NormalisedRow>): Finding[] {
  const findings: Finding[] = [];
  [...ctx.columns].forEach(([name, column], position) => {
    const looksLikeKey = column.kind === "id" || (position === 0 && ID_NAME.test(name));
    if (!looksLikeKey || column.nonBlank === 0) return;
    if (column.distinct < 0.9 * column.nonBlank) return; // repeats by design (customer_id on orders)
    const index = ctx.table.columns.indexOf(name);
    const rowsByKey = new Map<string, number>();
    for (const row of uniqueRows.values()) {
      const key = row[index] ?? "";
      if (!isBlank(key)) rowsByKey.set(key, (rowsByKey.get(key) ?? 0) + 1);
    }
    const conflicting = sortedText([...rowsByKey].filter(([, n]) => n > 1).map(([key]) => key));
    if (conflicting.length === 0) return;
    findings.push(
      finding({
        code: "duplicate_keys",
        severity: "critical",
        table: ctx.table.name,
        column: name,
        title: "The same ID appears on different rows",
        detail:
          counted(conflicting.length, `${name} value appears`, `${name} values appear`) +
          " on rows with different contents.",
        impact:
          "These are not simple copies: one of each pair is probably an edit " +
          "or a mistake, and someone has to decide which row is right.",
        examples: examples(conflicting),
        affected_rows: conflicting.reduce((sum, key) => sum + (rowsByKey.get(key) ?? 0), 0),
      }),
    );
  });
  return findings;
}

function nearDuplicates(ctx: TableContext): Finding[] {
  const findings: Finding[] = [];
  for (const [name, column] of ctx.columns) {
    if (column.kind === "email") {
      findings.push(...emailCaseVariants(ctx, name));
    } else if (NAME_LIKE.test(name) && (column.kind === "text" || column.kind === "category")) {
      findings.push(...similarNames(ctx, name));
    }
  }
  return findings;
}

function emailCaseVariants(ctx: TableContext, name: string): Finding[] {
  const forms = new Map<string, Set<string>>();
  for (const value of columnValues(ctx, name)) {
    if (value === null || isBlank(value)) continue;
    const key = strip(value).toLowerCase();
    const seen = forms.get(key) ?? new Set<string>();
    seen.add(strip(value));
    forms.set(key, seen);
  }
  const variants = [...forms.values()]
    .filter((seen) => seen.size > 1)
    .map((seen) => sortedText(seen).join(" / "));
  if (variants.length === 0) return [];
  return [
    finding({
      code: "near_duplicate_records",
      severity: "warning",
      table: ctx.table.name,
      column: name,
      title: "The same email address in different capitalisation",
      detail:
        counted(variants.length, "address appears", "addresses appear") +
        " in different letter case.",
      impact: "These are almost certainly the same person counted as separate customers.",
      examples: variants.slice(0, 5),
      affected_rows: variants.length,
    }),
  ];
}

function digitRuns(text: string): string {
  return (text.match(DIGITS) ?? []).join(",");
}

/** Nearly identical text that is not simply a different number ("Item 1" vs "Item 11"). */
export function likelySame(left: string, right: string): boolean {
  if (left.toLowerCase() === right.toLowerCase() || digitRuns(left) !== digitRuns(right)) {
    return false;
  }
  // Reason: skip the full comparison when the lengths alone rule a match out.
  if (maxRatio(Array.from(left).length, Array.from(right).length) < SIMILARITY) return false;
  return tokenSortRatio(left, right) >= SIMILARITY;
}

function similarNames(ctx: TableContext, name: string): Finding[] {
  // Reason: truncate long cells; names are short, and this bounds the cost of each comparison.
  const distinct = sortedText(
    new Set(
      columnValues(ctx, name)
        .filter((v): v is string => !isBlank(v) && v !== "")
        .map((v) => Array.from(collapseSpaces(v)).slice(0, MAX_NAME_LENGTH).join("")),
    ),
  );
  if (distinct.length > MAX_FUZZY_VALUES) return [];
  // Reason: compare within first-letter blocks; near-duplicates rarely differ there.
  const blocks = new Map<string, string[]>();
  for (const value of distinct) {
    const key = (Array.from(value)[0] ?? "").toLowerCase();
    const block = blocks.get(key) ?? [];
    block.push(value);
    blocks.set(key, block);
  }
  const pairs: string[] = [];
  for (const block of blocks.values()) {
    block.forEach((left, i) => {
      for (const right of block.slice(i + 1)) {
        if (likelySame(left, right)) pairs.push(`${left} / ${right}`);
      }
    });
  }
  if (pairs.length === 0) return [];
  return [
    finding({
      code: "near_duplicate_records",
      severity: "warning",
      table: ctx.table.name,
      column: name,
      title: "Names that look like the same record",
      detail:
        counted(pairs.length, "pair", "pairs") +
        ` of ${name} values ${pairs.length === 1 ? "is" : "are"} nearly identical.`,
      impact:
        "Likely typos or re-entered records; counts of unique customers or clients " +
        "will be too high until they are merged.",
      examples: pairs.slice(0, 5),
      affected_rows: pairs.length,
    }),
  ];
}
