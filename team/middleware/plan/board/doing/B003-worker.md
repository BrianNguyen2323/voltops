# B003: Worker process + compose service

## Facts
- Repo: a single Next.js 15 app in `src/`, alias `~` = `src/`, Vitest, TS strict. **No test may hit the network.** Inject `fetch` and the DataSource. Agents never call Tesla.
- What already exists on main (import, don't edit):
  - `~/lib/sources/fleet-api/client`:
    - `createFleetClient(deps)` and a lazy default `fleetClient: DataSource`;
    - `getLiveStatus(externalId) → LiveSample`;
    - `getHistory(externalId, {start_date, end_date, time_zone}) → EnergyInterval[]` (`start_date`/`end_date` are local RFC3339 with offset, e.g. `2026-10-04T00:00:00-07:00`).
  - `~/lib/core/types`: `LiveSample {ts, solarW, loadW, batteryW, gridW, socPct, gridStatus}`, `EnergyInterval {start, solarWh, loadWh, gridImportWh, gridExportWh, batteryChargeWh, batteryDischargeWh}` (ISO strings), errors `AuthExpired | RateLimited | SourceUnavailable`.
  - `~/lib/weather/open-meteo`: `fetchWeather({fetch, lat, lon, now}) → {observed: WeatherRow[], forecast: WeatherRow[]}`, with `WeatherRow {hour (ms), tempC, cloudPct, ghiWm2, precipMm, precipProbPct}`. Fixture: `fixtures/open-meteo/forecast.json` (fetch time in its README).
  - `~/lib/time`: `localParts`, `localDate`, `addDays`, `localMidnight(date, tz)`.
  - `~/server/db` `openDb(path)` + lazy `db`, and `~/server/db/schema`:
    - `sites` (id, source, externalId, timezone, latitude, longitude, temperatureUnit, …), `credentials`;
    - `energyIntervals` (PK siteId+start), `samples` (PK siteId+ts);
    - `weatherObserved` (PK siteId+hour), `weatherForecast` (PK siteId+issuedAt+hour).
    - Timestamps are `timestamp_ms` (Date objects in drizzle).
  - The test pattern for a temp DB is `src/server/db/db.test.ts` (mkdtemp, `openDb`, `migrate(db, {migrationsFolder: "drizzle"})`).
- `src/worker/jobs.ts` (deps injected: `db`, `source: DataSource`, `fetch`, `now: number`):
  - `dayRange(date, tz, endMs?)` → `{start_date, end_date, time_zone}`: local RFC3339 with offset, DST-safe. `start` = local midnight. `end` = `endMs` if given, else 1 s before the next local midnight.
  - `syncEnergy(deps, site)`:
    - for today (site-local) plus each of the 7 previous site-local days;
    - today is always fetched with `end = now`;
    - a past day is fetched only if its stored `energy_intervals` count in `[localMidnight(d), localMidnight(d+1))` is below `(next − start) / 5 min` (288; 276/300 on DST days);
    - upsert every interval (on conflict update all Wh columns).
  - `takeSample(deps, site)`: `getLiveStatus` → insert into `samples` (ts = sample ts, on conflict do nothing).
  - `syncWeather(deps, site)`: skip if lat/lon is null. Otherwise `fetchWeather` → upsert `weather_observed`, insert `weather_forecast` rows with `issuedAt = now`.
  - `applySiteSettings(db, env)`: when `SITE_LATITUDE`/`SITE_LONGITUDE`/`TEMPERATURE_UNIT` are set, write them onto every `sites` row.
  - Tesla jobs run only for sites with source `fleet-api`. Weather runs for every site with lat/lon.
  - Each job is wrapped: an error is caught and logged as `[worker] <job> site=<sites.id> <err.name>: <err.message>`.
    - **Never log `externalId`, tokens or bodies.**
    - One failing job/site never stops the others.
- `src/worker/main.ts`: opens `db`, calls `applySiteSettings`, runs all jobs once at start, then:
  - Tesla jobs every hour at minute 2 (local clock);
  - weather every 3 h;
  - a 60-s tick that checks "is it due" is fine.
  - No credentials row or no sites → log `[worker] no fleet-api site; idle` once per start and keep ticking (a site may appear after Connect Tesla).
  - SIGTERM/SIGINT → exit 0.
- Env (`src/env.schema.js`; `src/env.js` already reads all of `process.env`): `SITE_LATITUDE`, `SITE_LONGITUDE` (optional, `z.coerce.number()`, lat −90..90, lon −180..180), `TEMPERATURE_UNIT` (optional `"F" | "C"`). Document them in `.env.example` (2 decimals are enough; never commit real coordinates).
- Bundle:
  - add devDependency `esbuild` (use the version already in the pnpm store, e.g. `pnpm add -D esbuild@0.25.12 --offline`);
  - scripts: `"build:worker": "esbuild src/worker/main.ts --bundle --platform=node --format=esm --target=node22 --outfile=dist/worker.mjs --external:better-sqlite3 --banner:js=\"import{createRequire}from'module';const require=createRequire(import.meta.url);\""` and `"worker": "pnpm build:worker && node --env-file-if-exists=.env dist/worker.mjs"`;
  - `dist/` goes in `.gitignore`.
- Docker:
  - Dockerfile build stage runs `pnpm build:worker` after `pnpm build`; the runtime stage copies `dist/worker.mjs` to `/app/dist/`;
  - `compose.yaml`: tag the web image (`image: voltops:local`) and add a `worker` service with the same `image`, no `build`, `command: ["node", "dist/worker.mjs"]`, `depends_on: {web: {condition: service_healthy}}` (web runs the migrations), the same `env_file`, `DATABASE_PATH: /data/voltops.db`, the same volume, `restart: unless-stopped`.
- Budget: about 720 calendar_history (today) + 720 live_status per month, plus backfill only for missing days.
- Env notes:
  - worktrees have no node_modules. If you add esbuild you need a real install in the worktree: `pnpm install --offline --frozen-lockfile=false`;
  - lint needs `SKIP_ENV_VALIDATION=1`;
  - the PO's container holds port 3000, so run the smoke test with `SMOKE_PORT=3100 bash scripts/docker-smoke.sh` from Git Bash, run from D: (not Temp);
  - vitest flakes under load: re-run once.

## Owned files
- Tester: `src/worker/jobs.test.ts`
- Implementer: `src/worker/jobs.ts`, `src/worker/main.ts`, `src/env.schema.js`, `.env.example`, `package.json`, `pnpm-lock.yaml`, `.gitignore`, `Dockerfile`, `compose.yaml`

## Base
Tester: `main`. Implementer: the tester's branch.

## Judged by
- `pnpm vitest run src/worker`: green. The tests use a temp DB, a fake DataSource and a fake fetch serving the Open-Meteo fixture, and cover:
  - `dayRange` incl. DST days;
  - backfill of only incomplete days and today always;
  - the interval upsert being idempotent;
  - sample insert;
  - weather skipped without lat/lon and stored with it (forecast `issuedAt`);
  - `applySiteSettings`;
  - an error in one site/job doesn't stop the next, and the log line contains no externalId.
- The full `pnpm vitest run` green, `pnpm typecheck`, `SKIP_ENV_VALIDATION=1 pnpm lint` exit 0, `pnpm test:scripts` green.
- `pnpm build:worker` produces `dist/worker.mjs`, and `SKIP_ENV_VALIDATION=1 node dist/worker.mjs` starts against an empty temp DB (`DATABASE_PATH`, migrated) and logs the idle line.
- `SMOKE_PORT=3100 bash scripts/docker-smoke.sh` PASS (image ≤ 400 MB).
