# B022: cleaner pass on the snapshot and the advisor

## Facts
- Optimization round after M3. Remove dead code and duplication, and simplify. Behavior stays the same.
- Known item: `BuildInput.peakEstimate` in `src/server/snapshot/build.ts:59` is optional with a `?? { historyDays: 0, today: null, tomorrow: null }` fallback at line 73, but `load.ts` always sets it and `build.test.ts:21` documents it as required. Make it required and drop the fallback. Tests that build a `BuildInput` without it get that empty value added explicitly.
- Also look for helpers that duplicate `src/lib/time.ts`, `src/lib/tariff` or `src/lib/forecast`. Reuse them; don't edit them (other members own them).
- Env notes:
  - link the main node_modules: `cmd /c mklink /J node_modules "D:\Programming Projects\voltops\node_modules"`. Remove it with `cmd /c rmdir node_modules` before you finish;
  - lint needs `SKIP_ENV_VALIDATION=1`; vitest can flake under load, so re-run once;
  - **COMMIT, and give the hash and branch name.**

## Owned files
`src/server/snapshot/**`, `src/lib/advisor/**`

## Base
`middleware` (dec2f9a or later). Branch `phase2b/middleware-clean-snapshot`.

## Judged by
- `pnpm vitest run`, `pnpm test:scripts`, `pnpm tsc --noEmit` and `SKIP_ENV_VALIDATION=1 pnpm lint` are as green as your baseline run (record both counts in the handoff).
- No behavior change. Existing tests keep their assertions, except where Facts say otherwise.
- The diff touches only Owned files.
