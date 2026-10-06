# Resume board — front-end

- **Topic (PO, 2026-10-06):** the `/home` route becomes an overview dashboard of the MVP's key features (CLAUDE.md §9 Now/Plan/Trends/Accuracy/Health), using placeholders only.
  - Keep the existing colour theme. Use shadcn where it applies.
  - Use skill `frontend-design` in planning **and** in implementation (put `Use skill: frontend-design` in every UI brief; add `dataviz` for chart briefs).
  - Another team builds the middleware that feeds real data.
- **Status: M1 DONE 2026-10-06 — waiting on the PO.** TODO.md has "Review: M1".
- **M1 results:**
  - merged into `front-end-development`: B002 474e892, B004 6971648, B001 475337a, B003 ff33d4e;
  - gate: vitest 165/165, typecheck, lint clean (raw), build OK; docker smoke PASS 303 MB at B001.
- **Last action:** B008 merged d386e12 (gate green). Perf/size recorded (`research/optimization/`: /home 217/320 kB, image 304 MB). B009 cleaner to doing; cleaner spawned.
- **Next action:**
  1. B008 tester → implementer → reviewer → merge;
  2. B009 cleaner brief (after B008 merges);
  3. perf/size numbers into `research/optimization/README.md`;
  4. a TODO item for the PO: `/improve-codebase-architecture`.
  - Still open: the Tomorrow-tile indent nit.
- **Integration branch:** `front-end-development` (Q1 A; the PO merges it into main). Records are committed there.
- **Open branches / worktrees:** none from this scope. `worktree-agent-a85ac516cb7dc60dd` predates it (db-docker) and is left to the PO. Lint: use `rtk proxy pnpm lint` (the RTK filter prints false errors). Agents stalled 3 times (watchdog): give them bounded commands, and check worktrees for leftover junctions / dev servers on 3100 before re-spawning. Reviewers can leave an agent-browser daemon holding a worktree: run `agent-browser close` before removing it.
- **Env lessons:** see `team/db-docker/RESUME.md` "Env lessons":
  - node_modules junctions in worktrees: never `git worktree remove --force` while one exists;
  - `SKIP_ENV_VALIDATION=1` for lint/build;
  - the PO's container holds port 3000.

  This scope **adds deps** (`radix-ui`, `recharts`): run a real `pnpm install` in the worktree, not a junction.
