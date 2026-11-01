/**
 * The audit as JSON in the shape `intake audit --json` writes: same keys, same order, two-space
 * indent and a trailing newline, so files from either tool can be diffed.
 */

import type { Audit } from "../audit/models";

/** JSON text matching DataIntake's `Audit.model_dump_json(indent=2)` plus newline. */
export function renderFindingsJson(audit: Audit): string {
  const ordered = {
    client: audit.client,
    as_of: audit.as_of,
    tables: audit.tables.map((t) => ({
      name: t.name,
      source: t.source,
      rows: t.rows,
      columns: t.columns.map((c) => ({
        name: c.name,
        kind: c.kind,
        non_empty: c.non_empty,
        distinct: c.distinct,
        examples: c.examples,
        minimum: c.minimum,
        maximum: c.maximum,
      })),
      header_row: t.header_row,
    })),
    findings: audit.findings.map((f) => ({
      code: f.code,
      severity: f.severity,
      table: f.table,
      column: f.column,
      title: f.title,
      detail: f.detail,
      impact: f.impact,
      examples: f.examples,
      affected_rows: f.affected_rows,
    })),
    joins: audit.joins.map((j) => ({
      left_table: j.left_table,
      left_column: j.left_column,
      right_table: j.right_table,
      right_column: j.right_column,
      containment: j.containment,
      orphan_values: j.orphan_values,
    })),
    kpis: audit.kpis.map((k) => ({ name: k.name, tables: k.tables, why: k.why })),
  };
  // Reason: containment is a float in Python, so a whole share prints as 1.0, not 1.
  return (
    JSON.stringify(ordered, null, 2).replace(/("containment": )(-?\d+)(,?)$/gm, "$1$2.0$3") + "\n"
  );
}
