# Resume board — front-end

- **Topic (PO, 2026-10-06):** the `/home` route becomes an overview dashboard of the MVP's key features (CLAUDE.md §9 Now/Plan/Trends/Accuracy/Health), using placeholders only.
  - Keep the existing colour theme. Use shadcn where it applies.
  - Use skill `frontend-design` in planning **and** in implementation (put `Use skill: frontend-design` in every UI brief; add `dataviz` for chart briefs).
  - Another team builds the middleware that feeds real data.
- **Status:** Decision round 1 answered (all recommended; Q3 = Nova). SPEC Rev 1 + R001 written. M1 in progress.
- **Last action:** B004 review FAIL (credit vs export, import not derived) → round 2 written into the B004 brief; tester2 spawned. B001 implementer still running.
- **Next action:**
  1. tester handoffs → spawn the implementers on the tester branches;
  2. reviewer → gate → merge `--no-ff` into `front-end-development`;
  3. after B001 + B002 merge: B003 (backlog) → doing;
  4. after B003: the M1 Review item in TODO.md.
- **Integration branch:** `front-end-development` (Q1 A; the PO merges it into main). Records are committed there.
- **Open branches / worktrees:** phase2a/ui-theme-test + phase2a/ui-theme-impl (B001), plus B004 when spawned.
- **Env lessons:** see `team/db-docker/RESUME.md` "Env lessons":
  - node_modules junctions in worktrees: never `git worktree remove --force` while one exists;
  - `SKIP_ENV_VALIDATION=1` for lint/build;
  - the PO's container holds port 3000.

  This scope **adds deps** (`radix-ui`, `recharts`): run a real `pnpm install` in the worktree, not a junction.
