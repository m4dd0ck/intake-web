/**
 * Runs the whole audit off the page's main thread: starts DuckDB as soon as the page loads (so
 * every network fetch happens before any file is chosen), then reads, checks and reports.
 */

import { runAudit, withoutExamples } from "../audit/audit";
import type { CsvEngine } from "../load/csv";
import { loadFiles, type InputFile } from "../load/files";
import type { AuditRequest, WorkerMessage } from "./messages";
import { startEngine } from "./engine";

const scope = self as unknown as DedicatedWorkerGlobalScope;

function post(message: WorkerMessage): void {
  scope.postMessage(message);
}

const engine: Promise<CsvEngine> = startEngine();
engine.then(
  () => {
    post({ type: "ready" });
  },
  (error: unknown) => {
    post({
      type: "engine-failed",
      message: error instanceof Error ? error.message : String(error),
    });
  },
);

async function readInputs(files: File[]): Promise<InputFile[]> {
  return Promise.all(
    files.map(async (file) => ({
      name: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    })),
  );
}

async function handle(request: AuditRequest): Promise<void> {
  post({ type: "progress", label: "Opening files", done: 0, total: request.files.length });
  const inputs = await readInputs(request.files);
  const { tables, skipped } = await loadFiles(inputs, await engine, (done, total, fileName) => {
    const label = fileName ? `Reading ${fileName}` : "Checking";
    post({ type: "progress", label, done, total });
  });
  if (tables.length === 0) {
    post({ type: "error", message: "None of these files could be read as CSV or Excel.", skipped });
    return;
  }
  post({
    type: "progress",
    label: `Checking ${tables.length} ${tables.length === 1 ? "table" : "tables"}`,
    done: request.files.length,
    total: request.files.length,
  });
  const audit = runAudit(tables, request.client, request.asOf);
  post({ type: "result", audit: request.hideExamples ? withoutExamples(audit) : audit, skipped });
}

scope.addEventListener("message", (event: MessageEvent<AuditRequest>) => {
  handle(event.data).catch((error: unknown) => {
    post({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
      skipped: [],
    });
  });
});
