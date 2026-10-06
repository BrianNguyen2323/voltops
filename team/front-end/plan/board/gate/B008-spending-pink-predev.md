# B008 — "Spending" label pink + `predev` migrate

## Facts
- **SPEC Rev 4 / R004** (the PO's M3 review).
- **Spending label.**
  - In `src/components/dashboard/dashboard.tsx`, the "Your home now" lines render a muted label span ("Spending"/"Saving"/"Earning") with `mr-1.5`, then the bold amount. Spending's amount gets `text-grid-import` via a `tone`.
  - **Change:** the **"Spending" label word** also gets `text-grid-import`. "Saving" and "Earning" labels stay muted.
- **predev.**
  - On a fresh checkout `pnpm dev` crashed with `SqliteError: no such table: credentials`, because nothing runs migrations for dev (Docker does at start).
  - **Change:** add to `package.json` `scripts`: `"predev": "node --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/migrate.mjs"`.
  - `scripts/migrate.mjs` already reads `DATABASE_PATH` (default `./data/voltops.db`), creates the dir, and applies `drizzle/` migrations. It is idempotent.
  - Node 22 supports `--env-file-if-exists`; it prints a notice and continues when a file is missing.
  - Touch nothing else in `package.json`.

## Owned files
- Tester:
  - `src/components/dashboard/dashboard.test.tsx`;
  - a new `scripts/predev.test.mjs` (node:test, picked up by `pnpm test:scripts`, which runs `node --test "scripts/*.test.mjs"`).
- Implementer: `src/components/dashboard/dashboard.tsx`, `package.json` (the `scripts.predev` line only).

## Base
- Tester: `front-end-development` (at or after this brief's commit) → branch `phase2a/ui-m4-test`. The new tests must FAIL on the base.
- Implementer: `phase2a/ui-m4-test` → branch `phase2a/ui-m4-impl`.

## Judged by
- **`dashboard.test.tsx`:**
  - for an importing copy (`gridW: 1500, loadW: 2000`), the element containing the text "Spending" has a class including `text-grid-import`;
  - in the sample, the "Saving" and "Earning" label elements do **not** have `text-grid-import`.
- **`scripts/predev.test.mjs`:**
  - `package.json` `scripts.predev` equals exactly `node --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/migrate.mjs`;
  - running that command with `DATABASE_PATH=<tmp dir>/t.db` (cwd = repo root, and **no** `.env` read: run from a temp copy or pass the env explicitly) creates the DB with a `credentials` table and exits 0. Running it twice also exits 0 (idempotent).
  - Use `node:child_process` `execFileSync` with a timeout, and clean up the temp dir.
- **Command:** `rm -rf .next && pnpm test && pnpm test:scripts && pnpm typecheck && SKIP_ENV_VALIDATION=1 rtk proxy pnpm lint && SKIP_ENV_VALIDATION=1 pnpm build`, all green.
- Test files must lint clean.
- **Worktree:** junction `cmd //c mklink //J node_modules "D:\Programming Projects\voltops\node_modules"`; `cmd //c rmdir node_modules` before finishing; never use `--force`. Keep commands bounded. No dev server is needed.

## Gate log
- Tests 539fe4c on `phase2a/ui-m4-test`: 2 FAIL for the right reason (the Spending label class; `scripts.predev`). The migrate-run guard passes on base (expected). Implementer spawned.
- Impl c545ef3 on `phase2a/ui-m4-impl`: vitest 196/196, test:scripts 58/58, typecheck, lint clean, build OK. Reviewer spawned.
