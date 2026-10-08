# B025: cleaner pass on tariff, forecast and replay

## Facts
- Optimization round after M3. Remove dead code and duplication, and simplify. Behavior stays the same.
- Packages: `src/lib/tariff` (Tesla `tariff_content` → period, rates, cost; DST tests), `src/lib/forecast` (baseline load/solar with p10/p90, SoC projection), `src/server/replay` (demo seed from fixtures).
- Look for helpers that duplicate `src/lib/time.ts`; reuse it, don't edit it.
- Env notes:
  - link the main node_modules: `cmd /c mklink /J node_modules "D:\Programming Projects\voltops\node_modules"`. Remove it with `cmd /c rmdir node_modules` before you finish;
  - lint needs `SKIP_ENV_VALIDATION=1`; vitest can flake under load, so re-run once;
  - **COMMIT, and give the hash and branch name.**

## Owned files
`src/lib/tariff/**`, `src/lib/forecast/**`, `src/server/replay/**`

## Base
`middleware` (dec2f9a or later). Branch `phase2b/middleware-clean-tariff`.

## Judged by
- `pnpm vitest run`, `pnpm test:scripts`, `pnpm tsc --noEmit` and `SKIP_ENV_VALIDATION=1 pnpm lint` are as green as your baseline run (record both counts in the handoff).
- No behavior change. Existing tests keep their assertions, except where Facts say otherwise.
- The diff touches only Owned files.
