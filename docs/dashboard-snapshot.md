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

## What the view derives (do not supply)

- `today`: sums over today's actual hours, plus `selfPoweredPct`.
- `last7Days`: `previousDays` plus today.
- `solarOutlook`: today's vs tomorrow's total solar, `changePct` and `direction` ("less" | "more").
