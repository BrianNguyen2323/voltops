# B012 — Peak-hours tile + reserve advice sentence (placeholders on sample data)

## Skills
Implementer: `Use skill: frontend-design` (the tile and the sentence must fit the existing theme). Reviewer: `Use skill: agent-browser` for 390/1440 screenshots.

## Facts
- **SPEC Rev 6 "Peak-hours estimate and reserve advice"** (`team/front-end/design/SPEC.md`). Read that section in full: it is the exact contract (types, helpers, check rules, view, UI copy, sample values). Summary:
  - snapshot `peakEstimate: { historyDays; today: PeakHistory | null; tomorrow: PeakHistory | null }`, `PeakHistory = { historyAvgWh; highC; similarTempDays; similarTempAvgWh: number | null }`;
  - `recommendation.reserve?: { emergencyPct; extraPct; targetPct; peakWh; coveredWh }`;
  - exported pure helpers:
    - `peakEstimateWh(p)` = round(mean of the two averages), or `historyAvgWh` alone when `similarTempAvgWh` is null;
    - `reservePlan(peakWh, usableCapacityWh, emergencyPct = 20)`: extra = min(100 − e, ceil(peakWh×100/cap)), target = e + extra, covered = target < 100 ? peakWh : min(peakWh, floor(extra×cap/100));
  - `checkSnapshot` rules (SPEC list);
  - view `peakUsage: { learning (historyDays < 7), historyDays, today: PeakDay | null, tomorrow: PeakDay | null }`, `PeakDay = PeakHistory & { estimateWh, windowStart, windowEnd, usedSoFarWh }`. The window comes from that site-local date's `period === "peak"` Timeline hours; usedSoFar = Σ loadWh of today's actual peak hours, null if none yet, always null for tomorrow;
  - the UI:
    - the "Peak hours" tile is the 3rd cell of the Right-now strip (`sm:grid-cols-2 lg:grid-cols-3`);
    - the Tonight card renders "Raise your backup reserve to {targetPct}%." plus "With {emergencyPct}% as reserve for emergencies, an additional {extraPct}% will help you save {money} for tomorrow's estimated {kWh} usage during peak hours." when `reserve` is present; otherwise it is unchanged.
- **Sample values (exact):**
  - `historyDays: 30`;
  - today `{10200, 33, 8, 11600}` → 10 900;
  - tomorrow `{10200, 24, 6, 8400}` → 9 300;
  - `reserve = reservePlan(9300, 13500)` → extra 69, target 89, covered 9300;
  - `savingsCents 167`, `effectWh 9300`;
  - action "Raise backup reserve to 89%";
  - the why-line "about 11 kWh" → "about 9.3 kWh".
- **Middleware stub (placeholder spot):** `src/server/snapshot/build.ts` must keep compiling. Add exactly `peakEstimate: { historyDays: 0, today: null, tomorrow: null }, // placeholder until middleware B013` next to its `recommendation: null`. Change nothing else there.
- Canonical units: W/Wh integers, cents, ISO UTC, °C (CLAUDE.md §5). All display formatting goes through `src/lib/format.ts` (`formatKwh`, `formatMoney`, `formatTemp`).
- The rest of `/home` must look unchanged apart from the new tile and the new Tonight text.

## Owned files
- Tester: `src/lib/dashboard.test.ts`, `src/components/dashboard/dashboard.test.tsx`, `src/app/(protected)/home/data.test.ts`.
- Implementer:
  - `src/lib/dashboard.ts`;
  - `src/app/(protected)/home/data.ts`;
  - `src/components/dashboard/dashboard.tsx`;
  - `docs/dashboard-snapshot.md` (add a "Peak estimate and reserve advice" section);
  - `src/server/snapshot/build.ts` (the one stub line only);
  - plus fixing any other test/fixture that builds a full `DashboardSnapshot` literal and breaks on the new required field, by adding the stub value only. List each one in the handoff.

## Base
- Tester: `front-end-development` → branch `phase2a/peak-tile-test`. New tests must FAIL on the base for the right reason (missing exports/fields/markup), not syntax errors.
- Implementer: `phase2a/peak-tile-test` → branch `phase2a/peak-tile-impl`.

## Judged by
- **Tests (tester writes):**
  - `peakEstimateWh`: mean, null fallback, rounding.
  - `reservePlan`: 11000/27000 → 41/61; 9300/13500 → 69/89; capped (15000/13500 → extra 80, target 100, covered 10800); ceil (exact multiples don't round up).
  - `checkSnapshot`: `sampleSnapshot` → `[]`; each new rule fires on one mutated snapshot (bad historyDays, similarTempAvgWh present with < 3 days, a day non-null without peak hours, reserve mismatching `reservePlan`, reserve with historyDays < 7, emergencyPct < 20).
  - `toDashboardView`: the window from peak hours (sample 16:00–21:00 local), usedSoFarWh = the sample's 16:00 actual load, null for tomorrow, null when no actual peak hour yet, learning true at 6 / false at 7.
  - Markup:
    - the tile shows "Peak hours", "Today", "Tomorrow", "10.9 kWh", "9.3 kWh", "used so far", "Usual 10.2 kWh (30 days)", "On days near 91°F" and the null-average text;
    - learning shows "Learning your usage: 3 of 7 days";
    - Tonight shows "Raise your backup reserve to 89%." and "With 20% as reserve for emergencies, an additional 69% will help you save $1.67 for tomorrow's estimated 9.3 kWh usage during peak hours.";
    - the capped sentence includes "That covers about";
    - without `reserve`, the old action line still renders.
- **Command:** `rm -rf .next && pnpm test && pnpm test:scripts && pnpm typecheck && SKIP_ENV_VALIDATION=1 rtk proxy pnpm lint && SKIP_ENV_VALIDATION=1 pnpm build`, all green.
- **Visual (reviewer):**
  - screenshots of `/home` at 390 and 1440 px (scratch DB in `data/`, dev server in the background on **3100**, never 3000);
  - the tile sits beside "Your home now" on desktop and stacks on a phone;
  - the theme and type are consistent;
  - nothing else moved;
  - run `agent-browser close` before handing off.
- **Worktree:** junction `cmd //c mklink //J node_modules "D:\Programming Projects\voltops\node_modules"`; `cmd //c rmdir node_modules` before finishing; never `--force`. Keep commands bounded. **COMMIT and give the hash.**

## Gate log
- Tests 19f21fe on `phase2a/peak-tile-test`: 34 new tests fail on the base, all for the right reason (missing exports and fields). The lint errors on the base come from types that don't exist yet. One existing assertion moved: the `action` line is now checked only in the "without reserve" test. Implementer spawned.
