# Resume board — db-docker

- **Status: Round 3 = optimization round (M4, SPEC Rev 4, R004), building.** The PO answered "optimize" on the M3 review.
- **Integration branch: `optimization-round`** (the PO created it at aadb968 = main). Members branch from it; I merge into it; the PO merges it into `main` (same pattern as `database-docker` in round 1).
- **M4 briefs:**
  - B010 image shrink to ≤ 400 MB + smoke `MAX_IMAGE_MB` + `timeout 60` on (c). Tester → implementer. Status: see board.
  - B011 gate nits (check-env no echo + argv guard, `errorCode` null, test gaps). Tester → implementer. Parallel with B010.
  - B012 cleaner over `src/` + `scripts/`. In backlog until B010 + B011 merge.
  - PO: `/improve-codebase-architecture` (TODO, non-blocking). The pick becomes Rev 5.
- **Earlier rounds:** round 1 B001–B006 (PR #7, CLOSEOUT.md). Round 2 B007–B009 (M3, merged to main 84b059c).
- **Last action:** B011 tester 047b1ab + impl 30abf3f green; reviewer running. B010 tester 742127a committed, but Docker Desktop crashed before the size FAIL was shown. Asked the PO to restart Docker (TODO).
- **Next action:** B011: on reviewer PASS, merge `phase1/gate-nits-impl` into `optimization-round` + full gate. B010: after "docker up", run `docker compose -p voltops-smoke down -v`, confirm the size FAIL on `phase1/image-shrink-test`, spawn the implementer. Then B012 cleaner, then the Review item.
- **Open branches / worktrees:** `phase1/gate-nits-test`, `phase1/gate-nits-impl`, `phase1/image-shrink-test` (worktree `.claude/worktrees/agent-ac27fcd1579ef7f91`, still locked by the tester process; remove it later).
- **Env lessons:**
  - agent worktrees have no node_modules, and parallel `pnpm install`s stall. When the branch changes no deps, link main's: `cmd //c mklink //J node_modules "D:\Programming Projects\voltops\node_modules"`. Run `cmd //c rmdir node_modules` (removes only the link) BEFORE `git worktree remove`;
  - lint in a worktree without `.env` needs `SKIP_ENV_VALIDATION=1`. Never copy the PO's `.env` into a worktree;
  - the Bash tool breaks on heredocs or commands with unbalanced quotes; use Write/Edit;
  - the PO's `voltops-web-1` holds port 3000: run the smoke test with `SMOKE_PORT=3100`.
- **Housekeeping:** the PO deletes `origin/database-docker`.
