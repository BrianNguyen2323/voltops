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
