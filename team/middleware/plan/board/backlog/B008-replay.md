# B008: Replay seed + `VOLTOPS_DEMO`

## Facts
- CLAUDE.md: every feature must work against `replay`, and contributors without a Powerwall must be able to run the whole app. Decision Q9 A: replay = a **seed script over the committed fixtures**, so the same snapshot code serves both sources. No separate replay DataSource.
- On main (import, don't edit):
  - `~/server/db` (`openDb`, `db`) and schema tables `sites`, `tariffSchedule`, `energyIntervals`, `samples`, `weatherObserved`, `weatherForecast` (`timestamp_ms` columns; FKs cascade on site delete);
  - `~/lib/sources/fleet-api/map` (`mapCalendarHistory(json)` → `EnergyInterval[]` with ISO `start` and the Wh fields);
  - `~/lib/weather/open-meteo` (`mapForecast(json, fetchedAtMs)` → `{observed, forecast}` rows with `hour` ms);
  - `~/lib/time` (`localDate`, `addDays`, `localMidnight`, `localParts`).
  - `/home` (B007) shows the first site and uses its latest `samples` row as the Live reading when `source !== "fleet-api"`.
- Fixtures:
  - `fixtures/fleet-api/calendar_history_energy.json`: 288 five-minute intervals for 2026-10-04 in `America/Los_Angeles`; every interval balances exactly;
  - `fixtures/fleet-api/site_info.json`: `response.tariff_content` (SCE TOU-D-4-9PM, currency USD), `site_name` (anonymized);
  - `fixtures/open-meteo/forecast.json`: the fetch time is in `fixtures/open-meteo/README.md`.
  - Read the fixtures with `fs` relative to `process.cwd()` (both the repo root and `/app` in Docker). The Dockerfile must copy `fixtures/fleet-api/*.json` and `fixtures/open-meteo/forecast.json` into the runtime image.
- `src/server/replay/seed.ts` exports `seedReplay(db, now: number)`:
  1. Delete any `sites` row with source `replay` (cascade clears its rows), then insert: source `replay`, externalId `replay`, name "Demo home", timezone `America/Los_Angeles`, usableCapacityWh 27000, backupReservePct 20, lat 34.05, lon −118.24, temperatureUnit "F".
  2. `tariffSchedule` for it: tariffId `replay`, name/utility from the fixture, currency `USD`, content = `tariff_content`.
  3. `energyIntervals`: for each site-local date from `today − 7` through today, copy the fixture's intervals onto that date **at the same local wall-clock time**.
     - Use `localMidnight(date) + (fixture interval's ms offset from its own local midnight)`.
     - Skip slots that don't exist on a 23 h DST day; on a 25 h day the extra hour is simply empty.
     - For today, only intervals with start + 5 min ≤ now.
  4. `samples`: one per UTC hour start from `localMidnight(today − 7)` up to now.
     - Flows (W) = that hour's first seeded interval × 12: `solarW = solarWh×12`, `loadW = loadWh×12`, `batteryW = (dischargeWh − chargeWh)×12`, `gridW = (importWh − exportWh)×12`. This balances because the intervals balance.
     - `socPct`: integrate battery Wh over the seeded intervals from 50% at the first interval, at a capacity of 27000, clamped 0–100.
     - `gridStatus` `connected`.
     - Plus one final sample at exactly `now` (flows from the latest interval, SoC continued), so the Live reading is fresh.
  5. Weather: `mapForecast(fixture, fixtureFetchTime)`. Shift every row by whole days so that the fixture's fetch-time day lands on today (site-local); store observed and forecast (issuedAt = now).
  - Everything runs in one sync transaction, so a failure leaves no half seed.
- Worker: `src/worker/main.ts` at start, when env `VOLTOPS_DEMO=true` and there is no `fleet-api` site, calls `seedReplay(db, Date.now())` and logs `[worker] demo data seeded`.
  - Add `VOLTOPS_DEMO` (optional `"true"`, blank = unset) to `src/env.schema.js` and `.env.example` ("demo mode without a Powerwall").
  - Add `// ponytail: demo goes stale after a day; restart refreshes it`.
- `package.json` script `"seed:replay"` that runs the seed against `DATABASE_PATH` for local dev. Reuse the worker bundle: `node dist/worker.mjs --seed-only` seeds and exits, so no extra tooling is needed.
- Env notes:
  - link main's node_modules with `cmd /c mklink /J node_modules "D:\Programming Projects\voltops\node_modules"`, and remove it with `cmd /c rmdir node_modules` before finishing;
  - lint needs `SKIP_ENV_VALIDATION=1`;
  - the docker smoke runs from Git Bash with `SMOKE_PORT=3100`;
  - **commit before handing off.**

## Owned files
- Tester: `src/server/replay/seed.test.ts`
- Implementer: `src/server/replay/seed.ts`, `src/worker/main.ts`, `src/env.schema.js`, `.env.example`, `package.json`, `Dockerfile`

## Base
Tester: `main` (after B011 and B007 merge). Implementer: the tester's branch.

## Judged by
- `pnpm vitest run src/server/replay`: green. With a temp DB and a fixed `now` (include `now` on 2026-11-01 and 2026-03-08 in LA):
  - the replay site, tariff, 8 days of intervals and hourly samples exist;
  - every seeded interval balances;
  - samples balance (`solar + battery + grid = load`, ±50 W) with SoC 0–100;
  - weather rows sit on today/tomorrow;
  - re-seeding replaces rather than duplicates;
  - **`checkSnapshot(await loadSnapshot({db, source: <throwing DataSource>, now}, siteId))` is `[]`.**
- Full `pnpm vitest run`, `pnpm typecheck`, `SKIP_ENV_VALIDATION=1 pnpm lint` exit 0, `pnpm test:scripts`, `pnpm build:worker`, `pnpm build` green.
- `SMOKE_PORT=3100 bash scripts/docker-smoke.sh` PASS (image ≤ 400 MB).
