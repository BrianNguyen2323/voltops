# B012: Snapshot follow-ups (B007 review findings)

## Facts
- On main: `src/server/snapshot/build.ts` (pure `buildSnapshot(input: BuildInput)`), `src/server/snapshot/load.ts` (`loadSnapshot({db, source, now}, siteId)`, `firstSiteId(db)`, a module-level 60-s live cache), and `src/app/(protected)/home/page.tsx`. Tests: `build.test.ts`, `load.test.ts` (temp DB, fake DataSource; `vi.resetModules()` per test because of the cache).
- Fix 1: in `page.tsx`, `firstSiteId(db)` is outside the try, so a DB read error crashes `/home`. Move it inside, so any error falls back to `sampleSnapshot` (`isSample`), logging only `err.name` + `err.message`.
- Fix 2: in `load.ts`, when the Tesla live call fails, `console.warn("[snapshot] live unavailable site=<sites.id> <err.name>")`. Log the class name only: no message (it may hold paths), no externalId, no tokens. The existing "Live reading unavailable…" health warning stays.
- Fix 3: the "Energy history is N h behind" warning must use the **latest interval start** (`max(energy_intervals.start)` for the site), not the latest hour bucket. Warn when `updatedAt − latestStart > 2 h`, with `N = floor((updatedAt − latestStart) / 1 h)`.
  - Example: latest interval 10:55, updatedAt 12:50 → 1 h 55 min, so no warning.
  - Add `latestIntervalStart: number | null` to `BuildInput` if needed.
- Fix 4: add a battery-flow test.
  - Load `fixtures/fleet-api/calendar_history_energy.json` through `mapCalendarHistory` (`~/lib/sources/fleet-api/map`), shift it onto the 8 site-local days (`America/Los_Angeles`), and seed `energy_intervals`. Every interval balances exactly.
  - `checkSnapshot(loadSnapshot(...))` must be `[]` on a normal day and on 2026-03-08 / 2026-11-01.
  - At least one actual hour has `batteryChargeWh > 0` or `batteryDischargeWh > 0`.
- Env notes:
  - link main's node_modules with `cmd /c mklink /J node_modules "D:\Programming Projects\voltops\node_modules"`, and remove it with `cmd /c rmdir node_modules` before finishing;
  - lint needs `SKIP_ENV_VALIDATION=1` (re-run once if it exits 1 with no findings);
  - **commit before handing off.**

## Owned files
- Tester: `src/server/snapshot/build.test.ts`, `src/server/snapshot/load.test.ts`
- Implementer: `src/server/snapshot/build.ts`, `src/server/snapshot/load.ts`, `src/app/(protected)/home/page.tsx`

## Base
Tester: `main`. Implementer: the tester's branch.

## Judged by
- `pnpm vitest run src/server/snapshot`: green. New tests cover:
  - the live-failure log line (class name only, no externalId);
  - the behind warning at 1 h 55 min (none) and at 2 h 30 min ("2 h behind");
  - the fixture battery-flow case on 3 days.
  - Fix 1 is checked by the reviewer by reading the code; no page test is required.
- Full `pnpm vitest run`, `pnpm typecheck`, `SKIP_ENV_VALIDATION=1 pnpm lint` exit 0, `pnpm build`.
