# PO to-do — front-end

## Decision round 1 — ANSWERED 2026-10-06 (see design/revisions/R001.md) (home dashboard). Research: `research/home-dashboard/README.md`

The research README has the full design plan: colour, type, an ASCII wireframe of `/home`, and what I changed in the self-review. Short version: the **live power-flow diagram is the hero**, next to a **"Tonight" advice panel**. Below them sit a 48 h today→tomorrow forecast chart, then one strip with *Today so far · Cost today · Last 7 days · Forecast accuracy*, then one quiet system-status line. Everything shows sample data, and a visible "Sample data" badge marks it.

Answer in chat or here, e.g. "all recommended" or "Q3 B, rest recommended".

**Q1. Where do this scope's merges go?** The current branch is `front-end-development` (= main at 4842492). Today's records are committed there.
- **A (recommended, same as db-docker):** `front-end-development` is the integration branch. I merge briefs there, and you merge it into `main` after your review.
- B: I merge straight into `main`.
- Answer: **A** (PO, 2026-10-06).

**Q2. Theme token names.** shadcn components expect `card`, `muted-foreground`, `primary-foreground`... Today `muted` is a text colour, but in shadcn `muted` is a background.
- **A (recommended):** keep every hex value and rename to shadcn's names:
  - `surface` → `card`;
  - `muted` → `muted-foreground`;
  - add `primary-foreground`, `ring`, `input` and `--chart-1..5`;
  - update the 2 existing class names in `login/auth-form.tsx` and `(protected)/layout.tsx`. The login page looks identical afterwards.
- B: keep the custom names and add shadcn names as aliases (two names for one colour).
- Answer: **A** (PO, 2026-10-06).

**Q3. shadcn style** (`components.json` says `radix-maia` today).
- A: Maia. Fully rounded and roomy, made for consumer apps. A dashboard this dense gets long on a phone.
- **B (recommended): Nova.** Tighter padding, made for compact dashboards. It fits 8 sections without endless scrolling and still looks friendly.
- C: Vega, the classic shadcn look. D: Lyra, zero radius and boxy.
- Answer: **B (Nova)** (PO, 2026-10-06).

**Q4. Typeface.** `layout.tsx` loads both Geist and Figtree today, and they overwrite each other.
- **A (recommended): Archivo variable, one family.**
  - Live readings use the wide, heavy cut with tabular numbers: they read like a utility meter.
  - Body text uses the normal width.
  - Geist and Figtree are dropped.
- B: Geist only (drop Figtree). Safe, but it's the default T3 look.
- C: name another font.
- Answer: **A (Archivo)** (PO, 2026-10-06).

**Q5. What the placeholders look like.**
- **A (recommended): realistic sample data in the real components.**
  - Real charts and the flow diagram, fed by one typed sample-data file in canonical units (W/Wh, CLAUDE.md §5);
  - a "Sample data" badge on the page;
  - the middleware team later swaps that one file for real queries.
- B: grey skeleton boxes with section titles only. Faster, but you can't judge the design.
- Answer: **A** (PO, 2026-10-06).

**Q6. Charts.**
- **A (recommended):** the shadcn chart component (adds `recharts`; themed tooltips/legend). The flow diagram is hand-made SVG in both options.
- B: hand-made SVG charts too. No new dependency, but more code to maintain once real data arrives.
- Answer: **A** (PO, 2026-10-06).

**Q7. Links to the other screens** (Plan, Trends, Accuracy, Settings, Health don't exist yet).
- **A (recommended):** no navigation yet. The header shows app name, site name, "updated …" and Log out. We add nav when the second screen exists.
- B: a nav bar now, with not-yet-built screens shown as disabled.
- Answer: **A** (PO, 2026-10-06).

**Q8. Which page states to build now.**
- **A (recommended):**
  - the full dashboard (sample data);
  - the **not connected** state: a slim "Connect Tesla" banner above the dashboard (replaces today's lone button; same `/api/auth/tesla` link).
  - "Learning" (< 7 days), loading and error states come with the middleware, when there is real data to be missing.
- B: design all states now, previewable via `/home?state=learning|empty|error`.
- Answer: **A** (PO, 2026-10-06).

**Q9. Defer two CLAUDE.md §9 UI rules to later rounds?**
- **Recommended: yes, defer both:**
  - the light theme (the app is dark-only today);
  - "every chart has a table/CSV view" (better built on the Plan/Trends screens that own the data).
- Mobile layout, keyboard focus, reduced motion and kW/kWh labelling are **in** scope.
- Answer: **Yes, defer both** (PO, 2026-10-06).

**Q10. Two new energy colours** (the existing ones keep their hex).
- **Recommended:**
  - solar = amber **#ffb547**;
  - grid export = periwinkle **#8b93ff**;
  - battery = your mint #00ffb2, grid import/cost = your pink #ff0066, home = white #f5f5f5;
  - all are ≥ 3:1 contrast on the card colour.
- Or name your own.
- Answer: **Recommended** (PO, 2026-10-06).

**Q11. The contract with the middleware team.**
- **A (recommended):** this team defines the `DashboardData` TypeScript type in W/Wh, with CLAUDE.md §5 signs, next to the page. The middleware team fills it.
- B: the middleware team owns the type, and we wait for theirs. That blocks this scope.
- Answer: **A** (PO, 2026-10-06).

## USER INPUT REQUIRED — Review: M1 home dashboard on sample data (2026-10-06)
Everything is merged into `front-end-development` at ff33d4e. The gate is green: 165 tests, typecheck, lint and build. The Docker smoke test passed at B001 (303 MB). Nothing is merged into `main` yet; you merge `front-end-development` into `main` after this review.

**How to run it**
- `pnpm install` (adds `radix-ui`, `recharts` and `tw-animate-css`; already done in your checkout), then `pnpm dev`, then open http://localhost:3000/home and log in.
- Or Docker: `docker compose up --build`.
- To check phone width, use browser devtools at 390 px.
- The reviewer's screenshots are in `data/shots/review-390.png` and `data/shots/review-1440.png` (gitignored). They show the red "auth disabled" banner only because the reviewer ran with `AUTH_DISABLED=true`.

**What to look at**
1. **Hero ("Right now").** The live power-flow diagram: Solar, Home, Powerwall and Grid, with animated flow lines. The builder chose a **hub layout** (all lines meet in the middle) instead of the corner layout in the plan. The reviewer's main visual nit: the Powerwall charge ring sits far from its label on desktop, and the lines stop short of the readings.
2. **"Tonight"** card: the advice, why, savings and confidence.
3. **The 48 h chart:**
   - amber solar against white home use, peak hours shaded, a "Now" line;
   - cloudy tomorrow is visible as lower solar.
4. **The strip:** Today so far, Cost today, Last 7 days and Forecast accuracy.
   - Net cost shows "-$0.79", meaning you earned 79¢. Do you want it to read "$0.79 credit" instead?
5. **Not connected banner** ("Connect Tesla"): it shows when no Tesla account is linked.
6. **The theme:**
   - Archivo font, Nova style, energy colours (solar amber, battery mint, grid import pink, export periwinkle);
   - the login page should look the same as before.
   - R001 note: your pink `#ff0066` became shadcn's `destructive` (alerts and money leaving) instead of `accent`, because shadcn uses `accent` as the subtle hover colour.

**Sample data.** One simulated summer day at 5:00 PM: the battery is full and idle, and solar is exporting.
- Not visible on `/home`, but it matters for the future Plan screen: in the simulation the battery is at 62% at 9 PM, under the 65% reserve the advice recommends, and cloudy tomorrow still refills it. The advice numbers and the forecast need aligning when Plan is built.

**Known nits (non-blocking):**
- no "kWh" title on the chart's y-axis (the legend has it);
- the first Tab stop lands on the chart with no visible focus ring.

**Your call — reply with any of:**
- **a.** "approved": you merge `front-end-development` into `main`.
- **b.** a list of changes. I'll make them round 2 (SPEC Rev 2) and fix them before or after your merge.
- **c.** the next topic, e.g. the learning/loading/error states, the light theme, the chart table/CSV views, navigation plus the Plan/Trends screens, or a hand-off doc for the middleware team on `DashboardData`.
- Answer:
