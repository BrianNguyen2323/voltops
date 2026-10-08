# Resume board — middleware

Scope: wire real data into the dashboard (a `DashboardSnapshot` per Site from the DB, the Tesla Fleet API, Tesla's tariff and Open-Meteo). Created 2026-10-06 from the front-end hand-off (`research/dashboard-snapshot/README.md`).

- **Status (2026-10-07): M3 (peak estimate + reserve advice + weather gap-fill) IN PROGRESS.** SPEC Revision 2, R002. Started from the front-end's B013 hand-off (split into B015/B016/B017) plus B014 (6 red fleet-api tests after the PO's fixture re-record 856a5b7).
  - The PO's M1+M2 Review (TODO.md) is still unanswered; it doesn't block M3.
  - **Integration branch: `middleware`** (the PO checked it out at main 8dd31b9; it was 15 ahead of origin/middleware). Members branch from it; I merge into it; the PO opens the PR to main (same pattern as front-end-development).
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
  - M3 wave 1: B014 (implementer), B015/B016/B017 testers → implementers → reviewers → merge into `middleware`. B016's implementer starts after B015 merges;
  - then the full gate on `middleware`, the PO Review item, and the optimization round (due after M3);
  - still open from the PO: the M1+M2 review (a/b/c) and the B004 probe result. If N = 0 (no partial today), open a decision on the fetch plan.
- **Open branches / worktrees:** only 2 locked, empty spawns (`agent-acef4e3717147cf8b`, `agent-a1fb976491a87f4dd`) and `rv-b001`. Their removal was denied to the lead; it's in the PO housekeeping list. `worktree-agent-a85ac516cb7dc60dd` predates this team.
- **Follow-ups / backlog ideas (not MVP):**
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
