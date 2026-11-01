/**
 * The audit as HTML: the same layout as DataIntake's report. `renderReportBody` is shown on the
 * page; `renderReportDocument` wraps it into one file with inline styles and no scripts, safe
 * to email. Every value that came from the data goes through `escapeHtml`.
 */

import { countSeverity, type Audit } from "../audit/models";
import { formatFixed, formatGrouped, sortedText } from "../audit/py";
import reportCss from "./report.css?raw";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&#34;",
  "'": "&#39;",
};

/** Escape text for HTML content and attribute values (the same set Jinja escapes). */
export function escapeHtml(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

function share(part: number, whole: number): string {
  return `${formatFixed((part / whole) * 100, 0)}%`;
}

function findingsSection(audit: Audit): string {
  if (audit.findings.length === 0) return "<p>No problems found.</p>";
  return audit.findings
    .map((f) => {
      const where = f.column ? ` &rsaquo; <code>${escapeHtml(f.column)}</code>` : "";
      const examples = f.examples.length
        ? `<div class="examples">${f.examples.map((e) => `<span>${escapeHtml(e)}</span>`).join("")}</div>`
        : "";
      return `<div class="finding ${f.severity}">
  <h3><span class="badge ${f.severity}">${f.severity}</span>${escapeHtml(f.title)}</h3>
  <div class="where">${escapeHtml(f.table)}${where} &middot; ${escapeHtml(f.detail)}</div>
  <p class="impact">${escapeHtml(f.impact)}</p>
  ${examples}
</div>`;
    })
    .join("\n");
}

function kpiSection(audit: Audit): string {
  if (audit.kpis.length === 0) {
    return '<p class="sub">No standard metrics recognised; the shape of these files needs a conversation.</p>';
  }
  return audit.kpis
    .map(
      (k) =>
        `<div class="card"><b>${escapeHtml(k.name)}</b> <span class="where">(${escapeHtml(k.tables.join(", "))})</span><br>${escapeHtml(k.why)}</div>`,
    )
    .join("\n");
}

function joinSection(audit: Audit): string {
  if (audit.joins.length === 0) return '<p class="sub">No shared keys found between files.</p>';
  const rows = audit.joins
    .map(
      (j) =>
        `<tr><td>${escapeHtml(j.left_table)} &rsaquo; <code>${escapeHtml(j.left_column)}</code></td>` +
        `<td>${escapeHtml(j.right_table)} &rsaquo; <code>${escapeHtml(j.right_column)}</code></td>` +
        `<td>${share(j.containment, 1)}</td><td>${j.orphan_values}</td></tr>`,
    )
    .join("\n");
  return `<div class="card scroll joins"><table>
<tr><th>From</th><th>To</th><th>Matched</th><th>No match</th></tr>
${rows}
</table></div>`;
}

function filesSection(audit: Audit): string {
  return audit.tables
    .map((t) => {
      const columns = t.columns
        .map(
          (c) =>
            `<tr><td><code>${escapeHtml(c.name)}</code></td><td>${escapeHtml(c.kind)}</td>` +
            `<td>${t.rows ? share(c.non_empty, t.rows) : "-"}</td><td>${formatGrouped(c.distinct, 0)}</td>` +
            `<td>${c.minimum ? `${escapeHtml(c.minimum)} &ndash; ${escapeHtml(c.maximum ?? "")}` : ""}</td>` +
            `<td>${escapeHtml(c.examples.join(", "))}</td></tr>`,
        )
        .join("\n");
      return `<details>
<summary>${escapeHtml(t.name)}<small>${formatGrouped(t.rows, 0)} rows &middot; ${t.columns.length} columns &middot; ${escapeHtml(t.source)}</small></summary>
<div class="scroll"><table>
<tr><th>Column</th><th>Looks like</th><th>Filled</th><th>Distinct</th><th>Range</th><th>Examples</th></tr>
${columns}
</table></div>
</details>`;
    })
    .join("\n");
}

/** The report's sections, for the page or for the standalone file. */
export function renderReportBody(audit: Audit): string {
  const files = new Set(audit.tables.map((t) => t.source));
  const rows = audit.tables.reduce((sum, t) => sum + t.rows, 0);
  return `<h1>Data audit: ${escapeHtml(audit.client)}</h1>
<p class="sub">${audit.tables.length} tables from ${files.size} files, ${formatGrouped(rows, 0)} rows &middot; data as of ${escapeHtml(audit.as_of)}</p>
<div class="tiles">
  <div class="tile critical"><b>${countSeverity(audit, "critical")}</b><span>critical: fix before any analysis</span></div>
  <div class="tile warning"><b>${countSeverity(audit, "warning")}</b><span>warnings: clean before reporting</span></div>
  <div class="tile info"><b>${countSeverity(audit, "info")}</b><span>notes: worth knowing</span></div>
  <div class="tile"><b>${audit.kpis.length}</b><span>metrics the data can support</span></div>
</div>
<h2>What to fix first</h2>
${findingsSection(audit)}
<h2>What this data can answer</h2>
${kpiSection(audit)}
<h2>How the files connect</h2>
${joinSection(audit)}
<h2>Files</h2>
${filesSection(audit)}`;
}

/** File names the audit read, sorted, for the standalone report's footer. */
function sourceList(audit: Audit): string {
  return sortedText(new Set(audit.tables.map((t) => t.source)))
    .map(escapeHtml)
    .join(", ");
}

/** One HTML file with inline styles, readable offline and safe to email. */
export function renderReportDocument(audit: Audit): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Data audit - ${escapeHtml(audit.client)}</title>
<style>
${reportCss}
</style>
</head>
<body>
<main>
${renderReportBody(audit)}
<footer>Generated in the browser by intake-web, the browser version of DataIntake, from ${sourceList(audit)}. Findings describe the files as received; nothing was changed.</footer>
</main>
</body>
</html>
`;
}
