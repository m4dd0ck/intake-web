/** Values that are possible but suspicious: extreme numbers, negatives, odd dates. */

import { counted, examples, values as columnValues, type TableContext } from "../context";
import { parseDate, parseNumber } from "../kinds";
import { finding, type Finding } from "../models";
import { formatGrouped, quartiles } from "../py";

const AMOUNT_NAME = /(amount|price|total|revenue|cost|fee|hours|qty|quantity)/i;
const IQR_FENCE = 3.0;
const EARLIEST_PLAUSIBLE = "1990-01-01";
const MIN_VALUES_FOR_OUTLIERS = 20;

export function check(ctx: TableContext): Finding[] {
  const findings: Finding[] = [];
  for (const [name, column] of ctx.columns) {
    if (["integer", "decimal", "currency"].includes(column.kind)) {
      const numbers = columnValues(ctx, name)
        .map(parseNumber)
        .filter((n): n is number => n !== null);
      findings.push(...extremes(ctx, name, numbers), ...negatives(ctx, name, numbers));
    } else if (column.kind === "date") {
      const dates = columnValues(ctx, name)
        .map(parseDate)
        .filter((d): d is string => d !== null);
      findings.push(...oddDates(ctx, name, dates));
    }
  }
  return findings;
}

/** Python `f"{n:,.0f}"` for whole numbers, `f"{n:,.2f}"` otherwise. */
export function formatAmount(number: number): string {
  return formatGrouped(number, Number.isInteger(number) ? 0 : 2);
}

function extremes(ctx: TableContext, name: string, numbers: number[]): Finding[] {
  if (numbers.length < MIN_VALUES_FOR_OUTLIERS) return [];
  const [q1, , q3] = quartiles(numbers);
  const spread = q3 - q1;
  if (spread === 0) return [];
  const low = q1 - IQR_FENCE * spread;
  const high = q3 + IQR_FENCE * spread;
  // Reason: Array.sort is stable, matching Python's sorted(key=abs, reverse=True) on ties.
  const outliers = numbers
    .filter((n) => n < low || n > high)
    .sort((a, b) => Math.abs(b) - Math.abs(a));
  if (outliers.length === 0) return [];
  return [
    finding({
      code: "outliers",
      severity: "warning",
      table: ctx.table.name,
      column: name,
      title: "Unusually large or small values",
      detail:
        counted(outliers.length, "value sits", "values sit") +
        " far outside the typical range " +
        `(${formatAmount(q1)} to ${formatAmount(q3)} for the middle half).`,
      impact:
        "Could be real (a big order) or an entry error (an extra zero). Averages " +
        "will be pulled toward them either way; worth confirming.",
      examples: examples(outliers.map(formatAmount)),
      affected_rows: outliers.length,
    }),
  ];
}

function negatives(ctx: TableContext, name: string, numbers: number[]): Finding[] {
  const below = numbers.filter((n) => n < 0);
  if (below.length === 0 || !AMOUNT_NAME.test(name)) return [];
  return [
    finding({
      code: "negative_amounts",
      severity: "warning",
      table: ctx.table.name,
      column: name,
      title: "Negative values where amounts are expected",
      detail: counted(below.length, "value is", "values are") + " below zero.",
      impact:
        "Often refunds or corrections. Totals are right only if that is intended; " +
        "averages and counts of sales are not.",
      examples: examples(below.map(formatAmount)),
      affected_rows: below.length,
    }),
  ];
}

function oddDates(ctx: TableContext, name: string, dates: string[]): Finding[] {
  const findings: Finding[] = [];
  const future = dates.filter((d) => d > ctx.asOf).sort();
  if (future.length > 0) {
    findings.push(
      finding({
        code: "future_dates",
        severity: "warning",
        table: ctx.table.name,
        column: name,
        title: "Dates after the export date",
        detail: counted(future.length, "date is", "dates are") + ` later than ${ctx.asOf}.`,
        impact:
          "Usually typos in the year or scheduled items mixed in with actuals; " +
          "they land in the wrong period in any time series.",
        examples: examples(future),
        affected_rows: future.length,
      }),
    );
  }
  const ancient = dates.filter((d) => d < EARLIEST_PLAUSIBLE).sort();
  if (ancient.length > 0) {
    findings.push(
      finding({
        code: "implausible_dates",
        severity: "warning",
        table: ctx.table.name,
        column: name,
        title: "Dates too old to be real",
        detail: counted(ancient.length, "date is", "dates are") + " before 1990.",
        impact: "Often a default like 1900-01-01 standing in for 'unknown'.",
        examples: examples(ancient),
        affected_rows: ancient.length,
      }),
    );
  }
  return findings;
}
