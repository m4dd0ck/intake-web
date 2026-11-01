/**
 * Turn raw rows from any reader into a table: drop empty rows, find the header, clean names.
 *
 * Everything stays text on purpose: the audit's job is to find out what the data really holds,
 * so no reader is allowed to guess and coerce first.
 */

import type { RawTable } from "./models";
import { strip } from "./py";

export const HEADER_SCAN_ROWS = 20;
// Limits for hostile or accidental giant files; well above any real small-business export.
export const MAX_FILE_BYTES = 200 * 1024 * 1024;
export const MAX_ROWS = 1_000_000;
export const MAX_COLUMNS = 500;

/** Raised when a file exceeds the size, row or column limits. */
export class FileTooLargeError extends Error {
  override name = "FileTooLargeError";
}

export type Row = (string | null)[];

export function checkShape(fileName: string, rows: readonly Row[]): void {
  const width = rows.reduce((widest, row) => Math.max(widest, row.length), 0);
  if (rows.length > MAX_ROWS || width > MAX_COLUMNS) {
    throw new FileTooLargeError(
      `${fileName} exceeds ${MAX_ROWS.toLocaleString("en-US")} rows or ${MAX_COLUMNS} columns; split it first`,
    );
  }
}

function filled(row: readonly (string | null)[]): number {
  return row.filter((cell) => cell !== null && cell !== "").length;
}

/**
 * First row that is filled across most of the table's width.
 *
 * Exports often start with a title and a "generated on" line; those rows fill one or two cells,
 * while the header fills most columns.
 */
export function findHeaderRow(rows: readonly Row[]): number {
  const sample = rows.slice(0, HEADER_SCAN_ROWS);
  const width = sample.reduce((widest, row) => Math.max(widest, filled(row)), 0);
  const index = sample.findIndex((row) => filled(row) >= Math.max(2, width / 2));
  return index === -1 ? 0 : index;
}

/** Trim names, name blanks `unnamed_N` and suffix repeats; report what changed. */
export function cleanHeaders(header: readonly (string | null)[]): {
  columns: string[];
  renamed: Map<string, string>;
} {
  const columns: string[] = [];
  const renamed = new Map<string, string>();
  const seen = new Map<string, number>();
  header.forEach((raw, index) => {
    const original = raw ?? "";
    let name = strip(original) || `unnamed_${index + 1}`;
    const times = seen.get(name);
    if (times === undefined) {
      seen.set(name, 1);
    } else {
      seen.set(name, times + 1);
      name = `${name}_${times + 1}`;
    }
    if (name !== original) renamed.set(name, original);
    columns.push(name);
  });
  return { columns, renamed };
}

/** Build a table from raw rows, as DataIntake's loader does for both CSV and Excel. */
export function buildTable(name: string, source: string, rawRows: readonly Row[]): RawTable {
  const rows = rawRows.filter((row) => row.some((cell) => cell !== null && cell !== ""));
  const headerRow = findHeaderRow(rows);
  const width = rows.reduce((widest, row) => Math.max(widest, row.length), 0);
  const header = rows[headerRow] ?? [];
  const padded = [...header, ...Array<null>(width - header.length).fill(null)];
  const { columns, renamed } = cleanHeaders(padded);
  const body = rows
    .slice(headerRow + 1)
    .map((row) => [...row, ...Array<null>(width - row.length).fill(null)]);
  return { name, source, columns, rows: body, headerRow, renamedColumns: renamed };
}

/** Python `Path.stem`: the name without its last suffix (a leading dot is not a suffix). */
export function stem(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

/** Python `Path.suffix`, lower-cased. */
export function suffix(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(dot).toLowerCase() : "";
}
