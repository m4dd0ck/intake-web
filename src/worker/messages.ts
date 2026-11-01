/** Messages between the page and the audit worker. */

import type { Audit } from "../audit/models";
import type { SkippedFile } from "../load/files";

export interface AuditRequest {
  type: "audit";
  files: File[];
  client: string;
  asOf: string;
  hideExamples: boolean;
}

export type WorkerMessage =
  | { type: "ready" }
  | { type: "engine-failed"; message: string }
  | { type: "progress"; label: string; done: number; total: number }
  | { type: "result"; audit: Audit; skipped: SkippedFile[] }
  | { type: "error"; message: string; skipped: SkippedFile[] };
