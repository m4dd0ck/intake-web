import { describe, expect, it } from "vitest";
import { runAudit } from "../src/audit/audit";
import { buildTable } from "../src/audit/tables";
import { escapeHtml, renderReportBody, renderReportDocument } from "../src/report/html";
import { renderFindingsJson } from "../src/report/json";
import { auditSample, fixtureText } from "./helpers/samples";

const hostile = runAudit(
  [
    buildTable("notes", "notes.csv", [
      ["id", "note"],
      ["1", "<script>alert(1)</script>"],
      ["1", "x"],
    ]),
  ],
  "Acme <Ltd>",
  "2024-06-30",
);

describe("HTML report", () => {
  it("escapes every value from the data", () => {
    const html = renderReportDocument(hostile);
    expect(html).not.toContain("<script>alert(1)");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("Acme &lt;Ltd&gt;");
    expect(escapeHtml(`"'&`)).toBe("&#34;&#39;&amp;");
  });

  it("is one file with inline styles, no scripts and no external assets", () => {
    const html = renderReportDocument(hostile);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<style>");
    expect(html).not.toMatch(/<script|<link|src=|href=|@import|url\(/i);
  });

  it("uses classes only, so the page's Content Security Policy allows it", () => {
    expect(renderReportBody(hostile)).not.toContain("style=");
  });

  it("shows the sample store's headline numbers and sections", async () => {
    const body = renderReportBody(await auditSample("shop"));
    expect(body).toContain("3 tables from 3 files, 779 rows");
    expect(body).toMatch(/tile critical"><b>3</);
    expect(body).toMatch(/tile warning"><b>12</);
    for (const heading of [
      "What to fix first",
      "What this data can answer",
      "How the files connect",
      "Files",
    ]) {
      expect(body).toContain(`<h2>${heading}</h2>`);
    }
    expect(body).toContain("<td>95%</td><td>6</td>");
  });

  it("says so when there is nothing to report", () => {
    const clean = runAudit(
      [
        buildTable("t", "t.csv", [
          ["a", "b"],
          ["1", "x"],
        ]),
      ],
      "Co",
      "2024-01-01",
    );
    const body = renderReportBody(clean);
    expect(body).toContain("No problems found.");
    expect(body).toContain("No shared keys found between files.");
  });
});

describe("findings JSON", () => {
  it("keeps DataIntake's key order and prints whole shares as floats", () => {
    const json = renderFindingsJson(hostile);
    expect(Object.keys(JSON.parse(json) as object)).toEqual([
      "client",
      "as_of",
      "tables",
      "findings",
      "joins",
      "kpis",
    ]);
    expect(json.endsWith("}\n")).toBe(true);
  });

  it.each(["shop", "studio"] as const)(
    "writes the %s sample's file byte for byte like intake audit --json",
    async (business) => {
      expect(renderFindingsJson(await auditSample(business))).toBe(fixtureText(business));
    },
  );
});
