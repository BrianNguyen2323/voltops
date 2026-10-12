# B037: Pure equipment-health module

Hand-off from front-end (2026-10-08, front-end SPEC Rev 8; research `team/front-end/research/system-info/HEALTH.md`). Lead plan: SPEC Rev 4 → "Equipment health". **Its definitions are the contract for this brief**; read them first. The snapshot wiring is B042, not here.

## Facts
- New files only: `src/lib/health/index.ts` and `src/lib/health/index.test.ts`. Pure: no DB, no fetch, no `Date.now()`. In the style of `src/lib/advisor/reserve.ts` and `src/lib/forecast/baseline.ts`.
- Signature:
  ```ts
  import type { DashboardSnapshot } from "~/lib/dashboard";
  import type { HourEnergy, ObservedHour } from "~/server/history";
  type Eh = DashboardSnapshot["equipmentHealth"];
  export function equipmentHealth(i: {
    hours: HourEnergy[];            // UTC hour starts, ms
    observed: ObservedHour[];       // UTC hour starts, ms
    soc: { ts: number; socPct: number }[];
    tz: string;                     // IANA
    now: number;                    // ms
  }): Omit<Eh, "backfill">;
  ```
  If importing a type from `~/server/history` into `src/lib` breaks a lint boundary, copy the two row types into the module instead and say so.
- Site-local month and day keys come from `src/lib/time.ts` (`localDate`, `localParts`, `addDays`); don't hand-roll offsets.
- The four measurements, thresholds and null rules are exactly SPEC Rev 4's. Integers out: `pctOfBaseline`, `estimatedWh`, `expectedWh`, `actualWh`, `pct` are rounded. Medians of even-length lists = the mean of the middle two.
- Env notes:
  - link the main node_modules: `cmd /c mklink /J node_modules "D:\Programming Projects\voltops\node_modules"`. Remove it with `cmd /c rmdir node_modules` before you finish. Never `git worktree remove --force` while it exists;
  - lint needs `SKIP_ENV_VALIDATION=1`; vitest can flake under load, so re-run once; test files must lint clean too;
  - run `pnpm format:check`; no network in tests;
  - **COMMIT before handing off, and give the commit hash and branch name.**

## Owned files
- Tester: `src/lib/health/index.test.ts`.
- Implementer: `src/lib/health/index.ts`.

## Base
- Tester: `middleware`, branch `phase2b/middleware-health-tests`.
- Implementer: the tester's branch, then branch `phase2b/middleware-health`.

## Judged by
Each measurement has a synthetic-data test with a known answer **and** a test at its learning/null threshold:
- solarClearDay: a month at 95% of the same month a year earlier → 95; 19 clear hours → null; cloudy or weak-sun hours are ignored.
- sunnyDayMiss: a clear day at 70% of expected is returned; one at 80% is not; the newest qualifying day wins; < 14 days of data → null; a cloudy day at 50% is not flagged.
- batteryCapacity: 5 discharge swings of 50 points moving 13,000 Wh each → 26,000; 4 swings → null; a run broken by a rise or a > 75 min gap is not one swing; a 39-point run doesn't count; charge swings don't count.
- efficiency: Σ discharge 880 / Σ charge 1000 → 88; 9 days → null.
- DST: a site in America/Los_Angeles with the last complete month containing a DST change (e.g. `now` in December, month = November) gives the right month keys and day boundaries.
- Full `pnpm vitest run`, tsc, lint and `pnpm format:check` are green.
