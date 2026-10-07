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
