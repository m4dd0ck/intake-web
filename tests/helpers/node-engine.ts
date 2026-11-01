/**
 * DuckDB-Wasm's synchronous Node build behind the same `CsvEngine` interface the browser
 * worker uses, so tests read CSVs with the real reader rather than a stand-in.
 */

import { createRequire } from "node:module";
import { createDuckDB, NODE_RUNTIME, VoidLogger } from "@duckdb/duckdb-wasm/blocking";
import { ENGINE_SETTINGS, type CsvEngine } from "../../src/load/csv";

const require = createRequire(import.meta.url);

let engine: Promise<CsvEngine> | undefined;

async function start(): Promise<CsvEngine> {
  const bundle = (name: string): string => require.resolve(`@duckdb/duckdb-wasm/dist/${name}`);
  const db = await createDuckDB(
    {
      mvp: { mainModule: bundle("duckdb-mvp.wasm"), mainWorker: "" },
      eh: { mainModule: bundle("duckdb-eh.wasm"), mainWorker: "" },
    },
    new VoidLogger(),
    NODE_RUNTIME,
  );
  await db.instantiate(() => undefined);
  db.open({});
  const connection = db.connect();
  for (const setting of ENGINE_SETTINGS) connection.query(setting);
  return {
    register: (name, bytes) => {
      db.registerFileBuffer(name, bytes);
      return Promise.resolve();
    },
    query: (sql) => Promise.resolve(connection.query(sql)),
    drop: (name) => {
      db.dropFile(name);
      return Promise.resolve();
    },
  };
}

/** One engine per test worker; instantiating the wasm takes about a second. */
export function nodeEngine(): Promise<CsvEngine> {
  engine ??= start();
  return engine;
}
