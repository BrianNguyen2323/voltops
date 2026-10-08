# B032: one "complete day" rule inside Energy history

## Facts
- SPEC Rev 3 "Energy history": "complete day" is defined once. B028 ported two copies as-is: `isComplete(date)` uses `count >= slots` (from the worker), while `completeDays(before)` uses `HAVING COUNT(*) = slots` (from the peak SQL). Under the PK `(site_id, start)` with 5-min-aligned starts the two agree. A day with extra, misaligned rows would split them.
- Make both use **`>= slots`** (slots = the day's 5-min count: 288, or 276/300 on DST days). Prefer one shared expression/helper inside the module so the rule exists once.
- Add one test: a day with every aligned slot **plus** one extra misaligned interval (e.g. `start` at :02) is complete for both `isComplete` and `completeDays`.
- Env notes:
  - link the main node_modules: `cmd /c mklink /J node_modules "D:\Programming Projects\voltops\node_modules"`. Remove it with `cmd /c rmdir node_modules` before you finish;
  - lint needs `SKIP_ENV_VALIDATION=1`; run `pnpm format:check`;
  - **COMMIT, and give the hash and branch name.**

## Owned files
`src/server/history/index.ts`, `src/server/history/index.test.ts`

## Base
`middleware` (31beb76 or later). Branch `phase2b/middleware-complete-day`.

## Judged by
`pnpm vitest run` (all green, +1 test), `pnpm tsc --noEmit`, `SKIP_ENV_VALIDATION=1 pnpm lint`, `pnpm format:check`. The diff touches only the 2 owned files.
