# B036 — Fill `system` from site_info + panel env (hand-off from front-end, 2026-10-08)

## Facts
- Contract: front-end SPEC Rev 8, "Your system + Equipment health" (`team/front-end/design/SPEC.md`), field `system`. The front-end ships the type, view, UI and a `system: null` stub in `src/server/snapshot/build.ts` (front-end B035).
- Verified in `fixtures/fleet-api/site_info.json` (the PO's real site):
  - `battery_count` = 2;
  - `components.gateways[0].part_name` = "Powerwall 3";
  - `components.gateways[0].nameplate_energy_watts` = 27000 (Wh), already parsed into `usable_capacity_wh` by `findNameplate`;
  - `nameplate_power` = 11520 W;
  - `version` = "26.26.11 c4db63ce" (show the part before the space);
  - `installation_date` (redacted in the fixture: verify its format on a re-record, or treat it as ISO);
  - `utility`, `tariff_id`.
  - Expansion units appear in `components.batteries[]` with `part_name: "Unknown"` and zero nameplates: don't use them.
- Tesla has **no** panel count, panel rating or solar size. These come from the new env vars `SITE_PANEL_COUNT` and `SITE_PANEL_WATTS`, positive integers, applied every tick like the other `SITE_*` settings (B033). `.env.example` is documented by front-end B035.
- `bestHourWh` / `bestHourAt`: max hourly solar Wh over all stored `energy_intervals`, via GROUP BY hour (ADR 0001: no rollup table).
- `changes` (newest 5):
  - a daily `site_info` record (firmware, battery_count, nameplate), logging "Firmware X" / "Batteries: N" when a value changes;
  - grid outages from `samples.grid_status = 'islanded'` stretches: "Grid outage, {h} h {m} min".
  - Needs a small new table, e.g. `site_events(site_id, at, kind, text)` (Drizzle migration).
- Install date and firmware are not secret, but B021 redacted the install date in the fixtures: keep fixtures anonymized.

## Owned files (to be set by the middleware lead)
The site-sync, the fleet-api map, the schema + migration, the snapshot build/load, and the worker jobs.

## Judged by
- Fixture tests: the sample `site_info` maps to count 2, "Powerwall 3", 27000, 11520, "26.26.11".
- The env parse rejects 0 and non-integers.
- The best hour is correct across a DST day.
- A firmware change and an outage show up in `changes`.
- The full gate is green, and `checkSnapshot` on a real snapshot is `[]`.
