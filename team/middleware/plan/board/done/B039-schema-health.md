# B039: Migration 0003, site facts, site events, request counter

## Facts
- SPEC Rev 4, "Your system + Equipment health" → "Storage". Read it first.
- `src/server/db/schema.ts`:
  - `sites` gains nullable `batteryCount` (`battery_count` int), `batteryModel` (text), `maxPowerW` (`max_power_w` int), `firmware` (text), `installedOn` (`installed_on` text), `backfillFrom` (`backfill_from` text), `backfillCursor` (`backfill_cursor` text);
  - new `siteEvents` = `site_events(site_id fk → sites.id on delete cascade, at ts not null, kind text not null, text text not null)`, PK `(site_id, at, kind)`. Use the file's existing `siteFk()` and `ts()` helpers;
  - new `fleetRequests` = `fleet_requests(month text PK, total int not null default 0, backfill int not null default 0)`.
- Generate the migration with `pnpm db:generate` (drizzle-kit). Never edit 0000–0002. Name it as drizzle-kit does (`drizzle/0003_*.sql` + `meta/`).
- No behavior change anywhere else. No new reads or writes.
- Env notes:
  - link the main node_modules: `cmd /c mklink /J node_modules "D:\Programming Projects\voltops\node_modules"`. Remove it with `cmd /c rmdir node_modules` before you finish. Never `git worktree remove --force` while it exists;
  - lint needs `SKIP_ENV_VALIDATION=1`; vitest can flake under load, so re-run once; test files must lint clean too;
  - run `pnpm format:check`; no network in tests;
  - **COMMIT before handing off, and give the commit hash and branch name.**

## Owned files
- Implementer: `src/server/db/schema.ts`, `drizzle/0003_*`, `drizzle/meta/*`, `src/server/db/db.test.ts` (one case).

## Base
`middleware`, branch `phase2b/middleware-schema-health`.

## Judged by
- A test on a fresh migrated temp DB: inserting the same `site_events` row twice with `onConflictDoNothing` leaves one row, and deleting the Site cascades its events.
- Full `pnpm vitest run`, `pnpm test:scripts`, `pnpm tsc --noEmit`, `SKIP_ENV_VALIDATION=1 pnpm lint`, `pnpm format:check`, `pnpm build:worker` and `pnpm build` are green.
