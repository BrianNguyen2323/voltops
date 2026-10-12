# B042: Wire `equipmentHealth` + backfill progress into the snapshot

Lead plan: SPEC Rev 4 → "Equipment health" (last bullet) and "Request budget + backfill" (Snapshot). Needs B036, B037 and B038 merged.

## Facts
- `src/server/snapshot/load.ts` reads, for the Site:
  - `history.hours(from, to)` and `history.observed(from, to)` for 13 months + 7 days before today (site-local dates);
  - that window's `samples` (`ts`, `socPct`).
- It passes them to `equipmentHealth` (`src/lib/health`) and the result into `buildSnapshot`, which stays pure. `backfill` comes from `backfillState` (`src/worker/backfill.ts`). Move `backfillState` to `src/server/` if importing worker code into the web bundle breaks the build, and say so.
- `health.estRequestsPerMonth` (today a constant 1440 in `build.ts`) adds `min(daysTotal − daysDone, TESLA_BACKFILL_MAX_PER_MONTH)` while the state is `running`.
- The demo (replay) holds 7 days, so all four measurements are null ("learning") there, and `checkSnapshot` stays `[]`.
- Env notes:
  - link the main node_modules: `cmd /c mklink /J node_modules "D:\Programming Projects\voltops\node_modules"`. Remove it with `cmd /c rmdir node_modules` before you finish. Never `git worktree remove --force` while it exists;
  - lint needs `SKIP_ENV_VALIDATION=1`; vitest can flake under load, so re-run once; test files must lint clean too;
  - run `pnpm format:check`; no network in tests;
  - **COMMIT before handing off, and give the commit hash and branch name.**

## Owned files
- Tester: `src/server/snapshot/load.test.ts`, `src/server/snapshot/build.test.ts`.
- Implementer: `src/server/snapshot/load.ts`, `src/server/snapshot/build.ts`.

## Base
- Tester: `middleware` after B036/B037/B038 merge, branch `phase2b/middleware-health-wiring-tests`.
- Implementer: the tester's branch, branch `phase2b/middleware-health-wiring`.

## Judged by
- A temp DB with 14 months of synthetic clear-sky intervals + weather + SoC samples yields all four measurements non-null and `checkSnapshot` `[]`.
- `backfill` progress and the request estimate change while the backfill is running and drop back when it's done.
- The demo seed yields nulls and `checkSnapshot` `[]`.
- Full gate green, plus the lead's docker smoke.
