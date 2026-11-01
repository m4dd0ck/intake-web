# intake-web: rules for agents

Instructions for coding agents working in this repo; a human reader wants `README.md`. Read
`README.md` for how it works, `RUNBOOK.md` for procedures, `TASK.md` for what is open. The
owner's global agent rules apply on top of these.

## Prohibitions

- Public repo: no personal data, account numbers, keys or real client files in any file. Test
  inputs are small and synthetic; the samples are DataIntake's synthetic demo data.
- Nothing may send data off the page: no analytics, no CDN scripts or fonts, no fetch to another
  origin, no request after the engine is ready. The e2e test enforces it; loosening the CSP or
  that test is a decision for the owner.
- Never edit `tests/fixtures/` by hand; they are DataIntake's output. Regenerate them.
- Never change DataIntake from here; checks change there first.
- Real-time commits only; never backdate. No AI attribution.

## Traps

- JavaScript `trim`, `toFixed` and `toLocaleString` are not Python's `strip` and format; use
  `src/audit/py.ts`.
- Inline `style=""` in page markup is blocked by the CSP; use classes.
- Import only the `eh` DuckDB bundle in browser code; importing another pulls a further 36 MB
  into `dist/`.
- In Node, import the package's blocking entry point (@duckdb/duckdb-wasm/blocking); the
  package root starts worker threads.

## Conventions

- Audit JSON keeps DataIntake's snake_case field names and key order.
- Finding wording is copied from DataIntake verbatim, including British spelling.
