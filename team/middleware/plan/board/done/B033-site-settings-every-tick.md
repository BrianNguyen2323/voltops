# B033: apply the SITE_* env settings to Sites created after the worker started

## Facts
- Bug (PO, M4 review): the worker copies `SITE_LATITUDE`, `SITE_LONGITUDE` and `TEMPERATURE_UNIT` onto `sites` **once**, at start (`applySiteSettings(db, settings)` in `src/worker/main.ts`). A Site created later has `latitude`/`longitude` null until the worker restarts:
  - by the login callback (`syncSite` inserts the row and, by design, never touches lat/lon/unit);
  - or on a fresh volume (the worker starts before the first login).
  So: no weather, the "Set SITE_LATITUDE and SITE_LONGITUDE for weather" warning on `/home`, and no Peak-hours tile, even though the env is set. (Verified: the env does reach the container.)
- Fix: the worker applies the settings on **every tick**, before any job runs (one `UPDATE` on one row per minute; `applySiteSettings` already skips empty settings). Keep the startup call or fold it into the first tick. Parse the env once at start, as now.
- `parseSiteSettings`/`applySiteSettings` stay in `src/worker/jobs.ts`. If testing the tick needs it, export a small `tick`-level helper from `jobs.ts` (e.g. `prepareTick(db, settings)`) rather than testing `main.ts`.
- Env notes:
  - link the main node_modules: `cmd /c mklink /J node_modules "D:\Programming Projects\voltops\node_modules"`. Remove it with `cmd /c rmdir node_modules` before you finish;
  - lint needs `SKIP_ENV_VALIDATION=1`; run `pnpm format:check`;
  - **COMMIT, and give the hash and branch name.**

## Owned files
- Tester: `src/worker/jobs.test.ts`
- Implementer: `src/worker/jobs.ts`, `src/worker/main.ts`

## Base
- Tester: `middleware` (5b5f119 or later), branch `phase2b/middleware-site-settings-tests`.
- Implementer: the tester's branch, then branch `phase2b/middleware-site-settings`.

## Judged by
- A test: the settings applied, **then** a new `fleet-api` Site inserted (as `syncSite` does: lat/lon null), **then** the per-tick step runs → the new Site has the env lat/lon/unit; with empty settings nothing changes.
- Full `pnpm vitest run`, `pnpm test:scripts`, tsc, lint, `pnpm format:check`, `pnpm build:worker` green; docker smoke (the lead).

## Follow-up (review FAIL, 2026-10-08)
- `prepareTick` sits inside `tick()`'s `try { … } finally { busy = false }`, which has **no catch**. `void tick()` then turns a throw (e.g. SQLITE_BUSY after the 5 s busy_timeout, since the web process also writes) into an unhandled rejection, and Node 22 exits the worker. Before B033 the call ran once at boot (fail-fast); now it runs every minute.
- Fix: add a `catch (e)` to `tick()`'s try that logs `[worker] tick <ErrorName>: <message>` (never tokens) and lets the loop continue. That covers `prepareTick`, `isTeslaIdle` and anything else unguarded in the tick.
- Implementer only, on `phase2b/middleware-site-settings` (46af0a4); `main.ts` has no tests, and the reviewer verifies by reading.
