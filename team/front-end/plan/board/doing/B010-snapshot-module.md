# B010 — `src/lib/dashboard.ts`: Dashboard snapshot, check, view (+ sample adapter)

## Skills
Implementer: `Use skill: codebase-design` (one deep module: a small interface — 2 functions + 2 types — with the rules hidden inside).

## Facts
- **SPEC Rev 5 "Dashboard snapshot and view"** (pasted below) and `GLOSSARY.md`. This is architecture candidate 1 (R005).
- **Today:**
  - `src/app/(protected)/home/data.ts` holds both the `DashboardData` type (Rev 4) and `sampleDashboard`, built by one battery dispatch simulation over 48 hourly rows from 2026-07-15 00:00 PDT (`America/Los_Angeles`). The simulation already computes per-hour battery and grid energy internally.
  - `updatedAt` is `2026-07-16T00:00:00Z` (17:00 PDT); actual hours are 00:00–16:00 PDT (17 rows).
  - The UI (`src/components/dashboard/*`) and `page.tsx` import `DashboardData`/`sampleDashboard`. **Don't edit the UI in this brief.**
- **New module `src/lib/dashboard.ts`** (pure: no React, no I/O, no `server-only`):
  - **`TouPeriod`, `TimelineHour`, `DashboardSnapshot`.**
    - The snapshot = the Rev 4 `DashboardData` fields **minus** `today` and `last7Days`, **plus** `previousDays: Array<{ date: string; solarWh: number; loadWh: number }>` (exactly 6 site-local days before today, oldest first).
    - `TimelineHour` adds optional `gridImportWh`, `gridExportWh`, `batteryChargeWh` and `batteryDischargeWh` (present on actual hours only).
    - TSDoc on every field: units (W, Wh, integer cents, ISO-8601 UTC) and signs (CLAUDE.md §5: `batteryW` > 0 discharging, `gridW` > 0 importing). `live` = the instantaneous Live reading at `updatedAt`.
  - **Timeline rule:**
    - consecutive UTC hours covering the **whole** site-local today and tomorrow, where today = the site-local date of `updatedAt`. That is 48 rows, or 47/49 when a DST change falls in the two days;
    - today/tomorrow are found by each hour's **site-local date** (`hour` + `site.timezone`), never by index.
    - A private helper for the site-local date is fine (`Intl.DateTimeFormat("en-CA", { timeZone, year, month, day })`). Mark it `// ponytail: moves to the site-local time module (architecture backlog item 2)`.
  - **`checkSnapshot(s): string[]`** returns one message per problem; it never throws and never mutates. Rules:
    1. Live: integer W; `solarW ≥ 0`; `loadW ≥ 0`; `|solarW + batteryW + gridW − loadW| ≤ 50`; `socPct` 0–100.
    2. Timeline:
       - hours exactly 1 h apart;
       - covers site-local today + tomorrow fully;
       - all actual hours before all forecast hours, with every actual `hour < updatedAt`;
       - actual hours have the 4 breakdown fields (integers ≥ 0) and balance `solar + batteryDischarge + gridImport` vs `load + batteryCharge + gridExport` within ±50 Wh;
       - forecast hours have no breakdown fields and have `p10 ≤ value ≤ p90` for load and solar;
       - actual hours have no p10/p90.
    3. `costToday`: Σ `periods.importWh` === today's derived grid import; `netCents` === Σ `costCents` − `exportCreditCents`.
    4. `previousDays`: 6 entries, consecutive dates, ascending, the last one = the day before today.
    5. `weatherTomorrow?.date` === tomorrow's site-local date.
    6. Every ISO string parses.
  - **`DashboardView`** = the snapshot minus `previousDays`, plus:
    - `today: { solarWh, loadWh, gridImportWh, gridExportWh, batteryChargeWh, batteryDischargeWh, selfPoweredPct }`: Σ over actual hours whose site-local date is today, with `selfPoweredPct = round(100 × (1 − gridImportWh / loadWh))` clamped to 0–100 (0 when `loadWh` is 0);
    - `last7Days`: `previousDays` + `{ date: today, solarWh: today.solarWh, loadWh: today.loadWh }`;
    - `solarOutlook: { todayWh, tomorrowWh, changePct, direction: "less" | "more" }`: Σ `solarWh` over **all** hours of each site-local day; `changePct = round(|1 − tomorrowWh / todayWh| × 100)`; `direction = tomorrowWh < todayWh ? "less" : "more"`.
  - **`toDashboardView(s): DashboardView`**: pure, no validation (that's `checkSnapshot`'s job).
- **Sample adapter `home/data.ts`:**
  - export `sampleSnapshot: DashboardSnapshot` from the existing simulation. Actual hours carry the per-hour breakdown the sim already computes; `previousDays` = the 6 prior days it already has;
  - **every number on screen stays identical** (today's totals, cost, last 7 days, the outlook 45% less, the live reading);
  - add a comment that `live` approximates the instantaneous reading (hour-average power, SoC at 17:00).
  - **Temporary compatibility** (removed in B011): keep `export type DashboardData = DashboardView` and `export const sampleDashboard = toDashboardView(sampleSnapshot)`, so the UI and its tests build unchanged. Remove the old type definition from `data.ts`.

## Owned files
- Tester:
  - a new `src/lib/dashboard.test.ts`;
  - `src/app/(protected)/home/data.test.ts`: replace the tests that re-derive the simulation's own maths (per-row dispatch re-computation, about 80 lines) with `checkSnapshot(sampleSnapshot)` → `[]` plus pinned sample facts. Keep any assertion about visible values (SoC 100, peak until 21:00 PDT, saving 99 ¢, etc.).
- Implementer: `src/lib/dashboard.ts` (new), `src/app/(protected)/home/data.ts`.

## Base
- Tester: `front-end-development` (at or after this brief's commit) → branch `phase2a/ui-snapshot-test`. The new tests must FAIL on the base (module missing).
- Implementer: `phase2a/ui-snapshot-test` → branch `phase2a/ui-snapshot-impl`.

## Judged by
- **`dashboard.test.ts`:**
  - `checkSnapshot(sampleSnapshot)` → `[]`;
  - **each of rules 1–6 has a failing-case test**: mutate a copy (e.g. drop one hour, swap actual/forecast order, unbalanced actual hour, p10 > value, wrong cost import sum, 5 previous days, wrong weather date) and assert that a message about it is returned;
  - `toDashboardView(sampleSnapshot)` reproduces the Rev 4 sample's visible numbers. **Pin them from `sampleDashboard` at the base commit before changing anything:** today's totals, `selfPoweredPct`, `last7Days`, and `solarOutlook` (changePct 45, "less", the tomorrow kWh shown as "25.4 kWh");
  - **DST:** a synthetic snapshot in `America/Los_Angeles` with `updatedAt` on 2026-11-01 (a 25-hour day) passes `checkSnapshot` with 49 rows, and `toDashboardView` groups 25 hours into today. A spring-forward one (2026-03-08, a 23-hour day) also works;
  - **a Timeline that starts at 06:00 local instead of midnight** → `checkSnapshot` reports a coverage problem;
  - a `toDashboardView` edge case: `loadWh` 0 → `selfPoweredPct` 0, and no NaN anywhere.
- **Command:** `rm -rf .next && pnpm test && pnpm test:scripts && pnpm typecheck && SKIP_ENV_VALIDATION=1 rtk proxy pnpm lint && SKIP_ENV_VALIDATION=1 pnpm build`, all green.
- **All existing dashboard UI tests pass unchanged** (this is the proof the screen numbers didn't move).
- Test files lint clean.
- **Worktree:** junction `cmd //c mklink //J node_modules "D:\Programming Projects\voltops\node_modules"`; `cmd //c rmdir node_modules` before finishing; never `--force`. Keep commands bounded.

## Gate log
