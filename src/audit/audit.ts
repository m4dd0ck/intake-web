/** Run every check over a set of tables and collect the results into one Audit. */

import * as duplicates from "./checks/duplicates";
import * as formats from "./checks/formats";
import * as missing from "./checks/missing";
import * as outliers from "./checks/outliers";
import * as structure from "./checks/structure";
import { buildContext, examples, values as columnValues, type TableContext } from "./context";
import { isBlank, parseDate, parseNumber } from "./kinds";
import { suggest } from "./kpis";
import {
  SEVERITY_ORDER,
  type Audit,
  type ColumnProfile,
  type Finding,
  type RawTable,
  type TableProfile,
} from "./models";
import { compareText, formatGrouped, strip } from "./py";
import { findJoins } from "./relations";

const CHECKS = [structure.check, missing.check, formats.check, duplicates.check, outliers.check];

/** Sort order DataIntake uses: severity, then table, column and code. */
export function compareFindings(a: Finding, b: Finding): number {
  return (
    SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
    compareText(a.table, b.table) ||
    compareText(a.column ?? "", b.column ?? "") ||
    compareText(a.code, b.code)
  );
}

/**
 * Audit tables loaded from a client's files.
 *
 * Args:
 *   tables: Tables in file-name order.
 *   client: Name shown on the report.
 *   asOf: Export date (YYYY-MM-DD); dates after it are flagged.
 *
 * Returns: the audit, findings most severe first.
 */
export function runAudit(tables: readonly RawTable[], client: string, asOf: string): Audit {
  const contexts = tables.map((table) => buildContext(table, asOf));
  const findings = contexts.flatMap((ctx) => CHECKS.flatMap((check) => check(ctx)));
  const { joins, findings: joinFindings } = findJoins(contexts);
  findings.push(...joinFindings);
  findings.sort(compareFindings);
  return {
    client,
    as_of: asOf,
    tables: contexts.map(profileTable),
    findings,
    joins,
    kpis: suggest(contexts),
  };
}

export function profileTable(ctx: TableContext): TableProfile {
  const columns: ColumnProfile[] = [...ctx.columns].map(([name, column]) => {
    const present = columnValues(ctx, name)
      .filter((v): v is string => !isBlank(v) && v !== "")
      .map(strip);
    const [minimum, maximum] = range(column.kind, present);
    return {
      name,
      kind: column.kind,
      non_empty: column.nonBlank,
      distinct: column.distinct,
      examples: examples(present, 3),
      minimum,
      maximum,
    };
  });
  return {
    name: ctx.table.name,
    source: ctx.table.source,
    rows: ctx.table.rows.length,
    columns,
    header_row: ctx.table.headerRow,
  };
}

function range(kind: string, present: string[]): [string | null, string | null] {
  if (kind === "date") {
    const dates = present.map(parseDate).filter((d): d is string => d !== null);
    if (dates.length === 0) return [null, null];
    dates.sort();
    return [dates[0] ?? null, dates[dates.length - 1] ?? null];
  }
  if (["integer", "decimal", "currency", "percent"].includes(kind)) {
    const numbers = present.map(parseNumber).filter((n): n is number => n !== null);
    if (numbers.length === 0) return [null, null];
    // Reason: reduce, not Math.min(...numbers), which overflows the stack on a million rows.
    const low = numbers.reduce((a, b) => Math.min(a, b));
    const high = numbers.reduce((a, b) => Math.max(a, b));
    return [formatGrouped(low, 2), formatGrouped(high, 2)];
  }
  return [null, null];
}

/** Copy of the audit with every example value removed, for reports that leave the client. */
export function withoutExamples(audit: Audit): Audit {
  return {
    ...audit,
    findings: audit.findings.map((item) => ({ ...item, examples: [] })),
    tables: audit.tables.map((table) => ({
      ...table,
      columns: table.columns.map((column) => ({
        ...column,
        examples: [],
        minimum: null,
        maximum: null,
      })),
    })),
  };
}
