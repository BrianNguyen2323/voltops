# B014: Fleet-api tests follow the re-recorded fixtures

## Facts
- The PO re-recorded `fixtures/fleet-api/*.json` from the reference system (commit 856a5b7; day 2026-10-06, backup reserve 70%, identifiers redacted). 6 tests pin values from the old capture (day 2026-10-04) and now fail:
  - `src/lib/sources/fleet-api/map.test.ts` (4):
    - `mapLiveStatus` "maps the fixture 1:1 with no sign flips";
    - `mapCalendarHistory` "one interval per time_series entry with UTC ISO starts" (expects 2026-10-04T07:00Z, now 2026-10-06T07:00Z);
    - "maps the first interval's fields";
    - "matches the fixture day totals" (expects ≈40 kWh, now 38.974).
  - `src/lib/sources/fleet-api/client.test.ts` (1): "refreshes the token with Basic auth, then GETs live_status with Bearer" (expects 5469, gets 3874).
  - `src/app/callback-logging.test.ts` (1).
- Update the expected values to the new fixtures. Wherever it's easy, **derive** them from the raw fixture JSON in the test (e.g. Σ of the raw fields) instead of hard-coding new magic numbers, so the next re-recording breaks less. Keep every assertion's intent: no sign flips, 1:1 field mapping, UTC starts, day totals, token flow, no secrets in logs.
- The mappers are believed correct (SPEC: `live_status` maps 1:1; `calendar_history` → 288 intervals). If a failure turns out to be a real mapper bug and not a pinned value, **stop and report it**. Don't change source code.
- The PO owns the fixtures. Don't edit them.
- Env notes:
  - link the main node_modules: `cmd /c mklink /J node_modules "D:\Programming Projects\voltops\node_modules"`. Remove it with `cmd /c rmdir node_modules` before you finish. Never `git worktree remove --force` while it exists;
  - lint needs `SKIP_ENV_VALIDATION=1`. If `pnpm lint` exits 1 with no findings, re-run it once (or use `rtk proxy pnpm lint`). Vitest can flake under load; re-run once;
  - test files must lint clean too (`no-base-to-string` and `unbound-method` were common misses);
  - no network in tests; never call Tesla;
  - **COMMIT before handing off, and give the commit hash and branch name in your summary.**

## Owned files
`src/lib/sources/fleet-api/map.test.ts`, `src/lib/sources/fleet-api/client.test.ts`, `src/app/callback-logging.test.ts`. Nothing else.

## Base
`middleware`. Branch: `phase2b/middleware-fixture-tests`.

## Judged by
- `pnpm vitest run`: the whole suite is green (it was 478/484 on the new fixtures).
- `pnpm typecheck` and `SKIP_ENV_VALIDATION=1 pnpm lint` are clean.
- The diff touches only the 3 test files.
