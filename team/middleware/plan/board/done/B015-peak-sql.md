# B015: Peak SQL module (2 averages over complete days) + `localTime`

## Facts
- Contract (`src/lib/dashboard.ts`; the front-end owns it, so it's read-only for you):
  ```ts
  type PeakHistory = { historyAvgWh: number; highC: number; similarTempDays: number; similarTempAvgWh: number | null };
  ```
  `historyAvgWh` and `similarTempAvgWh` are integers ≥ 0. `similarTempAvgWh === null` exactly when `similarTempDays < 3`.
- DB (`src/server/db/schema.ts`, drizzle + better-sqlite3):
  - `energy_intervals(site_id, start [timestamp ms, 5-min UTC start], load_wh, …)`, PK (site_id, start);
  - `weather_observed(site_id, hour [timestamp ms, UTC hour start], temp_c, …)`, PK (site_id, hour).
  - See `src/server/snapshot/load.ts` for the query style and `load.test.ts` for the temp-DB test setup.
- `src/lib/time.ts` has `localParts`, `localDate`, `addDays` and `localMidnight(date, tz)`.
  - **Add `localTime(date, minutes, tz)`** = UTC ms of the local clock time `minutes` after midnight on `date`. It must be DST-safe, and `minutes` may be 1440 (= next midnight).
  - Make `localMidnight` = `localTime(date, 0, tz)`.
  - Inside a DST gap/overlap (2:00–3:00), the result only needs to be deterministic.
- **Complete day:** a site-local day before `today` whose `energy_intervals` count equals its 5-min slot count = (next local midnight − local midnight) / 5 min. That's 288, or 276/300 on DST days.
- **Query 1:**
  - for every complete day D: `Σ load_wh` over the intervals with `start` in `[localTime(D, fromMin), localTime(D, toMin))`;
  - `historyAvgWh = round(AVG)` over those days.
- **Query 2:**
  - the same per-day sums, but only for complete days whose observed high passes `|high − highC| ≤ 3`;
  - the observed high = `MAX(temp_c)` over the `weather_observed` hours in `[localMidnight(D), localMidnight(D+1))`;
  - `similarTempDays` = count; `similarTempAvgWh = round(AVG)`, or `null` when count < 3;
  - days without observed weather never match.
- **Both must be SQL** (PO requirement), over the whole stored history.
  - SQLite has no time zones, so JS computes the day bounds and passes them as a CTE: `WITH days(day, from_ms, to_ms, d0_ms, d1_ms) AS (VALUES …)`.
  - Then `JOIN energy_intervals ON start >= from_ms AND start < to_ms` and `GROUP BY day`, with the AVG on top.
  - The values are integers computed in JS, so they can be inlined as literals (check `Number.isSafeInteger`).
  - It must work for 3,653 days (10 years). Mind SQLite's bound-parameter limit if you use parameters.
- Interface (`src/server/snapshot/peak.ts`; B016 calls it from `load.ts`):
  ```ts
  /** Complete site-local days before `today`, oldest first (YYYY-MM-DD). */
  export function completeDays(db: Db, siteId: number, tz: string, today: string): string[];
  /** null when days is empty. fromMin/toMin = local minutes after midnight, e.g. 960/1260 for 16:00–21:00. */
  export function peakHistory(db: Db, siteId: number, o: { tz: string; days: string[]; fromMin: number; toMin: number; highC: number }): PeakHistory | null;
  ```
  `completeDays` may also be one SQL with a days CTE: every day from the earliest stored interval up to yesterday, with `HAVING count = slots`.
- DB reads only: no network, no writes.
- Env notes:
  - link the main node_modules: `cmd /c mklink /J node_modules "D:\Programming Projects\voltops\node_modules"`. Remove it with `cmd /c rmdir node_modules` before you finish. Never `git worktree remove --force` while it exists;
  - lint needs `SKIP_ENV_VALIDATION=1`. If `pnpm lint` exits 1 with no findings, re-run it once (or use `rtk proxy pnpm lint`). Vitest can flake under load; re-run once;
  - test files must lint clean too (`no-base-to-string` and `unbound-method` were common misses);
  - no network in tests;
  - **COMMIT before handing off, and give the commit hash and branch name in your summary.**

## Owned files
- Tester: `src/server/snapshot/peak.test.ts`, `src/lib/time.test.ts`
- Implementer: `src/server/snapshot/peak.ts`, `src/lib/time.ts`

## Base
- Tester: `middleware`, branch `phase2b/middleware-peak-sql-tests`.
- Implementer: the tester's branch, then branch `phase2b/middleware-peak-sql`.

## Judged by
`pnpm vitest run src/server/snapshot/peak src/lib/time` is green, and typecheck and lint pass. The tests use a seeded temp DB (America/Los_Angeles) and cover:
- `localTime`: 16:00 on a normal day and on 2026-03-08 and 2026-11-01; 1440 = next midnight; `localMidnight` unchanged;
- complete days:
  - a full day counts, and a day missing one interval doesn't;
  - today is excluded even if full;
  - DST days count with 276/300 intervals;
- query 1:
  - a hand-computed average over ≥ 3 days, including a DST day where 16:00 local has a different UTC offset;
  - intervals outside the window are ignored;
- query 2:
  - the ±3 boundary is inclusive (3.0 in, 3.1 out);
  - < 3 matches → `null`, with the right count;
  - days without observed weather aren't matched;
- `peakHistory` with `days: []` → `null`;
- 3,653 complete-day bounds don't throw. The test may seed only a few days; the CTE size is what matters.
