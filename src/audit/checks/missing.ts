/** Missing data: empty cells and the placeholders people type instead. */

import { counted, examples, percent, type TableContext } from "../context";
import { finding, type Finding } from "../models";

const HIGH_MISSING = 0.2;

export function check(ctx: TableContext): Finding[] {
  const findings: Finding[] = [];
  const total = ctx.table.rows.length;
  for (const [name, column] of ctx.columns) {
    if (column.kind === "empty" || !total) continue; // structure check reports empty columns
    const placeholders = [...column.blankTokens.values()].reduce((sum, n) => sum + n, 0);
    if (placeholders) {
      findings.push(
        finding({
          code: "blank_placeholders",
          severity: "warning",
          table: ctx.table.name,
          column: name,
          title: "Missing values written as text",
          detail:
            counted(placeholders, "cell holds a placeholder", "cells hold placeholders") +
            " instead of being empty.",
          impact:
            "Tools will treat these as real values: counts of distinct values " +
            "and joins on this column will be wrong until they are blanked.",
          examples: examples(column.blankTokens.keys()),
          affected_rows: placeholders,
        }),
      );
    }
    const missing = total - column.nonBlank;
    if (missing / total >= HIGH_MISSING) {
      findings.push(
        finding({
          code: "high_missing",
          severity: missing / total < 0.6 ? "warning" : "info",
          table: ctx.table.name,
          column: name,
          title: `${percent(missing, total)} of values are missing`,
          detail: `${missing} of ${total} ${total === 1 ? "row has" : "rows have"} no ${name}.`,
          impact:
            "Any breakdown by this column will leave these rows out or lump " +
            "them into an unknown bucket.",
          affected_rows: missing,
        }),
      );
    }
  }
  return findings;
}
