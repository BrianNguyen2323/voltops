# B023: cleaner pass on the worker (+ gap-fill query)

## Facts
- Optimization round after M3. Remove dead code and duplication, and simplify. Behavior stays the same.
- Perf item: `fillWeatherGaps` in `src/worker/jobs.ts` (~line 163) selects every 5-min `energy_intervals.start` for 92 days (~26k rows) only to turn them into a set of site-local dates. Query distinct UTC hours instead (a GROUP BY / selectDistinct on the hour bucket of `start`; check how `start` is stored in `src/server/db/schema.ts`, a `ts()` column). That's ≤ 2,208 rows, and mapping hours → local dates gives the same set (whole-hour time zones; non-whole-hour zones are a known, accepted limit). The existing `jobs.test.ts` gap-fill tests must pass unchanged.
- Don't change the job schedule, the Tesla request count or the error handling.
- Env notes:
  - link the main node_modules: `cmd /c mklink /J node_modules "D:\Programming Projects\voltops\node_modules"`. Remove it with `cmd /c rmdir node_modules` before you finish;
  - lint needs `SKIP_ENV_VALIDATION=1`; vitest can flake under load, so re-run once;
  - **COMMIT, and give the hash and branch name.**

## Owned files
`src/worker/**`

## Base
`middleware` (dec2f9a or later). Branch `phase2b/middleware-clean-worker`.

## Judged by
- `pnpm vitest run`, `pnpm test:scripts`, `pnpm tsc --noEmit` and `SKIP_ENV_VALIDATION=1 pnpm lint` are as green as your baseline run (record both counts in the handoff).
- No behavior change. Existing tests keep their assertions, except where Facts say otherwise.
- The diff touches only Owned files.
