# Research: fleet-api adapter (input to Decision round 2), 2026-10-05

Inputs: the daytime fixtures (b452729), `research/fleet-api-responses/README.md`, the current `src/lib/tesla.ts`, the db-docker SPEC Revision 2, and CLAUDE.md §5.

## 1. live_status → LiveSample: a straight copy
- Tesla's signs match the canonical signs 1:1. This was verified on 2026-10-05 (battery -1267 W while the app showed charging at 1.3 kW). No sign flips are needed.
- `solarW=solar_power`, `loadW=load_power`, `batteryW=battery_power`, `gridW=grid_power`, `socPct=round(percentage_charged)` (it's a float), `gridStatus` from `grid_status`/`island_status`. `timestamp` is local RFC3339 with an offset; convert it to UTC.
- The invariant check (`solar+battery+grid≈load`) has had residual 0 on all 3 runs. Log a warning when it fails; never fix the data.

## 2. calendar_history?kind=energy → EnergyInterval: official 5-minute Wh data, exact balance
- `period=day` returns 288 five-minute intervals. Fixture day 2026-10-04: solar 40.0, home 95.3, grid import 59.1, battery out 21.7, battery in 24.7, grid export 0.9 kWh.
- The balance `solar_energy_exported + battery_energy_exported + grid_energy_imported = total_home_usage + Σbattery_energy_imported_from_* + Σgrid_energy_exported_from_*` holds with **residual 0 Wh in every one of the 288 intervals** (checked by the lead).
- Mapping to rollup columns: solar=`solar_energy_exported`, load=`total_home_usage`, batteryOut=`battery_energy_exported`, batteryIn=Σ`battery_energy_imported_from_{grid,solar,generator}`, gridImport=`grid_energy_imported`, gridExport=Σ`grid_energy_exported_from_{solar,generator,battery}`.
- Some fields appear only on some intervals (`total_battery_discharge`, `total_solar_generation`, `total_battery_charge`). Don't rely on them; derive the values from the always-present fields above.
- **Unverified:** whether calling `calendar_history` for *today* returns the partial day so far. If it does, polling it hourly gives 5-minute history very cheaply (see §3).

## 3. Cost and polling budget (CLAUDE.md open question 4)
- The official billing page confirms a **$10/month discount** per account, and a rate limit of **60 realtime-data requests/min per device** ([billing-and-limits](https://developer.tesla.com/docs/fleet-api/billing-and-limits)). The page doesn't itemize prices.
- Secondary sources say the "Data" category costs **$1 per 500 requests** ([Teslemetry](https://teslemetry.com/blog/tesla-fleet-api-pay-per-use), [Not a Tesla App](https://www.notateslaapp.com/news/2415/tesla-announces-api-pricing-third-party-service-costs-expected-to-rise)). **Not verified for energy endpoints.** The PO's developer dashboard billing page can confirm it after the verify runs.
- At $1/500, live_status alone would cost:

| Interval | req/month | $/month | after $10 credit |
|---|---|---|---|
| 1 min | 43,200 | 86.40 | 76.40 |
| 5 min (CLAUDE.md default) | 8,640 | 17.28 | 7.28 |
| 10 min | 4,320 | 8.64 | 0 |
| 15 min | 2,880 | 5.76 | 0 |
| calendar_history hourly | 720 | 1.44 | 0 |

- Option: use calendar_history as the source of truth for history (hourly, 5-minute Wh), and call live_status only while someone has the Now screen open. That gives finer history than 5-minute polling for about 1/12 the cost. It depends on the "today returns a partial day" check in §2.

## 4. Token handling: current code burns a refresh on every call
- `src/lib/tesla.ts` `getAccessToken()` refreshes, and so rotates the refresh token, on **every** live request. That costs an auth round-trip each time, and two concurrent requests would race on the same refresh token (the loser gets locked out). CLAUDE.md §5 requires a single refresh point with a lock.
- Access tokens live about 8 h (`expires_in`). Cache the token in memory per process and refresh only when less than 5 minutes are left.
- Cross-process (web + future worker) safety without a schema change: do the refresh inside a SQLite write transaction (`BEGIN IMMEDIATE`). It re-reads `credentials` id=1, refreshes, writes the rotated token, then commits. SQLite serializes writers, so the same refresh token is never used twice. The cost is that each process refreshes on its own about every 8 h, which is fine.

## 5. Region
- The base URL is hard-coded to NA (`fleet-api.prd.na.vn.cloud.tesla.com`). EU/EMEA users need `fleet-api.prd.eu.vn.cloud.tesla.com`, and China uses `.cn`. `GET /api/1/users/region` returns the right `fleet_api_base_url` ([base URLs](https://developer.tesla.com/docs/fleet-api/getting-started/base-urls), [evcc #19355](https://github.com/evcc-io/evcc/issues/19355): the wrong region gives a 412 error that looks like an auth failure). The PO is in NA, so this only matters for other users.

## 6. Site facts from site_info
- `usableCapacityWh`: the gateway `nameplate_energy_watts` = 27000 (actually Wh; 2× PW3 at 13.5 kWh). Use it as the default and let the user override it.
- `capabilities()`: `minPollSeconds` from the budget decision; `canSetReserve=false` until Phase 3 (D11).

## 7. Where the code goes
- The repo is still a single Next.js app (`src/`), not the CLAUDE.md §4 monorepo. db-docker is mid-flight in `src/` (B002 edits `src/lib/tesla.ts`, `src/server/db/schema.ts`).
- Pure mappers (`live_status`/`calendar_history` → canonical types) have no dependencies. They can go in new files now and move to `packages/sources` and `packages/core` unchanged when the monorepo lands.
