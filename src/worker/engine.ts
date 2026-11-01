/**
 * DuckDB-Wasm in the browser, behind the `CsvEngine` interface. Only the `eh` bundle is
 * shipped: wasm exception handling is in every current browser, and each bundle is ~36 MB.
 */

import * as duckdb from "@duckdb/duckdb-wasm";
import ehWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";
import ehWasm from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import { ENGINE_SETTINGS, type CsvEngine } from "../load/csv";

/** Start DuckDB in its own worker (nested inside the audit worker) and return an engine. */
export async function startEngine(): Promise<CsvEngine> {
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), new Worker(ehWorker));
  await db.instantiate(ehWasm);
  await db.open({});
  const connection = await db.connect();
  for (const setting of ENGINE_SETTINGS) await connection.query(setting);
  return {
    register: (name, bytes) => db.registerFileBuffer(name, bytes),
    query: (sql) => connection.query(sql),
    drop: async (name) => {
      await db.dropFile(name);
    },
  };
}
