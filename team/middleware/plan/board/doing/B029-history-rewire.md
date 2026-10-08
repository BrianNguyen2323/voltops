# B029: Rewire the worker, the snapshot and the seed to Energy history

## Facts
- SPEC Rev 3 "Energy history". After this brief, **no file outside `src/server/history/` reads or writes `energy_intervals` or `weather_observed`**: `grep -rnE "energyIntervals|weatherObserved|energy_intervals|weather_observed" src --include=*.ts` hits only `history/`, `db/schema.ts` and test files.
- The module (B028, merged on `middleware`): `energyHistory(db, site)` with `putIntervals`, `putObserved`, `hours`, `observed`, `isComplete`, `completeDays`, `weatherGaps`, `peakAverage`, `latestStart`. Read its JSDoc in `src/server/history/index.ts`.
- Rewire:
  - `src/worker/jobs.ts`:
    - `syncEnergy` uses `isComplete` + `putIntervals`;
    - `syncWeather` writes observed rows with `putObserved` and forecast rows itself, as **two separate writes** (no shared transaction; forecast stays insert-or-ignore);
    - `fillWeatherGaps` uses `weatherGaps` + `putObserved` (the `pastDays` maths stays);
  - `src/server/snapshot/load.ts`: `hours`, `observed` (split at today's midnight as now), `latestStart`, `completeDays`, `peakAverage`. Keep `peakWindow`/`dayHighC` from the advisor;
  - `src/server/snapshot/build.ts`: `HourRow` → `HourEnergy` from the module (keep `HourRow` as an alias only if that's less churn);
  - `src/server/replay/seed.ts`: intervals and observed weather through `putIntervals`/`putObserved`. If they can't run inside the seed's transaction, call them right after it. State your choice in the handoff;
  - delete `src/server/snapshot/peak.ts` and `peak.test.ts` (their cases live in `history/index.test.ts`).
- **No behavior change**, in two commits:
  1. Rewire, with `load.test.ts`, `jobs.test.ts`, `build.test.ts` and `seed.test.ts` unchanged and all green. Commit.
  2. In `load.test.ts`/`jobs.test.ts`, remove only cases that test Energy-history rules now covered in `history/index.test.ts` (complete-day counts, DST slot counts, gap detection). Keep every wiring and behavior case. List the removed test names in the handoff. Commit.
- Env notes:
  - link the main node_modules: `cmd /c mklink /J node_modules "D:\Programming Projects\voltops\node_modules"`. Remove it with `cmd /c rmdir node_modules` before you finish. Never `git worktree remove --force` while it exists;
  - lint needs `SKIP_ENV_VALIDATION=1`; vitest can flake under load, so re-run once; test files must lint clean too;
  - run `pnpm format:check`; no network in tests;
  - **COMMIT before handing off, and give the commit hashes and branch name.**

## Owned files
`src/worker/jobs.ts`, `src/worker/jobs.test.ts`, `src/server/snapshot/load.ts`, `load.test.ts`, `build.ts`, `build.test.ts`, `peak.ts` (delete), `peak.test.ts` (delete), `src/server/replay/seed.ts`, `seed.test.ts`

## Base
`middleware` after B028 merges. Branch `phase2b/middleware-history-rewire`.

## Judged by
- The grep above is clean.
- Commit 1: `pnpm vitest run` green, with the four test files byte-identical to base.
- Final: `pnpm vitest run`, `pnpm test:scripts`, `pnpm tsc --noEmit`, `SKIP_ENV_VALIDATION=1 pnpm lint`, `pnpm format:check` and `pnpm build:worker` green.
