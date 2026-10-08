> **Split by the middleware lead (R002):** B015 (SQL), B016 (advisor + wiring), B017 (gap-fill). This file stays as the source; it moves to done with M3.

# B013 — Peak-hours estimate (2 SQL averages) + reserve advice + weather gap-fill

From the front-end team (PO topic 2, 2026-10-07; front-end SPEC Rev 6, R006, Decision round 4 in `team/front-end/TODO.md`). Start this after the front-end's B012 merges: it adds the contract, the helpers and a stub in `build.ts`.

## Facts
- **Contract (source of truth `src/lib/dashboard.ts`, guide `docs/dashboard-snapshot.md` "Peak estimate and reserve advice"):**
  ```ts
  peakEstimate: { historyDays: number; today: PeakHistory | null; tomorrow: PeakHistory | null };
  PeakHistory = { historyAvgWh: number; highC: number; similarTempDays: number; similarTempAvgWh: number | null };
  recommendation.reserve?: { emergencyPct; extraPct; targetPct; peakWh; coveredWh }  // = reservePlan(...)
  ```
  Use the exported helpers **`peakEstimateWh(p)`** and **`reservePlan(peakWh, usableCapacityWh, 20)`**; don't re-implement them. `checkSnapshot` enforces every rule below, so make it return `[]`.
- **Peak window per target day (today, tomorrow):** the site-local hours the tariff classifies `peak` on that date (`src/lib/tariff`). SCE TOU-D-4-9PM gives 16:00–21:00. No peak hours that day → that day is `null`.
- **The PO's two SQL queries** (they must be SQL, over `energy_intervals.load_wh` and `weather_observed.temp_c`):
  1. **All-history average:** for every **complete** stored site-local day (exclude today), Σ `load_wh` inside the **target day's local peak clock window** applied to that day, then `AVG` over the days → `historyAvgWh` (rounded integer). `historyDays` = the number of complete days with energy data.
  2. **Similar-temperature average:** the same per-day sums, filtered to days whose observed **high** (`MAX(temp_c)` over that site-local day) is within **±3 °C** of the target day's forecast high (`highC` = `MAX(temp_c)` of the latest-issued `weather_forecast` rows for that date). Output: `similarTempDays` = count, and `similarTempAvgWh` = `AVG`, or `null` when the count is < 3. Days without observed weather aren't matched.

  Both use the **whole** stored history (PO, Q2).
- **SQLite has no time zones.** Compute each history day's local window `[from_ms, to_ms)` and local-day bounds in JS (`src/lib/time.ts`, DST-aware). Pass them in as a CTE, e.g. `WITH days(day, from_ms, to_ms, d0_ms, d1_ms) AS (VALUES …)`, then `JOIN energy_intervals ON start >= from_ms AND start < to_ms`, and do `GROUP BY day` for the sums and the daily high. Keep the queries in one module with a test on a seeded in-memory DB, including a DST day.
- **Combine:** estimate = `peakEstimateWh` (plain mean of the two; history alone under 3 similar days).
- **Learning:** `historyDays < 7` → the front-end shows "Learning your usage", and `recommendation` must be `null` (`reserve` is only allowed when `historyDays ≥ 7`).
- **Reserve advice** (CLAUDE.md §8 advisor; a pure function, e.g. `src/lib/advisor/reserve.ts`): when `peakEstimate.tomorrow` is non-null and there are ≥ 7 days, emit
  - `recommendation` with `reserve = reservePlan(peakEstimateWh(tomorrow), usableCapacityWh, 20)`;
  - `savingsCents = round(coveredWh × (peak import rate − off-peak import rate) / 1000)`, both rates from tomorrow's tariff (Q7);
  - `effectWh = coveredWh`;
  - `action` "Raise backup reserve to {targetPct}%";
  - `validFrom` = tonight's end of peak (or now if later), `validTo` = the end of tomorrow's peak window;
  - `why` lines from the inputs (the usual vs similar-temperature averages, tomorrow's high);
  - `confidence`: "low" under 3 similar days, "medium" otherwise;
  - `wouldChange`.

  **Advisory only**: never write the reserve to the Powerwall (D11).
- **Weather gap-fill (PO Q4, with condition):** fetch past hourly weather from Open-Meteo (`past_days` ≤ 92, free, keyless) **only for site-local days that have `energy_intervals` rows but no `weather_observed` rows**. Never fetch beyond the stored energy history. Run it in the worker (D5), not the web process. Idempotent upserts.

## Owned files
To be set by the middleware lead. Expected: `src/server/snapshot/{build,load}.ts` (replace the `peakEstimate` stub), a new peak-queries module, `src/lib/advisor/**`, `src/worker/**` (gap-fill), `src/lib/weather/open-meteo.ts` (if `past_days` becomes a parameter), and the tests next to each.

## Base
`main` once front-end B012 is merged there (or `front-end-development`).

## Judged by
- Tests:
  - both SQL averages on a seeded DB, including a DST day, a weekend with no peak hours, < 3 similar days → null, and exclusion of today;
  - gap-fill only fetches missing days that do have energy (a mocked fetch, no network);
  - the advisor numbers on the 27 kWh example (11 kWh → 61%).
- `checkSnapshot(loadSnapshot(...)) === []` in load tests and on the replay seed.
- Full gate: vitest, test:scripts, typecheck, lint, build:worker, build.
