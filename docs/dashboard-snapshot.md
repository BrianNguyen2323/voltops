# Dashboard snapshot: guide for data-source adapters

Source of truth: [`src/lib/dashboard.ts`](../src/lib/dashboard.ts) (types, `checkSnapshot`, `toDashboardView`). If this page and the code disagree, the code wins. Terms follow [`GLOSSARY.md`](../GLOSSARY.md).

## What it is

A **Dashboard snapshot** is everything a data source knows about one **Site** as of one moment: the **Live reading**, the **Timeline**, tariff, weather, history, forecast accuracy and health. It holds only facts the source knows, nothing computable from other parts. The UI never reads it directly; it reads the **Dashboard view** that `toDashboardView(snapshot)` derives from it.

## Units and signs

- Power in W (integer), energy in Wh (integer), money in integer minor units (cents), timestamps ISO-8601 UTC. Convert to kW/kWh only in the UI.
- `solarW >= 0`, `loadW >= 0`; `batteryW > 0` discharging, `< 0` charging; `gridW > 0` importing, `< 0` exporting.
- Live reading balances: `solarW + batteryW + gridW = loadW` (within 50 W). Never silently "fix" data; fix the adapter.
- Temperatures are always degrees C; `site.temperatureUnit` is display only.

## Live reading

Instantaneous at `updatedAt`, not an average over the poll interval.

## Timeline

- Hourly rows (UTC hour starts), consecutive, covering the whole **site-local day** of `updatedAt` (today) and the next one (tomorrow): from local midnight today to local midnight after tomorrow.
- That is 48 rows normally, 47 or 49 when a DST change falls in the window (a site-local day can be 23 or 25 hours). Do not assume 24 + 24, and do not index by position.
- Rows with `hour < updatedAt` are `actual`; the rest are `forecast`. Actual rows never follow a forecast row.
- Actual hours carry the per-hour breakdown: `gridImportWh`, `gridExportWh`, `batteryChargeWh`, `batteryDischargeWh` (integers >= 0) and must balance: `solarWh + batteryDischargeWh + gridImportWh = loadWh + batteryChargeWh + gridExportWh` (within 50 Wh). Actual hours have no p10/p90.
- Forecast hours carry `loadP10Wh/loadP90Wh/solarP10Wh/solarP90Wh` with `p10 <= value <= p90`, and no breakdown fields.

## costToday

An input for now: the adapter (or tariff code) supplies it. Per-period `importWh` must sum to today's actual grid import; `netCents = sum(costCents) - exportCreditCents`.

## previousDays

The 6 site-local days before today, oldest first, `date` as `YYYY-MM-DD` site-local, `solarWh` and `loadWh` in Wh. The view appends today to make `last7Days`.

## Check it in your adapter tests

```ts
import { checkSnapshot } from "~/lib/dashboard";

it("produces a valid snapshot", async () => {
  const snapshot = await myAdapter.getDashboardSnapshot(siteId);
  expect(checkSnapshot(snapshot)).toEqual([]); // one message per problem
});
```

`checkSnapshot` never throws and never mutates. The `/home` page runs it and `console.warn`s each problem, because `toDashboardView` assumes a checked snapshot (a bad timezone gives a quietly wrong view). Include DST-change days in your tests.

## Peak estimate and reserve advice

- `peakEstimate: { historyDays, today, tomorrow }`. `historyDays` = complete site-local days of stored history (integer >= 0; < 7 means "learning"). `today` / `tomorrow` are `PeakHistory | null`, null when that day has no `peak` hour in the Timeline or `historyDays` is 0.
- `PeakHistory = { historyAvgWh, highC, similarTempDays, similarTempAvgWh }`: average home use (Wh) inside the peak window over all stored days; the day's forecast high (C); the number of stored days within +/-3 C of it; and their average, null when fewer than 3 such days.
- `recommendation.reserve?: { emergencyPct, extraPct, targetPct, peakWh, coveredWh }`. When present the UI shows "Raise your backup reserve to {targetPct}%." with the sentence about the extra reserve. `savingsCents` = `round(coveredWh * (peak rate - off-peak rate) / 1000)`.
- Use the exported helpers so you and the UI agree: `peakEstimateWh(p)` (mean of the two averages, or `historyAvgWh` alone when `similarTempAvgWh` is null) and `reservePlan(peakWh, usableCapacityWh, emergencyPct = 20)` (`extraPct = min(100 - e, ceil(peakWh * 100 / cap))`, `targetPct = e + extraPct`, `coveredWh` = `peakWh`, or `min(peakWh, floor(extraPct * cap / 100))` when the target reaches 100).
- `checkSnapshot` rules: `historyDays` is an integer >= 0; each non-null `PeakHistory` has integer Wh >= 0, `similarTempDays <= historyDays`, and `similarTempAvgWh` null exactly when `similarTempDays < 3`; a day is null when it has no peak hour; `reserve` equals `reservePlan(peakEstimateWh(tomorrow), usableCapacityWh, reserve.emergencyPct)`, has `emergencyPct >= 20`, and needs `tomorrow` non-null and `historyDays >= 7`.
- The view adds `peakUsage` (do not supply): `learning`, `historyDays`, and per day the estimate, the window (from the Timeline's peak hours) and `usedSoFarWh` (today only).

## What the view derives (do not supply)

- `today`: sums over today's actual hours, plus `selfPoweredPct`.
- `last7Days`: `previousDays` plus today.
- `solarOutlook`: today's vs tomorrow's total solar, `changePct` and `direction` ("less" | "more").

## Your system and equipment health

- `system: null | { batteries, solar, plan, firmware, installedOn, changes }` and `equipmentHealth: { solarClearDay, sunnyDayMiss, batteryCapacity, efficiency, backfill }` are both required fields. `system: null` means "not synced yet" and the UI shows "System details not available yet." Every measurement in `equipmentHealth` is null while learning; `backfill` is always present (`{ state: "off", daysDone: 0, daysTotal: 0 }` until the backfill exists).
- `batteries`: `count` integer >= 1, `model`, `capacityWh`, `maxPowerW` (W), `backupReservePct`. `solar`: `panelCount` / `panelWatts` (user-entered via `SITE_PANEL_COUNT` / `SITE_PANEL_WATTS`; Tesla has no panel data), `bestHourWh` (max hourly solar Wh in stored history) and `bestHourAt` (ISO UTC start of that hour). `plan`: `{ utility, name }`. `installedOn`: YYYY-MM-DD site-local. `changes`: newest first, max 5, `at` ISO UTC.
- `equipmentHealth`: `solarClearDay` = median clear-hour solar Wh per GHI for `month` as % of `baselineMonth` (a year earlier); `sunnyDayMiss` = latest clear day in the last 7 whose solar was > 25% under expected; `batteryCapacity` = median (battery Wh moved / SoC points moved x 100) over swings of >= 40 points in `month` (null under 5 swings); `efficiency` = monthly discharge Wh / charge Wh x 100; months are `YYYY-MM`.
- `checkSnapshot` rules: counts, Wh and W are integers >= 0; `count >= 1`; `pctOfBaseline` and `pct` within 0-200; `daysDone <= daysTotal`; months `YYYY-MM`; dates `YYYY-MM-DD`; `changes.length <= 5`.
- The UI derives the status chips (do not supply): solar below 95% = Watch, below 85% = Check, a `sunnyDayMiss` = Check; battery capacity below 90% of `capacityWh` = Watch, below 80% = Check; efficiency below 85% = Watch; a null measurement = Learning.