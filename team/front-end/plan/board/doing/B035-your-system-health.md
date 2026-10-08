# B035 — "Your system" section + Equipment health (placeholders on sample data)

## Skills
Implementer: `Use skill: frontend-design` (3 tiles, chips, details line in the existing theme). Reviewer: `Use skill: agent-browser` for 390/1440 screenshots.

## Facts
- **SPEC Rev 8, section "Your system + Equipment health"** (`team/front-end/design/SPEC.md`, the last section). It is the exact contract: read it in full. It defines:
  - the `system` and `equipmentHealth` types and their `checkSnapshot` rules;
  - the view's status thresholds, `systemSizeW` and `bestHourPerPanelW`;
  - the UI copy for the Batteries / Solar / Plan tiles, the details line, the change log, and the two ⓘ popovers;
  - the null and learning states;
  - the exact sample values;
  - the `build.ts` stub.
  Ignore its "Backfill budget" subsection: that is middleware work (B038). The UI only shows `backfill` progress.
- Reuse what exists:
  - `InfoPopover` (`src/components/dashboard/info-popover.tsx`) for the ⓘ;
  - shadcn `Badge` for the chips;
  - `formatKw` / `formatKwh` (`src/lib/format.ts`);
  - the `SOURCE` labels and the peak window from `view.peakUsage` in `dashboard.tsx`.
  - Keep `dashboard.tsx` a server component. Put any pure copy builders in a small `.ts` module, like `tonight.ts`, so they can be tested without opening popovers.
- Canonical units: W/Wh integers, ISO UTC, site-local dates (CLAUDE.md §5). Label kW for power and kWh for energy; never mix them (CLAUDE.md §9).
- Middleware stub: `src/server/snapshot/build.ts` gets exactly the stub values from the SPEC. Change nothing else there, and don't let prettier rewrap the file (the B012 lesson).
- The rest of `/home` must look unchanged apart from the new section.

## Owned files
- **Tester:**
  - `src/lib/dashboard.test.ts`;
  - `src/components/dashboard/dashboard.test.tsx`;
  - `src/app/(protected)/home/data.test.ts`;
  - a new `src/components/dashboard/system.test.ts`.
- **Implementer:**
  - `src/lib/dashboard.ts`;
  - `src/app/(protected)/home/data.ts`;
  - `src/components/dashboard/dashboard.tsx`;
  - a new `src/components/dashboard/system.ts` (pure copy/status helpers);
  - `docs/dashboard-snapshot.md` (a "Your system and equipment health" section);
  - `src/server/snapshot/build.ts` (the stub lines only);
  - `.env.example`: document `SITE_PANEL_COUNT` and `SITE_PANEL_WATTS` (commented, next to `SITE_LATITUDE`). The values are read by middleware B036.
  - Also fix any other test or fixture that builds a full `DashboardSnapshot` literal and breaks on the new required fields, by adding the stub values only. List each one in the handoff.

## Base
- Tester: `front-end-development` → branch `phase2b/your-system-test`. New tests must FAIL on the base for the right reason.
- Implementer: `phase2b/your-system-test` → branch `phase2b/your-system-impl`.

## Judged by
- **Tests (tester writes):**
  - `checkSnapshot`: `sampleSnapshot` → `[]`. Each new rule fires on one mutated snapshot: count 0, negative Wh, pct 250, `daysDone > daysTotal`, a bad month string, 6 changes.
  - Status thresholds, at the boundaries:
    - solar: 95 → ok, 94 → watch, 84 → check;
    - capacity: 90% → ok, 89% → watch, 79% → check;
    - efficiency: 85 → ok, 84 → watch;
    - a non-null sunnyDayMiss makes the solar status check;
    - every null measurement → learning.
  - `systemSizeW` = 9600 for the sample; `bestHourPerPanelW` = 329 (7900 / 24 → round); both null when panels aren't set.
  - Markup, sample:
    - "Your system";
    - "2 batteries · Powerwall 3";
    - "27.0 kWh"; "11.5 kW"; "20%";
    - "24 panels × 400 W"; "9.6 kW";
    - "Best hour so far"; "7.9 kWh";
    - "Est. capacity 26.1 kWh (97% of 27.0 kWh)";
    - "Round-trip efficiency 88%";
    - "Clear-day output 98% of June 2025";
    - "Southern California Edison";
    - "Firmware 26.26.11";
    - "Grid outage, 2 h 10 min";
    - OK chips;
    - two buttons with an "About" aria-label for the health ⓘs.
  - Markup, variants:
    - panels null → "Panel details not set";
    - `system: null` → "System details not available yet.";
    - all health null + backfill running 230/730 → "Loading past data: 230 of 730 days";
    - batteryCapacity null → "Learning";
    - "1 battery" singular.
- **Command:** `rm -rf .next && pnpm test && pnpm test:scripts && pnpm typecheck && SKIP_ENV_VALIDATION=1 rtk proxy pnpm lint && SKIP_ENV_VALIDATION=1 pnpm build`, all green.
- **Visual (reviewer):**
  - `/home` at 390 and 1440 px. Use a scratch DB in `data/` and a dev server in the background on **3100**, never 3000. Save the screenshots as `data/shots/b035-*.png`;
  - the section is at the bottom, 3 tiles on desktop, stacked on a phone;
  - the chips are readable;
  - the ⓘ opens on hover and on tap;
  - nothing else moved;
  - run `agent-browser close`.
- **Worktree:** branch from the given hash explicitly (worktrees may start on an older commit). Use a node_modules junction `cmd //c mklink //J node_modules "D:\Programming Projects\voltops\node_modules"`, and `cmd //c rmdir node_modules` before finishing; never `--force`. Keep commands bounded. Prettier only on owned files. **COMMIT and give the hash.**

## Gate log
- Tests 2d1140d on `phase2b/your-system-test`:
  - 30 tests fail plus 1 suite that can't load (`system.ts` missing), all for the right reason.
  - The helpers in `system.ts` are fixed by the tester: `HealthStatus`, `solarStatus(h)`, `batteryCapacityStatus(h, capacityWh)`, `efficiencyStatus(h)`, `systemSizeW(solar)`, `bestHourPerPanelW(solar)`. They are helpers, not new view fields.
  - The ⓘ buttons are counted by an `aria-label="About…` prefix.
  - Implementer spawned.
