/**
 * The TypeScript audit must agree with DataIntake on its own demo exports. The fixtures are the
 * Python tool's `--json` output for the files in `sample/` (RUNBOOK.md, Refresh the fixtures).
 */

import { describe, expect, it } from "vitest";
import type { Finding } from "../src/audit/models";
import { auditSample, BUSINESSES, fixture, type Business } from "./helpers/samples";

const businesses = Object.keys(BUSINESSES) as Business[];
const key = (f: Finding): string => `${f.severity} ${f.table} ${f.column ?? "-"} ${f.code}`;

describe.each(businesses)("parity with DataIntake: %s", (business) => {
  it("finds the same issues, in order, with the same severities and columns", async () => {
    const audit = await auditSample(business);
    expect(audit.findings.map(key)).toEqual(fixture(business).findings.map(key));
  });

  it("words every finding the same way, examples and row counts included", async () => {
    expect((await auditSample(business)).findings).toEqual(fixture(business).findings);
  });

  it("profiles every table the same way", async () => {
    expect((await auditSample(business)).tables).toEqual(fixture(business).tables);
  });

  it("finds the same joins and metrics", async () => {
    const audit = await auditSample(business);
    expect(audit.joins).toEqual(fixture(business).joins);
    expect(audit.kpis).toEqual(fixture(business).kpis);
  });
});
