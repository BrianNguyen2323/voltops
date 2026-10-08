# B017: Weather gap-fill in the worker

## Facts
- PO (front-end Decision round 4, Q4 A + a condition): fetch past hourly weather from Open-Meteo **only for site-local days that have stored energy but lack observed weather**, up to 92 days back. Never fetch for days without energy. Open-Meteo is free and keyless; this job never calls Tesla.
- **Gap day:** a site-local day that:
  - is **before today** and within the last 92 days;
  - has ≥ 1 `energy_intervals` row;
  - has fewer `weather_observed` hours than the day has hours. That's 24, or 23/25 on DST days (= (next local midnight − local midnight) / 1 h).
- **Fetch:**
  - one call, with `past_days = (today − oldest gap day)` in days (1..92) and `forecast_days=1`;
  - `fetchWeather` (`src/lib/weather/open-meteo.ts`) gains optional `pastDays` / `forecastDays`. The defaults stay 1 / 3, so the regular 3-hourly job doesn't change;
  - keep the mapper as is. It already shifts `shortwave_radiation` by 1 h and splits observed/forecast at the fetch time.
- **Write:**
  - upsert only the **observed** rows whose hour falls on a gap day, with the same `onConflictDoUpdate` as `syncWeather`. Write no forecast rows;
  - idempotent: a second run on the same data changes nothing, and once the days are full it makes no call.
- **Where:**
  - a new `fillWeatherGaps(deps, site)` in `src/worker/jobs.ts`, run inside `runWeather` after `syncWeather` for each site, wrapped in `guarded("fillWeatherGaps", …)`;
  - a site without lat/lon is skipped (no call). No gap day → no call.
- Existing pieces:
  - in `jobs.ts`: `Deps` (`db`, `fetch`, `now`, …), `syncWeather`, `dayRange` and `guarded`;
  - in `src/lib/time.ts`: `localDate`, `addDays` and `localMidnight`;
  - the recorded fixture `fixtures/open-meteo/*.json`, and the mocked-fetch style in `jobs.test.ts` / `open-meteo.test.ts`.
- This runs in the worker only (D5). Logs never contain tokens or coordinates.
- Env notes:
  - link the main node_modules: `cmd /c mklink /J node_modules "D:\Programming Projects\voltops\node_modules"`. Remove it with `cmd /c rmdir node_modules` before you finish. Never `git worktree remove --force` while it exists;
  - lint needs `SKIP_ENV_VALIDATION=1`. If `pnpm lint` exits 1 with no findings, re-run it once (or use `rtk proxy pnpm lint`). Vitest can flake under load; re-run once;
  - test files must lint clean too (`no-base-to-string` and `unbound-method` were common misses);
  - no network in tests;
  - **COMMIT before handing off, and give the commit hash and branch name in your summary.**

## Owned files
- Tester: `src/worker/jobs.test.ts`, `src/lib/weather/open-meteo.test.ts`
- Implementer: `src/worker/jobs.ts`, `src/lib/weather/open-meteo.ts`

## Base
- Tester: `middleware`, branch `phase2b/middleware-gapfill-tests`.
- Implementer: the tester's branch, then branch `phase2b/middleware-gapfill`.

## Judged by
`pnpm vitest run src/worker src/lib/weather` is green, and typecheck and lint pass. The tests use a mocked fetch (no network) and cover:
- the `fetchWeather` URL: `past_days=1&forecast_days=3` by default, and the given values with options;
- energy on 3 past days and observed weather on 1:
  - one call, with `past_days` reaching the oldest gap day;
  - rows upserted only for the 2 gap days;
  - no forecast rows written;
- a day with energy but only 20 observed hours is a gap; a day with weather but no energy isn't;
- a gap day 100 days back is ignored (> 92), and today is never a gap day;
- no gap → fetch isn't called; no lat/lon → fetch isn't called;
- a second run after filling → fetch isn't called;
- a DST day needs 23/25 hours to be full;
- `runWeather` keeps going when the gap-fill throws (logged by `guarded`).
