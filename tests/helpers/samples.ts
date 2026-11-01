import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runAudit } from "../../src/audit/audit";
import type { Audit } from "../../src/audit/models";
import { loadFiles } from "../../src/load/files";
import { nodeEngine } from "./node-engine";

export const ROOT = join(import.meta.dirname, "..", "..");
export const BUSINESSES = { shop: "Pinecrest Goods", studio: "Northline Studio" } as const;
export type Business = keyof typeof BUSINESSES;
export const SAMPLE_AS_OF = "2024-12-31";

/** Audit one of the bundled DataIntake demo folders, as the page's sample button does. */
export async function auditSample(business: Business): Promise<Audit> {
  const folder = join(ROOT, "sample", business);
  const files = readdirSync(folder).map((name) => ({
    name,
    bytes: new Uint8Array(readFileSync(join(folder, name))),
  }));
  const { tables, skipped } = await loadFiles(files, await nodeEngine());
  if (skipped.length) throw new Error(`sample files skipped: ${JSON.stringify(skipped)}`);
  return runAudit(tables, BUSINESSES[business], SAMPLE_AS_OF);
}

export function fixtureText(business: Business): string {
  return readFileSync(join(ROOT, "tests", "fixtures", `${business}.json`), "utf8");
}

export function fixture(business: Business): Audit {
  return JSON.parse(fixtureText(business)) as Audit;
}
