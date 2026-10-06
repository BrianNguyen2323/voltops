# B004 — Make `sampleDashboard` internally consistent

## Facts
- **Background.** B002 merged `src/app/(protected)/home/data.ts`: the `DashboardData` type, `sampleDashboard` and formatters. Its tests are in `src/app/(protected)/home/data.test.ts`. B003 will render the sample on `/home`, so the numbers on screen must agree with each other.
- **The B002 review found these mismatches:**
  1. The B002 brief contradicted itself: it said 16:40 local is mid-peak, while peak is 16:00–21:00. **Resolution (lead):** keep `updatedAt` = `2026-07-15T23:40:00Z` (16:40 PDT), which **is peak**. So `tariffNow.period` = `"peak"` and `tariffNow.endsAt` = `2026-07-16T04:00:00Z` (21:00 PDT). The tariff periods themselves stay as they are: peak 16–21, mid-peak 15–16 and 21–24, otherwise off-peak.
  2. `today.solarWh` (31000) ≠ the sum of the actual timeline rows' solar (about 42.2 kWh).
  3. Live `solarW` 4800 doesn't match the 16:00 timeline row (3.7 kWh), and live `socPct` 62 doesn't match that row's 80.
  4. `today.batteryChargeWh` − `batteryDischargeWh` doesn't match the SoC change since midnight on 13.5 kWh.
  5. `data.ts` and `src/lib/format.ts` start with a UTF-8 BOM. Remove it.
- **Rule:** `today` and `live` are derived from the timeline's actual rows. The current hour is the 16:00 PDT row = the last actual row.
- Keep all existing B002 invariants:
  - `solarW + batteryW + gridW ≈ loadW` (±50 W), integers, the sign rules;
  - 48 rows; all actuals before all forecasts, split at `updatedAt`;
  - p10 ≤ value ≤ p90 on forecast rows; net = Σcost − credit;
  - `usableCapacityWh` 13500; models `load-v1`/`seasonal-naive` and `solar-v1`/`yesterday` beating their baselines;
  - deterministic: no `Date.now()`, no randomness.
- **Plausibility** at 16:40 in peak on a July day:
  - solar is still producing, a few kW and falling;
  - the battery may still be charging from the surplus or covering the load;
  - `costToday` peak import can be small but non-zero.

## Owned files
- Tester: `src/app/(protected)/home/data.test.ts`.
- Implementer: `src/app/(protected)/home/data.ts`, `src/lib/format.ts` (BOM removal only).

## Base
- Tester: `front-end-development` (at or after 474e892) → branch `phase2a/ui-sample-test`. Change the "mid-peak" pin to "peak" and add the checks below. They must FAIL on the base.
- Implementer: `phase2a/ui-sample-test` → branch `phase2a/ui-sample-impl`.

## Judged by
- New or changed tests in `data.test.ts`:
  - `tariffNow.period === "peak"`, and it equals the `period` of the last actual timeline row; `tariffNow.endsAt === "2026-07-16T04:00:00Z"`;
  - `today.solarWh` and `today.loadWh` are each within 10% of the sum of the actual rows' `solarWh` and `loadWh`;
  - live `socPct` is within 3 of the last actual row's `socPct`;
  - live `solarW` is within 30% of the last actual row's `solarWh` (one hour of energy ≈ average W);
  - `(today.batteryChargeWh − today.batteryDischargeWh)` is within 10% of `usableCapacityWh` of `(live.socPct − firstRow.socPct) / 100 × usableCapacityWh`;
  - neither file starts with a BOM (`readFileSync(...)[0] !== 0xEF`).
- Command: `pnpm test && pnpm typecheck && SKIP_ENV_VALIDATION=1 pnpm lint`, all green, lint with 0 warnings.
- **Worktree:** no dep changes, so link main's node_modules (`cmd //c mklink //J node_modules "D:\Programming Projects\voltops\node_modules"`). Run `cmd //c rmdir node_modules` before finishing, and never use `--force`.

## Gate log
- Tester attempt 1 stalled (watchdog, no output, no worktree left). Re-spawned 2026-10-06.
