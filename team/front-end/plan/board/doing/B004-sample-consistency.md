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
- Tests f677711 on `phase2a/ui-sample-test`: 5 FAIL on base for the right reason (mid-peak, the today sums, socPct, BOM). 2 checks pass on base by chance (live solarW, battery net vs SoC) and stay as guards. Implementer spawned.
- Impl 4cac8c8 on `phase2a/ui-sample-impl`: 67/67, typecheck, lint clean. today/live derived from the actual rows; live = the 16:00 row (3747 W solar, SoC 80); peak ends 04:00Z. Reviewer spawned.
- Reviewer: **FAIL**. Tests pass, but the numbers shown side by side disagree:
  - (blocking) `exportCreditCents` is 38 while `gridExportWh` is 22090; at 8 c/kWh that should be about 177 c;
  - (blocking) `gridImportWh` 3600 can't be right: 00:00–06:00 has about 7.5 kWh load, no solar and flat SoC, so it must have been imported. `gridExportWh` is a plug value, and `batteryDischargeWh` is 0;
  - (nit) 300 Wh mid-peak import while 15:00 has a 4.6 kW surplus;
  - (nit) `last7Days` 07-15 solar 36200 < `today.solarWh` 42176.

## Round 2 (after review FAIL): derive every total from the actual rows
### Facts (added)
- **Per actual row `i`** (rows 0..k, where k = the last actual row; `next` = row i+1's `socPct`, or `live.socPct` for k):
  - `batteryWh_i = round((soc_i − next) / 100 × usableCapacityWh)` (> 0 = discharge);
  - `gridWh_i = load_i − solar_i − batteryWh_i` (> 0 = import).

  A row's `socPct` is the SoC at the **start** of that hour.
- **The timeline SoC must tell a plausible story:**
  - overnight the battery covers the home and falls (e.g. ~55% at midnight down to ~20% by 06:00), then the grid covers the rest until solar;
  - solar charges it through the day;
  - at 16:40 solar still exceeds the load, so the battery is still charging and the grid exports a little. That matches the existing B002 test (`batteryW < 0`, `gridW < 0`) and the round-1 checks.
- **`today`:**
  - `gridImportWh` = Σ max(gridWh_i, 0); `gridExportWh` = Σ max(−gridWh_i, 0);
  - `batteryChargeWh` = Σ max(−batteryWh_i, 0); `batteryDischargeWh` = Σ max(batteryWh_i, 0);
  - `selfPoweredPct` = round(100 × (1 − gridImportWh / loadWh)).
- **`costToday`:**
  - `periods[p].importWh` = Σ import of the rows in period p, and every period present in the actual rows is listed;
  - `costCents` = round(importWh × that period's import rate / 1000). Rates are constants in `data.ts`: off-peak 30, mid-peak 38, peak 48 c/kWh. `tariffNow.importCentsPerKwh` = the peak rate;
  - `exportCreditCents` = round(gridExportWh × `tariffNow.exportCentsPerKwh` / 1000); `netCents` = Σ cost − credit.
- **`last7Days`:** the last entry is `2026-07-15` (today so far), and its `solarWh`/`loadWh` equal `today`'s.
- Compute all of this in code from the timeline, not with hand-typed constants.

### Owned files / Base
- Tester: `data.test.ts`, base `phase2a/ui-sample-impl` (4cac8c8) → branch `phase2a/ui-sample-test2`.
- Implementer: `data.ts`, base `phase2a/ui-sample-test2` → branch `phase2a/ui-sample-impl2`.

### Judged by (added)
The test re-computes the per-row model above independently and checks:
- `today.gridImportWh`, `gridExportWh`, `batteryChargeWh` and `batteryDischargeWh` each within 3% (or 100 Wh) of the derived sums;
- `batteryDischargeWh` > 0;
- `selfPoweredPct` within 1 of the formula;
- Σ `periods.importWh` === `today.gridImportWh`; each period's `importWh` within 100 Wh of the derived per-period sum;
- `exportCreditCents` within 1 of the formula;
- the `last7Days` last entry equals `today` (solar and load), with date `2026-07-15`.

Same command as round 1.
