# Research: real Fleet API responses (PO run, 2026-10-04 ~20:38 PDT)

Source: the PO ran `pnpm verify:tesla`. All 4 GETs returned 200 with `ok`. The fixtures are in `fixtures/fleet-api/` (products.json was deleted because it leaked a vehicle, see B002).

## Hardware (answers CLAUDE.md open question 3)
- **Powerwall 3** (`site_info.components.gateways[0].part_name`), gateway `"teg"`. `battery_count = 2` (one PW3 plus an expansion pack, part `1807000-10-B`, which reports nameplate 0).
- `nameplate_power = 11520` W. The gateway reports `nameplate_energy_watts = 27000`, which is really Wh (27 kWh). That is the usable-capacity candidate.
- `backup_reserve_percent = 20`, `default_real_mode = "self_consumption"`.
- Implication: PW3 local API coverage is limited, so `fleet-api` is the first adapter. This agrees with CLAUDE.md §5.

## live_status
Fields: `solar_power, percentage_charged, battery_power, load_power, grid_status ("Active"), grid_power, generator_power, wall_connectors[], island_status ("on_grid"), storm_mode_active, timestamp` (local RFC3339 with offset).
- **Signs:** only grid is confirmed so far. The run was at night (solar 0, battery 0, grid 4440 = load 4440 → `gridW > 0` = importing). **Battery and solar signs are NOT verified.** This needs a daytime run while the battery is charging or discharging.
- Run 2 (2026-10-04 21:14 PDT, after B002): also at night. solar 0, battery 0, grid 5711 = load 5711, invariant ok. The grid sign is confirmed again. The battery stays idle at night because SoC (19%) is below the 20% backup reserve. The PO confirmed the values match the Tesla app.
- **Status at M1 close (2026-10-04):** the night fixtures are committed as the M1 baseline. The battery and solar signs are still UNVERIFIED. The adapter must not assume them until the PO's daytime re-run (scheduled for 2026-10-05 morning) confirms them. That run will overwrite these fixtures, and the update goes in as a separate commit.
- **Run 3 (2026-10-05 11:06 PDT, daytime) — ALL SIGNS VERIFIED.** live_status: `solar_power 5469`, `battery_power -1267`, `grid_power 0`, `load_power 4202`, SoC 26.9%. Invariant ok (residual 0: 5469 − 1267 + 0 = 4202). At the same moment the PO's Tesla app showed **battery charging 1.3 kW, solar 5.5 kW**. So `battery_power < 0` = charging, `solar_power ≥ 0`, `grid_power > 0` = importing (runs 1–2). **Tesla's raw signs match VoltOps' canonical signs (CLAUDE.md §5) 1:1. The adapter passes them through with no sign flips.** These fixtures replace the night baseline.
- `percentage_charged` is a float (19.548…). Round it in the adapter.

## calendar_history?kind=energy&period=day
- The RFC3339-with-offset dates for `start_date`/`end_date` (`2026-10-03T00:00:00-07:00`) work, along with `time_zone=America/Los_Angeles`.
- It returns **288 intervals of 5 minutes** in Wh for the day. That's high-resolution official backfill, so the undocumented `kind=power` probe may not be needed.
- Interval fields: `timestamp, raw_timestamp, solar_energy_exported, generator_energy_exported, grid_energy_imported, grid_services_energy_imported/exported, grid_energy_exported_from_solar/generator/battery, battery_energy_exported, battery_energy_imported_from_grid/solar/generator, consumer_energy_imported_from_grid/solar/battery/generator, total_home_usage, total_battery_discharge`.
- Top level: `serial_number` (redacted), `period`, `installation_time_zone`, `time_series`, `SmartBreakerEnergyLogs` (null).
- Day totals (2026-10-03): solar 40.1 kWh, home 73.3 kWh, grid import 31.0 kWh, battery discharge 20.9 kWh, export from solar 17 Wh.

## site_info
- `installation_time_zone`, `tariff_id`, `tariff_content` and `tariff_content_v2` are present. The tariff is SCE TOU-D-4-9PM with seasons, TOU periods, and a `sell_tariff`, so the D9 tariff model can be seeded from it.
- **No location:** there are no lat/lon, address, city or zip fields. The adapter can't get coordinates from Tesla, so weather (D8) needs the user to provide a location. The existing code comment in `src/app/api/auth/callback/route.ts` already says this.

## products
- The response mixes **vehicles** (`device_type: "vehicle"`, with `vin`, `display_name`, a protobuf `cached_data` blob containing the VIN and owner first name, and vehicle public keys) with energy sites (`device_type: "energy"`). The fixture writer must keep only energy items. (B002)
- Energy item ID keys not covered by the B001 list: `grid_installation_id`, `components.gateways[].device_id` (UUIDs). `site_info` gateways and batteries also carry `device_id` and `site_id` UUIDs. (B002)
