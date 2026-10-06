# Resume board — front-end

- **Topic (PO, 2026-10-06):** the `/home` route becomes an overview dashboard of the MVP's key features (CLAUDE.md §9 Now/Plan/Trends/Accuracy/Health), using placeholders only.
  - Keep the existing colour theme. Use shadcn where it applies.
  - Use skill `frontend-design` in planning **and** in implementation (put `Use skill: frontend-design` in every UI brief; add `dataviz` for chart briefs).
  - Another team builds the middleware that feeds real data.
- **Status: PAUSED by the PO (2026-10-06).** Resume on "continue".
- **M1 progress:**
  - B001, B002 and B004 are done and merged into `front-end-development` (475337a; gate green, docker smoke PASS 303 MB);
  - B003 (dashboard UI) is in **gate**: impl cea2eb6 on `phase2a/ui-home-impl` (tests f176485), green per the implementer.
- **Last action:** a B003 reviewer was spawned before the pause. Its job: full gate, then full-page screenshots at 390/1440 with agent-browser, the scroll-width check and the design rules. The lead can't stop a running agent; its handoff may arrive while paused.
- **Next action on "continue":**
  1. If the B003 reviewer's verdict arrived, record it in `plan/board/gate/B003-home-dashboard-ui.md`. If not, check the worktree `.claude/worktrees/agent-ab69824e2037de5aa` first:
     - a leftover `node_modules` junction → `cmd //c rmdir node_modules`;
     - a dev server on port 3100 → stop it.

     Then re-spawn the reviewer with the same instructions (brief + SPEC "Page: /home"/"Design rules"/"Type"; skills frontend-design + agent-browser; port 3100; screenshots in `data/shots/review-*.png`).
  2. PASS → `git merge --no-ff phase2a/ui-home-impl` into `front-end-development` → gate (`rm -rf .next && pnpm test && pnpm typecheck && SKIP_ENV_VALIDATION=1 rtk proxy pnpm lint && SKIP_ENV_VALIDATION=1 pnpm build`) → B003 to done → clean up the worktrees/branches (`agent-ab69824e2037de5aa`, `agent-ac1210e4dd55c565a`, `phase2a/ui-home-*`, `worktree-agent-a*`).
  3. Add the **Review: M1** item to TODO.md:
     - how to run: `pnpm dev`, open `/home`, check at phone width;
     - what to look at: the hero flow diagram (hub layout deviates from the plan), Tonight card, chart colours, the not-connected banner;
     - the R001 note on pink → `destructive`;
     - the B004 nits for the future Plan screen.
  4. FAIL → write a fix round into the B003 brief (as done for B004).
- **Integration branch:** `front-end-development` (Q1 A; the PO merges it into main). Records are committed there.
- **Open branches / worktrees:** `phase2a/ui-home-test` (agent-ac1210e4dd55c565a) and `phase2a/ui-home-impl` (agent-ab69824e2037de5aa). Lint: use `rtk proxy pnpm lint` (the RTK filter prints false errors).
- **Env lessons:** see `team/db-docker/RESUME.md` "Env lessons":
  - node_modules junctions in worktrees: never `git worktree remove --force` while one exists;
  - `SKIP_ENV_VALIDATION=1` for lint/build;
  - the PO's container holds port 3000.

  This scope **adds deps** (`radix-ui`, `recharts`): run a real `pnpm install` in the worktree, not a junction.
