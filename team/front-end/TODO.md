# PO to-do — front-end

## USER INPUT REQUIRED — Decision round 1 (home dashboard). Research: `research/home-dashboard/README.md`

The research README has the full design plan: colour, type, an ASCII wireframe of `/home`, and what I changed in the self-review. Short version: the **live power-flow diagram is the hero**, next to a **"Tonight" advice panel**. Below them sit a 48 h today→tomorrow forecast chart, then one strip with *Today so far · Cost today · Last 7 days · Forecast accuracy*, then one quiet system-status line. Everything shows sample data, and a visible "Sample data" badge marks it.

Answer in chat or here, e.g. "all recommended" or "Q3 B, rest recommended".

**Q1. Where do this scope's merges go?** The current branch is `front-end-development` (= main at 4842492). Today's records are committed there.
- **A (recommended, same as db-docker):** `front-end-development` is the integration branch. I merge briefs there, and you merge it into `main` after your review.
- B: I merge straight into `main`.
- Answer:

**Q2. Theme token names.** shadcn components expect `card`, `muted-foreground`, `primary-foreground`... Today `muted` is a text colour, but in shadcn `muted` is a background.
- **A (recommended):** keep every hex value and rename to shadcn's names:
  - `surface` → `card`;
  - `muted` → `muted-foreground`;
  - add `primary-foreground`, `ring`, `input` and `--chart-1..5`;
  - update the 2 existing class names in `login/auth-form.tsx` and `(protected)/layout.tsx`. The login page looks identical afterwards.
- B: keep the custom names and add shadcn names as aliases (two names for one colour).
- Answer:

**Q3. shadcn style** (`components.json` says `radix-maia` today).
- A: Maia. Fully rounded and roomy, made for consumer apps. A dashboard this dense gets long on a phone.
- **B (recommended): Nova.** Tighter padding, made for compact dashboards. It fits 8 sections without endless scrolling and still looks friendly.
- C: Vega, the classic shadcn look. D: Lyra, zero radius and boxy.
- Answer:

**Q4. Typeface.** `layout.tsx` loads both Geist and Figtree today, and they overwrite each other.
- **A (recommended): Archivo variable, one family.**
  - Live readings use the wide, heavy cut with tabular numbers: they read like a utility meter.
  - Body text uses the normal width.
  - Geist and Figtree are dropped.
- B: Geist only (drop Figtree). Safe, but it's the default T3 look.
- C: name another font.
- Answer:

**Q5. What the placeholders look like.**
- **A (recommended): realistic sample data in the real components.**
  - Real charts and the flow diagram, fed by one typed sample-data file in canonical units (W/Wh, CLAUDE.md §5);
  - a "Sample data" badge on the page;
  - the middleware team later swaps that one file for real queries.
- B: grey skeleton boxes with section titles only. Faster, but you can't judge the design.
- Answer:

**Q6. Charts.**
- **A (recommended):** the shadcn chart component (adds `recharts`; themed tooltips/legend). The flow diagram is hand-made SVG in both options.
- B: hand-made SVG charts too. No new dependency, but more code to maintain once real data arrives.
- Answer:

**Q7. Links to the other screens** (Plan, Trends, Accuracy, Settings, Health don't exist yet).
- **A (recommended):** no navigation yet. The header shows app name, site name, "updated …" and Log out. We add nav when the second screen exists.
- B: a nav bar now, with not-yet-built screens shown as disabled.
- Answer:

**Q8. Which page states to build now.**
- **A (recommended):**
  - the full dashboard (sample data);
  - the **not connected** state: a slim "Connect Tesla" banner above the dashboard (replaces today's lone button; same `/api/auth/tesla` link).
  - "Learning" (< 7 days), loading and error states come with the middleware, when there is real data to be missing.
- B: design all states now, previewable via `/home?state=learning|empty|error`.
- Answer:

**Q9. Defer two CLAUDE.md §9 UI rules to later rounds?**
- **Recommended: yes, defer both:**
  - the light theme (the app is dark-only today);
  - "every chart has a table/CSV view" (better built on the Plan/Trends screens that own the data).
- Mobile layout, keyboard focus, reduced motion and kW/kWh labelling are **in** scope.
- Answer:

**Q10. Two new energy colours** (the existing ones keep their hex).
- **Recommended:**
  - solar = amber **#ffb547**;
  - grid export = periwinkle **#8b93ff**;
  - battery = your mint #00ffb2, grid import/cost = your pink #ff0066, home = white #f5f5f5;
  - all are ≥ 3:1 contrast on the card colour.
- Or name your own.
- Answer:

**Q11. The contract with the middleware team.**
- **A (recommended):** this team defines the `DashboardData` TypeScript type in W/Wh, with CLAUDE.md §5 signs, next to the page. The middleware team fills it.
- B: the middleware team owns the type, and we wait for theirs. That blocks this scope.
- Answer:
