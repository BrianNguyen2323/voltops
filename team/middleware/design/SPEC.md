# SPEC — Middleware: real data into the dashboard

Revision 4

Decision round 1 (2026-10-06): all recommended (Q1–Q10 A). See `revisions/R001.md`, `research/mvp-scope/README.md`.
Rev 2 (2026-10-07): peak estimate, reserve advice and weather gap-fill from the front-end's Decision round 4 (`team/front-end/TODO.md`, front-end R006). See `revisions/R002.md`.
Rev 3 (2026-10-08): the Energy history module and Site sync, from O1's `/improve-codebase-architecture` (Decision round 3 Q1: "1, then 2"; grilling rounds 1–2 all recommended). See `revisions/R003.md`.
Rev 4 (2026-10-12): Your system + Equipment health + one-time backfill, from the front-end hand-off (front-end SPEC Rev 8, R008) and Decision round 4 (Q1–Q4 A). See `revisions/R004.md`.

## Goal
`/home` shows a real `DashboardSnapshot` (contract: `src/lib/dashboard.ts`, `docs/dashboard-snapshot.md`) built from the DB plus one live Tesla call. With no site in the DB, `/home` keeps `sampleSnapshot` (`isSample`).
Out of MVP: `accuracy` is always `[]`. `recommendation` is the reserve advice only (Rev 2).

## Units and conventions (CLAUDE.md §5)
W and Wh are integers. Money is in integer cents, timestamps are ISO-8601 UTC, and temperatures are in degrees C.
Signs: `solarW, loadW >= 0`; `batteryW > 0` means discharging; `gridW > 0` means importing. Tesla's signs match these 1:1 (verified 2026-10-05), so no sign flips are needed.
Timeline hours and the stored hours are UTC hour starts. "Site-local day" and hour-of-day come from the site's IANA timezone through `Intl`.

## File layout (Q1 A: in `src/`, pure where possible, movable to `packages/` later)
| Path | Kind | Brief |
|---|---|---|
| `src/lib/core/types.ts` | `LiveSample`, `EnergyInterval`, `DataSource` types | B001 |
| `src/lib/sources/fleet-api/map.ts` | pure mappers | B001 |
| `src/lib/sources/fleet-api/client.ts` | token + HTTP (deps injected) | B001 |
| `src/server/db/schema.ts`, `drizzle/0001_*` | new tables + `sites` columns | B002 |
| `src/worker/*` | worker loop + jobs | B003 |
| `scripts/verify-tesla-gets.mjs` | partial-today probe | B004 |
| `src/lib/time.ts` | site-local time helpers | B005 |
| `src/lib/tariff/index.ts` | pure tariff | B005 |
| `src/lib/forecast/baseline.ts` | pure forecast + SoC projection | B006 |
| `src/server/snapshot/*` | pure builder + DB loader; `/home` wiring | B007 |
| `src/server/replay/seed.ts` | fixture seed | B008 |
| `src/lib/weather/open-meteo.ts` | Open-Meteo client + pure mapper | B009, B017 |
| `src/server/snapshot/peak.ts` | the 2 peak SQL averages | B015 |
| `src/lib/advisor/reserve.ts` | pure reserve advice | B016 |

## Fleet API (B001; Q1 A absorbs tesla-api-connection round 2: 2A, 4A, 5A)
- Base URL: env `TESLA_FLEET_BASE_URL`, default `https://fleet-api.prd.na.vn.cloud.tesla.com`.
- Token handling:
  - cache the access token in memory per process and refresh only when less than 5 min of life is left;
  - a refresh is serialized across processes by a **lease**, `credentials.refresh_lock_until` (B010; this replaces Rev 1's "BEGIN IMMEDIATE held across the fetch", which froze other writers). No transaction is ever held across an `await`:
    - take the lease in a short synchronous transaction: if `refresh_lock_until` is null or in the past, set it to now + 30 s and read the refresh token; otherwise wait 250 ms and retry, for up to 35 s;
    - POST;
    - then, in a short synchronous transaction, store the rotated refresh token (AES-256-GCM via `~/lib/crypto`) and clear the lease;
    - on error, clear the lease and rethrow;
  - concurrent callers in one process share one in-flight refresh promise.
- Typed errors: `AuthExpired` (401, or a refresh 400/401), `RateLimited` (429), `SourceUnavailable` (other non-2xx, network). Messages carry the status + Tesla `error` code only, never bodies or tokens.
- `live_status` → `LiveSample`:
  - `solarW=solar_power`, `loadW=load_power`, `batteryW=battery_power`, `gridW=grid_power`, all rounded to integers;
  - `socPct=percentage_charged` (float), `gridStatus = island_status === "on_grid" ? "connected" : "islanded"`;
  - `ts` = `timestamp` (local RFC3339 with offset) converted to UTC ISO;
  - if `|solar+battery+grid−load| > 50` W, `console.warn`; never change the data.
- `calendar_history?kind=energy&period=day` → `EnergyInterval[]`, one per `time_series` entry. Use only these always-present fields:
  - `start` = `timestamp` → UTC;
  - `solarWh=solar_energy_exported`, `loadWh=total_home_usage`, `gridImportWh=grid_energy_imported`;
  - `gridExportWh=Σgrid_energy_exported_from_{solar,generator,battery}`;
  - `batteryDischargeWh=battery_energy_exported`, `batteryChargeWh=Σbattery_energy_imported_from_{grid,solar,generator}`.
- The query uses `start_date`/`end_date` as local RFC3339 day bounds plus `time_zone` (see `yesterdayRange` in `scripts/verify-tesla-gets.mjs`).
- `src/lib/tesla.ts` is deleted. `/api/powerwall/live` returns the `LiveSample` from the new client.

## Storage (B002; Q4 A, Q5 A, Q10 A). Never pruned (Energy history)
- `energy_intervals`: `site_id` FK→sites cascade, `start` (ts ms, 5-min UTC start), `solar_wh`, `load_wh`, `grid_import_wh`, `grid_export_wh`, `battery_charge_wh`, `battery_discharge_wh` (int not null). PK (`site_id`, `start`). Upsert on conflict.
- `samples`: `site_id`, `ts`, `solar_w`, `load_w`, `battery_w`, `grid_w`, `soc_pct` (real), `grid_status` text. PK (`site_id`, `ts`). This holds the worker's hourly `live_status`.
- `weather_observed`: `site_id`, `hour` (UTC hour start), `temp_c`, `cloud_pct`, `ghi_wm2`, `precip_mm`. PK (`site_id`, `hour`), upsert.
- `weather_forecast`: `site_id`, `issued_at`, `hour`, `temp_c`, `cloud_pct`, `ghi_wm2`, `precip_mm`, `precip_prob_pct`. PK (`site_id`, `issued_at`, `hour`).
- New nullable `sites` columns: `backup_reserve_pct` int, `temperature_unit` text.
- The Tesla callback also stores `sites.name = site_name`, `usable_capacity_wh = nameplate_energy_watts` (Wh despite the name), and `backup_reserve_pct = backup_reserve_percent`.
- ADR 0001 stands. CLAUDE.md §6 gets a note: rows are never pruned; the 90-day rule is dropped for MVP.

## Worker (B003; Q2 A, Q3 A, Q7 A)
- `src/worker/main.ts` is a plain Node loop. It is bundled by esbuild (devDependency, already in the pnpm store) to `dist/worker.mjs`. Everything is bundled except `better-sqlite3`, which is native and already in the standalone image. (Rev 1 erratum: "packages external" would miss `@t3-oss/env-nextjs`, which the runtime image doesn't ship.)
  - Scripts: `pnpm worker` (build + run).
  - Compose service `worker`: same image, `command: node dist/worker.mjs`, `depends_on: web: service_healthy`, the same volume/env.
- Every hour, at minute 2, for each `fleet-api` site:
  1. `calendar_history` for today (site-local), plus every missing site-local day back to 7 days before today: upsert `energy_intervals`. Today is fetched every hour. A past day is fetched only while it has fewer stored intervals than the day has 5-min slots (288, or 276/300 on DST days).
  2. One `live_status` → `samples`.
- Every 3 hours, for each site with lat/lon: Open-Meteo (B009) → `weather_observed` (past hours) + `weather_forecast` (`issued_at` = fetch time).
- Env (in `src/env.schema.js` + `.env.example`): `SITE_LATITUDE`, `SITE_LONGITUDE` (optional numbers, 2 decimals are enough), `TEMPERATURE_UNIT` (`F|C`, default `F`). At start the worker copies them onto every `sites` row.
- Errors: catch per job and log the job name + siteId + error class/message (never tokens); the loop keeps going. No `job_runs` table. Health is derived from data freshness (B007).
- No credentials or no site → log once and idle. `docker compose up` must still work.
- Budget: about 1,440 Tesla requests/month plus `/home` page views.

## Probe (B004)
`pnpm verify:tesla` gains one extra GET: `calendar_history` for **today** so far. It prints `today intervals: N (expected about M so far)` and writes no fixture. The PO runs it once.

## Site-local time (B005, `src/lib/time.ts`)
`localParts(ms, tz)` → {year, month, day, hour, minute, weekday (0=Monday..6=Sunday)}. `localDate(ms, tz)` → `YYYY-MM-DD`. `localMidnight(date, tz)` → UTC ms of local 00:00 (DST-safe). Pure, with `Intl` only.

## Tariff (B005; Q8 A). Input: Tesla `tariff_content` JSON as stored in `tariff_schedule.content`
- Season: `seasons[name]` with `fromMonth/fromDay/toMonth/toDay`, inclusive, which may wrap the year (Winter 10/1 → 5/31). An empty season object or `ALL` doesn't match.
- Period: `seasons[s].tou_periods[NAME]` is a list of `{fromDayOfWeek,toDayOfWeek,fromHour,fromMinute,toHour,toMinute}`.
  - **Day of week 0 = Monday … 6 = Sunday.** Evidence: SCE TOU-D-4-9PM has weekday ON_PEAK 0–4 and weekend PARTIAL_PEAK 5–6.
  - The time range is `[from, to)` and wraps midnight when from ≥ to (OFF_PEAK 21:00 → 16:00).
  - Matching uses site-local time. No match → `off-peak`.
- Names: `ON_PEAK`→`peak`, `PARTIAL_PEAK`→`mid-peak`, `OFF_PEAK`/`SUPER_OFF_PEAK`/other → `off-peak`.
- Rate ($/kWh) = `energy_charges[season][NAME]` (+ `energy_charges.ALL.ALL` if present) → cents ×100. Export uses the same lookup on `sell_tariff`; no `sell_tariff` → 0.
- `tariffAt(content, ms, tz)` → `{period, importCentsPerKwh, exportCentsPerKwh, endsAt}`. `endsAt` = the first later 15-min step where the period changes (searching up to 8 days). `// ponytail:` 15-min scan; exact boundary math only if a tariff needs it.
- `costToday(content, hours, tz)`: input is today's actual hours `{hour, gridImportWh, gridExportWh}`. Each hour is priced at its start instant.
  - `periods` = all 3 periods in the order off-peak, mid-peak, peak, each with `importWh` and `costCents = round(Σ importWh × cents/1000)`;
  - `exportCreditCents = round(Σ exportWh × exportCents/1000)`;
  - `netCents = Σ costCents − exportCreditCents`.

## Open-Meteo (B009; CLAUDE.md D8, no key)
- One call: `https://api.open-meteo.com/v1/forecast?latitude&longitude&hourly=temperature_2m,cloud_cover,shortwave_radiation,precipitation,precipitation_probability&past_days=1&forecast_days=3&timezone=UTC&timeformat=unixtime`.
- **`shortwave_radiation` at time T is the mean of the preceding hour**, so the GHI for the hour *starting* at H is the value at H+1h. Shift it in the mapper.
- Output: hourly rows `{hour, tempC, cloudPct, ghiWm2, precipMm, precipProbPct}`, split at the fetch time into observed (hour + 1h ≤ fetchedAt) and forecast (the rest). Validate the response with zod and throw a plain `Error("open-meteo: <status or 'bad response'>")` on a non-2xx or bad shape (the worker only logs it).

## Forecast (B006; Q6 A, pure)
- Inputs: the hours to forecast (UTC hour starts), tz, the last 7 site-local days of actual hourly data `{hour, solarWh, loadWh}`, observed GHI for those hours, forecast GHI for the target hours (either may be missing), the start SoC %, usable capacity Wh and reserve %.
- Load per target hour: the values at the same site-local hour-of-day over the available history days. `loadWh` = median, `loadP10Wh/loadP90Wh` = nearest-rank 10th/90th percentile, all rounded integers.
- Solar per target hour:
  - if forecast GHI and observed GHI exist: `k_h = Σ solarWh / Σ ghi` over history hours with the same hour-of-day and ghi > 0 (fallback: all hours' k). `solarWh = round(k_h × forecastGhi)`.
  - p10/p90: multiply by the 10th/90th percentile of the per-day ratios (actual day solar ÷ k-predicted day solar from observed GHI), then clamp so p10 ≤ value ≤ p90.
  - otherwise use the same median/percentile rule as load.
- No history → every value is 0 (the snapshot adds the "learning" warning).
- SoC projection (start-of-hour value, from the start SoC):
  - surplus charges up to capacity; a deficit discharges down to the reserve;
  - `socPct = round(energy/capacity×100)`;
  - `// ponytail:` no inverter power cap.

## Snapshot (B007)
- `buildSnapshot(input)` is pure; `loadSnapshot(db, siteId, now)` does the reads plus the live call. `/home` uses the first site (by id): `checkSnapshot` → warn, then render. No site → `sampleSnapshot`.
- `site`: `{name ?? "My home", timezone, temperatureUnit ?? "F"}`. `source` = `sites.source`. `currency` = `tariff_schedule.currency ?? "USD"`.
- `live`:
  - `fleet-api`: the client's `live_status`, cached in memory 60 s per site;
  - on error, or for `replay`: the latest `samples` row, plus a warning;
  - `usableCapacityWh` = `sites.usable_capacity_wh ?? 13500`;
  - `updatedAt` = the live `ts`.
- `timeline`: hours from `localMidnight(today)` up to `localMidnight(today+2)`.
  - Hour < updatedAt → `actual`: Σ of `energy_intervals` in the hour (ADR 0001; missing → 0). `socPct` = round of the `samples` row nearest the hour start, else `live.socPct`.
  - The rest are `forecast` from B006, starting at `live.socPct`.
  - `period` = `tariffAt(hour)`, or `off-peak` if there's no tariff.
- `tariffNow` = `tariffAt(updatedAt)`. No tariff → `{off-peak, 0, 0, endsAt: next local midnight}` plus the warning "No tariff from Tesla".
- `costToday` = B005 over today's actual hours.
- `previousDays` = the 6 site-local days before today: Σ solar/load from `energy_intervals`.
- `weatherTomorrow`: from the latest-issued forecast hours of tomorrow (site-local).
  - `highC/lowC` = max/min temp; `cloudCoverPct` = mean cloud; `precipitationChancePct` = max precip prob (all rounded);
  - `condition`: `rain` if chance ≥ 50, else mean cloud < 25 → `clear`, < 70 → `partly-cloudy`, else `cloudy`;
  - null if there are no forecast rows.
- `health`:
  - `lastPollAt` = the latest `samples.ts` (else updatedAt), `estRequestsPerMonth` = 1440;
  - `warnings`: "Energy history is N h behind" (latest interval > 2 h old); "Learning: forecasts improve after 7 days of data" (< 7 history days); "Set SITE_LATITUDE and SITE_LONGITUDE for weather" (no lat/lon); "Live reading unavailable: showing the last stored reading"; "No tariff from Tesla".
- `accuracy: []`. `peakEstimate` and `recommendation`: see "Peak estimate and reserve advice" (Rev 2).

## Replay (B008; Q9 A)
`seedReplay(db, now)` replaces any `replay` site and its rows:
- `sites`: source `replay`, `external_id` `replay`, name "Demo home", tz `America/Los_Angeles`, capacity 27000, reserve 20, lat/lon 34.05/−118.24.
- The tariff comes from the `site_info` fixture.
- `energy_intervals`: the 288 fixture intervals copied onto each site-local day from 7 days before today through now, at the same local time of day.
- `samples`: one per hour, flows = that hour's first interval Wh × 12. SoC is integrated from 50% over battery Wh at a capacity of 27000, clamped 0–100.
- Weather: B009's recorded fixture, shifted day by day onto the same dates.

The worker seeds on start when `VOLTOPS_DEMO=true` and no `fleet-api` site exists. `// ponytail:` the demo goes stale after a day; a restart refreshes it.

## Peak estimate and reserve advice (Rev 2; front-end R006, Decision round 4: Q1–Q3, Q5–Q8 A)
Contract: `src/lib/dashboard.ts` (`PeakHistory`, `ReservePlan`, `peakEstimateWh`, `reservePlan`). Use the helpers; don't re-implement them. `checkSnapshot` enforces the rules.
- **Peak window of a target day** (today, tomorrow): the Timeline hours of that site-local date whose `period` is `peak`. Window = [local clock start of the first one, local clock end of the last one), e.g. 16:00–21:00. No peak hour that day → that day is `null`.
- **Complete day:** a site-local day before today whose `energy_intervals` count equals its 5-min slot count (288, or 276/300 on DST days). Same rule the worker uses for "missing". `historyDays` = the number of complete days in the **whole** stored history.
- **Query 1 (`historyAvgWh`):** for every complete day, Σ `load_wh` with `start` in the target window's clock times applied to that day; `round(AVG)`. 0 complete days → the day is `null`.
- **Query 2 (similar temperature):** the same per-day sums, only for complete days whose observed high (`MAX(weather_observed.temp_c)` over hours in that site-local day) is within ±3 °C (inclusive) of the target `highC`. `similarTempDays` = count; `similarTempAvgWh` = `round(AVG)`, or `null` when count < 3. Days with no observed weather aren't matched.
- **`highC` of a target day:** the max over that day's hours of the observed temp where present, else the latest-issued forecast temp. Tomorrow is all forecast; today mixes both (forecast rows only cover the hours after each fetch). No temperature for any hour of the day → that day is `null`.
- **SQL in SQLite:** no time zones, so JS computes each complete day's `[from_ms, to_ms)` window and `[d0_ms, d1_ms)` bounds (`src/lib/time.ts`, DST-safe) and passes them as a CTE `WITH days(day, from_ms, to_ms, d0_ms, d1_ms) AS (VALUES …)`. Integers computed in JS may be inlined as literals; it must work for 10 years of days. Both averages are SQL `AVG`s over `GROUP BY day` sums.
- **Reserve advice** (pure, `src/lib/advisor/reserve.ts`; advisory only, D11: never writes to the Powerwall). Only when `peakEstimate.tomorrow` is non-null **and** `historyDays ≥ 7`; otherwise `recommendation: null`.
  - `reserve = reservePlan(peakEstimateWh(tomorrow), usableCapacityWh, 20)`;
  - `savingsCents = max(0, round(coveredWh × (peakCents − offPeakCents) / 1000))`. `peakCents` = the import rate at the start of tomorrow's window. `offPeakCents` = the lowest import rate among tomorrow's `off-peak` Timeline hours (none → `peakCents`);
  - `effectWh = coveredWh`; `action` = "Raise backup reserve to {targetPct}%";
  - `validFrom` = max(updatedAt, end of today's peak window when today has one); `validTo` = **start** of tomorrow's window (changed 2026-10-08 by front-end B034 / their R007, PO-approved: the reserve has to drop back to 20% when the peak starts so the battery covers the peak);
  - `why`: the usual average ("Usual peak use: 11.2 kWh over 30 days"), the similar-temperature one or "not enough days near 95°F yet", and tomorrow's high. Temperatures are shown in the site's unit; kWh to 1 decimal;
  - `confidence`: `low` when `similarTempDays < 3`, else `medium`;
  - `wouldChange`: "A different forecast high for tomorrow, or a tariff change."
- `health` warning "Learning: …" stays as is.

## Weather gap-fill (Rev 2; front-end Q4 A with the PO's condition)
- In the worker's weather job (every 3 h), for sites with lat/lon. A **gap day** is a site-local day before today that has `energy_intervals` rows but fewer `weather_observed` hours than the day has hours (24, or 23/25 on DST days).
- Only gap days within the last 92 days count (Open-Meteo `past_days` max). Never fetch for days without energy.
- One Open-Meteo call with `past_days` = the number of days back to the oldest gap day (≤ 92) and `forecast_days=1`. `fetchWeather` gains a `pastDays`/`forecastDays` option; the defaults stay 1/3. Upsert only the observed rows that fall on gap days. No forecast rows are written by the gap-fill.
- No gap day → no call.

## Energy history (Rev 3; grilling #1 Q1–Q5 + round 2 Q1–Q5, all A)
One module owns every read and write of `energy_intervals` and `weather_observed` (the glossary's Energy history). No other module touches those two tables. `samples` and `weather_forecast` stay with their callers.
- `src/server/history/index.ts` + one test file `index.test.ts` (a temp-file DB + drizzle migrations, the setup in `peak.test.ts`).
- `energyHistory(db, site: { id: number; timezone: string | null })` returns a Site-bound handle; tz `null` → `"UTC"`. Callers pass Site-local dates `YYYY-MM-DD`; all UTC/midnight/DST maths is inside. Times returned are UTC ms.
  ```ts
  putIntervals(rows: EnergyInterval[]): void            // upsert on (site_id, start)
  putObserved(rows: ObservedHour[]): void               // upsert on (site_id, hour)
  hours(from: string, to: string): HourEnergy[]         // [local midnight(from), local midnight(to)), Σ per UTC hour, ascending
  observed(from: string, to: string): ObservedHour[]    // same range, ascending
  isComplete(date: string): boolean                     // count = the day's 5-min slots (288 / 276 / 300)
  completeDays(before: string): string[]                // complete days < before, oldest first
  weatherGaps(today: string): string[]                  // days in [today−92, today) with ≥ 1 interval and fewer observed hours than the day has; ascending
  peakAverage(o: { days: string[]; fromMin: number; toMin: number; highC: number }): PeakHistory | null  // today's peakHistory, unchanged
  latestStart(): number | null                          // max(start) ms
  ```
  `HourEnergy = { start: number; solarWh; loadWh; gridImportWh; gridExportWh; batteryChargeWh; batteryDischargeWh }` (today's `HourRow`). `ObservedHour = { hour: number; tempC; cloudPct; ghiWm2; precipMm }`.
- **No behavior change** for the worker, the snapshot or the replay seed. Known limits stay: non-whole-hour time zones; the 92-day gap edge.
- Callers: the worker (`syncEnergy`, `syncWeather` observed rows, `fillWeatherGaps`), the snapshot loader, the replay seed. `src/server/snapshot/peak.ts` and its test are deleted. The worker writes observed weather through the module and forecast rows itself, as two separate writes (no shared transaction).

## Site sync (Rev 3; grilling #2 Q6–Q11, all A)
- `DataSource` gains (CLAUDE.md §5 `listSites`):
  ```ts
  listSites(): Promise<string[]>                        // external ids of energy sites with a battery (products, resource_type "battery")
  getSiteInfo(siteId: string): Promise<SiteInfo>
  type SiteInfo = { name: string | null; timezone: string | null; usableCapacityWh: number | null; backupReservePct: number | null;
                    tariff: { id: string; name: string | null; utility: string | null; currency: string | null; content: unknown } | null }
  ```
  fleet-api: `GET /api/1/products` and `GET /api/1/energy_sites/{id}/site_info` through the client (its base URL, token, typed errors). `mapSiteInfo` in `map.ts`: `site_name`, `installation_time_zone`, `nameplate_energy` via today's `findNameplate` (Wh), `backup_reserve_percent`, `tariff_id` + `tariff_content` (`name`, `currency`) + `utility`. Fixture-tested on `site_info.json`.
- `src/server/site-sync.ts`: `syncSite(db, source, externalId): Promise<number>` → `getSiteInfo`, then upsert the `sites` row (keyed on `external_id`; source = `source.id`; name, timezone, usable capacity, backup reserve) and replace `tariff_schedule` for it (only when `tariff` is non-null). Returns the site id. Lat/lon and temperature unit are never touched (env-owned).
- **Login** (`/api/auth/callback`): token exchange → store credentials → `primeToken(access, expiresAt)` on the fleet client (so no extra refresh) → `listSites()` → `syncSite` for the first one. A sync failure is logged (`[Tesla OAuth] site sync <ErrorName>`) and the login still redirects to `/home`. The callback's own fetches, `FLEET_BASE` and `findNameplate` are deleted.
- **Worker:** a daily `site-sync` job (first tick, then every 24 h) for each `fleet-api` site, ~30 requests/month. Errors log like the other jobs (`[worker] site-sync site=<n> <ErrorName>`). No `job_runs` table exists, so there's no dashboard warning beyond today's "No tariff from Tesla".
- **Replay:** `seedReplay` takes timezone, capacity, backup reserve and tariff from `mapSiteInfo(site_info.json)`; the name stays "Demo home" and lat/lon stay fixed.

## Your system + Equipment health (Rev 4; front-end SPEC Rev 8, Decision round 4 Q1–Q4 A)
Contract: `system` and `equipmentHealth` in `src/lib/dashboard.ts`. The front-end owns the contract and the `checkSnapshot` rules. The middleware supplies values only. Thresholds and status live in the front-end view.

### Storage (B039, migration `0003`)
- `sites` gains `battery_count int`, `battery_model text`, `max_power_w int`, `firmware text`, `installed_on text` (YYYY-MM-DD, site-local), `backfill_from text` and `backfill_cursor text` (both YYYY-MM-DD; null = not started). All nullable.
- `site_events(site_id fk cascade, at ts, kind text, text text)`, PK `(site_id, at, kind)`. `kind` is `firmware`, `batteries` or `outage`. Writes use `onConflictDoNothing`, so re-runs are idempotent.
- `fleet_requests(month text PK "YYYY-MM" in UTC, total int, backfill int)`.

### Site facts (B036)
- `SiteInfo` gains `batteryCount`, `batteryModel`, `maxPowerW`, `firmware` and `installedOn`, all `| null`. `mapSiteInfo` reads:
  - `battery_count`;
  - `components.gateways[0].part_name`;
  - `nameplate_power`;
  - `version` up to the first space;
  - `installation_date` (RFC 3339 with offset) → its first 10 chars. The offset is local, so that is the site-local date.
  - Never read `components.batteries[]`: expansion units report "Unknown" and zeros.
- `syncSite` writes the 5 facts. When the stored `firmware` or `battery_count` is non-null and differs from the new value, it inserts a `site_events` row at sync time with text "Firmware {v}" or "Batteries: {n}". The first sync logs nothing.
- A new history module op, `bestSolarHour(): { start: number; wh: number } | null`, returns the max of the UTC-hour GROUP BY of `solar_wh` over all stored intervals.
- `SITE_PANEL_COUNT` and `SITE_PANEL_WATTS` are `z.coerce.number().int().positive().optional()` in `src/env.schema.js`. The snapshot loader reads them (both containers load `.env`), so no columns.
- `system` is null until the Site has `battery_count` (the first sync with the new mapper). `batteries.capacityWh` = `usable_capacity_wh`. `plan` comes from `tariff_schedule` (`utility`, `name`). `changes` = the newest 5 `site_events`, `at` as ISO UTC.

### Outages (B040 → PO → B041; Q1 A)
- Tesla `GET /api/1/energy_sites/{id}/calendar_history?kind=backup` "Returns the backup (off-grid) event history of the site in duration of seconds" (developer.tesla.com energy endpoints, checked 2026-10-12). The field names and the duration unit stay **unverified** until `verify:tesla` records `fixtures/fleet-api/backup_history.json` (B040; the PO runs it). No mapper is written before that fixture exists.
- `DataSource` gains `getOutages(siteId): Promise<{ at: string; durationS: number }[]>`. A daily worker job (next to site-sync, ~30 req/month) writes `site_events` of kind `outage` with text "Grid outage, {h} h {m} min" ("Grid outage, {m} min" under an hour).

### Equipment health (B037 pure, B042 wiring)
- A pure module `src/lib/health/index.ts`, no I/O. Inputs are `hours: HourEnergy[]` and `observed: ObservedHour[]` (history module), `soc: { ts: number; socPct: number }[]` (`samples`), `tz` and `now`. The output is the four measurements of `equipmentHealth` (everything except `backfill`). Months are site-local `YYYY-MM`. "Last complete month" is the site-local month before the one holding `now`.
- **solarClearDay:**
  - a clear hour has `cloudPct <= 10` and `ghiWm2 >= 600`; its ratio is `solarWh / ghiWm2`;
  - take the median ratio for the last complete month and for the same month a year earlier; `pctOfBaseline = round(100 × m / b)`; `clearHours` is the month's count;
  - null if either month has < 20 clear hours, the baseline median is 0, or the result would exceed 200 (R004).
- **sunnyDayMiss:**
  - check each of the last 7 complete site-local days, newest first;
  - a clear day has a mean `cloudPct` ≤ 15 over its hours with `ghiWm2 > 0`;
  - expected Wh = Σ over its hours of `ghi × ratio(local hour of day)`. ratio(h) is the median `solarWh / ghi` for that local hour over the 60 days before the checked day, using hours with `ghi >= 50`;
  - the first clear day with actual < 75% of expected wins; null if none, or if fewer than 14 days hold data.
- **batteryCapacity (Q2 A, recorded SoC only):**
  - a swing is a run of consecutive samples ≤ 75 min apart with strictly falling `socPct` and a total drop ≥ 40 points;
  - Wh = Σ `batteryDischargeWh` of the UTC hours `[hour(t1), hour(t2))`; estimate = Wh / points × 100;
  - **discharge only.** Discharge Wh is metered AC out, the same basis as the AC nameplate. Charge Wh includes conversion losses and would overstate capacity;
  - the median over swings that end in the last complete month, rounded; null with < 5 swings.
- **efficiency:** for the last complete month, `round(100 × Σ discharge / Σ charge)`; null with < 10 days holding data, with Σ charge = 0, or above 200 (R004).
- The loader reads 13 months + 7 days of `hours` and `observed` (~10k rows, GROUP BY, ADR 0001) plus that window's `samples`.

### Request budget + backfill (B038; Q4 A)
- The fleet client's `call` upserts `fleet_requests[current UTC month].total += 1` for each response with status < 500. Tesla bills those. The token endpoint isn't a Fleet request. Both processes count.
- Env (`src/env.schema.js` + `.env.example`): `TESLA_BACKFILL_MAX_PER_MONTH` (int ≥ 0, default 2500; 0 = off) and `TESLA_MONTHLY_REQUEST_CAP` (int ≥ 1, default 4500).
- The worker job `backfillStep` runs every tick for the first `fleet-api` Site with `installed_on`, and makes **at most 1 Tesla request per tick**:
  1. first run: `backfill_from = backfill_cursor = today − 8` (syncEnergy owns the last 7 days);
  2. while `cursor >= installed_on` and the day is complete (`isComplete`), step `cursor` back one day without a request;
  3. if `cursor < installed_on`, it's done, for good;
  4. if this month's `backfill >= MAX` or `total >= CAP`, it's paused; return;
  5. otherwise `getHistory(cursor)` → `putIntervals` → `backfill += 1` → step `cursor` back. On an error it logs through `guarded` and leaves the cursor.
- `backfillState(db, site, env, now)` returns `off` (MAX = 0 or no `installed_on`), `done`, `paused-budget` or `running`, plus `daysTotal = days(installed_on .. backfill_from)` and `daysDone = days(cursor + 1 .. backfill_from)` (0 and 0 before the first run).
- Weather: `weatherGaps` drops its 92-day floor and returns every gap day. `fillWeatherGaps` fetches gaps within 92 UTC days as it does today, and older gaps in **one** Open-Meteo archive request: `https://archive-api.open-meteo.com/v1/archive?latitude&longitude&start_date&end_date&hourly=temperature_2m,cloud_cover,shortwave_radiation,precipitation&timezone=UTC&timeformat=unixtime`. Verified 2026-10-12: the same `hourly` shape without `precipitation_probability`. The GHI index shift is the same as in `mapForecast`.
- Snapshot (B042): `equipmentHealth.backfill` comes from `backfillState`. `health.estRequestsPerMonth` adds `min(daysTotal − daysDone, MAX)` while the state is `running`.
