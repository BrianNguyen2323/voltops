# B031: Daily site-sync job + replay seed via `mapSiteInfo`

## Facts
- SPEC Rev 3 "Site sync". B030 (merged) added `listSites`/`getSiteInfo` on the DataSource, `mapSiteInfo` in `src/lib/sources/fleet-api/map.ts` and `syncSite(db, source, externalId)` in `src/server/site-sync.ts`.
- Worker (`src/worker/jobs.ts`, `main.ts`): a `site-sync` job.
  - It runs on the first tick, then every 24 h. For each `fleet-api` site it calls `syncSite(db, source, site.externalId)`.
  - Errors are caught per site and logged like the other jobs (`[worker] site-sync site=<n> <ErrorName>: …`, never tokens), and the loop continues.
  - It adds ~30 Tesla requests/month. No credentials or no fleet-api site → it does nothing (the existing idle rule).
- Replay (`src/server/replay/seed.ts`): timezone, capacity, backup reserve and tariff come from `mapSiteInfo(read("fixtures/fleet-api/site_info.json"))`. The name stays "Demo home", lat/lon stay 34.05/−118.24, and `source`/`external_id` stay `replay`. If the fixture has no timezone, fall back to `America/Los_Angeles`.
- B030 review gap: add 2 regression tests to `src/app/callback-logging.test.ts` (they pass on the current code): credentials are stored even when `syncSite` throws, and a sync failure still redirects to `/home`.
- Env notes:
  - link the main node_modules: `cmd /c mklink /J node_modules "D:\Programming Projects\voltops\node_modules"`. Remove it with `cmd /c rmdir node_modules` before you finish. Never `git worktree remove --force` while it exists;
  - lint needs `SKIP_ENV_VALIDATION=1`; vitest can flake under load, so re-run once; test files must lint clean too;
  - run `pnpm format:check`; no network in tests;
  - **COMMIT before handing off, and give the commit hash and branch name.**

## Owned files
- Tester: `src/worker/jobs.test.ts`, `src/server/replay/seed.test.ts`, `src/app/callback-logging.test.ts` (2 regression tests only, see Facts)
- Implementer: `src/worker/jobs.ts`, `src/worker/main.ts`, `src/server/replay/seed.ts`

## Base
- Tester: `middleware` after B029 and B030 merge, branch `phase2b/middleware-site-sync-worker-tests`.
- Implementer: the tester's branch, then branch `phase2b/middleware-site-sync-worker`.

## Judged by
Full `pnpm vitest run`, `pnpm test:scripts`, tsc, lint, `pnpm format:check` and `pnpm build:worker` are green, and the docker smoke passes (the lead runs it). The tests cover:
- the job syncs every fleet-api site and skips replay sites;
- one site's failure doesn't stop the others, and it is logged by name;
- the seed's Site row carries the fixture's tz/capacity/reserve and tariff, read from the fixture rather than pinned.
