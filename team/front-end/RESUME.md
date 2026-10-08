# Resume board — front-end

- **Topic 4 (PO, 2026-10-08, before the optimization round): a "Your system" section.**
  - It covers battery count, storage, panel count, panel rating and other details. Placeholders only; the middleware connects the real data.
  - Research `research/system-info/README.md`: Fleet API has battery count, model, storage, power, reserve, plan, firmware and install date. It has **no** panel count, rating or solar size (user-entered per CLAUDE.md section 6).
  - Decision round 4 ANSWERED: all A, "the outline looks good".
  - **The PO added Equipment health** (spot declining panel output and battery storage). Research: `research/system-info/HEALTH.md`.
  - **Status: Decision round 5 (Q5-Q9) in TODO.md, waiting on the PO.** M7's review item is also still open.
  - Plan once answered: one milestone M8 holds "Your system" + the equipmentHealth placeholders (front-end), plus middleware backlog briefs (site_info fields + panel env, then the health functions, the site_info log and the backfill).
  - **Next:**
    - record the answers;
    - SPEC Rev 8 + R008;
    - M8 brief B035 (front-end) + a middleware backlog brief;
    - tester -> implementer -> reviewer;
    - then the optimization round.

## Topic 3 record
- **Topic 3 (PO, 2026-10-08): Tonight card clarity.**
  - (1) "From 9:00 PM until 9:00 PM" is confusing.
  - (2) An info tooltip on the confidence/"what would change it" line that explains the confidence level and the scenarios.
  - Research: `research/tonight-clarity/README.md`. Finding: `validTo` = end of tomorrow's peak. It should be the peak *start*: the reserve must drop back to 20% so the battery covers the peak.
- **Status: M7 DONE 2026-10-08 (merge 1f92288 on `front-end-development`), waiting on the PO's review** (TODO.md "Review: M7").
  - Gate on `front-end-development`: vitest 627, scripts, tsc, lint, build; `/home` 219/321 kB.
  - Middleware records updated: SPEC L166 + a note in their RESUME.
- **Next action:**
  - fold in the PO's review notes;
  - then the **optimization round** (due now, after M7): a `cleaner` per area, a perf/size pass, and a TODO item asking the PO to run `/improve-codebase-architecture`.
  - Open nits:
    - the popover runs ~2 px past the viewport at 390;
    - `lastIndexOf` is computed twice in `dashboard.tsx`.
- **Open branches / worktrees:** none from this topic. `worktree-agent-a1fb…`, `acef…` and `a85ac…` predate it (other scopes) and are left alone.

## Topic 2 record
- **Topic 2 (PO, 2026-10-07): peak-hours usage estimate + reserve advice.**
  - A "Peak hours" tile next to "Your home now": estimated kWh in today's and tomorrow's peak window;
  - the Tonight advice sentence: "Raise your backup reserve to x%. With 20% as reserve for emergencies an additional x% will help you save $x for tomorrow's estimated x kWh usage during peak hours".
  - The front-end builds placeholders only (sample data in the snapshot contract). The middleware team computes the numbers from 2 SQL averages: (1) peak usage over all history; (2) peak usage on days with similar temperatures.
  - Research: `research/peak-estimate/README.md`.
- **Status: M6 DONE and APPROVED 2026-10-07 (b66599f). The PO merges `front-end-development` → `main`. Idle until the PO's next topic.**
- **Gate:** typecheck, lint, build green; vitest 484/484 on the committed tree (clean worktree). In the main checkout, 6 fleet-api fixture tests fail because of the PO's uncommitted `fixtures/fleet-api/*.json` edits (asked in TODO.md).
- **Middleware hand-off:** `team/middleware/plan/board/backlog/B013-peak-estimate.md` (2 SQL averages, advisor, weather gap-fill) + a pointer in their RESUME.md. Doc copy refreshed. Until it lands, real data shows "Learning your usage: 0 of 7 days" and no reserve advice.
- **Next action (on "continue"):**
  - ask the PO for the next topic. Options: learning/loading/error states, `accuracy: []` empty state, light theme, chart CSV views, nav + Plan/Trends, or architecture backlog #3;
  - the optimization round is due after M7;
  - fixtures re-recorded and committed at 856a5b7 at the PO's request. 6 fleet-api tests are red until the middleware team updates them (pointer in their RESUME.md).
- **Open branches / worktrees:** none from this topic.
- Previous topic (dashboard v1, M1–M5) is done and on main. The architecture backlog (#3 time module, #2 tariff, #4 flow state, #5) stays parked.

## Topic 1 record
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
