/** Problems with the shape of a file: title rows, headers, empty columns. */

import { counted, type TableContext } from "../context";
import { finding, type Finding } from "../models";
import { pyRepr } from "../py";

export function check(ctx: TableContext): Finding[] {
  const { table } = ctx;
  const findings: Finding[] = [];
  if (table.headerRow > 0) {
    findings.push(
      finding({
        code: "title_rows",
        severity: "info",
        table: table.name,
        title: "Title rows above the header",
        detail: `The header is on row ${table.headerRow + 1}; the rows above it were skipped.`,
        impact:
          "Fine for this audit, but anything that assumes row 1 is the header " +
          "will read the title as column names.",
      }),
    );
  }
  if (table.renamedColumns.size > 0) {
    const shown = [...table.renamedColumns].map(([renamed, old]) =>
      old ? `${renamed} (was ${pyRepr(old)})` : `${renamed} (was blank)`,
    );
    findings.push(
      finding({
        code: "bad_headers",
        severity: "warning",
        table: table.name,
        title: "Blank, padded or repeated column names",
        detail:
          counted(shown.length, "header was", "headers were") +
          " renamed so every column has a usable name.",
        impact:
          "Repeated names usually mean two different fields share a label; " +
          "someone who knows the export should say which is which.",
        examples: shown.slice(0, 5),
      }),
    );
  }
  const empty = [...ctx.columns].filter(([, column]) => column.kind === "empty").map(([n]) => n);
  if (empty.length > 0 && table.rows.length > 0) {
    findings.push(
      finding({
        code: "empty_columns",
        severity: "info",
        table: table.name,
        title: "Columns with no data",
        detail: counted(empty.length, "column is", "columns are") + " completely empty.",
        impact: "Safe to drop, unless the field was expected to be filled.",
        examples: empty.slice(0, 5),
      }),
    );
  }
  return findings;
}
