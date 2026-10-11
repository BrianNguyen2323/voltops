# Topic 4 — "Your system" section (system information)

PO, 2026-10-08: a section with the site's system information, filled with placeholders that the middleware team later connects to Tesla's data. It should show:
- the number of Powerwall batteries;
- the number of solar panels;
- the maximum each panel can generate;
- how much the batteries store;
- other useful details.
The PO asked to check first whether this information exists.

## What Tesla actually gives us (checked against our recorded fixtures)
`fixtures/fleet-api/site_info.json` was recorded from the PO's real site (SCE, Powerwall 3). The fields below are verified in that recording, not taken from docs:

| Want | Field | Value in the fixture | Notes |
|---|---|---|---|
| Battery count | `battery_count` | 2 | Top level. |
| Battery model | `components.gateways[0].part_name` | "Powerwall 3" | PW3: the gateway entry is the Powerwall itself. |
| Expansion units | `components.batteries[]` | 1 entry, part `1807000-10-B`, `part_name: "Unknown"`, every nameplate is 0 | Part 1807000 looks like the PW3 Expansion, but **unverified**. Tesla gives no usable name or size per unit. |
| Total storage | `components.gateways[0].nameplate_energy_watts` | 27000 (Wh, despite "watts") | = 2 × 13.5 kWh. Already parsed: `findNameplate` in `src/lib/sources/fleet-api/map.ts` → `sites.usable_capacity_wh`. |
| Max battery power | `nameplate_power` (top level) / `gateways[0].nameplate_power_watts` | 11520 W | Matches Tesla's US PW3 spec of 11.5 kW continuous. |
| Backup reserve | `backup_reserve_percent` | 20 | Already stored (`sites.backup_reserve_pct`). |
| Utility / rate plan | `utility`, `tariff_id` | Southern California Edison, SCE-TOU-D-4-9PM | `tariff_schedule` already has `utility` and `name`. |
| Firmware | `version` | 26.26.11 | |
| Installed | `installation_date` | redacted in the fixture | The field exists. |
| Has solar | `components.solar`, `solar_type` | true, "pv_panel" | |
| **Panel count** | — | **not present** | |
| **Panel rating (W)** | — | **not present** | |
| **Solar system size (kW)** | — | **not present** | No solar nameplate anywhere in `site_info` or `products`. |

- Tesla's docs describe `site_info` only loosely ("assets, settings, features"), and third-party schemas list no solar nameplate either. Solar size and panel details are **not available from the Fleet API**.
- With the `local-gateway` source (pypowerwall), the PW3 reports power per **MPPT string** (A–F). That tells you how many strings are wired and what each produces, but not how many panels are on each string. It also needs the gateway password (TEDAPI), and that source isn't built yet.
- CLAUDE.md §6 already expects panel data to be **user-entered** ("panel tilt/azimuth/kWp (optional, improves solar forecasts)").

## What we can derive instead
- **Best solar hour so far:** max hourly solar Wh in stored history. This is real, measured, and absorbs shading and inverter limits.
- Once the user enters panel count and watts: **system size** = count × watts (kWp), and **best hour per panel** = best hour ÷ count.

## A note on units (for the copy)
A panel's rating is **power in watts** (e.g. 400 W): its output in full sun under test conditions. How much **energy** it makes (kWh) depends on the hours of sun, so a panel has no "max kWh". The section shows panel rating in W, system size in kW, and the best measured hour in kWh, with each unit labelled (CLAUDE.md §9).

## How the user could enter panel data today
- There is no Settings screen yet. Site values are already set through `SITE_*` env vars, which the worker applies every tick (middleware B033).
- Adding `SITE_PANEL_COUNT` and `SITE_PANEL_WATTS` follows that pattern. A Settings form can replace them later.

## Sources
- Recorded fixture: `fixtures/fleet-api/site_info.json`, `products.json` (verified).
- Tesla Fleet API energy endpoints: https://developer.tesla.com/docs/fleet-api/endpoints/energy
- Third-party site_info schema (no solar nameplate): https://apis.io/schemas/tesla-energy/tesla-energy-site/
- pypowerwall (PW3 string data, TEDAPI): https://github.com/jasonacox/pypowerwall
- PW3 specs (13.5 kWh, 11.5 kW US): https://www.notateslaapp.com/news/1606/tesla-unveils-powerwall-3-whats-new-and-how-it-compares-to-powerwall-2
