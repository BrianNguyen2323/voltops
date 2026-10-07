# PO to-do — middleware

## Decision round 1: middleware MVP scope — ANSWERED 2026-10-06 (all recommended; see design/revisions/R001.md)

Research: `research/mvp-scope/README.md`. **Headline:** the DB has no energy, weather or forecast tables yet (db-docker deferred all Phase 2 tables). So this scope must also add the storage and the fetch job, not just "read the DB".

### Proposed MVP task list (assuming all-recommended answers)
**M1: data in**
- B001 Fleet client (absorbs tesla-api-connection round 2): in-memory access-token cache, refresh serialized in a SQLite write transaction, typed errors. Pure mappers `live_status` → Live reading and `calendar_history` → 5-min intervals. Fixture-tested, no network.
- B002 Schema migration: `energy_intervals` (site, 5-min start, 6 Wh columns), `soc_samples` (site, ts, socPct), `weather_hourly` (observed + forecast-as-issued). The callback also stores site name + usable capacity.
- B003 Worker (2nd compose service, same image): hourly `calendar_history` for today plus backfill of missing days (≥ 7 at first run), one `live_status` for SoC, and Open-Meteo weather. Typed errors → `health.warnings`; no crash.
- B004 `verify:tesla` probe: does `calendar_history` for today return the partial day? You run it once.

**M2: snapshot out**
- B005 Tariff module (pure): Tesla `tariff_content` → `tariffNow` (period, import/export rate, `endsAt`) and `costToday`. DST tests.
- B006 Baseline forecast (pure): forecast hours for the rest of today and tomorrow with p10/p90, plus the SoC projection.
- B007 `getDashboardSnapshot(siteId)` from the DB + live call. `/home` drops `sampleSnapshot`. `checkSnapshot` is `[]` in tests, including DST days.
- B008 Replay: a seed script loads the fixtures into a DB, so `/home`, CI and `docker compose up` work without a Powerwall.

**Out of MVP:** `recommendation` (null, advisor = Phase 2b), `accuracy` (`[]` until forecasts are stored), the tariff editor/URDB, local-gateway, and automation.

### Questions
**Q1. Who builds the fleet-api adapter?** tesla-api-connection's Decision round 2 is paused, and it is this scope's critical path.
- **A (recommended):** middleware absorbs it with that round's recommended answers (1A code in `src/lib/…`, 2A client + mappers, 4A `TESLA_FLEET_BASE_URL` env, 5A replace `tesla.ts`). tesla-api-connection closes.
- B: wait for tesla-api-connection to finish first.
- Answer: **A** (PO, 2026-10-06, "all recommended").

**Q2. Fetch budget?**
- **A (recommended):** `calendar_history` hourly as the history source, one `live_status` per hour for SoC, and `live_status` on `/home` page load (cached 60 s). About 1,440 req/month + page views ≈ $3, inside the $10 credit. It depends on the B004 probe; if the partial day isn't returned, history lags until midnight.
- B: `live_status` every 5 min (the CLAUDE.md default): ~8,640 req/month ≈ $17, about $7 over the credit.
- Answer: **A** (PO, 2026-10-06, "all recommended").

**Q3. Where does fetching run?**
- **A (recommended):** a `worker` process (D5, DECIDED): a plain Node loop, a 2nd compose service sharing `/data`, and `pnpm dev` runs it alongside Next.
- B: fetch lazily inside the `/home` request when data is >1 h stale. Less code, but it overrides D5 (needs an ADR) and fetches nothing while nobody looks. calendar_history backfill would hide most of that gap.
- Answer: **A** (PO, 2026-10-06, "all recommended").

**Q4. Energy history retention (your many-years requirement)?**
- **A (recommended):** never prune `energy_intervals`, `soc_samples` or observed weather (~105k rows/year/Site; fine). ADR 0001 stands (no rollup table). Add a note to CLAUDE.md §6 that 90-day retention applies to raw live samples only.
- B: add an hourly rollup table kept forever, prune 5-min rows after 90 days. Revises ADR 0001.
- Answer: **A** (PO, 2026-10-06, "all recommended").

**Q5. SoC for past hours** (calendar_history has no battery %)?
- **A (recommended):** the worker stores SoC from its hourly `live_status` call (in Q2's budget). Exact, cheap.
- B: back-calculate from the current SoC and battery Wh. Free, but it drifts with round-trip losses.
- C: probe the undocumented `calendar_history?kind=soe`. Free if it works; may 4xx or change without notice.
- Answer: **A** (PO, 2026-10-06, "all recommended").

**Q6. Forecast for MVP** (the Timeline needs forecast hours with p10/p90)?
- **A (recommended):** load = the same hour over the last 7 days (p10/p90 from that spread). Solar = Open-Meteo forecast irradiance × the site's learned Wh-per-irradiance ratio from the last 7 days (CLAUDE.md §7 solar model, minimal). Tomorrow's solar then reflects the weather. Fewer than 7 days of data → the same naive shapes with wide bands.
- B: naive only (last 7 days for both). Simpler, but tomorrow's solar ignores clouds, so the "solar outlook" tile is meaningless.
- C: leave forecasting to a Phase 2b scope and show a stub. `checkSnapshot` requires forecast rows, so it would still need fake p10/p90.
- Answer: **A** (PO, 2026-10-06, "all recommended").

**Q7. Site location + display unit** (Open-Meteo needs lat/lon; Tesla gives none)?
- **A (recommended for MVP):** env vars `SITE_LATITUDE`, `SITE_LONGITUDE` (2 decimals is enough) and `TEMPERATURE_UNIT` (F/C), documented in `.env.example`. The worker copies them onto the `sites` row. Unset → `weatherTomorrow: null` and solar falls back to naive.
- B: a settings form (lat/lon, ZIP geocoding). Needs front-end work; better post-MVP.
- Answer: **A** (PO, 2026-10-06, "all recommended").

**Q8. Tariff shape** (the front-end's open question for its tariff module)?
- **A (recommended):** keep Tesla's `tariff_content` JSON exactly as the callback stores it, and parse it in one pure tariff module (B005). Tesla periods map ON_PEAK→peak, PARTIAL_PEAK→mid-peak, OFF_PEAK→off-peak. The export rate comes from `sell_tariff`. The D9 editor later writes the same shape.
- B: define a VoltOps tariff schema + editor now (D9). Not needed while Tesla supplies your plan.
- Answer: **A** (PO, 2026-10-06, "all recommended").

**Q9. Replay for MVP?**
- **A (recommended):** a seed script fills a DB from the fixtures (1 recorded day repeated over 7 days), and a fixture-backed live reading. The same snapshot code then serves both, with no separate replay DataSource yet.
- B: a full `replay` DataSource + a multi-week generated demo dataset (Phase 1-D).
- Answer: **A** (PO, 2026-10-06, "all recommended").

**Q10. Schema ownership?** db-docker is idle (waiting on your M4 review).
- **A (recommended):** middleware writes the new tables' migration (B002), and db-docker's SPEC gets a pointer.
- B: hand B002 to db-docker.
- Answer: **A** (PO, 2026-10-06, "all recommended").

### Asks for other teams (no decision needed)
- **front-end:** an empty/"learning" state for `accuracy: []`, plus a check that `recommendation: null` renders well.

Answer inline or in chat, e.g. "all recommended" or "Q6 B, rest recommended".
