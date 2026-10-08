# B018: Gap-fill `past_days` counts UTC days (B017 review follow-up)

## Facts
- `fillWeatherGaps` in `src/worker/jobs.ts` (merged in B017) sets `past_days` = (today's local midnight − the oldest gap day's local midnight) in days. But Open-Meteo is called with `timezone=UTC`, so `past_days` counts **UTC** days back from the current UTC date.
- Bug: for a site behind UTC (America/Los_Angeles), between about 17:00 and 24:00 local the UTC date is already a day ahead. `past_days` then comes out one short, so the oldest gap day is only partly returned (e.g. 7 of 24 hours). Partial rows get written and the day stays a gap until a morning run. No data is lost, but it costs a wasted call and a partial day.
- Fix: `past_days = utcDay(now) − utcDay(oldest gap day's local-midnight instant)`, in whole UTC days, clamped to 1..92. The 92-day gap-day window itself doesn't change (still site-local days).
- Optional, same file: count the interval rows per local day with a SQL `GROUP BY` (the day bounds come from JS, like `src/server/snapshot/peak.ts`) instead of loading every row of the 92-day window into JS. Only do this if it stays small.
- Env notes:
  - link the main node_modules: `cmd /c mklink /J node_modules "D:\Programming Projects\voltops\node_modules"`. Remove it with `cmd /c rmdir node_modules` before you finish;
  - lint needs `SKIP_ENV_VALIDATION=1`;
  - no network in tests;
  - **COMMIT, and give the hash and branch name.**

## Owned files
- Tester: `src/worker/jobs.test.ts`
- Implementer: `src/worker/jobs.ts`

## Base
`middleware`. Tester branch `phase2b/middleware-gapfill-utc-tests`; implementer branch `phase2b/middleware-gapfill-utc`.

## Judged by
`pnpm vitest run src/worker` is green, plus typecheck and lint. A new test with NOW = 20:00 PDT (03:00 UTC the next day) and a gap 3 local days back:
- `past_days` reaches that day's whole local span in UTC;
- after one run the day has all 24 observed hours;
- a second run makes no call.

The existing B017 tests stay green.
