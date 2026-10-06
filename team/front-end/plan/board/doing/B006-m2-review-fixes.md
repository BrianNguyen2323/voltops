# B006 — M2 review fixes: mobile kW size, labelled grid price + home cost now, tooltip swatches

## Skills
Implementer:
- `Use skill: frontend-design`: read it before changing markup, and critique your screenshots against it.
- `Use skill: dataviz`: the tooltip swatches.
- `Use skill: agent-browser`: full-page screenshots at 390 px and 1440 px.

## Facts
**Current code** (`front-end-development`):
- `src/components/dashboard/flow-diagram.tsx`:
  - SVG `viewBox="0 0 460 416"`, an orthogonal cross;
  - each node is a `<rect>` box (`BOX`) with name/kW/state `<text>`. The kW text uses `className="reading fill-foreground text-xl"`, and all text sizes are Tailwind classes in SVG user units;
  - the Powerwall node is `<g data-node="battery">` with the SoC ring and `%`.
- `src/components/dashboard/dashboard.tsx`:
  - around lines 85–93, under the diagram, sit `<Badge variant="outline">{PERIOD[tariffNow.period]}</Badge>` and "{money}/kWh to import, until {time}";
  - `PERIOD` maps off-peak/mid-peak/peak → "Off-peak"/"Mid-peak"/"Peak".
- `src/components/dashboard/charts.tsx`:
  - the custom `Legend()` uses inline swatch spans: a home line `bg-home h-0.5 w-5`, a range hatch via `HATCH_CSS`, a solar square and a peak square;
  - `TimelineTooltip` uses round dots for every row.
- Sample (`sampleDashboard`):
  - `live` = solar 3713 W, load 2066 W, battery 0 W (Idle), grid −1647 W (Exporting);
  - `tariffNow` = peak, import 48 ¢/kWh, export 8 ¢/kWh, ends 21:00 PDT;
  - currency USD.
- Formatters `~/lib/format`: `formatKw`, `formatKwh`, `formatMoney(cents, currency)`, `formatTemp`.

**PO's M2 review → SPEC Rev 3 (R003):**

1. **Mobile kW size.**
   - Below `sm` (640 px), the kW reading in all four nodes is one step smaller (e.g. `text-lg sm:text-xl`; pick what fits). The kW `<text>` must have the **identical className on all four nodes**; give each `data-reading="kw"`.
   - Each node's content (icon/ring, name, kW, state) stays inside its box with **≥ 6 SVG units of padding** on every side. That means the ring is no longer flush with the box top and the state words are no longer tight to the bottom.
   - Keep the cross geometry (equal orthogonal arms touching the boxes) and the % inside the ring.

2. **Replace the bare "Peak" badge** under the diagram with a labelled strip of two items: side by side at ≥ `sm`, stacked below.
   - **"Grid price now"** (a visible label, sentence case, not all caps): the reading `formatMoney(importCentsPerKwh)` + "/kWh", then "{Peak|Mid-peak|Off-peak} rate until {h:mm AM/PM local}".
   - **"Your home now"**: one line per **non-zero** item, each as a reading plus a plain explanation:
     - **Spending** `formatMoney(spendingCentsPerHour)/hour`: "Buying {formatKw(gridW)} from the grid at {formatMoney(import)}/kWh".
     - **Saving** `formatMoney(savingCentsPerHour)/hour`: "Solar and battery cover {formatKw(loadW − max(gridW,0))} of home use, so you're not buying it at {formatMoney(import)}/kWh".
     - **Earning** `formatMoney(earningCentsPerHour)/hour`: "Selling {formatKw(gridW)} to the grid at {formatMoney(export)}/kWh".
   - **New pure helper** `src/components/dashboard/cost-now.ts`: `costNow(live, tariffNow) → { spendingCentsPerHour, savingCentsPerHour, earningCentsPerHour }`, all integers:
     - spending = round(max(gridW,0) × importCentsPerKwh / 1000);
     - saving = round((loadW − max(gridW,0)) × importCentsPerKwh / 1000);
     - earning = round(max(−gridW,0) × exportCentsPerKwh / 1000).
   - Sample → spending 0 (line hidden), saving 99 ("$0.99/hour"), earning 13 ("$0.13/hour").
   - Colours: spending uses the grid-import pink (money leaving), saving and earning use the default foreground or battery mint. No new colours.

3. **Tooltip swatches = legend swatches.**
   - Extract one exported `Swatch({ kind: "home" | "range" | "solar" | "peak" })` in `charts.tsx` that renders `<span aria-hidden data-swatch={kind} …>`, and use it in **both** `Legend` and `TimelineTooltip`.
   - Export `TimelineTooltip` so it can be tested. The tooltip rows are home → `home` (line), expected range → `range` (hatch), solar → `solar` (square).

**Keep:**
- all existing behaviour and tests, except where these facts change them (the old "{money}/kWh to import, until" text goes away);
- design rules: no all-caps labels, no monospace micro-labels, no "→", no fade-ups or hover lifts; Tonight is the only Card;
- units only via `~/lib/format`; no minus signs for direction or money.

## Owned files
- Tester: `src/components/dashboard/dashboard.test.tsx`, a new `src/components/dashboard/cost-now.test.ts`.
- Implementer: `src/components/dashboard/**` (not the tests).

## Base
- Tester: `front-end-development` (at or after this brief's commit) → branch `phase2a/ui-m3-test`. The new tests must FAIL on the base.
- Implementer: `phase2a/ui-m3-test` → branch `phase2a/ui-m3-impl`.

## Judged by
- **`cost-now.test.ts`:**
  - the sample → `{0, 99, 13}`;
  - importing: live `{loadW: 2000, gridW: 1500, …}` at 48/8 → spending 72, saving 24, earning 0;
  - all zero when load and grid are 0;
  - results are integers.
- **`dashboard.test.tsx`** (`renderToStaticMarkup`, expectations derived from the sample and the formatters):
  - flow: exactly four `data-reading="kw"` texts, all with an identical `class` attribute; the existing cross-geometry tests still pass;
  - strip:
    - "Grid price now", `formatMoney(48)` + "/kWh", and "Peak rate until 9:00 PM" are present;
    - "Your home now", "$0.99/hour", "Solar and battery cover" + `formatKw(2066)`, "$0.13/hour", "Selling" + `formatKw(-1647)` are present;
    - **no** "Spending"/"Buying" line in the sample;
    - a copy with `gridW: 1500, loadW: 2000` shows "Buying" and the spending amount;
    - the old "to import, until" text is gone;
  - tooltip: `renderToStaticMarkup(<TimelineTooltip active payload={[{payload: rowWithBand}]} timezone=… />)` has `data-swatch="home"`, `data-swatch="range"` and `data-swatch="solar"`. The `range` swatch element's markup is **identical** to the one in the dashboard legend.
- **Command:** `rm -rf .next && pnpm test && pnpm typecheck && SKIP_ENV_VALIDATION=1 rtk proxy pnpm lint && SKIP_ENV_VALIDATION=1 pnpm build`, all green; lint prints "No ESLint warnings or errors". **Testers: lint your test files too** (two earlier rounds failed on test-file lint).
- **Visual check by the implementer:**
  - use a scratch DB in the worktree's `data/` (`pnpm db:migrate`);
  - run `SKIP_ENV_VALIDATION=1 AUTH_DISABLED=true pnpm dev -p 3100` in the background (**never port 3000**);
  - take full-page screenshots at 390 px and 1440 px into `data/shots/`, and hover the chart for the tooltip;
  - critique with frontend-design and fix;
  - **stop the dev server and run `agent-browser close`** before handing off.
- **Worktree:** link main's node_modules (`cmd //c mklink //J node_modules "D:\Programming Projects\voltops\node_modules"`). Run `cmd //c rmdir node_modules` before finishing, and never use `--force`. Keep every command bounded.

## Gate log
- Tests c9477f0 on `phase2a/ui-m3-test`: cost-now suite FAIL (module missing) + 7/41 dashboard FAIL for the right reason. Money strings compared whitespace-stripped; the range swatch must be an identical empty span in the legend and the tooltip. Implementer spawned.
