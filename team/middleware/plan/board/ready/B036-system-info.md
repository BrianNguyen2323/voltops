# B036: Fill `system` from site_info + panel env

Hand-off from front-end (2026-10-08, front-end SPEC Rev 8). Lead plan: SPEC Rev 4 → "Site facts" and "Storage". Read both first. Outages are **not** here (B041).

## Facts
- Contract: `system` in `src/lib/dashboard.ts` (`checkSnapshot` rules at ~L514). Today `src/server/snapshot/build.ts` returns `system: null` (~L247).
- Verified in `fixtures/fleet-api/site_info.json` (the PO's real site). **Read the expected values from the fixture in tests; never pin literals** (the PO re-records):
  - `battery_count` 2; `components.gateways[0].part_name` "Powerwall 3"; `nameplate_power` 11520 W; `version` "26.26.11 c4db63ce" → "26.26.11"; `utility`, `tariff_id`;
  - `installation_date` is redacted in the fixture. Its real format is RFC 3339 with an offset (checked in git history). Test the mapper with an inline object for that field;
  - expansion units in `components.batteries[]` say "Unknown" with zero nameplates: never read them.
- `src/lib/core/types.ts`: `SiteInfo` gains `batteryCount`, `batteryModel`, `maxPowerW`, `firmware`, `installedOn`, all `number | null` or `string | null`. Test fakes that build a `SiteInfo` need the new fields.
- `src/lib/sources/fleet-api/map.ts` `mapSiteInfo`: zod fields for the 5 facts; `installedOn` = the first 10 chars of `installation_date` when it matches `^\d{4}-\d\d-\d\d`, else null.
- `src/server/site-sync.ts` `syncSite`: read the existing row first; write the 5 facts; when the stored `firmware` or `batteryCount` is non-null and differs, insert `site_events` (`at` = now, kind `firmware` / `batteries`, text "Firmware {v}" / "Batteries: {n}") with `onConflictDoNothing`. The first sync logs nothing. A null from Tesla never overwrites a stored value with null and never logs a change.
- `src/server/history/index.ts`: add `bestSolarHour(): { start: number; wh: number } | null`, the max of the per-UTC-hour SUM of `solar_wh` over all stored intervals (SQL GROUP BY, ADR 0001). null when no intervals or the max is 0.
- `src/env.schema.js`: `SITE_PANEL_COUNT`, `SITE_PANEL_WATTS` as `z.coerce.number().int().positive().optional()` (`.env.example` already lists them; check the comment wording). Treat "" as unset like the other `SITE_*` keys.
- Snapshot (`load.ts` reads, `build.ts` maps; keep `build` pure):
  - `system` = null while the Site's `batteryCount` is null;
  - batteries `{ count, model, capacityWh: usableCapacityWh, maxPowerW, backupReservePct }`;
  - solar `{ panelCount, panelWatts }` from env, `bestHourWh`/`bestHourAt` (ISO UTC) from `bestSolarHour`;
  - plan `{ utility, name }` from `tariff_schedule` (null when no row); `firmware`; `installedOn`;
  - `changes` = newest 5 `site_events` for the Site, `{ at: ISO UTC, text }`.
- `seedReplay` gets the new facts for free through `mapSiteInfo`; check the demo `/home` shows the section with no `checkSnapshot` errors.
- Env notes:
  - link the main node_modules: `cmd /c mklink /J node_modules "D:\Programming Projects\voltops\node_modules"`. Remove it with `cmd /c rmdir node_modules` before you finish. Never `git worktree remove --force` while it exists;
  - lint needs `SKIP_ENV_VALIDATION=1`; vitest can flake under load, so re-run once; test files must lint clean too (`no-base-to-string`, `unbound-method`);
  - run `pnpm format:check`; no network in tests;
  - **COMMIT before handing off, and give the commit hash and branch name.**

## Owned files
- Tester: `src/lib/sources/fleet-api/map.test.ts`, `src/server/site-sync.test.ts`, `src/server/history/index.test.ts`, `src/server/snapshot/build.test.ts`, `src/server/snapshot/load.test.ts`, an env test if one exists for `SITE_*`.
- Implementer: `src/lib/core/types.ts`, `src/lib/sources/fleet-api/map.ts`, `src/server/site-sync.ts`, `src/server/history/index.ts` (the new op only), `src/server/snapshot/load.ts`, `src/server/snapshot/build.ts`, `src/env.schema.js`, `.env.example` (panel lines only), plus new fields in `SiteInfo` fakes of existing tests.

## Base
- Tester: `middleware`, branch `phase2b/middleware-system-tests`.
- Implementer: the tester's branch rebased onto `middleware` **after B039 merges**, branch `phase2b/middleware-system`.

## Judged by
- `mapSiteInfo` on the fixture: count, model, max power and firmware read from the fixture; `installedOn` from an inline RFC 3339 value; missing fields → null.
- The env parse rejects "0", "-1" and "2.5", accepts "24", and "" means unset.
- `bestSolarHour` is right on a DST day (2 days of intervals across a spring-forward and a fall-back day, America/Los_Angeles) and null on an empty DB.
- `syncSite`: a firmware change and a battery-count change each add one event; the first sync and a re-sync with the same values add none; a null never clears a value.
- Snapshot: `system` null before the facts exist; filled after; `changes` newest first, max 5; `checkSnapshot` is `[]`.
- Full `pnpm vitest run`, `pnpm test:scripts`, tsc, lint, `pnpm format:check`, `pnpm build:worker` and `pnpm build` are green.
