# Research: does VoltOps need a database? (lead, 2026-10-05)

PO question: is a DB needed for Fleet API metrics, or should we "dockerize and store locally"?
**Answer: both. It's one SQLite file on a Docker volume.** "Local storage" still needs a store, and SQLite is that store.

## Why storage is required (CLAUDE.md goals that can't work without it)
| Need | Why Tesla can't serve it on demand |
|---|---|
| SoC history, live samples (§6 `samples`) | `live_status` is instantaneous only. `kind=energy` has no SoC, and `kind=soe` is undocumented. If you don't store it, it's gone. |
| Weather forecast as issued (§6, §7) | Backtests must use the forecast as it was issued. That is VoltOps' own record, so nobody else has it. |
| Forecasts, recommendations, accuracy (§7–§9) | VoltOps generates these. There's nowhere else to keep them. |
| Trends and model fitting over weeks or months | `calendar_history` = 1 billed request per day queried. Re-fetching on every page view or model fit costs the user money (§5). |
| Rotating refresh token, settings, tariff, admin | Must persist across restarts. Today it's in Supabase. |
| Web + worker processes (D5) | Two processes writing and reading flat JSON files means locking and torn writes. SQLite WAL handles this. |

## Volume (fixture-based)
- `calendar_history kind=energy` = 288 × 5-min intervals per day ≈ 105k rows/yr.
- `live_status` every 5 min ≈ 105k rows/yr (at 30 s via local-gateway: ≈1M/yr, but kept only 90 days).
- Total is tens of MB per year. SQLite on a Pi handles this easily. Postgres is unjustified (D6 holds).

## Current state vs CLAUDE.md
- Hosted on Netlify (serverless) + Supabase Postgres, with multi-user tables (`user.email`, `teslaUserId`). This conflicts with D1, D4, D5 and D6.
- Netlify can't run the D5 worker, so **nothing polls today**. This is the real blocker, not the DB choice.
- `db.sqlite` in the repo root (gitignored, 16 KB, Jan 2026) is a create-t3-app leftover.

## Proposed plan
1. **Engine:** SQLite (WAL) + Drizzle. Driver: `node:sqlite` (built into Node ≥22.5; Drizzle supports it via `drizzle-orm/node-sqlite`) means no native-build dependency. Fallback: `better-sqlite3` if node:sqlite's experimental status bites. https://orm.drizzle.team/docs/connect-node-sqlite
2. **Placement:** `/data/voltops.db` on a named Docker volume, shared by the `web` and `worker` containers. Backup = `VACUUM INTO` / file copy, plus the Settings download (§9).
3. **Tables, phased (create only when the phase needs them):**
   - P1: `settings`, `admin` (1 row), `credentials` (AES-GCM, replaces `tesla_token`), `sites`, `job_runs`.
   - P2a: `energy_intervals` (5-min Wh from calendar_history, authoritative, kept forever), `samples` (live_status: W + SoC + grid_status, 90 days), `weather_observed`, `weather_forecast` (with issued_at), `tariff_plans` (seeded from `site_info.tariff_content_v2`).
   - P2b: `forecasts`, `recommendations`.
   - Deviation from CLAUDE.md §6: **no `energy_hourly` rollup table at first.** Tesla's 5-min intervals are already authoritative, so compute hourly with `GROUP BY`. Add the rollup table only if a query is measurably slow.
4. **Conventions:** timestamps are integer UTC ms, Wh/W are integers (§5), JSON goes in TEXT columns, and unique `(site_id, ts)` keys make backfill idempotent (`INSERT … ON CONFLICT DO NOTHING`).
5. **Migration off Supabase:** a one-off export of the token row → re-encrypt with `VOLTOPS_SECRET_KEY` → local `credentials`. Or simply re-login.

## Unverified / open
- Tesla OAuth redirect URI for a LAN-only instance: sources disagree on whether `http://localhost` is accepted (some say public HTTPS only). This decides whether a self-hosted user needs a tunnel. Must verify before the setup wizard.
- Fleet API energy pricing (still unverified from R1). A 5-min live poll ≈ 8.6k requests/month.
