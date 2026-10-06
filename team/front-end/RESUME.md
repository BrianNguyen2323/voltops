# Resume board — front-end

- **Topic (PO, 2026-10-06):** the `/home` route becomes an overview dashboard of the MVP's key features (CLAUDE.md §9 Now/Plan/Trends/Accuracy/Health), using placeholders only.
  - Keep the existing colour theme. Use shadcn where it applies.
  - Use skill `frontend-design` in planning **and** in implementation (put `Use skill: frontend-design` in every UI brief; add `dataviz` for chart briefs).
  - Another team builds the middleware that feeds real data.
- **Status:** research round 1 done → **Decision round 1 waiting on the PO** (TODO.md, Q1–Q11).
- **Last action:** wrote `research/home-dashboard/README.md` (design plan + self-review), then the decision round.
- **Next action:**
  1. record the answers in TODO.md;
  2. write SPEC Rev 1 + R001;
  3. write MILESTONES and briefs. Draft split:
     - B001 theme/tokens + shadcn init + font (tester: render test of the login page unchanged);
     - B002 `DashboardData` type + sample data + unit formatter (pure; tester: invariants and formatting);
     - B003 dashboard components + page (tester: `renderToStaticMarkup` sections/units/sample badge/not-connected banner).
     - B001 and B002 can run in parallel; B003 builds on both;
  4. reviewer screenshots at 390 px and 1440 px with `agent-browser`.
- **Integration branch:** `front-end-development` (pending Q1). Records are committed there.
- **Open branches / worktrees:** none.
- **Env lessons:** see `team/db-docker/RESUME.md` "Env lessons":
  - node_modules junctions in worktrees: never `git worktree remove --force` while one exists;
  - `SKIP_ENV_VALIDATION=1` for lint/build;
  - the PO's container holds port 3000.

  This scope **adds deps** (`radix-ui`, `recharts`): run a real `pnpm install` in the worktree, not a junction.
