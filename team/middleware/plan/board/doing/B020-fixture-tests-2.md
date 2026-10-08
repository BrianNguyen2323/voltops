# B020: 2 map tests stop pinning one recording

## Facts
- The PO re-recorded the fleet-api fixtures again (commit a491385, day 2026-10-07). On them, 2 tests in `src/lib/sources/fleet-api/map.test.ts` fail. Both assume something about one particular recording, not about the code:
  1. "returns one interval per time_series entry with UTC ISO starts" hard-codes `"2026-10-06T07:05:00.000Z"` for the second interval (the B014 review nit). Derive it from the raw fixture instead. Keep it a real UTC check, e.g. `new Date(raw[1].timestamp).toISOString()`, plus a check that the starts are 5 min apart and end in `Z`.
  2. "does not warn at exactly 50 W imbalance" sets `grid_power: 50`. That only made a 50 W imbalance because the old recording had `grid_power` 0. Use `grid_power: live.response.grid_power + 50`. Do the same in the sibling "> 50 W" test if it has the same assumption (e.g. `+ 500`), and keep `expect(r.gridW)` consistent with it.
- The PO's rule: fixtures get re-recorded and committed regularly, so no test may pin values of one recording.
- Don't change source code or fixtures.
- Env notes:
  - link the main node_modules: `cmd /c mklink /J node_modules "D:\Programming Projects\voltops\node_modules"`. Remove it with `cmd /c rmdir node_modules` before you finish;
  - lint needs `SKIP_ENV_VALIDATION=1`;
  - **COMMIT, and give the hash and branch name.**

## Owned files
`src/lib/sources/fleet-api/map.test.ts`

## Base
`middleware` (a491385 or later). Branch `phase2b/middleware-fixture-tests-2`.

## Judged by
- `pnpm vitest run`: all green on a491385's fixtures.
- typecheck and lint are clean.
- The diff touches only `map.test.ts`.
