/**
 * CSV through DuckDB, with the exact `read_csv` call DataIntake makes, so both tools see the
 * same rows. The engine (browser worker or Node) is passed in; this module only builds the SQL
 * and turns DuckDB's Arrow result into text rows.
 */

import { MAX_ROWS, type Row } from "../audit/tables";

/** The slice of an Arrow table this module reads. */
export interface ArrowTableLike {
  numRows: number;
  numCols: number;
  getChildAt(index: number): Iterable<string | null | undefined> | null;
}

/** What DuckDB has to offer: register a file, run a query, forget the file. */
export interface CsvEngine {
  register(name: string, bytes: Uint8Array): Promise<void>;
  query(sql: string): Promise<ArrowTableLike>;
  drop(name: string): Promise<void>;
}

/** Settings run once per connection so no query ever tries to download an extension. */
export const ENGINE_SETTINGS = [
  "SET autoinstall_known_extensions = false",
  "SET autoload_known_extensions = false",
];

function quoteLiteral(text: string): string {
  return `'${text.replaceAll("'", "''")}'`;
}

/**
 * The query DataIntake runs: every cell as text, no header (our own detection finds it), and
 * the whole file sampled for the dialect. One row more than the limit is fetched so the shape
 * check can tell "exactly at the limit" from "over it".
 */
export function readCsvSql(registeredName: string): string {
  return (
    `SELECT * FROM read_csv(${quoteLiteral(registeredName)}, ` +
    `all_varchar = true, header = false, sample_size = -1) LIMIT ${MAX_ROWS + 1}`
  );
}

/** Arrow result -> rows of cell text (null for empty cells). */
export function arrowToRows(table: ArrowTableLike): Row[] {
  const rows: Row[] = Array.from({ length: table.numRows }, () => []);
  for (let c = 0; c < table.numCols; c += 1) {
    const column = table.getChildAt(c);
    if (!column) continue;
    let r = 0;
    for (const value of column) {
      const row = rows[r];
      if (row) row.push(value ?? null);
      r += 1;
    }
  }
  return rows;
}

let counter = 0;

/** Read one CSV's bytes into text rows. */
export async function readCsvRows(
  engine: CsvEngine,
  fileName: string,
  bytes: Uint8Array,
): Promise<Row[]> {
  // Reason: register under a plain name; DuckDB treats paths as globs, so a client file named
  // "Sales [2024].csv" would otherwise not be found. The suffix is kept for DuckDB's sniffing.
  counter += 1;
  const dot = fileName.lastIndexOf(".");
  const registered = `upload_${counter}${dot > 0 ? fileName.slice(dot).toLowerCase() : ".csv"}`;
  await engine.register(registered, bytes);
  try {
    return arrowToRows(await engine.query(readCsvSql(registered)));
  } finally {
    await engine.drop(registered);
  }
}
