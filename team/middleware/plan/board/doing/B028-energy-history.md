# B028: Energy history module

## Facts
- SPEC Rev 3 "Energy history". One module owns every read and write of `energy_intervals` and `weather_observed`. This brief only **adds** it; B029 rewires the callers. Don't edit existing files.
- Interface (`src/server/history/index.ts`):
  ```ts
  type Db = ReturnType<typeof openDb>;          // ~/server/db
  export type HourEnergy = { start: number; solarWh: number; loadWh: number; gridImportWh: number; gridExportWh: number; batteryChargeWh: number; batteryDischargeWh: number };
  export type ObservedHour = { hour: number; tempC: number; cloudPct: number; ghiWm2: number; precipMm: number };
  export function energyHistory(db: Db, site: { id: number; timezone: string | null }): {
    putIntervals(rows: EnergyInterval[]): void;   // ~/lib/core/types; start = UTC ISO; upsert on (site_id, start), all 6 Wh columns
    putObserved(rows: ObservedHour[]): void;      // upsert on (site_id, hour), all 4 columns
    hours(from: string, to: string): HourEnergy[];     // [localMidnight(from), localMidnight(to)); Σ per UTC hour bucket; ascending by start
    observed(from: string, to: string): ObservedHour[]; // same range; ascending by hour
    isComplete(date: string): boolean;            // stored intervals that day = its 5-min slots (288, or 276/300 on DST days)
    completeDays(before: string): string[];       // complete days < before, from the first stored interval; oldest first
    weatherGaps(today: string): string[];         // days in [today−92, today) with ≥ 1 interval and fewer observed hours than the day has; ascending
    peakAverage(o: { days: string[]; fromMin: number; toMin: number; highC: number }): PeakHistory | null; // ~/lib/dashboard
    latestStart(): number | null;                 // max(start) in ms, null when none
  };
  ```
  Timezone `null` → `"UTC"`. Dates are Site-local `YYYY-MM-DD`. Use `localDate`, `addDays`, `localMidnight` and `localTime` from `~/lib/time`.
- **Same results as today's code.** Port the logic; don't reinvent it:
  - `completeDays` + `peakAverage` = `completeDays` + `peakHistory` in `src/server/snapshot/peak.ts` (SQL with a VALUES days CTE; 10 years of days must work);
  - `hours` = the hourly GROUP BY in `src/server/snapshot/load.ts` (`cast(start / 3600000 as integer) * 3600000`, sums coerced with `Number`);
  - `isComplete` = the per-day count check in `syncEnergy` (`src/worker/jobs.ts`);
  - `weatherGaps` = the gap logic in `fillWeatherGaps` (distinct energy hours → local dates; observed hours per day < the day's hour count);
  - the upserts = `syncEnergy` / `syncWeather` in `src/worker/jobs.ts`.
- Known limits stay (non-whole-hour time zones; the 92-day edge). DB only, no network.
- Env notes:
  - link the main node_modules: `cmd /c mklink /J node_modules "D:\Programming Projects\voltops\node_modules"`. Remove it with `cmd /c rmdir node_modules` before you finish. Never `git worktree remove --force` while it exists;
  - lint needs `SKIP_ENV_VALIDATION=1`; vitest can flake under load, so re-run once; test files must lint clean too (`no-base-to-string` and `unbound-method` are common misses);
  - run `pnpm format:check` (it's in the gate now); no network in tests;
  - **COMMIT before handing off, and give the commit hash and branch name.**

## Owned files
- Tester: `src/server/history/index.test.ts`
- Implementer: `src/server/history/index.ts`

## Base
- Tester: `middleware`, branch `phase2b/middleware-history-tests`.
- Implementer: the tester's branch, then branch `phase2b/middleware-history`.

## Judged by
`pnpm vitest run src/server/history` is green and the full `pnpm vitest run` is still green. `pnpm tsc --noEmit`, `SKIP_ENV_VALIDATION=1 pnpm lint` and `pnpm format:check` pass. The tests use a temp-file DB with migrations (copy the setup from `src/server/snapshot/peak.test.ts`), Site tz `America/Los_Angeles`, and cover:
- the upserts: a second put overwrites, and other Sites are untouched;
- `hours`: per-hour sums, the range bounds and ascending order, on a normal day and on 2026-03-08 (23 h) and 2026-11-01 (25 h);
- `isComplete` / `completeDays`: a full day; a day missing one interval; DST days at 276/300; `before` excluded; oldest first;
- `weatherGaps`: energy but no weather (gap), partial weather (gap), full weather (no gap), no energy (no gap), older than 92 days (excluded), a DST day's hour count;
- `peakAverage`: every case from `peak.test.ts` (history average, similar-temp days ±3 °C, `null` average when < 3 similar days, empty days → `null`);
- `latestStart`: null, then the max;
- `timezone: null` behaves as UTC.
