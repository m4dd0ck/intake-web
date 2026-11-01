/** Format problems: mixed date styles, numbers stored as text, currencies, labels, whitespace. */

import { counted, examples, values as columnValues, type TableContext } from "../context";
import { DATE_KINDS, NUMBER_KINDS, isBlank, valueKind } from "../kinds";
import { finding, type Finding } from "../models";
import { collapseSpaces, pyRepr, sortedText, strip } from "../py";

const CURRENCY_MARK = /[$€£¥]|\b(USD|EUR|GBP|CAD|AUD)\b/i;
const SYMBOL_CODES: Record<string, string> = { $: "USD", "€": "EUR", "£": "GBP", "¥": "JPY" };
const DATE_NAME = /(date|_at$|_on$|issued|created|updated|day)/i;
const DATE_KIND_LABELS: Record<string, string> = {
  date_iso: "2024-03-04",
  datetime: "2024-03-04 10:15",
  date_slash: "03/04/2024",
  date_dot: "04.03.2024",
  date_text: "Mar 4, 2024",
};

export function check(ctx: TableContext): Finding[] {
  const findings: Finding[] = [];
  for (const [name, column] of ctx.columns) {
    const present = columnValues(ctx, name).filter((v): v is string => !isBlank(v));
    if (present.length === 0) continue;
    if (column.kind === "date") findings.push(...mixedDates(ctx, name, present));
    if (["currency", "decimal", "integer"].includes(column.kind)) {
      findings.push(...numbersAsText(ctx, name, present), ...nonNumbers(ctx, name, present));
    }
    if ((column.kind === "integer" || column.kind === "id") && DATE_NAME.test(name)) {
      findings.push(...excelSerials(ctx, name, present));
    }
    if (column.kind === "category") findings.push(...inconsistentLabels(ctx, name, present));
    findings.push(...whitespace(ctx, name, present));
  }
  return findings;
}

function mixedDates(ctx: TableContext, name: string, present: string[]): Finding[] {
  const styles = new Map<string, string[]>();
  for (const value of present) {
    const kind = valueKind(value);
    if (!DATE_KINDS.has(kind)) continue;
    const style = kind === "datetime" ? "date_iso" : kind;
    const found = styles.get(style) ?? [];
    found.push(value);
    styles.set(style, found);
  }
  if (styles.size < 2) return [];
  const groups = [...styles];
  const breakdown = groups
    .map(([kind, found]) => `${found.length} like ${DATE_KIND_LABELS[kind] ?? kind}`)
    .join(", ");
  const sizes = groups.map(([, found]) => found.length);
  return [
    finding({
      code: "mixed_date_formats",
      severity: "warning",
      table: ctx.table.name,
      column: name,
      title: "Dates are written in more than one format",
      detail: `${breakdown}.`,
      impact:
        "Dates like 03/04/2024 are ambiguous (March 4 or April 3), and sorting or " +
        "monthly totals will be wrong until one format is used.",
      examples: groups.map(([, found]) => found[0] ?? ""),
      affected_rows: sizes.reduce((a, b) => a + b, 0) - Math.max(...sizes),
    }),
  ];
}

function currencyOf(value: string): string | null {
  const match = CURRENCY_MARK.exec(value);
  if (!match) return null;
  const token = match[0];
  return SYMBOL_CODES[token] ?? token.toUpperCase();
}

function numbersAsText(ctx: TableContext, name: string, present: string[]): Finding[] {
  const findings: Finding[] = [];
  const formatted = present.filter((v) => CURRENCY_MARK.test(v) || v.includes(","));
  if (formatted.length > 0) {
    findings.push(
      finding({
        code: "numbers_as_text",
        severity: "warning",
        table: ctx.table.name,
        column: name,
        title: "Numbers stored with currency symbols or separators",
        detail:
          counted(formatted.length, "value includes", "values include") +
          " symbols or thousands separators.",
        impact:
          "Spreadsheets and databases read these as text, so they drop out of sums " +
          "and averages unless they are cleaned first.",
        examples: examples(formatted),
        affected_rows: formatted.length,
      }),
    );
  }
  const currencies = sortedText(
    new Set(present.map(currencyOf).filter((c): c is string => c !== null)),
  );
  if (currencies.length > 1) {
    findings.push(
      finding({
        code: "mixed_currencies",
        severity: "critical",
        table: ctx.table.name,
        column: name,
        title: "More than one currency in the same column",
        detail: `Found ${currencies.join(", ")}.`,
        impact:
          "Totals would add different currencies together. Each value needs " +
          "converting to one currency (with the rate and date used) before any sum.",
        examples: currencies.map((code) => present.find((v) => currencyOf(v) === code) ?? ""),
      }),
    );
  }
  return findings;
}

function nonNumbers(ctx: TableContext, name: string, present: string[]): Finding[] {
  const stray = present.filter((v) => !NUMBER_KINDS.has(valueKind(v)));
  if (stray.length === 0) return [];
  return [
    finding({
      code: "non_numeric_values",
      severity: "warning",
      table: ctx.table.name,
      column: name,
      title: "Text mixed into a number column",
      detail: counted(stray.length, "value is not a number.", "values are not numbers."),
      impact: "These rows will fail or be skipped in any calculation on this column.",
      examples: examples(stray),
      affected_rows: stray.length,
    }),
  ];
}

function excelSerials(ctx: TableContext, name: string, present: string[]): Finding[] {
  const serials = present.filter((v) => /^\d+$/.test(v) && +v >= 20000 && +v <= 80000);
  if (serials.length < 0.5 * present.length) return [];
  return [
    finding({
      code: "excel_serial_dates",
      severity: "warning",
      table: ctx.table.name,
      column: name,
      title: "Dates saved as Excel serial numbers",
      detail:
        counted(serials.length, "value looks", "values look") +
        " like Excel day counts (e.g. 45412 = 2024-04-30).",
      impact:
        "They sort correctly but read as numbers; they need converting before any " +
        "date grouping or display.",
      examples: examples(serials),
      affected_rows: serials.length,
    }),
  ];
}

function inconsistentLabels(ctx: TableContext, name: string, present: string[]): Finding[] {
  const variants = new Map<string, Set<string>>();
  for (const value of present) {
    const key = collapseSpaces(value).toLowerCase();
    const forms = variants.get(key) ?? new Set<string>();
    forms.add(value);
    variants.set(key, forms);
  }
  const clashing = new Map([...variants].filter(([, forms]) => forms.size > 1));
  if (clashing.size === 0) return [];
  const shown = [...clashing.values()].map((forms) =>
    sortedText([...forms].map(pyRepr)).join(" / "),
  );
  return [
    finding({
      code: "inconsistent_labels",
      severity: "warning",
      table: ctx.table.name,
      column: name,
      title: "The same label is spelled several ways",
      detail:
        counted(clashing.size, "label differs", "labels differ") + " only by case or spacing.",
      impact:
        "Breakdowns will split one group into several (e.g. 'US' and 'us ' " +
        "counted separately).",
      examples: shown.slice(0, 5),
      affected_rows: present.filter((v) => clashing.has(collapseSpaces(v).toLowerCase())).length,
    }),
  ];
}

function whitespace(ctx: TableContext, name: string, present: string[]): Finding[] {
  const padded = present.filter((v) => v !== strip(v));
  if (padded.length === 0) return [];
  return [
    finding({
      code: "stray_whitespace",
      severity: "info",
      table: ctx.table.name,
      column: name,
      title: "Values with leading or trailing spaces",
      detail: counted(padded.length, "value has", "values have") + " extra spaces.",
      impact: "Invisible, but 'Leeds' and 'Leeds ' will not match in lookups or joins.",
      examples: examples(padded),
      affected_rows: padded.length,
    }),
  ];
}
