# B011 — UI reads the Dashboard view; page runs the check; hand-off doc

## Skills
Implementer: `Use skill: frontend-design` (no visual change allowed; use it to confirm). `Use skill: agent-browser` for before/after screenshots.

## Facts
- **SPEC Rev 5 "Dashboard snapshot and view"** and `GLOSSARY.md`. B010 (merged) provides, in `src/lib/dashboard.ts`:
  - `DashboardSnapshot`, `checkSnapshot(s): string[]`;
  - `DashboardView` (the snapshot minus `previousDays`, plus `today`, `last7Days`, `solarOutlook: { todayWh, tomorrowWh, changePct, direction }`);
  - `toDashboardView(s)`.

  `home/data.ts` exports `sampleSnapshot`, plus a **temporary** `DashboardData = DashboardView` alias and `sampleDashboard = toDashboardView(sampleSnapshot)`.
- **Changes:**
  1. `Dashboard` takes a **`view: DashboardView`** prop instead of `data` (and the same `connected`, `isSample`, `showLogout`). All `src/components/dashboard/*` import types from `~/lib/dashboard`, never from `home/data`.
  2. The **Tomorrow tile** uses `view.solarOutlook` (`formatKwh(tomorrowWh)`, `${changePct}% ${direction} sun than today`). **Delete the Timeline `slice(0,24)` / `slice(24,48)` sums** in `dashboard.tsx`. No dashboard module indexes the Timeline by position.
  3. **`page.tsx`:**
     - `const problems = checkSnapshot(sampleSnapshot); for (const p of problems) console.warn("[dashboard snapshot]", p);`
     - then render `<Dashboard view={toDashboardView(sampleSnapshot)} connected={…} isSample showLogout={…} />`.
  4. Remove the temporary `DashboardData`/`sampleDashboard` exports from `home/data.ts`.
  5. **`docs/dashboard-snapshot.md`**: a one-page guide for the middleware team. Cover:
     - what a Dashboard snapshot is (GLOSSARY terms);
     - units and signs;
     - the Timeline coverage and site-local-day rule, including DST (48 rows; 47 or 49 across a clock change);
     - the per-hour breakdown on actual hours;
     - the Live reading being instantaneous at `updatedAt`;
     - `costToday` being an input for now;
     - `previousDays`;
     - how to run `checkSnapshot` in their adapter tests (a short code example);
     - what the view derives so they don't supply it.

     Link `src/lib/dashboard.ts` as the source of truth.
- **From the B010 review:** `toDashboardView` assumes a checked snapshot. A bad timezone yields a quietly wrong view, so the page's check-and-log in change 3 is **required**, not optional. Add a one-line TSDoc to `site.name` in `src/lib/dashboard.ts` (comment only; that file is owned for this line only).
- **No visual change:** every number and pixel on `/home` must match the pre-change page.

## Owned files
- Tester: `src/components/dashboard/dashboard.test.tsx` (switch fixtures to `toDashboardView(sampleSnapshot)` / mutated snapshots, and the `view` prop; **don't change what any assertion checks**; add the new tests below).
- Implementer:
  - `src/components/dashboard/**` (not the test);
  - `src/app/(protected)/home/page.tsx`, `src/app/(protected)/home/data.ts` (alias removal only);
  - `docs/dashboard-snapshot.md` (new);
  - `src/lib/dashboard.ts` (the `site.name` TSDoc line only).

## Base
- Tester: `front-end-development` (after B010 merges) → branch `phase2a/ui-view-test`. The new tests must FAIL on the base.
- Implementer: `phase2a/ui-view-test` → branch `phase2a/ui-view-impl`.

## Judged by
- **`dashboard.test.tsx`:**
  - all existing assertions still pass with the `view` prop;
  - **new:** with a snapshot whose tomorrow solar is changed (mutate the forecast hours of tomorrow), the Tomorrow tile shows the new `formatKwh` and %, which proves it reads `solarOutlook`. The same test with tomorrow > today shows "more sun than today";
  - **new:** a source-level guard: `dashboard.tsx` contains no `.slice(0, 24)` / `.slice(24` (read the file as text).
- **Command:** `rm -rf .next && pnpm test && pnpm test:scripts && pnpm typecheck && SKIP_ENV_VALIDATION=1 rtk proxy pnpm lint && SKIP_ENV_VALIDATION=1 pnpm build`, all green. `grep -r "home/data" src/components` returns nothing.
- **Visual:**
  - take full-page screenshots of `/home` at 390 px and 1440 px on the **base** and on your branch (scratch DB in `data/`, dev server in the background on **3100**, never 3000);
  - they must look identical;
  - list the paths;
  - stop the server and run `agent-browser close` before handing off.
- **Worktree:** junction `cmd //c mklink //J node_modules "D:\Programming Projects\voltops\node_modules"`; `cmd //c rmdir node_modules` before finishing; never `--force`. Keep commands bounded.

## Gate log
- Tests da666d1 on `phase2a/ui-view-test`: the file fails on base (`Dashboard` has no `view` prop yet), the right reason; lint clean. Added the tomorrow ×0.5/×3 outlook tests and the slice source guard. Implementer spawned (before/after screenshots).
- Impl 1245731 on `phase2a/ui-view-impl`: vitest 243/243, scripts 58, typecheck, lint clean, build OK. `view` prop, `solarOutlook`, page check + warn, alias removed, `docs/dashboard-snapshot.md`.
  - Deviations: edited `cost-now.test.ts` and `home/data.test.ts` (not owned) because the alias removal broke their imports; tests still import `sampleSnapshot` from `home/data`; equal solar now reads "0% more".
  - The 390 screenshots were eyeballed identical; the 1440 pair was not viewed.
  - Reviewer spawned.
