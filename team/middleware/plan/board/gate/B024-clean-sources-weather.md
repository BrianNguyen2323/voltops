# B024: cleaner pass on the fleet-api source and Open-Meteo

## Facts
- Optimization round after M3. Remove dead code and duplication, and simplify. Behavior stays the same.
- Test item: `src/lib/sources/fleet-api/map.test.ts:26` asserts `expect(warn).not.toHaveBeenCalled()` with the comment "fixture balances". That pins one recording: the PO re-records the fixtures regularly, and a new recording may be off by > 50 W. Compute the residual `solar + battery + grid - load` from the fixture and assert the warn happened iff `|residual| > 50`. This is the only assertion you may change.
- Don't touch `fixtures/` or the token-refresh lease logic semantics in `client.ts`.
- Env notes:
  - link the main node_modules: `cmd /c mklink /J node_modules "D:\Programming Projects\voltops\node_modules"`. Remove it with `cmd /c rmdir node_modules` before you finish;
  - lint needs `SKIP_ENV_VALIDATION=1`; vitest can flake under load, so re-run once;
  - **COMMIT, and give the hash and branch name.**

## Owned files
`src/lib/sources/**`, `src/lib/weather/**`

## Base
`middleware` (dec2f9a or later). Branch `phase2b/middleware-clean-sources`.

## Judged by
- `pnpm vitest run`, `pnpm test:scripts`, `pnpm tsc --noEmit` and `SKIP_ENV_VALIDATION=1 pnpm lint` are as green as your baseline run (record both counts in the handoff).
- No behavior change. Existing tests keep their assertions, except where Facts say otherwise.
- The diff touches only Owned files.
