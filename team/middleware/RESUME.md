# Resume board — middleware

Scope: wire real data into the dashboard (a `DashboardSnapshot` per Site from the DB, the Tesla Fleet API, Tesla's tariff and Open-Meteo). It replaces `sampleSnapshot` on `/home`. Created 2026-10-06 from the front-end hand-off (`research/dashboard-snapshot/README.md`).

- **Current round:** build, M1 + M2 (SPEC Revision 1, Decision round 1 = all recommended). The plan is in `plan/MILESTONES.md`:
  - wave 1 = B001 fleet client, B002 schema, B005 time+tariff, B009 Open-Meteo;
  - wave 2 = B003 worker, B006 forecast, B004 probe;
  - wave 3 = B008 replay, B007 snapshot + `/home`.
  - Wave 2/3 briefs are written when they move to ready (they depend on wave 1's actual exports).
- **Last action:** SPEC Rev 1, R001, MILESTONES, wave-1 briefs in board/ready. tesla-api-connection marked closed (absorbed).
- **Next action:** wave 1 testers → implementers → reviewers → gate/merge, one brief at a time per member slot (max 4 members at once).
- **Open branches / worktrees:** none yet.
- **Read first next session:** `design/SPEC.md`, then the board.
- **Env lessons** (from db-docker):
  - worktrees need the node_modules junction; remove it with `cmd /c rmdir node_modules` BEFORE `git worktree remove`, and never use `--force` while the junction exists;
  - run `rm -rf .next` before gating builds;
  - lint needs `SKIP_ENV_VALIDATION=1` in worktrees;
  - vitest flakes under load: re-run once;
  - smoke: `SMOKE_PORT=3100`.
- **Follow-ups (not MVP):**
  - the callback still hard-codes the NA Fleet base URL (B001 adds `TESLA_FLEET_BASE_URL` for the client only);
  - the front-end needs an empty/"learning" state for `accuracy: []`.
