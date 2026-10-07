# B002: Schema for Energy history + callback stores site facts

## Facts
- Drizzle 0.45 + better-sqlite3, schema in `src/server/db/schema.ts` (see the existing `ts()` helper = integer `timestamp_ms`). Migrations are generated with `pnpm db:generate` into `drizzle/` (the next one is `0001_*`, plus the `meta/` snapshot + journal). **Never edit `0000_init.sql`.** The test pattern is `src/server/db/db.test.ts` (temp dir, `openDb`, `migrate`).
- Energy history is kept for years per Site. **None of these tables is ever pruned.** There is no hourly rollup table (ADR 0001: hourly = SQL GROUP BY).
- New tables (all columns not null unless marked):
  - `energy_intervals`: `site_id` int FK→`sites.id` ON DELETE CASCADE, `start` ts (5-min UTC start), `solar_wh`, `load_wh`, `grid_import_wh`, `grid_export_wh`, `battery_charge_wh`, `battery_discharge_wh` (int). PK (`site_id`, `start`).
  - `samples`: `site_id` FK cascade, `ts` ts, `solar_w`, `load_w`, `battery_w`, `grid_w` int, `soc_pct` real, `grid_status` text. PK (`site_id`, `ts`).
  - `weather_observed`: `site_id` FK cascade, `hour` ts (UTC hour start), `temp_c` real, `cloud_pct` real, `ghi_wm2` real, `precip_mm` real. PK (`site_id`, `hour`).
  - `weather_forecast`: `site_id` FK cascade, `issued_at` ts, `hour` ts, `temp_c`, `cloud_pct`, `ghi_wm2`, `precip_mm`, `precip_prob_pct` (real). PK (`site_id`, `issued_at`, `hour`).
- New nullable `sites` columns: `backup_reserve_pct` int, `temperature_unit` text.
- The Tesla callback (`src/app/api/auth/callback/route.ts`, site upsert ~line 140) also stores these from `site_info` on insert and on conflict update:
  - `name = site_name`;
  - `usableCapacityWh = nameplate_energy_watts` (Wh despite the name). It is nested: find the first numeric `nameplate_energy_watts` anywhere under `components` (the fixture has 27000);
  - `backupReservePct = backup_reserve_percent` (fixture 20).
  - Missing values → null. Extend `SiteInfoResponse` with these fields. Logging rules stay: never log Tesla bodies, site name or ids.
- Fixture: `fixtures/fleet-api/site_info.json`.
- CLAUDE.md §6 "Retention" line: replace it with "Retention: Energy history (`energy_intervals`, `samples`, `weather_observed`, `weather_forecast`) is never pruned; hourly figures are computed by GROUP BY (ADR 0001)."
- Env notes: worktrees have no node_modules. Link main's from PowerShell: `cmd /c mklink /J node_modules "D:\Programming Projects\voltops\node_modules"`. Lint needs `SKIP_ENV_VALIDATION=1`. Never copy `.env`. vitest can flake under load; re-run once.

## Owned files
- Tester: `src/server/db/energy-history.test.ts` (new: migrate, insert/upsert per table, PK conflict, cascade delete with the site), `src/app/callback-redirect.test.ts` or `src/app/callback-logging.test.ts` (add assertions that the site row gets name/capacity/reserve from a site_info like the fixture)
- Implementer: `src/server/db/schema.ts`, `drizzle/0001_*.sql`, `drizzle/meta/*`, `src/app/api/auth/callback/route.ts`, `CLAUDE.md` (§6 retention line only)

## Base
Tester: `main`. Implementer: the tester's branch.

## Judged by
- `pnpm vitest run src/server/db src/app`: green;
- the full `pnpm vitest run` green, `pnpm typecheck`, `SKIP_ENV_VALIDATION=1 pnpm lint` 0 warnings;
- `pnpm test:scripts` green (the migrate scripts);
- `drizzle/0000_init.sql` unchanged.
