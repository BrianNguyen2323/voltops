# Resume board — db-docker

- **Status: Round 3 = optimization round (M4, SPEC Rev 4, R004), building.** The PO answered "optimize" on the M3 review.
- **Integration branch: `optimization-round`** (the PO created it at aadb968 = main). Members branch from it; I merge into it; the PO merges it into `main` (same pattern as `database-docker` in round 1).
- **M4 briefs:**
  - B010 image shrink to ≤ 400 MB + smoke `MAX_IMAGE_MB` + `timeout 60` on (c). Tester → implementer. Status: see board.
  - B011 gate nits (check-env no echo + argv guard, `errorCode` null, test gaps). Tester → implementer. Parallel with B010.
  - B012 cleaner over `src/` + `scripts/`. In backlog until B010 + B011 merge.
  - PO: `/improve-codebase-architecture` (TODO, non-blocking). The pick becomes Rev 5.
- **Earlier rounds:** round 1 B001–B006 (PR #7, CLOSEOUT.md). Round 2 B007–B009 (M3, merged to main 84b059c).
- **Last action:** wrote Rev 4 / R004 / M4 / B010–B012; spawning B010 + B011 testers.
- **Next action:** gate the testers → spawn the implementers on the test branches → reviewers → merge into `optimization-round` → B012 cleaner → Review item in TODO.
- **Open branches / worktrees:** see board `doing/` files (each lists its branch).
- **Env lessons:**
  - agent worktrees have no node_modules, and parallel `pnpm install`s stall. When the branch changes no deps, link main's: `cmd //c mklink //J node_modules "D:\Programming Projects\voltops\node_modules"`. Run `cmd //c rmdir node_modules` (removes only the link) BEFORE `git worktree remove`;
  - lint in a worktree without `.env` needs `SKIP_ENV_VALIDATION=1`. Never copy the PO's `.env` into a worktree;
  - the Bash tool breaks on heredocs or commands with unbalanced quotes; use Write/Edit;
  - the PO's `voltops-web-1` holds port 3000: run the smoke test with `SMOKE_PORT=3100`.
- **Housekeeping:** the PO deletes `origin/database-docker`.
