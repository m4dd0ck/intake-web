import { buildContext, type TableContext } from "../../src/audit/context";
import type { Finding, RawTable } from "../../src/audit/models";

export const AS_OF = "2024-06-30";

export function table(
  columns: string[],
  rows: (string | null)[][],
  name = "t",
  extra: Partial<RawTable> = {},
): RawTable {
  return {
    name,
    source: `${name}.csv`,
    columns,
    rows,
    headerRow: 0,
    renamedColumns: new Map(),
    ...extra,
  };
}

export function context(columns: string[], rows: (string | null)[][], name = "t"): TableContext {
  return buildContext(table(columns, rows, name), AS_OF);
}

export function codes(findings: Finding[]): Set<string> {
  return new Set(findings.map((f) => f.code));
}

export function byCode(findings: Finding[], code: string): Finding {
  const found = findings.find((f) => f.code === code);
  if (!found) throw new Error(`no ${code} finding in ${[...codes(findings)].join(", ")}`);
  return found;
}
