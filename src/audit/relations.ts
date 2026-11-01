/** How files relate: likely join keys, and keys that point at nothing. */

import { counted, examples, values as columnValues, type TableContext } from "./context";
import { ratio } from "./fuzz";
import { isBlank, type ColumnAnalysis } from "./kinds";
import { finding, type Finding, type JoinCandidate } from "./models";
import { pyRound, sortedText, strip } from "./py";

const MIN_CONTAINMENT = 0.5;
const NAME_SIMILARITY = 85;
const TEXTUAL_KINDS = new Set(["id", "integer", "text", "category", "email"]);

/** `client_id` and `Client ID` both become `client`. */
export function keyName(column: string): string {
  let name = column.toLowerCase().replaceAll(" ", "_");
  for (const ending of ["_id", "id", "_code", "_no"]) {
    if (name.endsWith(ending)) name = name.slice(0, -ending.length);
  }
  return name.replace(/^_+|_+$/g, "");
}

function distinctValues(ctx: TableContext, column: string): Set<string> {
  return new Set(
    columnValues(ctx, column)
      .filter((v): v is string => !isBlank(v) && v !== "")
      .map((v) => strip(v).toLowerCase()),
  );
}

/** Nearly unique values, like a primary key another file could refer to. */
function isKey(column: ColumnAnalysis): boolean {
  return (
    TEXTUAL_KINDS.has(column.kind) &&
    column.distinct >= 0.9 * column.nonBlank &&
    0.9 * column.nonBlank > 0
  );
}

/** Column pairs where one side looks like a key the other side refers to. */
export function findJoins(contexts: readonly TableContext[]): {
  joins: JoinCandidate[];
  findings: Finding[];
} {
  const joins: JoinCandidate[] = [];
  const findings: Finding[] = [];
  contexts.forEach((left, i) => {
    contexts.forEach((right, j) => {
      if (i === j) return;
      for (const [rightName, rightColumn] of right.columns) {
        if (!isKey(rightColumn)) continue;
        const rightValues = distinctValues(right, rightName);
        for (const [leftName, leftColumn] of left.columns) {
          const similar = ratio(keyName(leftName), keyName(rightName));
          if (!TEXTUAL_KINDS.has(leftColumn.kind) || similar < NAME_SIMILARITY) continue;
          const leftValues = distinctValues(left, leftName);
          if (leftValues.size === 0) continue;
          const matched = [...leftValues].filter((v) => rightValues.has(v)).length;
          const containment = matched / leftValues.size;
          if (containment < MIN_CONTAINMENT) continue;
          const orphans = sortedText([...leftValues].filter((v) => !rightValues.has(v)));
          joins.push({
            left_table: left.table.name,
            left_column: leftName,
            right_table: right.table.name,
            right_column: rightName,
            containment: pyRound(containment, 3),
            orphan_values: orphans.length,
          });
          if (orphans.length > 0) {
            findings.push(orphanFinding(left, leftName, right, rightName, orphans));
          }
        }
      }
    });
  });
  return { joins, findings };
}

function orphanFinding(
  left: TableContext,
  column: string,
  right: TableContext,
  rightColumn: string,
  orphans: string[],
): Finding {
  return finding({
    code: "orphan_keys",
    severity: "warning",
    table: left.table.name,
    column,
    title: `Values with no match in ${right.table.name}`,
    detail:
      counted(orphans.length, `${column} value does`, `${column} values do`) +
      ` not exist in ${right.table.name}.${rightColumn}.`,
    impact:
      "Rows with these values drop out of any report that joins the two files, " +
      "usually because the reference list is out of date.",
    examples: examples(orphans),
    affected_rows: orphans.length,
  });
}
