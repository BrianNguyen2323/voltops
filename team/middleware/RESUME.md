# Resume board — middleware

Scope created by the front-end team lead on 2026-10-06 at the PO's request. No research or decisions yet; this team's lead starts here.

- **Topic (PO):** wire real data into the dashboard. Fill a `DashboardSnapshot` per Site from the DB and APIs: Tesla Fleet API live status + `calendar_history`, the tariff, and a weather API (Open-Meteo, CLAUDE.md D8). Replace the sample adapter on `/home`.
- **Read first:**
  1. `CLAUDE.md` §5 (DataSource, units, signs), §6 (data model + retention), §7;
  2. `GLOSSARY.md`;
  3. `research/dashboard-snapshot/README.md`: the **hand-off doc** (a copy of `docs/dashboard-snapshot.md`; the code in `src/lib/dashboard.ts` is canonical);
  4. `team/front-end/design/SPEC.md`;
  5. `docs/adr/0001-no-hourly-rollup-table.md`;
  6. `team/db-docker/design/SPEC.md` (current schema).
- **Contract decisions already made by the PO** (front-end Decision rounds 2–3, 2026-10-06):
  - today/tomorrow = **site-local days**, derived from each Timeline hour + the Site timezone;
  - the Timeline covers the **whole** of today and tomorrow (48 rows; 47 or 49 across a DST change);
  - actual Timeline hours carry grid import/export and battery charge/discharge Wh;
  - "Cost today" is supplied by the adapter (until a tariff module exists) and must agree with the derived grid import;
  - "Last 7 days": the adapter supplies the 6 previous days;
  - the Live reading is the instantaneous reading at `updatedAt`;
  - `checkSnapshot(snapshot)` returns a list of problems: run it in your adapter tests. The page logs problems server-side and still renders.
- **PO requirement: Energy history (2026-10-06).**
  - Keep a running record **for many years for each Site**: observed weather and the kWh the system generated (plus home use, grid and battery). A future feature will use it to check **panel and battery degradation**.
  - **Conflict to resolve first.** CLAUDE.md §6 keeps raw samples 90 days and rollups forever, and ADR 0001 says "no hourly rollup table; GROUP BY the 5-minute interval rows". Together, the 5-minute interval rows are the *only* long-term energy record, so they must never be pruned by the 90-day retention. Otherwise add a durable hourly/daily rollup and revise ADR 0001. `weather_observed` (hourly irradiance, cloud, temperature) must be kept forever too.
  - Scale note: 288 five-minute rows/day ≈ 105k rows/year/Site, which is fine for SQLite. This is still to decide with the PO.
- **Open question for this team:** the `tariffSchedule.content` JSON shape. The front-end's architecture candidate 2 (one tariff module) waits on it.
- **Status (2026-10-06): Decision round 1 open in TODO.md (Q1–Q10 + the proposed MVP task list B001–B008).** Research: `research/mvp-scope/README.md`. Key finding: the DB has no energy/weather tables, so this scope also adds storage + a worker. It overlaps tesla-api-connection's paused round 2 (Q1).
- **Last action:** research round done by the lead; Decision round 1 written.
- **Next action:** record the PO's answers → SPEC Revision 1 + `design/revisions/R001.md` → MILESTONES (M1 data in, M2 snapshot out) → briefs in board/ready (tester first). If Q1=A, mark tesla-api-connection round 2 as absorbed in its RESUME/TODO.
- **Open branches / worktrees:** none.
- **Env lessons:** see `team/front-end/RESUME.md` and `team/db-docker/RESUME.md`.
