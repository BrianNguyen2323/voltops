# Topic 4b — Equipment health monitoring (PO, 2026-10-08)

PO: "add a goal of monitoring the health of the system … seeing a decline in generation from the panels or the storage of the batteries." This sits on top of the "Your system" outline (Decision round 4, approved).

Naming: the snapshot already has a `health` field (poll time, request estimate, warnings), and CLAUDE.md §9 has a "Health" screen for job runs. This feature is called **Equipment health** so the two don't get confused.

## What VoltOps already records (never pruned, ADR 0001)
| Table | Resolution | Useful fields |
|---|---|---|
| `energy_intervals` | 5 min (Fleet `calendar_history`, 288/day) | solar Wh, load Wh, grid import/export Wh, **battery charge / discharge Wh** |
| `samples` | each poll (default 5 min) | solar/load/battery/grid W, **soc_pct**, grid_status |
| `weather_observed` | hourly (Open-Meteo) | **ghi_wm2** (sunlight), **cloud_pct**, temp_c |
| `sites` | static | usable_capacity_wh (Tesla nameplate, 27 000 Wh) |

Verified **not** available from the Fleet API (our recorded `live_status` / `site_info`): live battery pack energy (`total_pack_energy` / `energy_left`), per-battery health, solar strings, alerts. Battery nameplate values are static.

## Suggestions

### Solar: is generation declining?
1. **Clear-sky output ratio (with today's data, recommended).**
   - For hours with low cloud cover (e.g. ≤ 10%) and strong sun (GHI ≥ 600 W/m²), compute `solar Wh ÷ GHI`: output per unit of sunlight.
   - Take the monthly median and compare it with **the same month last year**. The sun's angle changes the ratio through the seasons, so month-to-month comparisons would mislead.
   - Normal panel ageing is roughly 0.5%/year. A sustained drop of several percent points to soiling, new shading, a failed panel or string, or an inverter issue.
2. **"Sunny day, low output" flag (recommended, fast).**
   - Compare each day's solar Wh with what the sunlight predicted, using the site-specific irradiance→Wh conversion the solar forecast (CLAUDE.md §7) already learns.
   - A clear day that comes in, say, 25% under expectation gets flagged the next morning. It catches sudden faults (a tripped breaker, a dead string) weeks before a monthly trend would.
3. **Best hour so far, tracked over time.** The peak hourly solar Wh per month (already in the "Your system" tile). A falling summer peak, year over year, is a simple, intuitive signal. Clipping: a flat midday plateau is the inverter limit, not a fault, and the explanation says so.
4. **Per-string comparison (later, local-gateway only).** pypowerwall reports PW3 power per MPPT string (A–F). One string falling behind the others is the clearest sign of a shaded or failed panel. It waits for the `local-gateway` source.

### Battery: is storage declining?
1. **Estimated capacity from charge % swings (with today's data, recommended).**
   - For each long discharge or charge (e.g. SoC moves ≥ 40 points in one direction), capacity ≈ `battery Wh moved ÷ SoC points moved × 100`, after correcting for the inverter loss (the efficiency below).
   - Take the median per month and compare it with the 27.0 kWh nameplate.
   - Tesla's % is of *usable* energy, so a worn pack moves fewer Wh per percent and this shows up. It's noisy per event (SoC is the battery's own estimate), so it needs many events and the trend matters more than any single month.
2. **Round-trip efficiency (with today's data, recommended).** Monthly `discharge Wh ÷ charge Wh`. Tesla quotes ~89% solar→battery→home for PW3. A downward drift means more losses (heat, ageing).
3. **Cycles and throughput.** Total discharge Wh ÷ capacity = equivalent full cycles to date. It gives context for warranty terms (check your own warranty; we don't assume its thresholds).
4. **Tesla's own pack estimate (later, local-gateway only).** The local gateway (`/api/system_status`) reports `nominal_full_pack_energy` per battery. It's the most direct capacity number, but it needs the `local-gateway` source.

### System: is anything else off?
- **Grid outages:** count and duration of `grid_status = islanded` stretches (from `samples`).
- **Firmware / hardware changes:** record `site_info` daily (firmware `version`, `battery_count`, nameplate) and log changes. It explains sudden shifts ("output dropped the day after firmware 26.30").
- **Meter consistency:** how often `solar + battery + grid ≈ load` fails (adapters already log it). A rising rate points to a metering issue.
- **Data gaps:** polls missed. This belongs to the existing Health screen/`health.warnings`, not here.

## What changes are needed
- **No new sensors.** Solar 1–3 and battery 1–3 use tables already being filled.
- **A baseline needs history.** Battery capacity and efficiency work within weeks. A year-over-year solar comparison needs a year, **unless we backfill**:
  - **Energy:** Fleet `calendar_history` takes any past day (1 request per day; 2 years ≈ 730 requests, one time). Fleet API usage is billed (CLAUDE.md §5), so the PO decides this.
  - **Weather:** Open-Meteo's historical archive is free and keyless. The middleware already gap-fills weather for days with energy data (B017).
- **New middleware work:**
  - pure health functions (a `health` module in the advisor/forecast style: pure, tested on fixtures);
  - a daily `site_info` record (firmware/hardware log);
  - optionally the backfill job;
  - computed by GROUP BY on demand (ADR 0001: no rollup tables).
- **Front-end:** a placeholder `equipmentHealth` block in the snapshot contract + sample values + UI, as with the peak tile.

## Sources
- Fixtures: `fixtures/fleet-api/live_status.json`, `site_info.json`, `calendar_history_energy.json` (verified fields).
- Schema: `src/server/db/schema.ts`. History call: `src/lib/sources/fleet-api/client.ts` (`period: "day"`).
- pypowerwall (strings, system_status): https://github.com/jasonacox/pypowerwall
- PW3 efficiency 89% solar→battery→home: https://www.notateslaapp.com/news/1606/tesla-unveils-powerwall-3-whats-new-and-how-it-compares-to-powerwall-2
- Open-Meteo historical weather API: https://open-meteo.com/en/docs/historical-weather-api
