# B002 — `DashboardData` contract, `sampleDashboard`, formatters

## Facts
- **Purpose.** `/home` shows an overview dashboard on sample data (PO decisions Q5, Q11). This file is the contract: another team later fills `DashboardData` from the DB, so the type must be exact and in canonical units.
- **Units** (CLAUDE.md §5):
  - power in W and energy in Wh, both **integers**; money in integer **cents**; times are ISO-8601 UTC strings;
  - `solarW` ≥ 0, `loadW` ≥ 0;
  - `batteryW` > 0 when discharging and < 0 when charging;
  - `gridW` > 0 when importing and < 0 when exporting;
  - invariant: `solarW + batteryW + gridW ≈ loadW` (±50 W).
- **File `src/app/(protected)/home/data.ts`** exports exactly this type (plus `TouPeriod`) and `sampleDashboard`:
```ts
export type TouPeriod = "off-peak" | "mid-peak" | "peak";
export type DashboardData = {
  site: { name: string; timezone: string };            // IANA tz
  source: "fleet-api" | "local-gateway" | "replay";
  updatedAt: string;
  currency: string;                                     // ISO 4217
  live: { solarW: number; loadW: number; batteryW: number; gridW: number;
          socPct: number; usableCapacityWh: number; gridStatus: "connected" | "islanded" };
  tariffNow: { period: TouPeriod; importCentsPerKwh: number; exportCentsPerKwh: number; endsAt: string };
  recommendation: null | {
    action: string; validFrom: string; validTo: string;
    effectWh: number; savingsCents: number;
    why: string[];                                      // 1–3 plain sentences
    confidence: "low" | "medium" | "high";
    wouldChange: string;
  };
  timeline: Array<{                                     // 48 consecutive hours
    hour: string;                                       // start of hour, UTC
    kind: "actual" | "forecast";                        // all actuals precede all forecasts
    loadWh: number; solarWh: number; socPct: number; period: TouPeriod;
    loadP10Wh?: number; loadP90Wh?: number;             // forecast rows only
    solarP10Wh?: number; solarP90Wh?: number;           // p10 ≤ value ≤ p90
  }>;
  today: { solarWh: number; loadWh: number; gridImportWh: number; gridExportWh: number;
           batteryChargeWh: number; batteryDischargeWh: number; selfPoweredPct: number };
  costToday: { periods: Array<{ period: TouPeriod; importWh: number; costCents: number }>;
               exportCreditCents: number; netCents: number };   // net = Σ costCents − exportCreditCents
  last7Days: Array<{ date: string; solarWh: number; loadWh: number }>;  // 7 dates YYYY-MM-DD, oldest first
  accuracy: Array<{ target: "load" | "solar"; model: string; baseline: string;
                    maePct: number; baselineMaePct: number; days: number }>;
  health: { lastPollAt: string; estRequestsPerMonth: number; warnings: string[] };
};
```
- **The sample.**
  - One plausible summer day: a 13.5 kWh Powerwall home, `America/Los_Angeles`, `currency "USD"`, `source "fleet-api"`.
  - `updatedAt` is fixed in the late afternoon (e.g. `2026-07-15T23:40:00Z` = 16:40 local, mid-peak) and **deterministic**: no `Date.now()`, no randomness.
  - Live: solar producing, the battery charging, the grid exporting a little.
  - `recommendation` is non-null, e.g. "Raise backup reserve to 65%" from 21:00, with 2–3 `why` sentences about tomorrow being cloudy and the 4–9 PM peak needing about 11 kWh.
  - Timeline: hours from local midnight today to 48 h later. Hours up to `updatedAt` are `actual`, the rest are `forecast` with p10/p90.
  - Peak is 16:00–21:00 local, mid-peak 15–16 and 21–24, otherwise off-peak (plausible PG&E-like).
  - `accuracy`: `load-v1` beats `seasonal-naive`, and `solar-v1` beats `yesterday`.
- **File `src/lib/format.ts`:**
  - `formatKw(w: number): string`: absolute value, 1 decimal + " kW" (`4180` → `"4.2 kW"`, `-2100` → `"2.1 kW"`, `0` → `"0.0 kW"`);
  - `formatKwh(wh: number): string`: 1 decimal + " kWh" (`11040` → `"11.0 kWh"`);
  - `formatMoney(cents: number, currency: string): string`: `Intl.NumberFormat("en-US", { style: "currency", currency })` (`310, "USD"` → `"$3.10"`, `-45` → `"-$0.45"`).
  - These are the only unit conversions in the UI.
- Pure modules: no I/O, no React, no `server-only`.

## Owned files
- Tester: `src/lib/format.test.ts`, `src/app/(protected)/home/data.test.ts`.
- Implementer: `src/lib/format.ts`, `src/app/(protected)/home/data.ts`.

## Base
- Tester: `front-end-development` → branch `phase2a/ui-data-test`. The tests must FAIL on the base (the modules don't exist).
- Implementer: `phase2a/ui-data-test` → branch `phase2a/ui-data-impl`.

## Judged by
- `format.test.ts`: the examples above, plus rounding (`4150` → `"4.2 kW"` or `"4.1 kW"`, whichever `toFixed(1)` gives; pin it) and large values (`123456` Wh → `"123.5 kWh"`).
- `data.test.ts` on `sampleDashboard`:
  - live: the invariant within 50 W; all W/Wh/cents fields are integers; the sign rules hold; `socPct` is 0–100;
  - timeline: length 48, hours exactly 1 h apart, all actuals before all forecasts, at least one of each;
  - every forecast row has p10 ≤ value ≤ p90 for load and solar; actual rows have no p10/p90;
  - `costToday.netCents === Σ periods.costCents − exportCreditCents`;
  - `last7Days`: length 7, ascending dates;
  - `accuracy` has load and solar, each with `maePct < baselineMaePct`;
  - `recommendation` is non-null with 1–3 `why` items; `today.selfPoweredPct` is 0–100;
  - every ISO time string parses (`!isNaN(Date.parse(x))`).
- Command: `pnpm test && pnpm typecheck && SKIP_ENV_VALIDATION=1 pnpm lint`, all green, lint with 0 warnings.
- **Worktree:** no dep changes, so link main's node_modules: `cmd //c mklink //J node_modules "D:\Programming Projects\voltops\node_modules"`. Run `cmd //c rmdir node_modules` **before** any `git worktree remove`, and never use `--force`. Never copy the PO's `.env`.

## Gate log
