# Milestones — middleware

## M1: data in — DONE 2026-10-06
Fetch and store real data, never pruned.
- B001 Fleet API client + mappers (replaces `src/lib/tesla.ts`)
- B002 Schema: energy_intervals, samples, weather_observed/forecast, sites columns; callback stores name/capacity/reserve
- B009 Open-Meteo client + mapper (+ recorded fixture)
- B003 Worker process + compose service (needs B001, B002, B009)
- B004 `verify:tesla` partial-today probe (PO runs once)

## M2: snapshot out — DONE 2026-10-06 (+ follow-ups B010, B011, B012)
`/home` renders real data; replay works without a Powerwall.
- B005 Site-local time helpers + tariff module
- B006 Baseline forecast + SoC projection (needs B005)
- B007 Snapshot builder + loader, `/home` wiring (needs all above)
- B011 Worker follow-ups (B003 review: today first, blank env, idle w/o creds, smoke image name)
- B012 Snapshot follow-ups (B007 review: page fallback, live error log, behind warning, battery-flow test)
- B008 Replay seed + `VOLTOPS_DEMO` (needs B002, B009 fixture, B003)

Order: wave 1 = B001, B002, B005, B009 (parallel, disjoint files) → wave 2 = B003, B006, B004 → wave 3 = B008, B007.

## M3: peak estimate + reserve advice (Rev 2, R002) — DONE 2026-10-07 on `middleware` (e7f48a9)
The Peak hours tile and the Tonight advice show real numbers; past weather is gap-filled.
- B014 Fleet-api tests follow the re-recorded fixtures (856a5b7)
- B015 Peak SQL module (2 averages, complete days) + `localTime` helper
- B016 Reserve advisor + snapshot wiring (`peakEstimate`, `recommendation`) (needs B015)
- B017 Weather gap-fill in the worker (`fetchWeather` past days)
- B018 Gap-fill `past_days` in UTC days (B017 review nit; partial oldest day in local evenings)

Order: wave 1 = B014, B015, B017, plus B016's tester → wave 2 = B016's implementer (on B015's merge). Integration branch: `middleware` (the PO opens the PR to main).
After M3: optimization round (cleaner per package + perf/size + `/improve-codebase-architecture`).

## O1: optimization round after M3 (started 2026-10-08, on `middleware` from dec2f9a)
Cleaner per package plus a perf/size pass; no behavior change.
- B022 snapshot + advisor (`peakEstimate` required)
- B023 worker (gap-fill query: distinct hours, not 26k rows)
- B024 fleet-api source + Open-Meteo (map test stops assuming a balanced recording)
- B025 tariff + forecast + replay
- B026 repo chores: lint 0/0 (`dist` ignored, config default exports), Dockerfile copies only the fixtures replay reads

Order: wave 1 = B022–B025 (disjoint) → wave 2 = B026. Each gets a reviewer. Plus `/improve-codebase-architecture` with the PO; the PO's pick becomes Revision 3.
Skipped: `pnpm format:check` (453 files, repo-wide, touches other scopes' files) is flagged to the PO instead.

## M4: Energy history + Site sync (Rev 3, R003) — DONE + APPROVED 2026-10-08 (5b5f119; + B033 31ceb81). PR middleware → main opened by the PO
- B028 Energy history module (tester → implementer; new files only)
- B029 Rewire the worker, the snapshot and the seed to it; delete `peak.ts` (needs B028)
- B030 `listSites`/`getSiteInfo` + `mapSiteInfo` + `syncSite` + login path (tester → implementer; implementer after B029)
- B032 One "complete day" rule in the history module (B028 review nit)
- B031 Worker daily `site-sync` job + replay seed via `mapSiteInfo` (tester → implementer; needs B029, B030)

Order: wave 1 = B028 tester + B030 tester → B028 implementer → B029 → B030 implementer → B031.

## M5: Your system + Equipment health + backfill (Rev 4, R004) — STARTED 2026-10-12 on `middleware` (from 591a3c0)
The "Your system" section on `/home` shows real batteries, panels, plan, firmware and change log; Equipment health shows the four measurements; a one-time backfill fills past history inside the Tesla budget.
- B039 Migration 0003 (site facts, `site_events`, `fleet_requests`)
- B040 `verify:tesla` records `backup_history` (then the PO runs it)
- B036 `system` from site_info + panel env + best hour + change log (tester → implementer; implementer after B039)
- B037 Pure `src/lib/health` module (tester → implementer; new files only)
- B038 Request counter + backfill + archive weather (tester → implementer; implementer after B039 and B036)
- B042 Snapshot wiring of `equipmentHealth` + backfill progress (after B036, B037, B038)
- B041 Outages from `backup_history` (after B040 and the PO's recorded fixture)

Order: wave 1 = B039, B040, testers of B036/B037/B038 → wave 2 = B037 implementer, B036 implementer (on B039) → wave 3 = B038 implementer → wave 4 = B042 → B041 when the fixture lands. A reviewer per brief.
