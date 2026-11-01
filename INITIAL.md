# Feature Request: intake-web

## FEATURE

A static web page where a visitor drops CSV and Excel files and gets DataIntake's first-day data
audit, computed entirely in the browser. Files never leave the machine: after the page and its
engine have loaded there are no network requests, no analytics and no uploads. It is for
prospective freelance clients and hiring managers who want to try the audit on their own files
with no install and no trust required; it ports the Python tool DataIntake
(https://github.com/m4dd0ck/data-intake) so the two tools agree on every finding.

---

## EXAMPLES

### Example 1: Try the sample

**Input:**
```
Visitor opens the page and clicks "Try the sample store" (DataIntake's synthetic shop exports:
orders.csv, products.csv, customers.xlsx), export date 2024-12-31.
```

**Output:**
```
3 tables, 3 critical, 12 warnings, 3 notes
What to fix first:
  CRITICAL  Rows repeated exactly            orders · 12 rows are exact copies of another row.
  CRITICAL  The same ID appears on different rows   orders › order_id
  CRITICAL  More than one currency in the same column   products › price · Found EUR, USD.
  ...
What this data can answer: Revenue and orders by month, ...
How the files connect: orders › customer_id -> customers › customer_id, 95% matched, 6 no match
Files: per-table column profile (kind, filled, distinct, range, examples)
Buttons: Download report (.html), Download findings (.json)
```

### Example 2: Own files

**Input:**
```
Visitor drops invoices.xlsx (two sheets) and clients.csv onto the drop zone, or picks them with
the keyboard-operable file picker.
```

**Output:**
```
Progress while reading and checking each file, then the same report sections. Each Excel sheet
is its own table, named invoices/<sheet>. The findings JSON has the same shape as
`intake audit --json`.
```

### Example 3: Edge Case - unsupported or broken file

**Input:**
```
Visitor drops notes.pdf, a 0-byte CSV and a valid orders.csv.
```

**Output:**
```
The audit runs on orders.csv. A notice lists notes.pdf as unsupported and the empty CSV as
unreadable; nothing else is affected.
```

### Similar Features (for reference)

- **DataIntake (`intake audit`)**: the source of truth for checks, wording, severities and
  report layout; this repo is a port of it.
- **DataIntake sample site**: shows how the demo audits are presented and that the raw demo
  files are offered next to them.

---

## DOCUMENTATION

### Required Reading

| Document | Why It's Needed | Link |
|----------|-----------------|------|
| DuckDB-Wasm instantiation | Vite `?url` bundle pattern | https://duckdb.org/docs/stable/clients/wasm/instantiation |
| DuckDB `read_csv` | `all_varchar`, `header`, `sample_size` options | https://duckdb.org/docs/stable/data/csv/overview |
| SheetJS install | current builds come from the SheetJS CDN, not npm | https://docs.sheetjs.com/docs/getting-started/installation/nodejs/ |
| SheetJS parse options | `dense`, `cellDates`, `cellNF` | https://docs.sheetjs.com/docs/api/parse-options |
| Vite workers | `new Worker(new URL(...), { type: 'module' })` | https://vite.dev/guide/features#web-workers |
| Vitest | config and Node environment | https://vitest.dev/guide/ |
| Playwright | request events, `webServer` | https://playwright.dev/docs/network |
| GitHub Pages with Actions | deploy workflow | https://vite.dev/guide/static-deploy#github-pages |

### Related Internal Docs

- DataIntake `src/data_intake/` (kinds, checks, relations, kpis, audit, report, template).
- DataIntake `tests/` for the expected behaviour of each check.

### API/Library Documentation

- `@duckdb/duckdb-wasm`: https://github.com/duckdb/duckdb-wasm - the `blocking` entry point.
- SheetJS: https://docs.sheetjs.com/ - `read`, `SSF.is_date`, `SSF.parse_date_code`.

---

## OTHER CONSIDERATIONS

### Constraints

- **Privacy**: no network request after the page and engine load; a Content Security Policy
  blocks connections to other origins; no analytics.
- **Parity**: the same finding codes, severities, columns and wording as DataIntake on its
  demo exports, checked by a test against fixtures produced by the Python tool.
- **Stack**: TypeScript strict, Vite, npm, DuckDB-Wasm for CSV, SheetJS for Excel, work in a
  Web Worker, vitest, ESLint + Prettier, Playwright smoke test.
- **Scale**: files of tens of MB with visible progress; DataIntake's limits (200 MB, 1,000,000
  rows, 500 columns) apply.
- **Accessibility**: keyboard-operable drop zone with a file input, phone width, light and dark.

### Security Considerations

- Every value from the data is escaped in the page and in the downloaded report.
- The downloaded report is one HTML file with inline styles and no scripts, like DataIntake's.

### Known Gotchas

1. **SheetJS on npm is stale**: the `xlsx` package on npm stops at 0.18.5; install the CDN
   tarball and pin it.
2. **DuckDB-Wasm wasm files are 35-41 MB each**: ship only the bundle that is needed.
3. **Number and date formatting**: Python rounds half to even and has its own `repr`, `strip`
   and `statistics.quantiles`; port them, do not approximate.

### Out of Scope

- Databases, APIs, `.xls`/`.ods` files (DataIntake reads CSV and xlsx only).
- Saving anything server side; accounts; sharing links.
- Changing DataIntake.

### Open Questions

- [x] Does DuckDB-Wasm run under Node for tests? Yes: the `blocking` entry point runs in Node.
- [x] Which SheetJS version is current? 0.20.3 on the SheetJS CDN.

---

## Priority & Timeline

- **Priority**: HIGH
- **Target**: first public version
- **Estimated Effort**: LARGE

---

## Stakeholders

- **Requestor**: Noah (m4dd0ck)
- **Implementer**: coding agent
- **Reviewer**: Noah
