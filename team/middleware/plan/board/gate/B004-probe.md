# B004: `verify:tesla` probe: does calendar_history return today's partial day?

## Facts
- `scripts/verify-tesla-gets.mjs` (plain Node ESM) is the PO-run, read-only Fleet API check. Its tests are `scripts/verify-tesla-gets.test.mjs` (`node --test`, fake `fetch` injected via `run(deps)`; no network).
- It already has `localParts`, `fmtLocal` and `yesterdayRange(timeZone, now)` → `{start_date, end_date}` (local RFC3339 with offset). It calls `calendar_history` for yesterday with `kind=energy&period=day&start_date&end_date&time_zone`.
- Add `todayRange(timeZone, now)` → `{start_date: local midnight today, end_date: now}`, both local RFC3339 with offset (the same format as `yesterdayRange`). It must be DST-safe.
- After the existing `calendar_history_energy` call, make ONE more GET, named `calendar_history_today`, with `todayRange`. Requirements:
  - **No fixture is written for it.** Today's data is not anonymized-reviewed. Skip `writeFixture` for this name only.
  - It still appears in the results table (status/ok).
  - It logs one line: `today intervals: N (expected about M so far)`. `N` = `time_series.length` (0 if missing). `M = floor((now − local midnight today) / 5 min)`.
  - Nothing else in that response is logged.
- Total requests become 1 refresh + 5 GETs.
- Env notes: worktrees have no node_modules. Link main's from PowerShell: `cmd /c mklink /J node_modules "D:\Programming Projects\voltops\node_modules"`. Agents never run this script against Tesla. Tests only.

## Owned files
- Tester: `scripts/verify-tesla-gets.test.mjs`
- Implementer: `scripts/verify-tesla-gets.mjs`

## Base
Tester: `main`. Implementer: the tester's branch.

## Judged by
- `pnpm test:scripts`: green. The new tests cover `todayRange` (including a DST day for America/Los_Angeles, 2026-03-08 and 2026-11-01), that the extra call is made with the right query, that no fixture is written for it, and the `today intervals` log line;
- the existing tests still pass.
