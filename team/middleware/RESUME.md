# Resume board — middleware

Scope: wire real data into the dashboard (a `DashboardSnapshot` per Site from the DB, the Tesla Fleet API, Tesla's tariff and Open-Meteo). Created 2026-10-06 from the front-end hand-off (`research/dashboard-snapshot/README.md`).

- **B019 README rewrite merged into `middleware` 2026-10-08** (PO request, Haiku member; reviewer PASS). Stale `scripts/generate-tesla-keypair.mjs` (TESLA_PRIVATE_KEY, Netlify vars) flagged to the PO.
- **Status (2026-10-07): M3 DONE on `middleware` (e7f48a9). Waiting on the PO's Review** (TODO.md "Review: M3") and the still-open M1+M2 review + B004 probe. SPEC Revision 2, R002.
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
- **Red tests (2026-10-07):** the PO re-recorded `fixtures/fleet-api/*.json` (856a5b7: day 2026-10-06, reserve 70%). 6 tests pin the old capture: `map.test.ts` (4), `client.test.ts` (1), `callback-logging.test.ts` (1). Update them first.
- **Next action:**
  - record the PO's M3 review (a/b/c) and the M1+M2 review + probe. If N = 0 (no partial today), open a decision on the fetch plan;
  - **optimization round is due now** (M1–M3 done): a `cleaner` per package (`src/lib/advisor`, `src/server/snapshot`, `src/worker`, `src/lib/weather`, `src/lib/tariff`, `src/lib/sources`), a perf/size pass, and the PO runs `/improve-codebase-architecture` (asked in TODO.md);
  - cleaner candidates: `BuildInput.peakEstimate` is optional with a default stub (the reviewer prefers it required; `build.test.ts:21` comment says "required"); the gap-fill loads every interval in the 92-day window into JS (a GROUP BY would do); the 2 old lint warnings (postcss/prettier).
- **Open branches / worktrees:** only 2 locked, empty spawns (`agent-acef4e3717147cf8b`, `agent-a1fb976491a87f4dd`) and `rv-b001`. Their removal was denied to the lead; it's in the PO housekeeping list. `worktree-agent-a85ac516cb7dc60dd` predates this team.
- **Follow-ups / backlog ideas (not MVP):**
  - gap-fill edge: a gap day exactly 92 local days back, run in a local evening, needs past_days 93 (capped at 92) → partial until the morning run; bounded, documented in the B018 review;
  - `highC` nullable in the contract would let a site without lat/lon see the tile (front-end change; R002);
  - the callback still hard-codes the NA Fleet base URL (the client uses `TESLA_FLEET_BASE_URL`);
  - the front-end needs a "learning" state for `accuracy: []`;
  - the Dockerfile ships 4 fleet fixtures (2 unused);
  - non-whole-hour timezones (India etc.) would mis-bucket hours;
  - `verify:tesla` refreshes without the lease;
  - the 2 old lint warnings (postcss/prettier) are for a cleaner.
- **Env lessons:**
  - worktrees need the node_modules junction; remove it with `cmd /c rmdir node_modules` BEFORE `git worktree remove`, and never `--force` with a junction;
  - a real node_modules: `cmd /c rmdir /s /q "\\?\<literal full path>\node_modules"` (a literal path; a variable in the path gets blocked);
  - run `rm -rf .next` before gating builds; lint needs `SKIP_ENV_VALIDATION=1`;
  - `pnpm lint` right after a merge sometimes exits 1 with no findings; re-run once;
  - vitest flakes under load: re-run once;
  - smoke: `SMOKE_PORT=3100`, from Git Bash on D:;
  - members often forget to commit or hit test-file lint errors (`no-base-to-string`, `unbound-method`). Say "COMMIT and give the hash" in every spawn;
  - Agent isolation sometimes fails ("git could not be run"); retry later with fewer members running.
