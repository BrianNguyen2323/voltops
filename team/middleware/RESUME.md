# Resume board — middleware

- **M5 DONE 2026-10-12 on `middleware`** (B040 10d137e, B039 bd746f1, B037 ff11732, B036 fd6fa64, B038 d42b560, B042 6f39b1a; board f0c824f). Gate: vitest 817, scripts 72, tsc, lint 0/0, format, builds; docker smoke PASS 305 MB. **Waiting on the PO:** the M5 review item and the `verify:tesla` probe (TODO). Next: B041 once the fixture exists (Haiku scan → `chore(fixtures)` commit → tester → implementer → reviewer); then the PO picks the next topic. An optimization round is due after 2 more milestones (count from M4).
- **Follow-ups (M5):** with the refresh token dead (AuthExpired), the backfill tick calls auth.tesla.com every minute (not billed; hourly jobs only hourly). Back off after AuthExpired if it shows up. An unfillable old weather gap costs one free archive request per 3 h forever (reviewer: acceptable). `client.test.ts` has a BOM (pre-existing). Housekeeping: worktree `agent-aa688d006b0df62bd` (Permission denied); merged branches deletable.
- **M5 progress (2026-10-12):** lead chore 8ed1634 (prettier on front-end's `dashboard.test.ts`; format:check was red on main). Worktrees spawn at `main` 591a3c0, so every spawn names its base. Tests in: B037 2cca6b2 (`phase2b/middleware-health-tests`; tester's readings adopted as contract), B036 75787b4 (`phase2b/middleware-system-tests`; loader must zod-coerce the panel env; new `src/env.schema.test.ts`). B040 c0f1413 done → reviewer running (nit: header says 5 GETs, now 6). B037 implementer running. B038 tests 62dbc56 (`phase2b/middleware-backfill-tests`; signatures assumed: async `backfillStep(deps, limits)` with jobs `Deps`, sync `backfillState(db, site, limits, now)`, limits keyed like the env; `done` beats `paused-budget`; archive `end_date` must reach the UTC day where the newest old gap's local span ends; replaced 2 tests asserting the old 92-day floor). Waiting: B039 impl.
- **Status (2026-10-12): M5 started** (Your system + Equipment health + backfill). Decision round 4 answered (all A). SPEC Rev 4 + R004 + briefs B036–B042 committed 48a4ada. **Wave 1 spawned** (worktrees, sonnet @medium): B039 implementer, B040 implementer, B036/B037/B038 testers. Next: reviewer per finished brief (opus @medium) → merge into `middleware` → wave 2 = B037 + B036 implementers (B036 rebased on B039) → wave 3 = B038 implementer (after B039 + B036) → B042 → B041 after the PO runs `verify:tesla` (B040) and the fixture passes the Haiku scan.
  - Verified: `samples` is hourly (worker `live_status` once an hour); `installation_date` is RFC 3339 with an offset (git history, digits masked); `backup_history` = `calendar_history?kind=backup` is official (developer.tesla.com energy endpoints, 2026-10-12), its fields are unrecorded; both containers load `.env`.

- **Hand-off from front-end (2026-10-08, PO-approved, front-end SPEC Rev 8):** three new backlog briefs. The front-end ships the contract + a `build.ts` stub in B035.
  - `plan/board/backlog/B036-system-info.md` (site_info fields, `SITE_PANEL_*` env, best hour, change log);
  - `B037-equipment-health.md` (pure health measurements);
  - `B038-history-backfill.md` (one-time backfill; **PO budget condition**: ≤ 2,500/month, total ≤ 4,500 of ~5,000 free Tesla Data requests).

- **Cross-scope note (front-end lead, 2026-10-08):** front-end B034 (PO-approved, decision round 3 Q1 A) changed `src/lib/advisor/reserve.ts`: `validTo` = start of tomorrow's peak (was the end), plus its expectations in `reserve.test.ts`, `build.test.ts` and `load.test.ts`. SPEC L166 updated. Merged on `front-end-development` at 1f92288. Rebase or merge before touching the advisor.

Scope: wire real data into the dashboard (a `DashboardSnapshot` per Site from the DB, the Tesla Fleet API, Tesla's tariff and Open-Meteo). Created 2026-10-06 from the front-end hand-off (`research/dashboard-snapshot/README.md`).

- **M4 APPROVED 2026-10-08; the PO opened the PR `middleware` → main (M4 + B027 + B033). Next: the PO picks the next topic** (candidates: #3 collapse snapshot load/build, now small; #4 Tariff day; a job-run table so worker failures reach the dashboard; backlog list below). Next optimization round is due after 2 more milestones. History: O1 done (main 10edebf; B027 prettier aad9419 on `middleware`, PO to open the PR). Grilling done (all recommended). SPEC Rev 3, R003, briefs B028–B031. B028 DONE (8a309a9). B029 DONE (31beb76; gate green: vitest 569, format, tsc, lint, builds; 10 peak + 11 duplicated cases removed). B030 DONE (72942a2). B032 DONE (996509c). Gate green on middleware: vitest 596, format, tsc, lint, builds. B031 DONE (5b5f119). **M4 DONE** on `middleware`: gate green (vitest 601, scripts 71, tsc, lint 0/0, format:check, builds), docker smoke PASS 305 MB. **B033 DONE (31ceb81):** SITE_* env applied every worker tick (a Site created after start got no lat/lon) + tick catch (no unhandled rejection). Gate green: vitest 603, scripts, tsc, lint, format, builds; smoke PASS 305 MB. The PO found env "not injecting": verified it IS in the container; their containers were pre-M4 (16 h old) → `docker compose up -d --build --force-recreate`.
  - **Done + merged into `middleware`** (reviewer PASS each; gate green after each: vitest 563, test:scripts 71, tsc, lint 0/0, build:worker, build): B023 worker 39ccf88 (gap-fill reads distinct hours), B025 tariff df00880, B024 sources d92b6be (map test uses the fixture residual), B022 snapshot 6f6be2f (`peakEstimate` required, one weather_observed read). Worktrees + branches removed.
  - B026 chores 5c3277f (lint 0/0 incl. dist ignored; image ships only runtime fixtures), smoke PASS 305 MB.
  - Reviewer nit (non-blocking, B023): no test puts intervals across a DST day for the distinct-hour bucket. Candidate for the next round.
  - **/improve-codebase-architecture run** (PO asked): report at `%TEMP%\architecture-review-20261008-middleware.html`; TODO **Decision round 3** waits on the PO (pick from 1–5, plus Q2 on format:check). The pick → grilling → SPEC Revision 3.
- **B019 README rewrite merged into `middleware` 2026-10-08** (PO request, Haiku member; reviewer PASS). Stale `scripts/generate-tesla-keypair.mjs` (TESLA_PRIVATE_KEY, Netlify vars) flagged to the PO.
- **Status (2026-10-08): M3 DONE and APPROVED** (e7f48a9; README B019 e1ce27e). B004 probe answered: partial today works. SPEC Revision 2, R002.
  - **Integration branch: `middleware`** (the PO checked it out at main 8dd31b9). Members branch from it; I merge into it; **the PO opens the PR `middleware` → `main`**.
  - M3 merges into `middleware`: B014 c1d3a02 (fixture tests), B017 2291729 (gap-fill), B015 9a6444a (peak SQL), B018 fb80002 (gap-fill UTC past_days), B016 e7f48a9 (advisor + wiring).
  - M3 gate on `middleware`: vitest 563, test:scripts 70, typecheck, lint, build:worker, build; docker smoke PASS 305 MB.
- **Merged to main:**

| Brief | What | Merge |
|---|---|---|
| B002 | schema | 6a8afaf |
| B005 | time + tariff | f45dc61 |
| B009 | Open-Meteo | 1bbcf84 |
| B001 | fleet client | 167d93a |
| B004 | probe | 12b39f7 |
| B006 | forecast | 7e7015d |
| B010 | refresh lease | 7f7f1c6 |
| B003 | worker | 3a601ee |
| B007 | snapshot + /home | 3b2abed |
| B011 | worker follow-ups | 3677be0 |
| B012 | snapshot follow-ups | 26644d6 |
| B008 | replay | 0166a1b |

- **Lead chore:** 59973ab (`.claude` + `next-env.d.ts` excluded from tsc/eslint).
- **Final gate on main:** vitest 448, tsc, lint, test:scripts 70, build:worker, build; docker smoke PASS at 305 MB (reviewer, on the merged tree).
- **Last action:** wrote the PO Review item (890e44e). All merged worktrees and branches removed.
- **Incoming from front-end (2026-10-07):** `plan/board/backlog/B013-peak-estimate.md` covers the peak-hours estimate (2 SQL averages: all history + similar temperature), the reserve advice (`recommendation.reserve`) and the weather gap-fill. Start after front-end B012 (contract + helpers + stub) merges.
- **Next action:**
  - **M3 APPROVED by the PO (2026-10-08), probe answered** (N = 9 vs ~8: partial today works; no fetch-plan change). The PO opens the PR `middleware` → `main`;
  - after that PR merges (so the approved PR stays clean), start the **optimization round**: a `cleaner` per package (`src/lib/advisor`, `src/server/snapshot`, `src/worker`, `src/lib/weather`, `src/lib/tariff`, `src/lib/sources`), a perf/size pass, and a TODO item asking the PO to run `/improve-codebase-architecture`;
  - cleaner candidates: `BuildInput.peakEstimate` optional → required (`build.test.ts:21` says "required"); gap-fill loads all 92 days of intervals into JS (a GROUP BY would do); the 2 old lint warnings; `pnpm format:check` reports 453 files (pre-existing, not in the gate);
  - fixtures re-recorded + committed a491385 (Haiku scan PASS); B020 (ac9eceb) made `map.test.ts` recording-independent. Left: the "fixture balances" no-warn check (`map.test.ts:26`) still assumes a recording balances within 50 W; the scan flagged `site_info.installation_date` as a quasi-identifier (PO to decide on redacting it in `verify:tesla`); `du.exe.stackdump` untracked, never `git add -A`;
  - leave `scripts/generate-tesla-keypair.mjs` alone (PO).
- **Open branches / worktrees (2026-10-08):** none from M4. Still only 2 locked, empty spawns (`agent-acef4e3717147cf8b`, `agent-a1fb976491a87f4dd`) and `rv-b001`. Their removal was denied to the lead; it's in the PO housekeeping list. `worktree-agent-a85ac516cb7dc60dd` predates this team.
- **Follow-ups / backlog ideas (not MVP):**
  - gap-fill edge: a gap day exactly 92 local days back, run in a local evening, needs past_days 93 (capped at 92) → partial until the morning run; bounded, documented in the B018 review;
  - `highC` nullable in the contract would let a site without lat/lon see the tile (front-end change; R002);
  - the callback still hard-codes the NA Fleet base URL (the client uses `TESLA_FLEET_BASE_URL`);
  - the front-end needs a "learning" state for `accuracy: []`;
  - the Dockerfile ships 4 fleet fixtures (2 unused);
  - non-whole-hour timezones (India etc.) would mis-bucket hours;
  - `verify:tesla` refreshes without the lease;
  - the 2 old lint warnings (postcss/prettier) are for a cleaner.
- **B021 done (82a0624):** `verify:tesla` now redacts `installation_date` (PO). The value is still in git history (old fixture commits, brief commit 09e8410); a history rewrite is the PO's call.
- **Standing rule (PO, 2026-10-08): fixture re-records get committed each time.** `pnpm verify:tesla` rewrites `fixtures/fleet-api/*.json`. Before committing them, a **Haiku** reviewer (Agent `model: "haiku"`) scans them for sensitive data (site IDs, serials, DIN, gateway IDs, names, addresses, coordinates, emails, account numbers, tokens). Commit only on PASS, as `chore(fixtures): …`; then fix any tests pinned to the old recording.
- **Env lessons:**
  - worktrees need the node_modules junction; remove it with `cmd /c rmdir node_modules` BEFORE `git worktree remove`, and never `--force` with a junction;
  - a real node_modules: `cmd /c rmdir /s /q "\\?\<literal full path>\node_modules"` (a literal path; a variable in the path gets blocked);
  - run `rm -rf .next` before gating builds; lint needs `SKIP_ENV_VALIDATION=1`;
  - `pnpm lint` right after a merge sometimes exits 1 with no findings; re-run once;
  - vitest flakes under load: re-run once;
  - smoke: `SMOKE_PORT=3100`, from Git Bash on D:;
  - members often forget to commit or hit test-file lint errors (`no-base-to-string`, `unbound-method`). Say "COMMIT and give the hash" in every spawn;
  - Agent isolation sometimes fails ("git could not be run"); retry later with fewer members running.
- **M4 follow-up (B028 review nit) → B032** (one `>= slots` rule in the history module).
