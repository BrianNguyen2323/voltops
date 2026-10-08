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

## Review: M1 + M2, real data on `/home` (2026-10-06) — PROBE ANSWERED 2026-10-08

All of it is on `main` (last merge 0166a1b). Gate on main: vitest 448/448, typecheck, lint, test:scripts 70/70, `build:worker`, `build`. Docker smoke PASS (image 305 MB, ≤ 400). Every brief had a tester, an implementer and a reviewer PASS.

**What's new**
- `/home` builds a real Dashboard snapshot. The Live reading comes from Tesla, cached 60 s; the Timeline comes from stored 5-min energy plus a baseline forecast; cost comes from your Tesla tariff (SCE TOU-D-4-9PM); the weather tile comes from Open-Meteo. With no site in the DB it still shows the sample data.
- A `worker` service (second compose container). Every hour it pulls today's `calendar_history` (and backfills up to 7 missing days) plus one `live_status`. Every 3 h it pulls weather. Nothing is ever pruned (your Energy history requirement). That's about 1,440 Tesla requests/month plus page views.
- The Tesla token refresh is safe across the web and worker processes (a lease; the old code rotated the token on every call).
- Demo mode: `VOLTOPS_DEMO=true` seeds a "Demo home" from the fixtures when no Tesla site exists.

**1. Try the demo (no Tesla needed).** Use a throwaway checkout or volume, because it seeds only when there is no Tesla site:
`pnpm db:migrate`, then `pnpm seed:replay`, then `pnpm dev`. Log in, and `/home` shows "Demo home" with 7 days of history and tomorrow's forecast.

**2. Try your real system (Docker).**
1. In `.env`, add `SITE_LATITUDE=` and `SITE_LONGITUDE=` (2 decimals, e.g. your city), plus `TEMPERATURE_UNIT=F`.
2. Run `docker compose up -d --build`.
3. **Click "Connect Tesla" once more.** The login now also stores your site name, battery capacity (27 kWh) and backup reserve. Until you do, the capacity defaults to 13.5 kWh.
4. Watch `docker compose logs -f worker`: the first run backfills 7 days (8 history calls + 1 live call), and errors show as `[worker] <job> site=<n> <ErrorName>: …`.
5. Open `/home`. Expect "Learning…" in the health warnings until 7 days are stored (the backfill should cover that at once), and a "behind" warning if Tesla's data lags by more than 2 h.

**3. Run the probe once (B004).** It answers whether Tesla returns *today's* partial day.
- Run `pnpm verify:tesla` against the DB that holds your current Tesla login. That's the local `./data/voltops.db` if you connected through `pnpm dev`.
- Stop the app/worker that uses that same DB first, because the script refreshes the token without the new lease.
- Paste the `today intervals: N (expected about M so far)` line here. If N ≈ M, hourly history works as designed. If N = 0, today's actual hours stay empty until midnight, and we'll need a different fetch plan.

**Known limits (by design for MVP)**
- The recommendation card is empty.
- Forecast accuracy is `[]` (the front-end needs a "learning" state; see the ask above).
- The forecast is a 7-day baseline: median load, and solar from irradiance × learned ratio.

**Housekeeping:** remove the 2 locked, empty worktrees (my removal was denied):
`git worktree unlock .claude/worktrees/agent-acef4e3717147cf8b; git worktree remove --force .claude/worktrees/agent-acef4e3717147cf8b` (the same for `agent-a1fb976491a87f4dd`). Also delete `.claude/worktrees/rv-b001` and the old branch `worktree-agent-a85ac516cb7dc60dd` (it predates this team).

Reply with: (a) approved; (b) changes (list them); or (c) the probe result plus anything you saw.
- Answer (PO, 2026-10-08): **probe result** `today intervals: 9 (expected about 8 so far)`, live_status invariant ok (residual 0 W). So Tesla returns today's partial day, and the hourly `calendar_history` plan works as designed; no fetch-plan change needed. The M1+M2 code shipped inside the approved M3 (below).

## Review: M3, peak hours + reserve advice from real data (2026-10-07) — ANSWERED 2026-10-08

All of it is on the **`middleware`** branch (last merge e7f48a9). It isn't on `main` yet: **you open the PR `middleware` → `main`**, the same way as with front-end-development. Gate on `middleware`: vitest 563/563, test:scripts 70/70, typecheck, lint, `build:worker`, `build`. Docker smoke PASS (305 MB). Every brief had a tester, an implementer and a reviewer PASS.

**What's new**
- **The 6 red fleet-api tests are fixed** (B014). They now read the expected values from your re-recorded fixtures (856a5b7), so the next re-recording breaks fewer of them. No mapper bug was found.
- **The "Peak hours" tile shows real numbers** (B015, B016). Each one comes from your two SQL averages over all stored history:
  - the peak-window home use over every complete day;
  - the same, over the days whose high was within ±3 °C (≈ ±5 °F) of the forecast high.
  - Under 3 such days, it shows "not enough days near X yet".
- **Tonight's reserve advice is live** (B016). Example: "Raise backup reserve to 61%" for an 11 kWh peak on your 27 kWh battery, with the saving = covered kWh × (peak − cheapest off-peak rate). It is advice only; nothing is ever sent to the Powerwall.
- **Past weather gets filled in** (B017, B018). Every 3 h the worker fetches past hours from Open-Meteo, only for days that have energy data but are missing weather, up to 92 days back. It's free and never touches Tesla.

**How to try it**
1. **Demo (no Tesla):** in a throwaway checkout, run `pnpm db:migrate`, `pnpm seed:replay`, `pnpm dev`, then open `/home`. The demo has 7 complete days, so the tile shows numbers and Tonight shows the advice sentence.
2. **Your system (Docker):**
   - run `docker compose up -d --build`;
   - the worker backfills up to 7 days of Tesla history and fills those days' weather on its next weather run;
   - with ≥ 7 complete days, `/home` shows the tile and the advice. Under 7, it says "Learning your usage: N of 7 days".

**Things to know**
- **Your SCE tariff has a peak window every day in winter (Oct–May), weekends included.** So the advice also shows on weekends until summer; in summer, weekends have no peak and no advice.
- **"Complete day" = all 288 five-minute intervals are stored.** Partial days (e.g. the day you connected) don't count, so they can't drag the averages down.
- **Without `SITE_LATITUDE`/`SITE_LONGITUDE` there's no temperature, so the tile stays empty.** The existing warning tells you to set them.
- My other small calls are in `team/middleware/design/revisions/R002.md`.

**Still open from the M1+M2 review above:** your verdict and the `pnpm verify:tesla` probe line.

**Next:** an optimization round is due now (after 3 milestones). That's a cleaner pass per package plus a perf/size pass. Please also run **`/improve-codebase-architecture`** in this session when you're ready; your pick becomes the next design revision.

Reply with: (a) approved (and you open the PR); (b) changes (list them); or (c) anything you saw, plus the probe result.
- Answer: **a, approved** (PO, 2026-10-08). The PO opens the PR `middleware` → `main`. B019 (README) is on `middleware` too. `scripts/generate-tesla-keypair.mjs`: leave as is (the PO has plans for it). The fixtures re-recorded by this probe are still uncommitted; the PO decides.

## USER INPUT REQUIRED — Decision round 3: architecture pick (O1, 2026-10-08)

`/improve-codebase-architecture` report: `C:\Users\nguye\AppData\Local\Temp\architecture-review-20261008-middleware.html` (outside the repo). Candidates:
1. **Energy history module** owns every `energy_intervals` read and write; "complete day" is defined once (today it's defined twice: worker vs peak SQL). Strong. **My recommendation.**
2. **Site sync**: site_info joins the DataSource; the callback and a daily worker job share one mapping, so tariff/reserve/capacity changes are picked up without re-login, and the hard-coded NA base URL goes away. Strong. Costs ~30 Tesla requests/month.
3. **Collapse snapshot load/build** into one `loadSnapshot` test surface. Worth exploring (after 1).
4. **Tariff day**: the tariff module returns a whole Site-local day (periods, peak window, cheapest off-peak). Worth exploring.
5. **One demo adapter**: retire the hand-simulated `home/data.ts` sample in favour of replay. Speculative; front-end owns that file.

**Q1. Which to explore?** Pick one or more (e.g. "1 and 2"). We then grill the shape together, and your pick becomes SPEC Revision 3.
- Answer (PO, 2026-10-08): **1, then 2.** Grill 1 first; both go into SPEC Revision 3.

**Q2. `pnpm format:check` flags 453 files repo-wide** (pre-existing, not in the gate). It touches every scope's files.
- **A (recommended):** leave it. Do one repo-wide `prettier --write` commit later, when no team has open branches.
- B: add format:check to the gate now (a one-off reformat first).
- Answer (PO, 2026-10-08): **reformat now**, after the lead confirmed no team has open branches (all merged into main 10edebf; nothing in doing/gate). B027.

**Q3. Docker Desktop is not running**, so B026's docker smoke (the last O1 gate) can't run. Lint and the config/Dockerfile review already PASS. Start Docker Desktop (or reply "start it" and I'll launch it), then I re-run `SMOKE_PORT=3100 bash scripts/docker-smoke.sh` and merge B026.
- Answer (PO, 2026-10-08): Docker is up; smoke re-run started.

### Grilling #1 Energy history, round 1 — ANSWERED 2026-10-08 (all recommended)
1. Contents: `energy_intervals` + `weather_observed` (the glossary's Energy history). SoC samples and forecast weather stay where they are.
2. Reads **and** writes go through the module (one upsert rule; the worker and the seed share it).
3. Callers pass a Site and Site-local dates (`YYYY-MM-DD`); all UTC/midnight/DST math is inside. Stored times stay UTC ms.
4. No behavior change: a pure restructure. Non-whole-hour time zones and the 92-day gap edge stay in the backlog.
5. Replace, don't layer: one module test file on in-memory SQLite (incl. DST days); `peak.test.ts` and the energy parts of the load/jobs tests move there.

### Grilling #1 round 2 + Site sync round 1 — ANSWERED 2026-10-08 (all recommended)
Q1 Site-bound handle; Q2 the operation list, peak averages inside; Q3 `src/server/history/`; Q4 observed and forecast as two separate writes; Q5 split B028 module → B029 rewire. Site sync: Q6 `getSiteInfo` on the DataSource + `mapSiteInfo`; Q7 at login + daily (~30 req/month); Q8 all 5 facts, tariff replaced whole; Q9 login stores creds, then syncs via the client with the fresh token; Q10 a failure never blocks login; Q11 the seed uses the mapper.
→ SPEC Revision 3, `design/revisions/R003.md`, milestone M4 (B028–B031).

**FYI (no action needed):** for Q10 I said a failed sync would show "as a Health warning". There's no job-run table, so the worker can't put anything on the dashboard. A failed site-sync is a log line, like every other worker job; the dashboard still says "No tariff from Tesla" when a tariff is missing. Say so if you want a job-run table (a later item).

## USER INPUT REQUIRED — Review: M4, Energy history + Site sync (2026-10-08)

Everything is on **`middleware`** (last merge 5b5f119; **+ B033 31ceb81**: the SITE_* env settings now reach a Site created after the worker started, e.g. at login, without a worker restart). **You open the PR `middleware` → `main`**; it also carries B027 (repo-wide prettier). Gate on `middleware`: vitest 601/601, test:scripts 71/71, typecheck, lint 0/0, **format:check**, `build:worker`, `build`. Docker smoke PASS (305 MB). Every brief had a tester (where new behavior), an implementer and a reviewer PASS.

**What's new**
- **Energy history** (`src/server/history/`): one module owns every read and write of stored energy and observed weather. "Complete day" is one rule now. `peak.ts` is gone. This is a pure restructure: the dashboard, the worker and the demo show the same numbers as before.
- **Site sync:** your site name, timezone, battery capacity, backup reserve and tariff are refreshed **daily by the worker** and at login, through the Tesla client. So a tariff or reserve change in the Tesla app shows up within a day, with no re-login. It costs ~30 extra Tesla requests/month.
- **Login** no longer hard-codes the North America Fleet API URL (it uses `TESLA_FLEET_BASE_URL`). If the site sync fails at login, you're still logged in and land on `/home`.
- **Demo** (`VOLTOPS_DEMO`/`seed:replay`): the demo Site's timezone, capacity, reserve and tariff now come from `fixtures/fleet-api/site_info.json`.

**How to try it**
1. **Demo (no Tesla):** in a throwaway checkout, run `pnpm db:migrate`, `pnpm seed:replay`, `pnpm dev`, then open `/home`. It should look exactly as before: 7 days of history, the Peak hours tile and the Tonight advice.
2. **Your system (Docker):** `docker compose up -d --build --force-recreate` (your containers were still on the pre-M4 image), then `docker compose logs -f worker`. On the first tick you should see no `site-sync` error. `/home` should look as before.
3. **Site sync for real:** change the backup reserve in the Tesla app, then restart the worker (`docker compose restart worker`; it syncs on its first tick). The reserve on `/home` (Tonight's advice) should follow.
4. **Optional:** click "Connect Tesla" again. The login should land on `/home` as before.

**Things to know**
- A failed site sync shows only in the worker log (`[worker] site-sync site=<n> <ErrorName>`), not on the dashboard. There's no job-run table yet (see the FYI above).
- The demo tariff id is now the fixture's real plan name (a public SCE plan id, already in the committed fixtures) instead of `replay`.

Reply with: (a) approved (and you open the PR); (b) changes (list them); or (c) anything you saw.
- Answer:
