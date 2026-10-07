# Resume board — front-end

- **Topic (PO, 2026-10-06):** the `/home` route becomes an overview dashboard of the MVP's key features (CLAUDE.md §9 Now/Plan/Trends/Accuracy/Health), using placeholders only.
  - Keep the existing colour theme. Use shadcn where it applies.
  - Use skill `frontend-design` in planning **and** in implementation (put `Use skill: frontend-design` in every UI brief; add `dataviz` for chart briefs).
  - Another team builds the middleware that feeds real data.
- **Status: M5 DONE 2026-10-06 (10f2f7f) — waiting on the PO.** TODO.md "Review: M5". The PO said they'd merge `front-end-development` → `main` after this architecture work.
- **Milestones** (all on `front-end-development`; SPEC is at Rev 5):
  - M1 ff33d4e: dashboard v1 on sample data (B001 theme/shadcn/font, B002 data contract, B004 sample consistency, B003 UI);
  - M2 b891873: the PO's M1 changes (B005): cross flow diagram, Tomorrow weather tile, readable chart, credit wording. Rev 2 / R002;
  - M3 6442b61: the PO's M2 changes (B006, B007): mobile kW size, Grid price now + Your home now (`costNow`), tooltip swatches, cost-line labels. Rev 3 / R003;
  - M5 10f2f7f: architecture candidate 1 (B010, B011): `src/lib/dashboard.ts` (`DashboardSnapshot`, `checkSnapshot`, `toDashboardView`), UI reads the view, page logs check problems, `docs/dashboard-snapshot.md`, `GLOSSARY.md`, `team/middleware/` created. Rev 5 / R005.
  - M4 d27022d: the PO's M3 asks (B008): pink Spending label, `predev`; plus optimization round 1 (B009 cleaner, perf/size). Rev 4 / R004.
- **Gate on `front-end-development`:** vitest 243/243, test:scripts 58/58, typecheck, lint clean, build OK; `/home` 217 kB route / 320 kB First Load; docker image 304 MB (M4).
- **Last action:** the PO approved M5 and is merging to main; the architecture backlog is parked until the PO prompts again.
- **Next action (on "continue"):**
  1. read TODO.md and MILESTONES.md "Architecture backlog";
  2. candidate #3 (site-local time module: `clock`, `hourLabel`, `localHour`, the week-label UTC trick, the private `localDate` in `src/lib/dashboard.ts`, plus DST tests): a research/decision round only if the PO needs to choose something, otherwise SPEC Rev 6 + a brief;
  3. then #2 (tariff, blocked on middleware's `tariffSchedule.content` shape), #4 (flow state), #5 (finish with real data).
  - Next optimization round after M7.
  - Open nits:
    - the Tomorrow-tile indent;
    - NaN on actual hours passes the balance check;
    - B009 unused exports/tokens;
    - the doc doesn't mention the `selfPoweredPct` clamp.
- **Integration branch:** `front-end-development` (Q1 A; the PO merges it into main). Records are committed there.
- **Open branches / worktrees:** none from this scope. `worktree-agent-a85ac516cb7dc60dd` predates it (db-docker) and is left to the PO. Lint: use `rtk proxy pnpm lint` (the RTK filter prints false errors). Agents stalled 3 times (watchdog): give them bounded commands, and check worktrees for leftover junctions / dev servers on 3100 before re-spawning. Reviewers can leave an agent-browser daemon holding a worktree: run `agent-browser close` before removing it.
- **Env lessons:** see `team/db-docker/RESUME.md` "Env lessons":
  - node_modules junctions in worktrees: never `git worktree remove --force` while one exists;
  - `SKIP_ENV_VALIDATION=1` for lint/build;
  - the PO's container holds port 3000.

  This scope **adds deps** (`radix-ui`, `recharts`): run a real `pnpm install` in the worktree, not a junction.
