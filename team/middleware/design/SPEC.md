# SPEC — Middleware: real data into the dashboard

Revision 2

Decision round 1 (2026-10-06): all recommended (Q1–Q10 A). See `revisions/R001.md`, `research/mvp-scope/README.md`.
Rev 2 (2026-10-07): peak estimate, reserve advice and weather gap-fill from the front-end's Decision round 4 (`team/front-end/TODO.md`, front-end R006). See `revisions/R002.md`.

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
  - `validFrom` = max(updatedAt, end of today's peak window when today has one); `validTo` = end of tomorrow's window;
  - `why`: the usual average ("Usual peak use: 11.2 kWh over 30 days"), the similar-temperature one or "not enough days near 95°F yet", and tomorrow's high. Temperatures are shown in the site's unit; kWh to 1 decimal;
  - `confidence`: `low` when `similarTempDays < 3`, else `medium`;
  - `wouldChange`: "A different forecast high for tomorrow, or a tariff change."
- `health` warning "Learning: …" stays as is.

## Weather gap-fill (Rev 2; front-end Q4 A with the PO's condition)
- In the worker's weather job (every 3 h), for sites with lat/lon. A **gap day** is a site-local day before today that has `energy_intervals` rows but fewer `weather_observed` hours than the day has hours (24, or 23/25 on DST days).
- Only gap days within the last 92 days count (Open-Meteo `past_days` max). Never fetch for days without energy.
- One Open-Meteo call with `past_days` = the number of days back to the oldest gap day (≤ 92) and `forecast_days=1`. `fetchWeather` gains a `pastDays`/`forecastDays` option; the defaults stay 1/3. Upsert only the observed rows that fall on gap days. No forecast rows are written by the gap-fill.
- No gap day → no call.
