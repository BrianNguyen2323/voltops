# B016: Reserve advisor + snapshot wiring (`peakEstimate`, `recommendation`)

## Facts
- Contract (`src/lib/dashboard.ts`; the front-end owns it, so it's read-only for you):
  ```ts
  peakEstimate: { historyDays: number; today: PeakHistory | null; tomorrow: PeakHistory | null };
  PeakHistory = { historyAvgWh; highC; similarTempDays; similarTempAvgWh: number | null };
  recommendation: null | { action; validFrom; validTo; effectWh; savingsCents; why: string[]; confidence: "low"|"medium"|"high"; wouldChange; reserve?: ReservePlan };
  ```
  - Use the exported **`peakEstimateWh(p)`** and **`reservePlan(peakWh, usableCapacityWh, 20)`**. Don't re-implement them.
  - `checkSnapshot` enforces:
    - a day's PeakHistory must be null when that date has no `peak` Timeline hour;
    - `similarTempDays ≤ historyDays`;
    - `reserve` only when `tomorrow` is non-null and `historyDays ≥ 7`, and it must equal `reservePlan(...)`.
- Today `src/server/snapshot/build.ts` returns `recommendation: null` and the stub `peakEstimate: { historyDays: 0, today: null, tomorrow: null }`. Replace both.
- **B015** (merged before you start) gives `src/server/snapshot/peak.ts`:
  - `completeDays(db, siteId, tz, today): string[]`;
  - `peakHistory(db, siteId, { tz, days, fromMin, toMin, highC }): PeakHistory | null`;
  - plus `localTime(date, minutes, tz)` in `src/lib/time.ts`.
- **Peak window of a target date** (today, tomorrow):
  - the hours h in `[localMidnight(date), localMidnight(date+1))` with `tariffAt(tariff, h, tz).period === "peak"`. That's the same rule as the Timeline's `period`;
  - `fromMin` = the local minutes of the first such hour's start; `toMin` = the local minutes of the last one's end (1440 at midnight);
  - no such hour, or no tariff → that day is `null`.
- **`highC` of a target date:**
  - for each hour of the day: the observed `temp_c` if present, else the latest-issued forecast `temp_c`; then take the max;
  - no temperature for any hour → that day is `null`;
  - `load.ts` today reads observed GHI only before today. Extend the reads so today's observed temps are available.
- `historyDays = completeDays(...).length`. A day = `peakHistory(...)`, or `null` per the rules above (also `null` when there are 0 complete days).
- **Advisor** (pure, `src/lib/advisor/reserve.ts`; advisory only, D11: nothing writes to the Powerwall):
  - emit a recommendation only when `tomorrow` is non-null **and** `historyDays ≥ 7`; otherwise `recommendation: null`.
  - `reserve = reservePlan(peakEstimateWh(tomorrow), usableCapacityWh, 20)`. `usableCapacityWh` = the snapshot's `live.usableCapacityWh`.
  - `savingsCents = max(0, round(coveredWh × (peakCents − offPeakCents) / 1000))`:
    - `peakCents` = the import rate (`tariffAt`) at the start of tomorrow's window;
    - `offPeakCents` = the lowest import rate among tomorrow's hours whose period is `off-peak` (none → `peakCents`).
  - `effectWh = coveredWh`; `action = "Raise backup reserve to {targetPct}%"`.
  - `validFrom` = ISO of max(updatedAt, the end of today's peak window when today has one); `validTo` = ISO of the end of tomorrow's window.
  - `why` (temperatures in the site's unit: °F = round(c × 9/5 + 32), °C rounded; kWh with 1 decimal):
    - `"Usual peak use: 11.2 kWh over 30 days"`;
    - `"On days near 95°F: 15.4 kWh over 8 days"`, or, when similarTempAvgWh is null, `"Not enough days near 95°F yet (2 so far)"`;
    - `"Tomorrow's forecast high: 95°F"`.
  - `confidence`: `"low"` when `similarTempDays < 3`, else `"medium"`.
  - `wouldChange`: `"A different forecast high for tomorrow, or a tariff change."`
- Keep `build.ts` pure (no I/O). `load.ts` does the reads, including the B015 calls, and passes the results in through `BuildInput`. Where the window/highC helpers live is your call (e.g. `reserve.ts`), as long as they stay pure.
- Worked example (from the PO): a 27 kWh battery and an 11 kWh peak → extra 41%, target **61%**. At $0.48 peak and $0.25 off-peak → 11,000 × 23 / 1000 = **253 cents**.
- Env notes:
  - link the main node_modules: `cmd /c mklink /J node_modules "D:\Programming Projects\voltops\node_modules"`. Remove it with `cmd /c rmdir node_modules` before you finish. Never `git worktree remove --force` while it exists;
  - lint needs `SKIP_ENV_VALIDATION=1`. If `pnpm lint` exits 1 with no findings, re-run it once (or use `rtk proxy pnpm lint`). Vitest can flake under load; re-run once;
  - test files must lint clean too (`no-base-to-string` and `unbound-method` were common misses);
  - no network in tests;
  - **COMMIT before handing off, and give the commit hash and branch name in your summary.**

## Owned files
- Tester: `src/lib/advisor/reserve.test.ts`, `src/server/snapshot/build.test.ts`, `src/server/snapshot/load.test.ts`, `src/server/replay/seed.test.ts`
- Implementer: `src/lib/advisor/reserve.ts`, `src/server/snapshot/build.ts`, `src/server/snapshot/load.ts`

## Base
- Tester: `middleware`, branch `phase2b/middleware-advisor-tests`. Write the load tests against `loadSnapshot`'s output, not against `peak.ts` internals.
- Implementer: the tester's branch with `middleware` merged in (B015 is there by then), branch `phase2b/middleware-advisor`.

## Judged by
`pnpm vitest run src/lib/advisor src/server` is green, plus typecheck, lint, `pnpm build:worker` and `pnpm build`. The tests cover:
- the advisor on the 27 kWh example: 61%, 253 cents; the capped case (a peak above 80% of capacity → target 100%, coveredWh < peakWh); confidence low/medium; the why lines in °F and °C; savings never negative;
- `historyDays < 7` → `recommendation: null` while `peakEstimate` is still filled;
- the load tests on a seeded DB (America/Los_Angeles, an SCE TOU-D-4-9PM tariff from `fixtures/fleet-api/site_info.json`):
  - ≥ 7 complete days and tomorrow a weekday → `peakEstimate.tomorrow` set, `recommendation.reserve` set, `validTo` = tomorrow 21:00 local;
  - tomorrow a Saturday (no ON_PEAK) → `tomorrow: null`, `recommendation: null`;
  - no weather rows → both days null;
  - today's `highC` uses observed temps for past hours;
- `checkSnapshot(snapshot)` is `[]` in every load test, including the DST dates 2026-03-08 and 2026-11-01, and on the replay seed (`seedReplay` then `loadSnapshot`).
