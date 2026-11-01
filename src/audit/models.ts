/**
 * Data shapes shared by loading, checks, audit and report. Field names follow DataIntake's JSON
 * (snake_case) so a findings file from either tool reads the same.
 */

/** One CSV file or Excel sheet as text, after header detection. */
export interface RawTable {
  name: string;
  /** File name the table came from. */
  source: string;
  columns: string[];
  /** Cell text aligned to `columns`; null for empty cells. */
  rows: (string | null)[][];
  /** 0-based row (after dropping empty rows) where the header was found. */
  headerRow: number;
  /** New column name -> original header text, in header order. */
  renamedColumns: Map<string, string>;
}

export type Severity = "critical" | "warning" | "info";

export const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

/** One problem, stated for a client: what, where, examples, and what it means. */
export interface Finding {
  code: string;
  severity: Severity;
  table: string;
  column: string | null;
  title: string;
  detail: string;
  impact: string;
  examples: string[];
  affected_rows: number | null;
}

export interface ColumnProfile {
  name: string;
  kind: string;
  non_empty: number;
  distinct: number;
  examples: string[];
  minimum: string | null;
  maximum: string | null;
}

export interface TableProfile {
  name: string;
  source: string;
  rows: number;
  columns: ColumnProfile[];
  header_row: number;
}

/** A column pair that looks like a key relationship between two tables. */
export interface JoinCandidate {
  left_table: string;
  left_column: string;
  right_table: string;
  right_column: string;
  /** Share of distinct left values found on the right. */
  containment: number;
  /** Distinct left values with no match. */
  orphan_values: number;
}

export interface KpiSuggestion {
  name: string;
  tables: string[];
  why: string;
}

export interface Audit {
  client: string;
  /** Export date, YYYY-MM-DD; later dates are flagged. */
  as_of: string;
  tables: TableProfile[];
  findings: Finding[];
  joins: JoinCandidate[];
  kpis: KpiSuggestion[];
}

/** Build a finding with DataIntake's defaults (no column, no examples, no row count). */
export function finding(
  fields: Omit<Finding, "column" | "examples" | "affected_rows"> &
    Partial<Pick<Finding, "column" | "examples" | "affected_rows">>,
): Finding {
  return { column: null, examples: [], affected_rows: null, ...fields };
}

export function countSeverity(audit: Audit, severity: Severity): number {
  return audit.findings.filter((item) => item.severity === severity).length;
}
