# Research: what the middleware needs for MVP (2026-10-06, lead)

Goal (PO): replace `sampleSnapshot` on `/home` with a real `DashboardSnapshot` per Site.
Inputs: `src/lib/dashboard.ts`, `src/server/db/schema.ts`, `fixtures/fleet-api/*`, `src/lib/tesla.ts`, `team/tesla-api-connection/research/fleet-api-adapter/README.md`, CLAUDE.md §5–§7, ADR 0001.

## 1. What actually exists today
- **DB (db-docker Rev 4):** `admin`, `credentials`, `sites`, `tariff_schedule`. **No energy, weather or forecast tables.** db-docker deferred "all Phase 2 tables". The hand-off assumed more than exists.
- `sites`: the callback fills `external_id`, `source`, `timezone` only. `name`, `usable_capacity_wh`, `latitude`, `longitude` stay null.
- `tariff_schedule.content`: Tesla's own `site_info.tariff_content` JSON (seasons → TOU periods → rates, plus `sell_tariff` for export). The PO's plan is SCE TOU-D-4-9PM (OFF_PEAK / PARTIAL_PEAK / ON_PEAK).
- `src/lib/tesla.ts`: `getPowerwallLiveStatus()` works, but it rotates the refresh token on **every** call (race → lockout). tesla-api-connection's Decision round 2 (the fleet-api adapter, Q1–Q5) is paused and covers exactly this.
- Fixtures: `live_status`, `site_info`, one day of `calendar_history?kind=energy` (288 five-minute rows, balance residual 0 Wh). Signs match VoltOps' 1:1.
- No worker process and no replay source.

## 2. Snapshot field → source → gap
| Field | Source | Gap |
|---|---|---|
| `site.name/timezone` | `sites` (+ `site_info.site_name`) | callback should also store name + capacity |
| `site.temperatureUnit` | none | needs a setting |
| `currency` | `tariff_schedule.currency` | none |
| `live` | `live_status` | safe fleet client (token cache + serialized refresh) |
| `live.usableCapacityWh` | `site_info` nameplate (27000 Wh) | store on `sites` |
| `tariffNow` | `tariff_schedule.content` | pure tariff module: period at instant, import/export rate, `endsAt` (DST) |
| `timeline` actual hours | `calendar_history` 5-min Wh, GROUP BY hour (ADR 0001) | **new table + fetch job** |
| `timeline` actual `socPct` | calendar_history has **no SoC** | store SoC from an hourly `live_status` call (Q5) |
| `timeline` forecast hours | none | baseline forecast with p10/p90 + SoC projection (Q6) |
| `costToday` | tariff × actual hourly import/export | pure function on top of the tariff module |
| `previousDays` | same intervals, GROUP BY site-local day | backfill ≥ 6 days at first run |
| `weatherTomorrow` | Open-Meteo daily forecast | **Tesla gives no coordinates** (Q7) |
| `health` | last fetch time + request estimate | small |
| `recommendation` | advisor (Phase 2b) | **out of MVP: `null`** (type allows it) |
| `accuracy` | stored forecasts vs. actuals | **out of MVP: `[]`**. The UI renders an empty card; front-end needs a "learning" state |

## 3. Budget (from tesla-api-connection research, $1/500 requests unverified for energy)
- `calendar_history` today, hourly: 720 req/month ≈ $1.44.
- `live_status` hourly in the worker (for SoC history): 720 ≈ $1.44.
- `live_status` while `/home` is open, cached 60 s: bounded by use.
- Total stays well inside the $10/month credit. Open check: does `calendar_history` for **today** return the partial day? (One PO-run probe.)

## 4. Energy history (PO requirement) vs. retention
ADR 0001 + CLAUDE.md §6 make the 5-minute interval rows the only long-term energy record. ~105k rows/year/Site is small for SQLite. So the lazy answer is to **never prune intervals or hourly observed weather**. The 90-day rule then only applies to raw live samples. ADR 0001 stands; no rollup table.
