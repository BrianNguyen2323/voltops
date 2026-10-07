# Resume board — front-end

- **Topic (PO, 2026-10-06):** the `/home` route becomes an overview dashboard of the MVP's key features (CLAUDE.md §9 Now/Plan/Trends/Accuracy/Health), using placeholders only.
  - Keep the existing colour theme. Use shadcn where it applies.
  - Use skill `frontend-design` in planning **and** in implementation (put `Use skill: frontend-design` in every UI brief; add `dataviz` for chart briefs).
  - Another team builds the middleware that feeds real data.
- **Status: M4 DONE 2026-10-06 (d27022d) — waiting on the PO.** TODO.md "Review: M4" asks for:
  1. `/improve-codebase-architecture` (the pick → SPEC Rev 5);
  2. a chart-size option A/B/C (`research/optimization/README.md`);
  3. the PO's merge of `front-end-development` into `main`.
- **Milestones** (all on `front-end-development`; SPEC is at Rev 4):
  - M1 ff33d4e: dashboard v1 on sample data (B001 theme/shadcn/font, B002 data contract, B004 sample consistency, B003 UI);
  - M2 b891873: the PO's M1 changes (B005): cross flow diagram, Tomorrow weather tile, readable chart, credit wording. Rev 2 / R002;
  - M3 6442b61: the PO's M2 changes (B006, B007): mobile kW size, Grid price now + Your home now (`costNow`), tooltip swatches, cost-line labels. Rev 3 / R003;
  - M4 d27022d: the PO's M3 asks (B008): pink Spending label, `predev`; plus optimization round 1 (B009 cleaner, perf/size). Rev 4 / R004.
- **Gate on `front-end-development`:** vitest 195/195, test:scripts 58/58, typecheck, lint clean, build OK; `/home` 217 kB route / 320 kB First Load; docker image 304 MB.
- **Last action:** the PO picked architecture candidate 1; priority backlog for 2–5 in MILESTONES; Decision round 2 (Q1–Q7) asked in chat + TODO. **The PO merges to main only after this architecture work.**
- **Next action:**
  - record the PO's `/improve-codebase-architecture` pick and chart option → SPEC Rev 5 → briefs;
  - the next optimization round is due after M7;
  - open nits: the B009 gate log (done/) and the Tomorrow-tile indent.
- **Integration branch:** `front-end-development` (Q1 A; the PO merges it into main). Records are committed there.
- **Open branches / worktrees:** none from this scope. `worktree-agent-a85ac516cb7dc60dd` predates it (db-docker) and is left to the PO. Lint: use `rtk proxy pnpm lint` (the RTK filter prints false errors). Agents stalled 3 times (watchdog): give them bounded commands, and check worktrees for leftover junctions / dev servers on 3100 before re-spawning. Reviewers can leave an agent-browser daemon holding a worktree: run `agent-browser close` before removing it.
- **Env lessons:** see `team/db-docker/RESUME.md` "Env lessons":
  - node_modules junctions in worktrees: never `git worktree remove --force` while one exists;
  - `SKIP_ENV_VALIDATION=1` for lint/build;
  - the PO's container holds port 3000.

  This scope **adds deps** (`radix-ui`, `recharts`): run a real `pnpm install` in the worktree, not a junction.
