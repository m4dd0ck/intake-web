# Runbook

Procedures for intake-web. `README.md` describes what each command does; this file says when
to run it and in what order.

## On open

```bash
git status --short
git log -3 --oneline
```

## On close

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
```

## Run

`npm run dev` and open the printed URL. To see the page as it will be deployed, with its
Content Security Policy: `npm run build`, then `npm run preview`.

## Change a check

DataIntake is the source of truth for checks and wording.

1. Make the change in DataIntake first, with its own tests.
2. Port it to `src/audit/` and add the case to the check's test file in `tests/`.
3. Refresh the fixtures (below) and run `npm test`. A parity failure that is intended goes in
   README §Decisions as a deliberate difference; any other is a bug in the port.

## Refresh the fixtures

When DataIntake's checks or demo data change:

1. `scripts/refresh-fixtures.sh <path to a data-intake checkout>`. It runs `intake demo` and
   `intake audit ... --json` there (read-only) and rewrites `sample/` and `tests/fixtures/`.
2. `npm test`.
3. `git diff tests/fixtures/`. The `.xlsx` samples change bytes on every run (zip timestamps)
   even when their cells do not; if the fixtures did not change, `git checkout -- sample/`.

## Deploy

Nothing by hand. Every push to `main` runs CI (lint, types, unit and parity tests, the browser
smoke test) and deploys `dist/` to GitHub Pages. `gh run list --limit 3` shows whether it landed.
Once it has, `npm run test:live` runs the browser tests against the deployed site, which
also checks that Pages serves the Content Security Policy and nothing reaches another origin.

## Things that bite

- **`npm install xlsx` brings back 0.18.5.** SheetJS publishes on its own CDN; install
  `https://cdn.sheetjs.com/xlsx-<version>/xlsx-<version>.tgz`.
- **`npm install typescript@latest` breaks lint.** typescript-eslint supports TypeScript below
  6.1; keep the pin until it moves.
- **The dev server has no CSP.** A change that breaks under the policy (an inline `style=""`, a
  fetch to another origin) only shows in `npm run test:e2e` or `npm run preview`.
- **Playwright needs its browser.** `npx playwright install chromium` once per machine.

## Restore on a new machine

1. Install Node 24 or later.
2. `git clone https://github.com/m4dd0ck/intake-web.git`, then `npm ci`.
3. `npx playwright install chromium`, then `npm test` and `npm run test:e2e`. There are no keys.
