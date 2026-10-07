# B007: Snapshot builder + loader, `/home` on real data

## Facts
- Contract: `DashboardSnapshot`, `checkSnapshot`, `toDashboardView` in `src/lib/dashboard.ts` (read its types and `checkSnapshot` rules). Guide: `docs/dashboard-snapshot.md`.
  - W/Wh are integers, money is integer cents, ISO UTC strings.
  - Timeline = consecutive UTC hour starts from local midnight today to local midnight after tomorrow (47–49 rows).
  - Rows with `hour < updatedAt` are `actual` and carry 4 breakdown fields that must balance.
  - The rest are `forecast`, with p10/p90 and no breakdown.
- Already on main (import, don't edit):
  - `~/lib/time`: `localParts`, `localDate(ms,tz)`, `addDays(date,n)`, `localMidnight(date,tz)`;
  - `~/lib/tariff`: `parseTariff(json) → Tariff|null`, `tariffAt(t, ms, tz) → {period, importCentsPerKwh, exportCentsPerKwh, endsAt}`, `costToday(t, hours[{hour, gridImportWh, gridExportWh}], tz) → {periods, exportCreditCents, netCents}`;
  - `~/lib/forecast/baseline`: `forecastHours({hours:number[], tz, history:{hour,solarWh,loadWh}[], observedGhi:{hour,ghiWm2}[], forecastGhi:{hour,ghiWm2}[], startSocPct, capacityWh, reservePct})` → per hour `{hour: ISO, loadWh, loadP10Wh, loadP90Wh, solarWh, solarP10Wh, solarP90Wh, socPct}` (hours = epoch ms);
  - `~/lib/core/types`: `DataSource`, `LiveSample {ts, solarW, loadW, batteryW, gridW, socPct, gridStatus}`; `~/lib/sources/fleet-api/client`: `fleetClient` (`getLiveStatus(externalId)`); `mapCalendarHistory` in `./map` (useful for test data from `fixtures/fleet-api/calendar_history_energy.json`);
  - `~/server/db` (`db`, `openDb`) and `~/server/db/schema`:
    - `sites` (id, source, externalId, name, timezone, latitude, longitude, usableCapacityWh, backupReservePct, temperatureUnit);
    - `tariffSchedule` (siteId, currency, content);
    - `energyIntervals` (siteId, start, solarWh, loadWh, gridImportWh, gridExportWh, batteryChargeWh, batteryDischargeWh);
    - `samples` (siteId, ts, solarW, loadW, batteryW, gridW, socPct, gridStatus);
    - `weatherObserved` (siteId, hour, tempC, cloudPct, ghiWm2, precipMm);
    - `weatherForecast` (siteId, issuedAt, hour, tempC, cloudPct, ghiWm2, precipMm, precipProbPct);
    - timestamps are `timestamp_ms`.
- Files:
  - `src/server/snapshot/build.ts`: pure `buildSnapshot(input) → DashboardSnapshot`;
  - `src/server/snapshot/load.ts`: `loadSnapshot({db, source, now}, siteId) → DashboardSnapshot` (all reads, then `buildSnapshot`), plus `firstSiteId(db) → number | null` (lowest id).
- Rules (SPEC §Snapshot):
  - `site`: `{name ?? "My home", timezone ?? "UTC", temperatureUnit ?? "F"}`. `source` = `sites.source`. `currency` = `tariffSchedule.currency ?? "USD"`.
  - `live`:
    - for `fleet-api`: `source.getLiveStatus(externalId)`, cached in memory 60 s per site (module-level Map keyed by site id; cache time from `now`);
    - on error, or for any other source: the latest `samples` row plus the warning "Live reading unavailable: showing the last stored reading";
    - no sample either → `loadSnapshot` throws (the page then falls back to sample data);
    - `usableCapacityWh = sites.usableCapacityWh ?? 13500`;
    - `updatedAt` = the live `ts`;
    - `socPct` = `Math.round` of the reading (checkSnapshot requires 0–100);
    - flows are integers.
  - Timeline actual hours (`hour < updatedAt`):
    - sums of `energy_intervals` per UTC hour via SQL `GROUP BY` (ADR 0001: no rollup table); missing → zeros;
    - `socPct` = round of the `samples` row nearest the hour start, else `live.socPct`;
    - the breakdown fields come from the sums (Tesla data balances exactly).
  - Timeline forecast hours: `forecastHours` with:
    - target hours = the remaining timeline hours;
    - `history` = hourly sums over the 7 site-local days before today;
    - `observedGhi` from `weather_observed` for those hours; `forecastGhi` from the **latest-issued** `weather_forecast` row per target hour;
    - `startSocPct = live.socPct`, `capacityWh`, `reservePct = backupReservePct ?? 20`.
  - Every row: `period` = `tariffAt(hour)`, or `off-peak` if there is no parseable tariff.
  - `tariffNow` = `tariffAt(updatedAt)`. No tariff → `{period:"off-peak", importCentsPerKwh:0, exportCentsPerKwh:0, endsAt: next local midnight}` plus the warning "No tariff from Tesla".
  - `costToday` = `costToday(tariff, today's actual hours)`. No tariff → 3 periods (off-peak, mid-peak, peak) with the import Wh and 0 cents, credit 0, net 0.
  - `previousDays`: the 6 site-local dates before today, oldest first, `{date, solarWh, loadWh}` = sums of `energy_intervals` in `[localMidnight(d), localMidnight(d+1))`.
  - `weatherTomorrow`: from the latest-issued forecast rows of tomorrow's site-local hours.
    - `highC/lowC` = max/min temp; `cloudCoverPct` = mean cloud; `precipitationChancePct` = max precip prob (all rounded);
    - `condition`: `rain` if chance ≥ 50, else mean cloud < 25 → `clear`, < 70 → `partly-cloudy`, else `cloudy`;
    - `null` if there are no rows.
  - `health`:
    - `lastPollAt` = latest `samples.ts` ISO, else `updatedAt`; `estRequestsPerMonth: 1440`;
    - `warnings` (in this order, as they apply):
      - "Energy history is N h behind" (latest interval start > 2 h before updatedAt; N = floor hours);
      - "Learning: forecasts improve after 7 days of data" (fewer than 7 site-local days with any interval in the history window);
      - "Set SITE_LATITUDE and SITE_LONGITUDE for weather" (lat or lon null);
      - the live-unavailable warning;
      - "No tariff from Tesla".
  - `recommendation: null`, `accuracy: []`.
- `src/app/(protected)/home/page.tsx`:
  - `firstSiteId(db)`; when there is a site, try `loadSnapshot({db, source: fleetClient, now: Date.now()}, id)` and render with `isSample={false}`;
  - no site, or `loadSnapshot` throws (log the error name + message only) → today's `sampleSnapshot` with `isSample`;
  - keep the existing `checkSnapshot` → `console.warn` loop, `connected` and `showLogout`.
- Tests:
  - temp DB (pattern `src/server/db/db.test.ts`), a fake `DataSource`, a fixed `now`, tz `America/Los_Angeles`;
  - seed `energy_intervals` from the calendar_history fixture, shifted onto the needed days;
  - seed the tariff from `fixtures/fleet-api/site_info.json` `response.tariff_content`;
  - seed weather rows by hand.
- Env notes:
  - worktrees have no node_modules; link main's from PowerShell with `cmd /c mklink /J node_modules "D:\Programming Projects\voltops\node_modules"`, and remove it with `cmd /c rmdir node_modules`, never `--force`;
  - lint needs `SKIP_ENV_VALIDATION=1`;
  - **commit before handing off.**

## Owned files
- Tester: `src/server/snapshot/build.test.ts`, `src/server/snapshot/load.test.ts`
- Implementer: `src/server/snapshot/build.ts`, `src/server/snapshot/load.ts`, `src/app/(protected)/home/page.tsx`

## Base
Tester: `main`. Implementer: the tester's branch.

## Judged by
- `pnpm vitest run src/server/snapshot`: green. `checkSnapshot(snapshot)` is `[]` for:
  - a normal day;
  - **2026-03-08 and 2026-11-01** (47/49 rows);
  - a cold start (1 day of data → the learning warning);
  - no tariff (warning + off-peak);
  - no weather (`weatherTomorrow` null + the location warning);
  - live failing (latest sample used + warning).
- Further checks:
  - actual sums match the seeded intervals;
  - Σ costToday importWh = Σ actual grid import;
  - previousDays dates/order;
  - the 60-s live cache (2 calls within 60 s → 1 `getLiveStatus`);
  - the latest-issued forecast wins.
- The full `pnpm vitest run` green, `pnpm typecheck`, `SKIP_ENV_VALIDATION=1 pnpm lint` exit 0.
