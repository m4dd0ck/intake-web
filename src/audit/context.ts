/** A table with each column analysed once, plus the wording helpers every check shares. */

import { analyseColumn, type ColumnAnalysis } from "./kinds";
import type { RawTable } from "./models";
import { formatFixed, pyRepr, strip } from "./py";

export const MAX_EXAMPLES = 5;

export interface TableContext {
  table: RawTable;
  /** Column name -> analysis, in header order (a repeated name keeps its first position). */
  columns: Map<string, ColumnAnalysis>;
  /** Export date, YYYY-MM-DD. */
  asOf: string;
}

export function buildContext(table: RawTable, asOf: string): TableContext {
  const columns = new Map<string, ColumnAnalysis>();
  table.columns.forEach((name, index) => {
    columns.set(name, analyseColumn(name, columnValues(table, index)));
  });
  return { table, columns, asOf };
}

function columnValues(table: RawTable, index: number): (string | null)[] {
  return table.rows.map((row) => row[index] ?? null);
}

/** Values of a column by name (the first column with that name, as in DataIntake). */
export function values(ctx: TableContext, column: string): (string | null)[] {
  return columnValues(ctx.table, ctx.table.columns.indexOf(column));
}

/** First few distinct values as display strings, each cut to 40 characters. */
export function examples(items: Iterable<unknown>, limit = MAX_EXAMPLES): string[] {
  const seen: string[] = [];
  for (const item of items) {
    let text = typeof item === "string" && item !== strip(item) ? pyRepr(item) : String(item);
    const chars = Array.from(text);
    if (chars.length > 40) text = chars.slice(0, 37).join("") + "...";
    if (!seen.includes(text)) seen.push(text);
    if (seen.length === limit) break;
  }
  return seen;
}

export function percent(part: number, whole: number): string {
  return whole ? `${formatFixed((100 * part) / whole, 0)}%` : "0%";
}

/** `1 row is` / `3 rows are`: the count with matching wording. */
export function counted(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
