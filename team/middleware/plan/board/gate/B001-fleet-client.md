# B001: Fleet API client + mappers (replaces src/lib/tesla.ts)

## Facts
- Repo: a single Next.js 15 app in `src/`, alias `~` = `src/`, Vitest (`src/**/*.test.ts`), TypeScript strict. No test may hit the network: inject `fetch`.
- Canonical units: W and Wh are integers, timestamps ISO-8601 UTC. Signs: `solarW, loadW >= 0`; `batteryW > 0` discharging / `< 0` charging; `gridW > 0` importing / `< 0` exporting. Tesla's signs match these 1:1 (verified against the PO's app), so no flips.
- Fixtures (anonymized, committed): `fixtures/fleet-api/live_status.json`, `calendar_history_energy.json` (288 five-minute entries; each one balances exactly), `site_info.json`. All of them are wrapped in `{ "response": ... }`.
- `src/lib/core/types.ts` (new):
  - `LiveSample = {ts: string; solarW; loadW; batteryW; gridW: number; socPct: number; gridStatus: "connected"|"islanded"}`;
  - `EnergyInterval = {start: string; solarWh; loadWh; gridImportWh; gridExportWh; batteryChargeWh; batteryDischargeWh: number}`;
  - `DataSource = {id: "fleet-api"|"local-gateway"|"replay"; getLiveStatus(siteId: string): Promise<LiveSample>; getHistory(siteId: string, day: {start_date: string; end_date: string; time_zone: string}): Promise<EnergyInterval[]>}`;
  - typed errors `AuthExpired`, `RateLimited`, `SourceUnavailable` (classes extending Error, `name` set).
- `map.ts` (pure):
  - `mapLiveStatus(response)`: `solarW=solar_power`, `loadW=load_power`, `batteryW=battery_power`, `gridW=grid_power` (Math.round each); `socPct=percentage_charged` unchanged; `gridStatus = island_status === "on_grid" ? "connected" : "islanded"`; `ts` = `timestamp` (e.g. `2026-10-05T11:06:04-07:00`) → `new Date(..).toISOString()`.
    - When `|solar+battery+grid−load| > 50` W, call `console.warn` once; never change the data.
  - `mapCalendarHistory(response)`: one interval per `time_series` entry. `start` = `timestamp` → UTC ISO. Use only these always-present fields:
    - `solarWh=solar_energy_exported`, `loadWh=total_home_usage`, `gridImportWh=grid_energy_imported`;
    - `gridExportWh=grid_energy_exported_from_solar+_from_generator+_from_battery`;
    - `batteryDischargeWh=battery_energy_exported`;
    - `batteryChargeWh=battery_energy_imported_from_grid+_from_solar+_from_generator`.
    - Do not use `total_solar_generation`/`total_battery_*` (only present on some intervals).
  - Validate both inputs with zod at the boundary.
  - Fixture check: day totals are solar 40.0, home 95.3, grid import 59.1, battery out 21.7, battery in 24.7, grid export 0.9 kWh (±0.1). Every interval balances: `solar+batteryDischarge+gridImport = load+batteryCharge+gridExport` exactly.
- `client.ts`: `createFleetClient(deps: {fetch, db, now: () => number, baseUrl, clientId, clientSecret})` returns a `DataSource` with id `fleet-api`. Plus a default `fleetClient` built from `~/env` + `~/server/db`, created lazily so importing never opens the DB.
  - Base URL: env `TESLA_FLEET_BASE_URL` (add to `src/env.schema.js` as optional url, to `src/env.js` runtimeEnv, and to `.env.example`), default `https://fleet-api.prd.na.vn.cloud.tesla.com`.
  - Token refresh is the same HTTP call as today's `src/lib/tesla.ts` `getAccessToken()`: POST `https://auth.tesla.com/oauth2/v3/token`, Basic auth, `grant_type=refresh_token`, the rotated refresh token stored encrypted via `~/lib/crypto` `encrypt`, `accessTokenExpiresAt`.
  - The access token is cached in memory and refreshed only when less than 5 min of life is left. Concurrent callers share one in-flight refresh promise (test: 3 parallel `getLiveStatus` → 1 token POST).
  - The refresh runs inside a SQLite `BEGIN IMMEDIATE` transaction: re-read `credentials` id=1, POST, write, commit. better-sqlite3 transactions are sync, so do it as: begin immediate → read → await fetch → write → commit, with rollback on error.
  - Errors:
    - refresh 400/401 or API 401 → `AuthExpired`; 429 → `RateLimited`; any other non-2xx or network failure → `SourceUnavailable`;
    - no credentials row → `AuthExpired("No Tesla credentials stored")`;
    - messages = path template + status + Tesla's JSON `error` string if any. **Never include bodies, tokens or the site id**.
  - Endpoints: `GET {base}/api/1/energy_sites/{siteId}/live_status` and `/calendar_history?kind=energy&period=day&start_date&end_date&time_zone` (URLSearchParams).
- Delete `src/lib/tesla.ts`. `src/app/api/powerwall/live/route.ts` keeps `requireAdminApi()`:
  - it finds the first `sites` row with source `fleet-api` (404 `{error}` if none) and returns `fleetClient.getLiveStatus(site.externalId)` as JSON;
  - errors → 500 `{error: message}` (status 401 for AuthExpired).
  - Update `src/app/auth-routes.test.ts`'s `~/lib/tesla` mock accordingly.
- Env notes: worktrees have no node_modules. Link main's from PowerShell: `cmd /c mklink /J node_modules "D:\Programming Projects\voltops\node_modules"`. Lint needs `SKIP_ENV_VALIDATION=1`. Never copy `.env`. vitest can flake under load; re-run once.

## Owned files
- Tester: `src/lib/sources/fleet-api/map.test.ts`, `src/lib/sources/fleet-api/client.test.ts`, `src/app/auth-routes.test.ts`
- Implementer: `src/lib/core/types.ts`, `src/lib/sources/fleet-api/map.ts`, `src/lib/sources/fleet-api/client.ts`, `src/lib/tesla.ts` (delete), `src/app/api/powerwall/live/route.ts`, `src/env.schema.js`, `src/env.js`, `.env.example`

## Base
Tester: `main`. Implementer: the tester's branch.

## Judged by
- `pnpm vitest run src/lib/sources src/app/auth-routes.test.ts`: all green;
- the full `pnpm vitest run` green, `pnpm typecheck` clean, `SKIP_ENV_VALIDATION=1 pnpm lint` 0 warnings;
- no network in tests; `rg "lib/tesla" src` finds nothing.
