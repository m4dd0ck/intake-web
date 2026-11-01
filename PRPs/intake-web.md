# Plan Review Protocol: intake-web

## Purpose

Port DataIntake's first-day audit (https://github.com/m4dd0ck/data-intake) to a static web page
that runs every check in the visitor's browser. A visitor drops CSV and Excel files, sees the
report on the page, and can download it as one self-contained HTML file plus the findings as
JSON. Nothing is uploaded: that is the reason the page exists, so it must be true and tested.

## Core Principles

1. **Parity over novelty**: same finding codes, severities, columns, titles, details, impacts
   and examples as `intake audit` on the same files. A divergence is a decision, written down.
2. **Privacy is enforced, not promised**: a Content Security Policy blocks other origins, the
   engine loads at page start, and a browser test asserts no request after that.
3. **Checks are engine-agnostic**: DuckDB-Wasm and SheetJS turn bytes into text rows; every
   check is plain TypeScript over `string | null` cells, so tests run in Node.

---

## Goal

`npm run lint`, `npm run typecheck`, `npm test` (unit + parity) and `npm run build` pass, and a
Playwright test loads the built page, runs the sample audit and sees findings with no
cross-origin and no post-load requests.

## Why

The owner's portfolio is Python and DuckDB command-line tools with static output. A prospective
client cannot try DataIntake without installing Python. This page lets them run it on their own
exports in a minute, with nothing to trust because nothing leaves their machine.

## What

- [x] TypeScript port of DataIntake's loaders (header detection, header cleaning, limits),
      kinds, the five check modules, relations, KPI rules, profiles and audit ordering.
- [x] CSV reading with DuckDB-Wasm (`read_csv(..., all_varchar = true, header = false,
      sample_size = -1)`, the exact call DataIntake makes); Excel with SheetJS 0.20.3.
- [x] A module Web Worker that owns the engine and posts progress.
- [x] Page: drop zone + file input, client name, export date, hide-examples toggle, "try the
      sample" buttons, progress, report, Blob downloads of HTML and JSON.
- [x] Vitest: each check, loaders, Python-compatible helpers, report/JSON, parity against
      fixtures produced by the Python tool.
- [x] Playwright smoke test against `vite preview`.
- [x] GitHub Pages workflow (not enabled), four-file skeleton, LICENSE.

---

## Success Criteria

### Functional Requirements
- [x] Parity: the TS audit of `sample/shop` and `sample/studio` equals
      `tests/fixtures/{shop,studio}.json` on tables, findings, joins and KPIs.
- [x] The page renders the four report sections and both downloads work.
- [x] Unsupported or unreadable files are listed and do not stop the audit.

### Non-Functional Requirements
- [x] Responsiveness: all parsing and checks run in the worker; the page shows per-file
      progress; a 30 MB CSV completes.
- [x] Privacy: CSP `connect-src 'self'`; no analytics; Playwright asserts zero requests after
      the engine reports ready and none to another origin at any time.
- [x] Safety: every data value HTML-escaped in page and report; report has no `<script>`.
- [x] Accessibility: the drop zone is a labelled button that opens the file picker, works with
      Enter/Space; status is announced via `aria-live`; layout works at 360 px; light and dark.

### Testing Requirements
- [x] One test file per check module, synthetic inputs only (mirroring DataIntake's tests).
- [x] Parity test over both demo businesses.
- [x] Report escaping, self-containment and JSON shape tests.

---

## All Needed Context

### Relevant Documentation

| Document | Purpose | Link |
|----------|---------|------|
| DuckDB-Wasm instantiation | Vite manual bundles via `?url` | https://duckdb.org/docs/stable/clients/wasm/instantiation |
| DuckDB CSV | `read_csv` options | https://duckdb.org/docs/stable/data/csv/overview |
| duckdb-wasm repo | `blocking` export for Node | https://github.com/duckdb/duckdb-wasm |
| SheetJS install | CDN tarball, npm `xlsx` is stale | https://docs.sheetjs.com/docs/getting-started/installation/nodejs/ |
| SheetJS parse options | `dense`, `nodim`, `cellNF` | https://docs.sheetjs.com/docs/api/parse-options |
| SheetJS + Vite | bundling notes | https://docs.sheetjs.com/docs/demos/frontend/bundler/vitejs |
| Vite features | workers, `?url` | https://vite.dev/guide/features |
| Vite static deploy | Pages workflow | https://vite.dev/guide/static-deploy |
| Vitest | config | https://vitest.dev/guide/ |
| Playwright network | `page.on('request')` | https://playwright.dev/docs/network |

### Codebase Structure

```
intake-web/
├── index.html                 # page shell, CSP injected at build
├── vite.config.ts             # base './', base64 sample plugin, CSP plugin, vitest config
├── src/
│   ├── audit/                 # engine-agnostic port of DataIntake
│   │   ├── models.ts          # Audit, Finding, profiles (same field names as Python JSON)
│   │   ├── py.ts              # Python-compatible strip/split/repr/format/round/quantiles
│   │   ├── kinds.ts           # value_kind, analyse_column, parse_number, parse_date
│   │   ├── context.ts         # TableContext, examples, percent, counted
│   │   ├── tables.ts          # build_table, find_header_row, clean_headers, limits
│   │   ├── fuzz.ts            # rapidfuzz ratio / token_sort_ratio (Indel)
│   │   ├── checks/            # structure, missing, formats, duplicates, outliers
│   │   ├── relations.ts       # joins and orphan keys
│   │   ├── kpis.ts            # metric rules
│   │   └── audit.ts           # runAudit, profileTable, withoutExamples
│   ├── load/
│   │   ├── csv.ts             # Arrow result -> text rows; SQL shared by both engines
│   │   ├── excel.ts           # SheetJS workbook -> text rows per sheet
│   │   └── files.ts           # route files by suffix, limits, skipped list
│   ├── report/
│   │   ├── html.ts            # escaped report body + standalone document
│   │   └── json.ts            # Python-shaped JSON
│   ├── worker/audit.worker.ts # owns AsyncDuckDB, runs the audit, posts progress
│   └── ui/                    # main.ts, samples.ts, download.ts, styles.css
├── sample/                    # DataIntake demo exports (synthetic, MIT)
├── tests/                     # vitest; fixtures/ from the Python tool
└── e2e/smoke.spec.ts          # Playwright
```

### Key Files to Understand

| File | Purpose | Must Read Before |
|------|---------|------------------|
| DataIntake `kinds.py` | patterns, majority rule, parsers | kinds.ts |
| DataIntake `checks/*.py` | wording and thresholds | each check |
| DataIntake `relations.py`, `kpis.py` | join and KPI rules | relations.ts, kpis.ts |
| DataIntake `loaders.py` | header detection, Excel cell text | tables.ts, excel.ts |
| DataIntake `templates/report.html.j2` | report layout and CSS | html.ts |

### Known Gotchas

1. **SheetJS on npm is stale (0.18.5)**. Install `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`;
   the lockfile records its integrity hash.
2. **typescript-eslint 8.72 supports TypeScript `<6.1`**. npm `latest` is TypeScript 7; pin 6.0.3.
3. **duckdb-wasm `latest` dist-tag is `1.33.1-dev57.0`** (DuckDB v1.5.4; DataIntake uses
   1.5.6). Pin it exactly. Last non-dev tag 1.32.0 is from 2025-12.
4. **Wasm files are 36-41 MB each.** Ship only the `eh` bundle (wasm exception handling is in
   every current browser); do not import the `mvp` or `coi` files in browser code.
5. **The `blocking` export is the Node path**: `@duckdb/duckdb-wasm/blocking` with `NODE_RUNTIME`
   runs synchronously in Node and is what tests use. In the browser use the documented
   `AsyncDuckDB` with its own worker, created from inside our audit worker (nested workers).
6. **Python semantics to copy exactly**: `str.strip`/`split` whitespace set (wider than JS
   `trim`), `repr` of strings (used in examples), `round`/format half-to-even (use
   `Intl.NumberFormat` with `roundingMode: 'halfEven'`), `statistics.quantiles` "exclusive"
   method with its clamp, `Counter.most_common` tie order (first seen), `sorted` stability with
   `reverse=True`, dict insertion order for repeated column names.
7. **rapidfuzz 3.x has no default processor**: `ratio` and `token_sort_ratio` are case
   sensitive; score = 100 * 2 * LCS / (len1 + len2) on code points.
8. **openpyxl cell text**: dates with a date number format become ISO text, whole floats lose
   `.0`, booleans become `True`/`False`, `""` becomes null. With SheetJS read raw numbers
   (`cellDates: false`, `cellNF: true`) and use `SSF.is_date(z)` + `SSF.parse_date_code(v)`,
   which avoids time zone shifts. Use `dense: true, nodim: true` so a sheet that declares
   `A1:XFD1048576` only costs its real cells.
9. **Empty CSV** reads as zero rows in both DuckDB builds; a table with no rows still appears.
10. **CSP is a `<meta>`**: GitHub Pages cannot set headers. Inject it only at build (dev server
    needs inline HMR). `script-src 'self' 'wasm-unsafe-eval'` is needed for wasm; inline
    `style=""` attributes are blocked, so the page report uses classes only.
11. **Same-origin fetches after load would break the claim**: the sample files are bundled
    into JS as base64 (a small Vite plugin), and the engine starts loading at page start.
12. **DuckDB autoloading**: set `autoinstall_known_extensions` / `autoload_known_extensions`
    to false so a query never tries to fetch an extension.

### Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| @duckdb/duckdb-wasm | 1.33.1-dev57.0 | CSV parsing (same reader as DataIntake) |
| xlsx (SheetJS CDN) | 0.20.3 | Excel parsing |
| vite | 8.3.5 | build, dev server |
| vitest | 5.0.5 | unit and parity tests |
| typescript | 6.0.3 | strict types |
| eslint + typescript-eslint | 10.14.0 / 8.72.1 | lint |
| prettier | 3.9.10 | format |
| @playwright/test | 1.64.1 | smoke test |

---

## Implementation Blueprint

### Data Models

```
Audit (JSON shape identical to DataIntake's model_dump_json):
  client: string; as_of: "YYYY-MM-DD"
  tables: TableProfile[]   {name, source, rows, columns: ColumnProfile[], header_row}
  findings: Finding[]      {code, severity, table, column|null, title, detail, impact,
                            examples: string[], affected_rows: number|null}
  joins: JoinCandidate[]   {left_table, left_column, right_table, right_column,
                            containment, orphan_values}
  kpis: KpiSuggestion[]    {name, tables, why}

RawTable: {name, source, columns: string[], rows: (string|null)[][], headerRow, renamed: Map}
InputFile: {name: string, bytes: Uint8Array}
WorkerMessage: ready | progress{step,total,label} | result{audit, skipped[]} | error{message}
```

Dates are ISO `YYYY-MM-DD` strings throughout (lexical order is date order).

### Task Breakdown

#### Phase 1: Foundation

| # | Task | File(s) | Depends On | Validation |
|---|------|---------|------------|------------|
| 1 | Tooling: tsconfig strict, eslint flat config, prettier, vite + vitest config | root | - | `npm run lint && npm run typecheck` |
| 2 | Python-compatible helpers | `src/audit/py.ts` | 1 | `tests/py.test.ts` |
| 3 | Models, kinds, context | `src/audit/{models,kinds,context}.ts` | 2 | `tests/kinds.test.ts` |
| 4 | Table building (header row, header cleaning, limits) | `src/audit/tables.ts` | 3 | `tests/tables.test.ts` |

#### Phase 2: Core Logic

| # | Task | File(s) | Depends On | Validation |
|---|------|---------|------------|------------|
| 5 | Five checks | `src/audit/checks/*.ts` | 3 | one test file each |
| 6 | Fuzzy ratio, relations, KPIs | `src/audit/{fuzz,relations,kpis}.ts` | 3 | tests |
| 7 | runAudit + profiles + sort + withoutExamples | `src/audit/audit.ts` | 5, 6 | `tests/audit.test.ts` |
| 8 | CSV via DuckDB (shared SQL + Arrow conversion), Excel via SheetJS, file routing | `src/load/*` | 4 | `tests/load.test.ts` |
| 9 | Parity test (Node blocking DuckDB) | `tests/parity.test.ts` | 7, 8 | equals fixtures |
| 10 | Report HTML + JSON | `src/report/*` | 7 | `tests/report.test.ts` |

#### Phase 3: Integration & Testing

| # | Task | File(s) | Depends On | Validation |
|---|------|---------|------------|------------|
| 11 | Worker | `src/worker/audit.worker.ts` | 8, 10 | build |
| 12 | Page | `index.html`, `src/ui/*` | 11 | `npm run dev`, manual |
| 13 | CSP + sample plugin | `vite.config.ts` | 12 | build, e2e |
| 14 | Playwright smoke | `e2e/smoke.spec.ts`, `playwright.config.ts` | 13 | `npm run test:e2e` |
| 15 | Pages workflow, docs, LICENSE | `.github/workflows/pages.yml`, four files | 14 | doc-check |

### Pseudocode / Logic Flow

```
worker on start:
    create AsyncDuckDB from eh bundle (?url); open; disable extension autoload; post ready
worker on "audit" {files, client, asOf, hideExamples}:
    sort files by name (code-point order, like Python's sorted Paths)
    for each file (post progress):
        suffix not in {.csv,.txt,.xlsx,.xlsm} -> skipped "unsupported"
        size > 200 MB -> skipped "too large"
        csv: registerFileBuffer(safe name) ; SELECT * FROM read_csv(..) LIMIT 1_000_001
             -> rows (string|null)[][] ; shape check ; buildTable(stem, rows)
        xlsx: XLSX.read(bytes, {dense, nodim, cellNF}) ; per sheet cellText ; skip empty
        on error -> skipped with message
    no tables -> error "No CSV or Excel files could be read"
    audit = runAudit(tables, client, asOf) ; hideExamples -> withoutExamples
    post result
page:
    start worker at load; status "Loading the audit engine" -> "Ready"
    drop / pick / sample -> read File.arrayBuffer -> post (transfer buffers)
    on result -> innerHTML = renderReportBody(audit) (all values escaped) ; enable downloads
```

Error handling: per-file errors are collected and shown; engine failure shows a message telling
the visitor the browser could not start the engine; nothing retries over the network.

---

## Validation

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

The final gate is every command above passing in one run, plus the owner's doc check over the
four root files.

---

## Anti-Patterns to Avoid

### Do NOT:

1. **Approximate Python formatting with `toFixed`/`toLocaleString` defaults**
   - Why it's bad: half-up rounding and JS whitespace rules change examples and details.
   - Instead: the helpers in `py.ts`, tested against values printed by Python.
2. **Fetch the samples or anything else after load**
   - Why it's bad: breaks the page's one promise.
   - Instead: bundle samples; load the engine at start; test it.
3. **Edit fixtures by hand to make parity pass**
   - Why it's bad: the fixture is the Python tool's answer.
   - Instead: regenerate with the RUNBOOK command, or record the divergence.

### Common Mistakes for This Feature:

- [ ] Inline `style` attributes in page markup (CSP blocks them).
- [ ] Importing `@duckdb/duckdb-wasm` root in Node tests (resolves to the async Node build that
      spawns worker threads); import `@duckdb/duckdb-wasm/blocking`.
- [ ] Copying all three wasm files into `dist/`.

---

## Notes

Confidence for one-pass implementation: 7/10. The port is mechanical but long; the risks are
Python formatting edge cases and the nested DuckDB worker under CSP, both covered by tests.

---

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-11-01 | coding agent | Initial PRP created |
| 2026-11-01 | coding agent | Executed; all deliverables and criteria met (see README History) |
