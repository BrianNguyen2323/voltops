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

## Review: M1 home dashboard on sample data — ANSWERED 2026-10-06 (b; see design/revisions/R002.md)
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
- Answer: **b**, with these changes (PO, 2026-10-06):
  1. **Right now:** the flow lines look odd at different angles. Organize the diagram's structure. Also fix the Powerwall ring (agreed nit).
  2. **Tonight:** looks good. Add a "tomorrow's expected forecast" tile inside the card, using sample weather data (the middleware team will connect a weather API later). It must stay within the theme and be visually appealing.
  3. **48 h chart:**
     - "p10 to p90" is confusing; it must be readable by anyone seeing the chart for the first time;
     - "Home use range" and "Home use" colours are too similar to tell apart.
  4. **Net cost:** the "credit earned" wording is better.


## Review: M2 (your M1 changes) — ANSWERED 2026-10-06 (b; see design/revisions/R003.md)
Merged into `front-end-development` at b891873. Gate: 180 tests, typecheck, lint and build all green. No new dependencies.

**How to run it** (corrected 2026-10-06 after the PO hit `no such table`):
- **Docker (your real instance: your admin password + Tesla link live in its volume):** `docker compose up --build`, then open `/home`. The rebuild takes a few minutes.
- **Local dev (hot reload, its own empty DB at `./data/voltops.db`):** run `pnpm db:migrate` once, then `pnpm dev`. The first visit asks you to create an admin password (`/setup`). The "Connect Tesla" banner shows because this DB has no Tesla link; the dashboard shows sample data either way.
- Check phone width at 390 px in devtools. The reviewer's screenshots are in `data/shots/review-m2-390.png` and `data/shots/review-m2-1440.png`.

**What changed (your four asks)**
1. **Right now:**
   - the diagram is now a straight cross: Solar top, Grid left, Home right, Powerwall bottom;
   - four equal horizontal/vertical lines meet at a centre point and touch each node;
   - the Powerwall node is its charge ring, with the % inside.
2. **Tonight:**
   - a "Tomorrow" weather tile sits inside the card: an amber cloud icon, "Cloudy, 75°F high, 61°F low", "80% cloud cover, 20% chance of rain", and "Expect 25.4 kWh of solar, 45% less sun than today";
   - the solar figure comes from the chart's own forecast, so the two always agree;
   - the weather is sample data for now. The middleware team fills `weatherTomorrow` (temperatures in °C) from a weather API later.
3. **48 h chart:**
   - no "p10/p90" anywhere;
   - home use is a white line (dashed after "Now"), and the forecast range is a striped band called "Expected range for home use";
   - a plain legend and a one-line caption sit under the chart, and the y-axis says kWh;
   - the tooltip reads, e.g., "Expected range 0.9 to 1.3 kWh".
4. **Cost today:** shows "$0.79 Credit earned so far today", with no minus sign.

**Decisions I made inside your direction** (`design/revisions/R002.md`; override any):
- the cross layout mirrors Tesla's own app;
- temperatures are stored in °C, and the display unit is a per-site setting (the sample uses °F);
- the band is told apart by its stripes rather than a new colour, so each energy type keeps one colour.

**Small leftover nits** (say if you want them fixed now):
- on a phone, the "100%" inside the ring is small and nearly touches it;
- the Powerwall ring and the state words sit tight to their box edges;
- the last two lines of the Tomorrow tile aren't indented like the first two.

**Dev-setup gap (not front-end code):** `pnpm dev` doesn't run migrations and the README doesn't say to. Option: add `"predev": "node scripts/migrate.mjs"` to `package.json` so `pnpm dev` always migrates first (that's the db-docker scope's file). Say "add predev" if you want it.

**Your call:**
- **a.** "approved": you merge `front-end-development` into `main`;
- **b.** more changes (e.g. the nits above);
- **c.** the next topic. Options:
  - the learning/loading/error states;
  - the light theme;
  - the chart table/CSV views;
  - navigation plus the Plan/Trends screens;
  - a hand-off doc for the middleware team describing `DashboardData` and `weatherTomorrow`.

  Note: an **optimization round** (cleaner pass + perf/size + `/improve-codebase-architecture`) is due after the next milestone (M3).
- Answer: **b** (PO, 2026-10-06):
  1. **Mobile, Right now:** the 100% in the ring looks fine. Scale down the kW text on mobile in **all** node tiles so they match and the content fits the tiles better.
  2. **The "Peak" badge under Right now is confusing.**
     - Label it so an outside viewer knows it's the current grid rate, and say clearly that $0.48/kWh until 9:00 PM is the grid's price, not a total.
     - Also show the home's current cost: e.g. the 2.1 kW the home is using, which it is currently saving on or spending on, depending on whether it draws from the grid.
  3. **Chart tooltip:** the "Expected range" marker should match the legend's marker.
  - Asked: is Tailwind used? (Answered in chat: yes, Tailwind v4 throughout.)
  - Not picked: "add predev" (still open), the Tomorrow-tile indent nit.


## Review: M3 (your M2 changes) — ANSWERED 2026-10-06 (a; see design/revisions/R004.md)
Merged into `front-end-development` at 6442b61. Gate: 195 tests, typecheck, lint and build all green. No new dependencies.

**How to run it:**
- Docker: `docker compose up --build` (your real instance).
- Or local: `pnpm db:migrate` once, then `pnpm dev`.
- Open `/home` and check phone width at 390 px. Screenshots: `data/shots/review-m3-*.png` and `data/shots/review-b007-*.png`.

**What changed**
1. **Mobile tiles:** all four kW readings are the same, one step smaller on phones. Every tile has padding around its ring, name, kW and state. The cross arms are still equal.
2. **Under "Right now"** (replaces the bare "Peak" badge):
   - **Grid price now:** "$0.48/kWh, Peak rate until 9:00 PM", i.e. the grid's price per kWh, not a total.
   - **Your home now:** one labelled line per thing happening, each with a plain sentence. Sample:
     - "Saving $0.99/hour": solar and battery cover 2.1 kW of home use, so you're not buying it at $0.48/kWh;
     - "Earning $0.13/hour": selling 1.6 kW to the grid at $0.08/kWh;
     - when the home buys from the grid, a "Spending $X/hour" line appears with a pink amount.
   - Decision (R003): "saving" = home use not drawn from the grid, priced at the current grid rate. Export earnings are separate, so nothing is double-counted. Saving can't go negative.
3. **Chart tooltip:** it uses the exact same markers as the legend (line, stripes, amber square).

**Still open** (say if you want any):
- "add predev": `pnpm dev` would set up the database automatically;
- the Tomorrow-tile indent nit;
- making the "Spending" label word pink too (today only its amount is pink).

**Your call:**
- **a.** "approved": you merge `front-end-development` into `main`. I then run the **optimization round**, which is due now that 3 milestones are done:
  - a cleaner pass over the front-end code, plus a perf/size check (bundle size, Docker image);
  - and you run `/improve-codebase-architecture` in this session. Its pick becomes the next design revision.
- **b.** more changes. The optimization round waits until they land.
- **c.** the next topic. Options:
  - learning/loading/error states;
  - the light theme;
  - chart table/CSV views;
  - nav + the Plan/Trends screens;
  - a middleware hand-off doc for `DashboardData`/`weatherTomorrow`.
- Answer: **a, approved** (PO, 2026-10-06). The PO merges `front-end-development` into `main`. Also requested: **add predev** and make the **"Spending" label pink**. → M4 = these two + the optimization round.


## Review: M4 (your M3 asks + optimization round 1) — ANSWERED 2026-10-06
Merged into `front-end-development` at d27022d. Gate: 195 app tests + 58 script tests, typecheck, lint and build all green. Nothing is in `main` yet; you merge it.

**Done**
- **"Spending" is pink:** the label word too, not just the amount. "Saving" and "Earning" stay grey.
- **`pnpm dev` sets up the database first** (`predev`). It reads the same `.env`/`.env.local` as the app. It's safe to run again, and it never touches anything else.
- **Cleaner pass:**
  - consistent formatting over the dashboard code, and the garbled test line fixed;
  - the unused shadcn `separator` component removed (SPEC updated);
  - no behaviour change (the reviewer diffed every file against pure formatter output).
- **Sizes** (`research/optimization/README.md`):
  - Docker image 304 MB (400 MB cap);
  - `/home` loads 320 kB of JavaScript, against 103 kB for login. About 217 kB of that is the chart library (Recharts).

**Your three steps**
1. **Run `/improve-codebase-architecture` in this session.** Tell me which suggestion you pick; it becomes SPEC Rev 5.

   Small things the reviewers noticed, which it may also surface:
   - a few needless `export`s;
   - unused colour tokens;
   - the hour/time formatters could share one helper.
2. **Chart size: pick one.**
   - **A.** Keep as is (recommended for now). Plan/Trends will reuse the same chart code anyway.
   - **B.** Load the charts after the rest of the page. A few lines; first paint gets lighter; the charts appear a moment later.
   - **C.** Hand-draw the charts and drop Recharts. Smallest page, but more code to maintain.
3. **Merge** `front-end-development` into `main` when you're happy.

- Still open from before: the Tomorrow-tile indent nit.
- Answer: (PO, 2026-10-06):
  1. **Run `/improve-codebase-architecture`**: running now. The pick → SPEC Rev 5.
  2. **Chart size: A** (keep as is).
  3. The PO merges into `main` **after** the architecture run.


## Pick an architecture candidate — ANSWERED 2026-10-06
The report is at `C:\Users\nguye\AppData\Local\Temp\architecture-review-20261006-165151.html`, with full findings in `research/architecture/README.md`.
1. **Deepen the `DashboardData` seam** (Strong, recommended): one module owns "today vs tomorrow" and every derived total; an invariant suite becomes the middleware team's acceptance test.
2. **Gather the tariff knowledge into one module** and deepen `costNow` (Strong, but wait for the real tariff shape).
3. **One site-local time module** with DST tests (Worth exploring, cheap).
4. **One "what is this flow doing" module** (Worth exploring).
5. **Name the sample sim as an adapter** (Speculative; do nothing now).

Which would you like to explore? (We then walk through it together and it becomes SPEC Rev 5.)
- Answer: **1** (PO, 2026-10-06): do the suggested fix, and keep a priority list for the others (see `plan/MILESTONES.md` "Architecture backlog").

## Decision round 2: candidate 1, deepen the `DashboardData` seam — ANSWERED 2026-10-06
The questions are in chat; summary here. Answer e.g. "all recommended".
- **Q1. Day rule:** derive today/tomorrow by grouping `timeline` rows by **site-local date** from `hour` + `site.timezone` (rec). Or document the "row 24" index rule, or add a `day` field.
- **Q2. Per-hour energy breakdown:** add `gridImportWh`, `gridExportWh`, `batteryChargeWh` and `batteryDischargeWh` to **actual** timeline rows, so today's totals are derived (rec). Or keep the grid/battery totals as inputs.
- **Q3. Cost today:** stays an **input** this round, cross-checked against the derived grid import (rec). Deriving it needs the tariff module (candidate 2).
- **Q4. Last 7 days:** the input is the **6 previous days**; today's bar is derived (rec).
- **Q5. `live`:** documented as the instantaneous reading at `updatedAt` (rec).
- **Q6. Invariant suite:** an exported pure check that returns a list of problems, used by our tests and handed to the middleware team for theirs (rec). Or a test-only helper.
- **Q7. Where it lives:** one pure module, `src/lib/dashboard.ts` (input type, check, derive), with the sample staying in `home/data.ts` as the sample adapter (rec).
- Answer: **Q1–Q7 all A (recommended)** (PO, 2026-10-06).

## Decision round 3: candidate 1 follow-ups — ANSWERED 2026-10-06
The questions are in chat; summary here.
- **Q8. Timeline coverage:** the timeline must cover the **whole** site-local today and tomorrow (46–50 hourly rows on DST days); the check flags gaps (rec). Or allow partial days and compare "so far".
- **Q9. Names:**
  - the adapter-supplied input is a **"Dashboard snapshot"** (type `DashboardSnapshot`);
  - the derived screen data is the **"Dashboard view"** (`DashboardView`);
  - the functions are `checkSnapshot(snapshot) → string[]` and `toDashboardView(snapshot) → DashboardView`;
  - the terms go into a new `GLOSSARY.md` (rec).
- **Q10. When the check finds problems on a real snapshot:** the page logs each one server-side and still renders (rec). Or show them in the status-line warnings, or refuse to render.
- **Q11. Tests that survive:**
  - `data.test.ts`'s sim re-derivation tests (about 80 lines that restate the simulation) are replaced by `checkSnapshot(sample)` returning `[]`, plus a few pinned sample facts;
  - new derive tests cover a DST day and a timeline that doesn't start at midnight;
  - the dashboard markup tests stay (rec).
- **Q12. Middleware hand-off:** full TSDoc on `DashboardSnapshot` (units, signs, the day rule, the live instant) plus a short `docs/dashboard-snapshot.md` for the other team (rec). Or TSDoc only.
- Answer: (PO, 2026-10-06):
  - **Q8:** A. **Plus a new requirement:** keep a running record for many years for each Site (the PO said "account"; the glossary term is **Site**) of observed weather and kWh generated, for a future panel/battery degradation feature. This is a storage requirement, so it was handed to the new **middleware** team (`team/middleware/RESUME.md`). It conflicts with the CLAUDE.md §6 90-day raw retention combined with ADR 0001 (no hourly rollup), and that team must resolve it.
  - **Q9:** yes. `GLOSSARY.md` was created at the repo root.
  - **Q10:** A.
  - **Q11:** yes.
  - **Q12:** A, plus create the `team/middleware/` scope with the doc in it. Done: tree + RESUME hand-off notes; the doc copy lands after M5.

## Confirm the candidate-1 design — ANSWERED 2026-10-06
- Answer: **confirmed** (PO, 2026-10-06) → SPEC Rev 5, R005, M5 (B010, B011).

## USER INPUT REQUIRED — Review: M5 (architecture candidate 1) (2026-10-06)
Merged into `front-end-development` at 10f2f7f. Gate: 243 app tests + 58 script tests, typecheck, lint and build all green; `/home` size unchanged (217 / 320 kB).

**What changed (no visible change; the reviewer compared before/after screenshots at 390 and 1440 px: identical, in `data/shots/b011-*.png`)**
- New `src/lib/dashboard.ts`, one module with a small interface:
  - **`DashboardSnapshot`**: what a data source supplies. Fully commented: units, signs, and the Live reading = the reading at "Updated".
  - **`checkSnapshot(snapshot)`**: returns a list of problems and never crashes; it was fuzzed with 21 broken inputs. It checks the power balance, whole-day coverage of today and tomorrow in site-local time (DST-aware: 47/48/49 hours), actual-before-forecast order, the per-hour energy balance, forecast ranges, cost vs grid import (exact), the 6 previous days, the weather date, and valid dates and timezone.
  - **`toDashboardView(snapshot)`**: derives "Today so far", self-powered %, the "Last 7 days" today bar, and tomorrow-vs-today solar, by **site-local date**, never by row position.
- The dashboard reads only the view. `/home` runs the check and logs any problem on the server, then renders.
- The sample data is now just the **sample adapter** (`sampleSnapshot`).
- **Hand-off:**
  - `docs/dashboard-snapshot.md`, copied into `team/middleware/research/dashboard-snapshot/README.md`;
  - `team/middleware/RESUME.md` lists your decisions plus the **Energy history** requirement and its retention conflict (CLAUDE.md §6 90-day raw retention vs ADR 0001).
- `GLOSSARY.md`: Site, Home use, Live reading, Site-local day, Timeline, Dashboard snapshot, Dashboard view, Energy history.

**Architecture backlog (priority, `plan/MILESTONES.md`):**
1. #3, a site-local time module + DST tests (next, unblocked);
2. #2, a tariff module (blocked on the middleware team's tariff format);
3. #4, a flow-state module;
4. #5, finish the sample-adapter naming when real data lands.

**Your call:**
- **a.** "approved": you merge `front-end-development` into `main` (as planned).
- **b.** changes.
- **c.** next topic: backlog #3, learning/loading/error states, the light theme, chart table/CSV views, nav + Plan/Trends, or call the **middleware** team.
- Answer:
