/** Page wiring: collect files, hand them to the audit worker, show and offer the report. */

import "../report/report.css";
import "./page.css";
import type { Audit } from "../audit/models";
import type { SkippedFile } from "../load/files";
import { escapeHtml, renderReportBody, renderReportDocument } from "../report/html";
import { renderFindingsJson } from "../report/json";
import type { AuditRequest, WorkerMessage } from "../worker/messages";
import { downloadBlob, downloadText, slug } from "./download";
import { SAMPLES, sampleFile, sampleFiles } from "./samples";

function element<T extends HTMLElement>(id: string, type: new () => T): T {
  const found = document.getElementById(id);
  if (!(found instanceof type)) throw new Error(`#${id} is missing or not a ${type.name}`);
  return found;
}

const ui = {
  engine: element("engine-status", HTMLParagraphElement),
  client: element("client", HTMLInputElement),
  asOf: element("as-of", HTMLInputElement),
  hideExamples: element("hide-examples", HTMLInputElement),
  dropZone: element("drop-zone", HTMLButtonElement),
  fileInput: element("file-input", HTMLInputElement),
  sampleFiles: element("sample-files", HTMLParagraphElement),
  progressPanel: element("progress-panel", HTMLElement),
  progressLabel: element("progress-label", HTMLParagraphElement),
  progress: element("progress", HTMLProgressElement),
  notice: element("notice", HTMLDivElement),
  result: element("result", HTMLElement),
  report: element("report", HTMLDivElement),
};

let current: Audit | null = null;
let busy = false;

function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

// Reason: the worker starts DuckDB immediately, so every fetch happens while the page loads
// and none after a visitor has chosen files.
const worker = new Worker(new URL("../worker/audit.worker.ts", import.meta.url), {
  type: "module",
});
worker.addEventListener("message", (event: MessageEvent<WorkerMessage>) => {
  onWorkerMessage(event.data);
});
worker.addEventListener("error", () => {
  ui.engine.textContent = "The audit engine could not start in this browser.";
  ui.engine.classList.add("failed");
});

function onWorkerMessage(message: WorkerMessage): void {
  switch (message.type) {
    case "ready":
      ui.engine.textContent = "Ready. From here on, nothing leaves this page.";
      ui.engine.classList.add("ready");
      document.body.dataset.engine = "ready";
      break;
    case "engine-failed":
      ui.engine.textContent =
        "The audit engine could not start in this browser. A current Chrome, Edge, Firefox " +
        `or Safari is needed. (${message.message})`;
      ui.engine.classList.add("failed");
      break;
    case "progress":
      ui.progressLabel.textContent = message.label;
      ui.progress.max = Math.max(message.total, 1);
      ui.progress.value = message.done;
      break;
    case "result":
      finish();
      showSkipped(message.skipped);
      showReport(message.audit);
      break;
    case "error":
      finish();
      showNotice(message.message, message.skipped);
      break;
  }
}

function finish(): void {
  busy = false;
  ui.progressPanel.hidden = true;
  document.body.removeAttribute("aria-busy");
}

function skippedList(skipped: SkippedFile[]): string {
  const items = skipped.map(
    (s) => `<li><b>${escapeHtml(s.file)}</b>: ${escapeHtml(s.reason)}</li>`,
  );
  return `<ul>${items.join("")}</ul>`;
}

function showNotice(message: string, skipped: SkippedFile[]): void {
  ui.notice.innerHTML = `<p>${escapeHtml(message)}</p>${skipped.length ? skippedList(skipped) : ""}`;
  ui.notice.hidden = false;
}

function showSkipped(skipped: SkippedFile[]): void {
  if (skipped.length === 0) return;
  const count = skipped.length === 1 ? "1 file was" : `${skipped.length} files were`;
  showNotice(`${count} left out of the audit:`, skipped);
}

function showReport(audit: Audit): void {
  current = audit;
  // Reason: every value from the data is escaped by the renderer before it reaches innerHTML.
  ui.report.innerHTML = renderReportBody(audit, 1);
  ui.result.hidden = false;
  ui.report.focus();
}

function startAudit(files: File[], client: string, asOf: string): void {
  if (files.length === 0 || busy) return;
  busy = true;
  current = null;
  ui.result.hidden = true;
  ui.notice.hidden = true;
  ui.progressPanel.hidden = false;
  ui.progressLabel.textContent =
    document.body.dataset.engine === "ready" ? "Starting" : "Waiting for the audit engine";
  ui.progress.removeAttribute("value");
  document.body.setAttribute("aria-busy", "true");
  const request: AuditRequest = {
    type: "audit",
    files,
    client: client.trim() || "Client",
    asOf: asOf || today(),
    hideExamples: ui.hideExamples.checked,
  };
  worker.postMessage(request);
}

function auditChosenFiles(files: FileList | null): void {
  startAudit(files ? [...files] : [], ui.client.value, ui.asOf.value);
}

ui.asOf.value = today();

ui.dropZone.addEventListener("click", () => {
  ui.fileInput.click();
});
ui.fileInput.addEventListener("change", () => {
  auditChosenFiles(ui.fileInput.files);
  ui.fileInput.value = "";
});
for (const type of ["dragenter", "dragover"] as const) {
  ui.dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    ui.dropZone.classList.add("over");
  });
}
for (const type of ["dragleave", "drop"] as const) {
  ui.dropZone.addEventListener(type, () => {
    ui.dropZone.classList.remove("over");
  });
}
ui.dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  auditChosenFiles(event.dataTransfer?.files ?? null);
});
// Reason: a file dropped next to the zone would otherwise make the browser open it.
window.addEventListener("dragover", (event) => {
  event.preventDefault();
});
window.addEventListener("drop", (event) => {
  event.preventDefault();
});

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-sample]")) {
  button.addEventListener("click", () => {
    const sample = button.dataset.sample === "studio" ? SAMPLES.studio : SAMPLES.shop;
    ui.client.value = sample.client;
    ui.asOf.value = sample.asOf;
    startAudit(sampleFiles(sample), sample.client, sample.asOf);
  });
}

// Offer the raw sample files too, so a visitor can see exactly what went in.
const links = Object.entries(SAMPLES).flatMap(([key, sample]) =>
  Object.entries(sample.files).map(([name, data]) => {
    const link = document.createElement("button");
    link.type = "button";
    link.className = "link";
    link.textContent = `${key}/${name}`;
    link.addEventListener("click", () => {
      downloadBlob(name, sampleFile(name, data));
    });
    return link;
  }),
);
ui.sampleFiles.append("Sample files: ");
links.forEach((link, index) => {
  if (index) ui.sampleFiles.append(" · ");
  ui.sampleFiles.append(link);
});

element("download-html", HTMLButtonElement).addEventListener("click", () => {
  if (current) {
    downloadText(
      `data-audit-${slug(current.client)}.html`,
      renderReportDocument(current),
      "text/html",
    );
  }
});
element("download-json", HTMLButtonElement).addEventListener("click", () => {
  if (current) {
    downloadText(
      `findings-${slug(current.client)}.json`,
      renderFindingsJson(current),
      "application/json",
    );
  }
});
element("start-over", HTMLButtonElement).addEventListener("click", () => {
  ui.result.hidden = true;
  ui.notice.hidden = true;
  current = null;
  ui.dropZone.focus();
});
