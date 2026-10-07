# SPEC — Front end: home dashboard (`/home`)

Revision 5

## Goal
`/home` becomes an overview dashboard of the MVP's key features (CLAUDE.md §9: Now, Plan, Trends, Accuracy, Health), fed by **sample data** through one typed contract. Another team will swap the sample data for real queries. It is dark only, built with shadcn (style `radix-nova`), and works at 390 px and 1440 px. Research and design plan: `research/home-dashboard/README.md`.

## Decisions (Decision round 1, see R001)
- Q1 merges go to the `front-end-development` branch; the PO merges it into `main`.
- Q2 shadcn token names, every hex value kept.
- Q3 Nova style.
- Q4 Archivo variable font.
- Q5 realistic sample data plus a "Sample data" badge.
- Q6 shadcn chart (`recharts`).
- Q7 no nav yet.
- Q8 build the full dashboard and the not-connected state only.
- Q9 the light theme and the chart table/CSV views are deferred.
- Q10 solar is #ffb547 and grid export is #8b93ff.
- Q11 this team owns `DashboardData`.
- M1 review (R002): the flow diagram becomes an orthogonal cross; Tonight gets a weather tile; the 48 h chart is plain-language with a hatched range band; a negative net cost reads as a credit.
- Architecture candidate 1 (R005): the `DashboardData` contract splits into a **Dashboard snapshot** (inputs only) and a **Dashboard view** (derived) in `src/lib/dashboard.ts`, with `checkSnapshot` and `toDashboardView`. The day rule is the site-local date. See GLOSSARY.md.
- M3 review (R004): the "Spending" label word is pink too; `pnpm dev` migrates the DB first (`predev`).
- M2 review (R003): smaller, matching kW readings in the flow nodes on mobile; a labelled "Grid price now" + "Your home now" (spending/saving/earning per hour) strip replaces the bare Peak badge; the tooltip uses the legend's swatches.

## Theme (`src/styles/globals.css`)
shadcn Tailwind v4 layout: raw vars on `:root` (the app is always `.dark`, so one set is enough), mapped in `@theme inline` as `--color-<name>: var(--<name>)`.

| var | value | was |
|---|---|---|
| `--background` | #08070e | `background` |
| `--foreground`, `--card-foreground`, `--popover-foreground`, `--secondary-foreground` | #f5f5f5 | `foreground` |
| `--card`, `--popover` | #17171d | `surface` |
| `--primary` | #00ffb2 | `primary` |
| `--primary-foreground` | #08070e | new |
| `--secondary`, `--muted`, `--accent` | #202026 | new (shadcn surfaces/hover) |
| `--muted-foreground` | #b0b0b0 | `muted` (text) |
| `--accent-foreground` | #f5f5f5 | new |
| `--destructive` | #ff0066 | `accent` (see R001 note) |
| `--border`, `--input` | #202026 | `border` |
| `--ring` | #00ffb2 | new |
| `--chart-1` solar | #ffb547 | new |
| `--chart-2` battery | #00ffb2 | |
| `--chart-3` home | #f5f5f5 | |
| `--chart-4` grid import | #ff0066 | |
| `--chart-5` grid export | #8b93ff | new |

- Also add semantic aliases `--color-solar`, `--color-battery`, `--color-home`, `--color-grid-import` and `--color-grid-export`. Each points at its chart var. Use them in markup (`text-solar`, `stroke-battery`...).
- **Removed names:** `surface` and `accent` (as pink). `muted` is now a background.
- **Renames in existing code:** `bg-surface` → `bg-card` and `text-muted` → `text-muted-foreground`. These are in `login/auth-form.tsx` and `(protected)/layout.tsx`. The login page must look the same.
- `color-scheme: dark` stays.

## Type
- Archivo from `next/font/google`, with `axes: ["wdth"]` and variable `--font-archivo`. `--font-sans` = Archivo + system fallbacks. Geist and Figtree are removed from `layout.tsx`.
- Live readings (kW, kWh, %, money in the hero and the strip): `font-stretch: 112.5%` (semi-expanded), weight 700–800, `tabular-nums`. Body text: normal width, 400/500.
- Scale (1.25): 12 / 14 / 16 / 20 / 25 / 31 / 39 / 49 px. Body is 16 px (15 on mobile). Lines stay under 80 characters.

## shadcn
- `components.json` style `radix-nova`. Keep the aliases and hugeicons.
- Components: `button`, `card`, `badge`, `chart` (`separator` was removed as unused in B009, Rev 4). Add others only if a section needs them.
- Allowed new deps: `radix-ui`, `recharts`, plus whatever the shadcn CLI requires for these components (e.g. `tw-animate-css`, `shadcn` for its CSS import). List each one in the handoff.

## Dashboard snapshot and view (Rev 5; replaces the Rev 1–4 "Data contract")
Terms are as in `GLOSSARY.md`. Everything lives in one pure module, **`src/lib/dashboard.ts`**: no React, no I/O.

**`DashboardSnapshot`**: inputs only, supplied by an adapter (today the sample in `src/app/(protected)/home/data.ts`; later the middleware team's real one). Its fields are the Rev 4 `DashboardData` fields **minus** `today` and `last7Days`, **plus**:
- `previousDays: Array<{ date: "YYYY-MM-DD"; solarWh; loadWh }>`: exactly the 6 site-local days before today, oldest first.
- On **actual** Timeline hours only: `gridImportWh`, `gridExportWh`, `batteryChargeWh` and `batteryDischargeWh` (integers ≥ 0). Forecast hours don't have them.
- TSDoc on every field states the units and signs (CLAUDE.md §5).
- `live` is the **instantaneous Live reading at `updatedAt`**. The sample approximates it; a code comment says so.
- `costToday` stays an input until the tariff module exists (architecture backlog item 3).

**Timeline rule:**
- the Timeline covers the **whole** site-local today and tomorrow: from local midnight of `updatedAt`'s site-local date to the last hour of the next site-local date, in consecutive UTC hours (46, 48 or 50 rows on DST days);
- "today" and "tomorrow" are always found by each hour's **site-local date** (`hour` + `site.timezone`), never by row index.

**`checkSnapshot(snapshot): string[]`** returns one plain message per problem (empty = OK). It never throws and never fixes data. It checks:
1. Live: integer W, `solarW ≥ 0`, `loadW ≥ 0`, `|solarW + batteryW + gridW − loadW| ≤ 50`, `socPct` 0–100.
2. Timeline:
   - consecutive hours, exactly 1 h apart;
   - full coverage of site-local today + tomorrow;
   - all actual hours before all forecast hours, and actual hours start before `updatedAt`;
   - actual hours carry the four breakdown fields and balance: `solar + batteryDischarge + gridImport ≈ load + batteryCharge + gridExport` (±50 Wh);
   - forecast hours have `p10 ≤ value ≤ p90` for load and solar; actual hours have no p10/p90.
3. `costToday`: Σ `periods.importWh` = today's derived grid import; `netCents` = Σ `costCents` − `exportCreditCents`.
4. `previousDays`: 6 consecutive dates ending the day before today, ascending.
5. `weatherTomorrow` (if present): `date` = tomorrow's site-local date.
6. Every ISO time string parses.

**`toDashboardView(snapshot): DashboardView`** = the snapshot's fields (minus `previousDays`) **plus** the derived fields:
- `today`: Σ over actual hours of today's site-local date (`solarWh`, `loadWh`, grid import/export, battery charge/discharge), and `selfPoweredPct = round(100 × (1 − gridImportWh / loadWh))`, clamped to 0–100;
- `last7Days`: `previousDays` + today's entry (`date`, `solarWh`, `loadWh` from `today`);
- `solarOutlook: { todayWh, tomorrowWh, changePct, direction: "less" | "more" }`: Σ `solarWh` over **all** hours (actual + forecast) of each site-local day; `changePct = round(|1 − tomorrow/today| × 100)`.

**Page:** `/home` runs `checkSnapshot` on the snapshot and logs each problem server-side (`console.warn("[dashboard snapshot]", problem)`). It still renders `<Dashboard view={toDashboardView(snapshot)} … />`. Dashboard modules read only the view; none slices the Timeline by index.

**Sample adapter** (`home/data.ts`): `sampleSnapshot`, produced by the existing dispatch simulation (it already computes per-hour battery/grid). **Every number on screen stays identical** to Rev 4.

**Hand-off:** `docs/dashboard-snapshot.md` is a one-page guide for the middleware team (units, signs, the day rule, the Live reading, the check, an example). A copy goes in `team/middleware/research/dashboard-snapshot/README.md`.

## Formatters: `src/lib/format.ts`
- `formatKw(w)`: absolute value, 1 decimal, e.g. `4180` → `"4.2 kW"`, `-2100` → `"2.1 kW"`, `0` → `"0.0 kW"`.
- `formatKwh(wh)`: 1 decimal, e.g. `11040` → `"11.0 kWh"`.
- `formatMoney(cents, currency)`: `Intl.NumberFormat("en-US", { style: "currency" })`, e.g. `310, "USD"` → `"$3.10"`.
- `formatTemp(c, unit)` (Rev 2): rounds to an integer, e.g. `(21.7, "C")` → `"22°C"`, `(21.7, "F")` → `"71°F"` (°F = c × 9/5 + 32, rounded).
- Direction is a word chosen by the component ("Exporting", "Charging"), never a minus sign.

## Page: `/home`
- `page.tsx` stays a server component:
  - it reads `connected` (a `credentials` row exists, as today);
  - it renders `<Dashboard view={toDashboardView(sampleSnapshot)} connected={connected} isSample showLogout={…} />` after logging `checkSnapshot` problems (Rev 5).
- `Dashboard` and its sections live in `src/components/dashboard/`. They are pure: props in, markup out, no fetching.
- **Header:** h1 = site name, "Updated <time>" in site-local time, the "Sample data" badge when `isSample`, and Log out. Log out moves from the absolute-positioned form in `(protected)/layout.tsx` into the header. The header gets the form via `logoutAction`, which keeps `isAuthDisabled()` hiding it.
- **Not connected:** a slim banner above the content with the text "Connect your Tesla account to see your own system" and a primary button "Connect Tesla" (`href="/api/auth/tesla"`). The sample dashboard still renders below it.

Sections, in DOM order. On mobile they stack in this order; desktop follows the wireframe in the research README.

| h2 text | content |
|---|---|
| Right now | **Hero, no card frame.** SVG power-flow diagram laid out as an **orthogonal cross** (Rev 2): Solar top, Grid left, Home right, Powerwall bottom, and a hub in the centre. Every flow line is strictly horizontal or vertical; the four arms have equal length and are symmetric about the hub. Each line runs from its node's edge to the hub, with no gap. Each node is one unit: an icon/ring, then its name, kW and state word directly beneath. The **Powerwall node *is* its SoC ring** (the % sits inside the ring). Each node has its kW value; the grid shows "Importing"/"Exporting", the battery "Charging"/"Discharging"/"Idle". The SVG has `role="img"` and an `aria-label` that reads all four flows in words. **Rev 3, mobile:** below `sm` (640 px), the kW reading is one step smaller on the type scale, and it's the **same class on all four nodes**. Each node's content sits inside its box with ≥ 6 units of padding on every side. **Rev 3, below the diagram, replacing the bare Peak badge:** a labelled strip with two items (side by side ≥ `sm`, stacked below):
- **"Grid price now"**: `formatMoney(importCentsPerKwh)` + "/kWh", then "{Peak / Mid-peak / Off-peak} rate until {endsAt local time}".
- **"Your home now"**: one line per non-zero item, each with a plain explanation:
  - **Spending** (Rev 4: the label word *and* the amount in `text-grid-import`) `formatMoney(round(max(gridW,0) × importRate / 1000))` + "/hour": "Buying {formatKw} from the grid at {importRate}/kWh".
  - **Saving** `formatMoney(round((loadW − max(gridW,0)) × importRate / 1000))` + "/hour": "Solar and battery cover {formatKw} of home use, so you're not buying it at {importRate}/kWh".
  - **Earning** `formatMoney(round(max(−gridW,0) × exportRate / 1000))` + "/hour": "Selling {formatKw} to the grid at {exportRate}/kWh".
  - Pure helper `costNow(live, tariffNow)` → `{ spendingCentsPerHour, savingCentsPerHour, earningCentsPerHour }` (integers). |
| Tonight | The only raised panel: action, valid window, effect (kWh) and savings, the `why` list, confidence and what would change it. If `recommendation` is null: "No changes needed tonight." **Rev 2: a "Tomorrow" weather tile inside the card**, below the why list, as an inset (`bg-muted`/`secondary` surface, smaller radius, no shadow). It shows: a hugeicons weather icon in solar amber, the condition in words ("Mostly cloudy"), high/low via `formatTemp`, cloud cover %, chance of rain %, and expected solar = `formatKwh` of the day-2 timeline `solarWh` sum, compared with today's full-day solar (day-1 sum) in words, e.g. "45% less sun than today". It is the evidence for the advice. If `weatherTomorrow` is null, the tile is omitted. |
| Today and tomorrow | shadcn chart: 48 h of home use vs solar, shaded peak hours, and a "Now" marker at the first forecast hour. Fixed height. **Rev 2, readable by a first-time viewer:** home use is a **line** (solid before Now, dashed after); solar is an amber filled area; the forecast range is a **diagonal-hatched band** (home colour at low opacity, no outline), so it can't be confused with the line. **No "p10"/"p90" anywhere.** A **custom HTML legend** below the chart (not the Recharts legend): "Home use", "Expected range for home use", "Solar", "Peak price hours", each with a swatch matching its mark (line, hatch, fill, shaded block). Plus one caption: "Hours after Now are a forecast. The hatched band shows where home use will most likely land." Y-axis title "kWh". The tooltip names the range "Expected range". **Rev 3:** the tooltip uses the **same swatch component** as the legend (line for home use, hatch for the expected range, amber square for solar). |
| Today so far | solar, home, grid import/export, battery charge/discharge in kWh, self-powered % |
| Cost today | cost per TOU period, export credit, net. **Rev 2:** if `netCents < 0`, show "Credit earned" with `formatMoney(-netCents)` (no minus sign); otherwise "Net cost" with `formatMoney(netCents)`. |
| Last 7 days | small bar chart, solar vs home per day (kWh) |
| Forecast accuracy | per target: model vs baseline error %, days measured |

- The last four sections sit in one panel divided by rules: 4 columns ≥ 1024 px, 2 at md, 1 on mobile.
- System status line at the bottom (not an h2): source, last poll time, estimated requests per month, and warnings if any.

## Design rules (skill `frontend-design`; charts also skill `dataviz`)
- **Colour:** each energy type keeps its colour in every widget. Pink means money leaving or an alert, never decoration. No gradient washes.
- **Motion:** exactly one moment. The flow lines animate along the real flow direction (`stroke-dashoffset`), with speed scaled to kW. Lines with < 50 W are drawn static and dim. Under `motion-reduce` everything is static.
- **No template chrome:**
  - no all-caps eyebrow labels, no monospace micro-labels;
  - no "→" appended to buttons, no fade-up on sections;
  - no hover lift on panels.
- **Units:** kW for power, kWh for energy, always labelled. All conversion goes through `src/lib/format.ts`.
- **Accessibility:** visible keyboard focus (`ring`), headings in order (h1 → h2), text contrast ≥ 4.5:1, chart series ≥ 3:1.
- **Copy:** plain sentence case from the owner's point of view.

## Dev setup (Rev 4)
- `package.json` `"predev": "node --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/migrate.mjs"`: `pnpm dev` applies Drizzle migrations to `DATABASE_PATH` (default `./data/voltops.db`) first. It loads the same env files Next does, so both use one DB. Docker is unchanged (it already migrates at start).

## Tests
- Vitest includes `src/**/*.test.{ts,tsx}`.
- UI tests use `react-dom/server` `renderToStaticMarkup`. No jsdom, no new test deps.
- The reviewer screenshots `/home` at 390 px and 1440 px (skill `agent-browser`) and checks the design rules by eye.

## Out of scope (this revision)
- Real data and middleware.
- Learning, loading and error states (Q8).
- Light theme and chart table/CSV views (Q9).
- Navigation to other screens (Q7).
- Phase 3 controls.
