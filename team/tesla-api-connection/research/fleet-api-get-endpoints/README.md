# Research: Fleet API GET endpoints VoltOps needs

Date: 2026-10-04 · Author: team lead

## What the code calls today

| Where | Call | Status |
|---|---|---|
| `src/app/api/auth/callback/route.ts` | `POST auth.tesla.com/oauth2/v3/token` (code exchange) | Works (PO confirmed on Netlify) |
| same | `GET /api/1/products` → picks first `resource_type === "battery"` | Called at login; result only logged, so not confirmed |
| same | `GET /api/1/energy_sites/{id}/site_info` | Called at login; failure only logs a warning, so not confirmed |
| `src/lib/tesla.ts` `getAccessToken` | `POST oauth2/v3/token` (refresh_token grant, writes the rotated token back to DB) | Not confirmed |
| `src/lib/tesla.ts` `getPowerwallLiveStatus` → `/api/powerwall/live` | `GET /api/1/energy_sites/{id}/live_status` | Not confirmed |

OAuth scopes requested: `openid email offline_access energy_device_data`. These are read-only, and that is enough for every GET below.
Base URL: `https://fleet-api.prd.na.vn.cloud.tesla.com` (NA region).

## Read-only energy endpoints (official docs)

Source: https://developer.tesla.com/docs/fleet-api/endpoints/energy

| Endpoint | Path | VoltOps use | Need |
|---|---|---|---|
| products | `GET /api/1/products` | discover energy_site_id(s) | **Required** |
| site_info | `GET /api/1/energy_sites/{id}/site_info` | timezone, battery count/capacity, backup reserve, tariff | **Required** |
| live_status | `GET /api/1/energy_sites/{id}/live_status` | live solar/load/battery/grid W + SoC, grid status (CLAUDE.md §5 `getLiveStatus`) | **Required** |
| energy_history | `GET /api/1/energy_sites/{id}/calendar_history?kind=energy&start_date&end_date&period&time_zone` | authoritative daily Wh totals and backfill (CLAUDE.md §5 "daily calendar_history backfill") | **Required** |
| backup_history | `GET .../calendar_history?kind=backup` | grid outage events (Health/Trends) | Nice to have |
| charge_history | `GET .../telemetry_history?kind=charge` | Wall Connector charging | Not needed (VoltOps is energy-only, no vehicle features) |

Write endpoints (`backup`, `operation`, `grid_import_export`, `storm_mode`, `time_of_use_settings`, `off_grid_vehicle_charging_reserve`) are Phase 3 and **out of scope**. They also need the `energy_cmds` scope, which we don't request.

### Undocumented (community-reported, UNVERIFIED)
The Owner API used `calendar_history?kind=power` (5-min power series) and `kind=soe` (SoC history). These are **not** in the Fleet docs. If they work, they give a high-resolution backfill. Try them only as optional probes, and expect 4xx.

## What the docs don't tell us (only a real response can answer)
- Exact response field names for `live_status` (code assumes `solar_power`, `percentage_charged`, `battery_power`, `load_power`, `grid_power`, `timestamp`).
- **Sign conventions** for `battery_power` / `grid_power`. CLAUDE.md §5 forbids trusting memory here, so a recorded fixture is the only acceptable source.
- Allowed `period` values and the date format for `calendar_history`.
- `site_info` fields (code assumes `installation_time_zone`, `tariff_id`, `utility`, `tariff_content`).
- Powerwall model (2/+/3). This comes from site_info and answers CLAUDE.md open question 3.

## Cost / limits
Source: https://developer.tesla.com/docs/fleet-api/billing-and-limits
- Pay-per-use, $10/month credit per account. Requests with status < 500 are billed.
- Rate limit: realtime data 60 req/min per device per account.
- The per-endpoint "Pricing Category" for energy endpoints sits in collapsed doc sections that the fetch couldn't read. Third-party sources (https://teslemetry.com/blog/tesla-fleet-api-pay-per-use) say energy data is currently unbilled. **Unverified.** A one-off verification is roughly 6–8 requests, which is negligible in any case.

## Risks noted
- **Refresh-token rotation:** each refresh invalidates the previous refresh token. Any verification tool must write the rotated token back to the same DB the Netlify app uses, or the deployed app gets locked out. `getAccessToken()` already does this.
- `products` picks only the first battery site; multi-site is fine for now (D1 allows 1..n, but there's one reference site).
