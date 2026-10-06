# B005 — M1 review fixes: cross flow diagram, weather tile, readable chart, credit wording

## Skills
Implementer:
- `Use skill: frontend-design`: read it before changing markup, and critique your screenshots against it.
- `Use skill: dataviz`: the chart, its legend and the flow diagram.
- `Use skill: agent-browser`: full-page screenshots at 390 px and 1440 px.

## Facts
**Current code** (`front-end-development`):
- `/home` renders `Dashboard({data, connected, isSample, showLogout})` from `src/components/dashboard/dashboard.tsx`, with `flow-diagram.tsx` (hub-based SVG) and `charts.tsx` (Recharts `TimelineChart`, `WeekChart`).
- Data: `src/app/(protected)/home/data.ts` (`DashboardData`, `sampleDashboard`; one dispatch sim drives all numbers; the timeline is 48 rows from 00:00 PDT 2026-07-15, day-2 solar is 55% of day 1).
- Formatters: `src/lib/format.ts` (`formatKw`, `formatKwh`, `formatMoney`).
- Energy colours: Tailwind `solar` #ffb547, `battery` #00ffb2, `home` #f5f5f5, `grid-import` #ff0066, `grid-export` #8b93ff (`var(--chart-1..5)`). `bg-muted`/`bg-secondary` = #202026.
- Icons: `@hugeicons/react` + `@hugeicons/core-free-icons` (installed).

**PO's M1 review → SPEC Rev 2 (R002):**

1. **Right now: organize the flow diagram.** The lines sit at odd angles. Fix the Powerwall ring too.
   - **Layout:** an orthogonal cross. Solar **top**, Grid **left**, Home **right**, Powerwall **bottom**, hub in the centre.
   - **Lines:** four `<line>` elements with `data-flow="solar" | "grid" | "home" | "battery"`. Each is strictly horizontal or vertical (`x1 === x2` or `y1 === y2`), each has one endpoint exactly at the hub centre, and all four have **equal length**. Each line ends at its node's edge, with no gap.
   - **Nodes:** each node is one unit: a symbol, then its name, kW (`formatKw`) and state word directly beneath.
   - **Powerwall:** the node **is** the SoC ring. Put the ring and its `${socPct}%` text inside `<g data-node="battery">`.
   - **Kept:** direction words (grid Importing/Exporting; battery Charging/Discharging/Idle, |W| < 50 → Idle), no minus signs, `role="img"` + `aria-label` naming Solar/Home/Powerwall/Grid, flow animation under `motion-safe` only (speed scaled to kW, static and dim under 50 W), the TOU chip below.
   - It must look balanced at 390 px and at 1440 px.

2. **Tonight: add a "Tomorrow" weather tile inside the card,** below the why list.
   - **Look:** an inset with `bg-muted`, a smaller radius than the card and no shadow. It must stay within the theme and look good.
   - **Contents:**
     - a hugeicons weather icon in `text-solar`;
     - the condition in words: clear → "Sunny", partly-cloudy → "Partly cloudy", cloudy → "Cloudy", rain → "Rain";
     - high/low via `formatTemp`;
     - "{cloudCoverPct}% cloud cover" and "{precipitationChancePct}% chance of rain";
     - expected solar = `formatKwh(Σ solarWh of timeline rows 24–47)`, plus "{N}% less sun than today", where N = round((1 − day2 / day1) × 100) and day1 = Σ rows 0–23. Write "more" if day 2 > day 1.
   - If `weatherTomorrow` is null, omit the tile.
   - **Contract additions in `data.ts`** (the middleware team fills these later from a weather API):
     - `site.temperatureUnit: "F" | "C"`; the sample uses `"F"`;
     - the shape below.
     ```ts
     weatherTomorrow: null | {
       date: string;                 // YYYY-MM-DD site-local; sample "2026-07-16"
       condition: "clear" | "partly-cloudy" | "cloudy" | "rain";
       highC: number; lowC: number;  // canonical °C
       cloudCoverPct: number;        // 0–100
       precipitationChancePct: number;
     };
     ```
     - Sample: `cloudy`, high 24 °C, low 16 °C, 80% cloud, 20% rain.
   - **`src/lib/format.ts`:** add `formatTemp(c: number, unit: "F" | "C"): string`. It rounds to an integer: `(21.7,"C")` → `"22°C"`, `(21.7,"F")` → `"71°F"`, `(24,"F")` → `"75°F"`, `(-3.4,"C")` → `"-3°C"`.

3. **48 h chart: readable by a first-time viewer.**
   - Remove every "p10"/"p90" from visible text, including the tooltip.
   - **Home use** is a **line**: solid up to Now, dashed after. Use two series, or one line with a dashed overlay.
   - **Solar** is an amber filled area.
   - The **forecast range** is a **diagonal-hatched band**: an SVG `<pattern>` in the home colour at low opacity, no outline. It must be clearly different from the line.
   - Y-axis title "kWh". The tooltip calls the band "Expected range".
   - Replace the Recharts legend with a **custom HTML legend** below the chart. Each entry has a swatch matching its mark (a short line for home use, a hatched square for the range, an amber square for solar, a muted block for peak):
     - "Home use"
     - "Expected range for home use"
     - "Solar"
     - "Peak price hours"
   - Add this caption under the legend: "Hours after Now are a forecast. The hatched band shows where home use will most likely land."

4. **Cost today:** if `netCents < 0`, show the label "Credit earned" with `formatMoney(-netCents)` and no minus sign. Otherwise show "Net cost" with `formatMoney(netCents)`.

**Keep:**
- all existing tests and behaviour;
- design rules: no all-caps eyebrows, no monospace micro-labels, no "→", no fade-ups or hover lifts; Tonight is the only Card; the strip is one divided panel;
- units only through `~/lib/format`.

## Owned files
- Tester: `src/app/(protected)/home/data.test.ts`, `src/lib/format.test.ts`, `src/components/dashboard/dashboard.test.tsx`.
- Implementer: `src/app/(protected)/home/data.ts`, `src/lib/format.ts`, `src/components/dashboard/**` (not the test), `src/styles/globals.css` (only if needed, e.g. a hatch swatch).

## Base
- Tester: `front-end-development` (at or after this brief's commit) → branch `phase2a/ui-m2-test`. The new tests must FAIL on the base.
- Implementer: `phase2a/ui-m2-test` → branch `phase2a/ui-m2-impl`.

## Judged by
- **Tests** (`renderToStaticMarkup`; derive expectations from `sampleDashboard` and the formatters):
  - **format:** the `formatTemp` examples above.
  - **data:** `site.temperatureUnit === "F"`; `weatherTomorrow` matches the sample values; its `date` is the site-local date of timeline row 24.
  - **flow diagram:**
    - exactly four `<line data-flow=…>` with the four values;
    - each has x1 === x2 or y1 === y2;
    - all share one common endpoint (the hub), and all four lengths are equal (±0.5);
    - solar is above the hub, battery below, grid left and home right;
    - `<g data-node="battery">` contains `${socPct}%`.
  - **Tonight** (the slice from "Tonight" to "Today and tomorrow"):
    - contains "Tomorrow", "Cloudy", `formatTemp(24,"F")`, `formatTemp(16,"F")`, "80% cloud cover" and "20% chance of rain";
    - contains `formatKwh(day-2 solar sum)` and `${N}% less sun than today`;
    - with `weatherTomorrow: null`, none of the weather strings appear.
  - **chart:**
    - the whole markup contains no "p10"/"p90" (case-insensitive);
    - it contains the four legend labels and the caption text;
    - the tooltip and y-axis title render inside Recharts and are not visible in SSR, so the reviewer checks those on screenshots.
  - **cost:**
    - the sample (net < 0) shows "Credit earned" + `formatMoney(-netCents)` and does **not** contain `formatMoney(netCents)` (the "-$" form);
    - a copy with a positive `netCents` shows "Net cost".
- **Command:** `rm -rf .next && pnpm test && pnpm typecheck && SKIP_ENV_VALIDATION=1 rtk proxy pnpm lint && SKIP_ENV_VALIDATION=1 pnpm build`, all green; lint must print "No ESLint warnings or errors".
- **Visual check by the implementer:**
  - set `DATABASE_PATH` to a scratch file in the worktree's `data/` and run `pnpm db:migrate`;
  - run `SKIP_ENV_VALIDATION=1 AUTH_DISABLED=true pnpm dev -p 3100` in the background (**never port 3000**);
  - take full-page screenshots at 390 px and 1440 px into `data/shots/`, critique them with frontend-design and fix;
  - **stop the dev server** and confirm nothing is listening on 3100.
- **Worktree:** no dep changes, so link main's node_modules (`cmd //c mklink //J node_modules "D:\Programming Projects\voltops\node_modules"`). Run `cmd //c rmdir node_modules` before finishing, and never use `--force`.
- **Keep every command bounded:** agents have stalled on long waits here.

## Gate log
- Tests on `phase2a/ui-m2-test`: 12 new FAIL on base for the right reason (168 pass). Null-weather check skips "Tomorrow" (the why text already says it); the old net-cost assertion was replaced by the Credit earned / Net cost tests. Implementer spawned.
- Impl 10922b1 on `phase2a/ui-m2-impl`: 180/180, typecheck clean. Lint/build red only on the tester's `dashboard.test.tsx:237` (`prefer-includes`).
  - After its screenshot critique: SoC % fits inside a larger ring; node text 16 px at 390 px; hatch opacity raised.
  - The final 1440 shot wasn't opened and the tooltip wasn't checked. The Tomorrow tile heading is an h3.
  - Tester lint fix-up spawned → `phase2a/ui-m2-test2`.
- Test lint fix f456e77 on `phase2a/ui-m2-test2`: 180/180, lint clean. Reviewer spawned (full gate, full-page shots, tooltip hover).
