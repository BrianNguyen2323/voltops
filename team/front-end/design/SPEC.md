# SPEC — Front end: home dashboard (`/home`)

Revision 7

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
- Topic 2 (R006, Decision round 4): a **"Peak hours" tile** (today's and tomorrow's estimated peak-window home use) next to "Your home now", and a structured **reserve advice sentence** in Tonight. The front-end builds placeholders on sample data; the middleware computes the numbers (`team/middleware/plan/board/backlog/B013-peak-estimate.md`).
- Topic 3 (R007, Decision round 3): the reserve window ends at the **start** of tomorrow's peak (the reserve drops back to the emergency floor so the battery covers the peak); Tonight states both steps with day words; an ⓘ popover explains the confidence and what would change the advice.
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
- the Timeline covers the **whole** site-local today and tomorrow: from local midnight of `updatedAt`'s site-local date to the last hour of the next site-local date, in consecutive UTC hours (48 rows; 47 or 49 when a DST change falls in the two days);
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

## Peak-hours estimate and reserve advice (Rev 6)
The PO's reasons: show the household's usual peak use and build up a usage pattern. Weather drives usage: hot days mean AC and cold days mean heating.

**Snapshot additions** (`src/lib/dashboard.ts`, TSDoc on every field):
```ts
type PeakHistory = {
  /** Average home use (Wh, integer ≥ 0) inside this day's peak window, over every complete stored day. */
  historyAvgWh: number;
  /** This day's forecast high, °C (the temperature the days are matched on). */
  highC: number;
  /** Complete stored days whose high is within ±3 °C of highC. Integer ≥ 0. */
  similarTempDays: number;
  /** Average peak-window home use over those days, Wh; null when similarTempDays < 3. */
  similarTempAvgWh: number | null;
};
peakEstimate: {
  /** Complete site-local days of stored history (integer ≥ 0). < 7 = learning. */
  historyDays: number;
  /** null when that day has no peak hours in the Timeline, or historyDays is 0. */
  today: PeakHistory | null;
  tomorrow: PeakHistory | null;
};
// recommendation gains an optional structured part (Q8):
reserve?: {
  /** Fixed emergency floor, percent (20). */
  emergencyPct: number;
  /** Percent of usable capacity to hold for the peak: min(100 − emergencyPct, ceil(peakWh × 100 / usableCapacityWh)). */
  extraPct: number;
  /** emergencyPct + extraPct (≤ 100). */
  targetPct: number;
  /** Tomorrow's peak estimate, Wh (= peakEstimateWh(tomorrow)). */
  peakWh: number;
  /** Peak Wh the extra reserve covers: peakWh, or less when the target is capped at 100%. */
  coveredWh: number;
};
// recommendation.savingsCents (existing) = round(coveredWh × (peak rate − off-peak rate) / 1000) when reserve is present (Q7).
```

**Pure helpers (exported, used by the view and by the middleware advisor so both agree):**
- `peakEstimateWh(p: PeakHistory): number` = `similarTempAvgWh === null ? historyAvgWh : round((historyAvgWh + similarTempAvgWh) / 2)` (Q2).
- `reservePlan(peakWh, usableCapacityWh, emergencyPct = 20)` → `{ emergencyPct, extraPct, targetPct, peakWh, coveredWh }`, following the rule above. `coveredWh = targetPct < 100 ? peakWh : min(peakWh, floor(extraPct × usableCapacityWh / 100))`. Example: 27 000 Wh battery, 11 000 Wh peak → extra 41, target 61.

**`checkSnapshot` adds:**
- `historyDays` is an integer ≥ 0;
- each non-null `PeakHistory` has integer Wh ≥ 0 and `similarTempDays` ≤ `historyDays`, and `similarTempAvgWh` is null **iff** `similarTempDays < 3`;
- `today` / `tomorrow` is null when that site-local day has no `peak` hour in the Timeline;
- when `recommendation.reserve` is present:
  - it deep-equals `reservePlan(peakEstimateWh(peakEstimate.tomorrow), live.usableCapacityWh, reserve.emergencyPct)`;
  - `emergencyPct ≥ 20`;
  - `peakEstimate.tomorrow` is non-null and `historyDays ≥ 7`.

**View** (`toDashboardView`) adds `peakUsage`:
```ts
peakUsage: {
  learning: boolean;            // historyDays < 7
  historyDays: number;
  today: PeakDay | null;
  tomorrow: PeakDay | null;
};
type PeakDay = PeakHistory & {
  estimateWh: number;           // peakEstimateWh(...)
  windowStart: string;          // ISO UTC: start of that day's first peak Timeline hour
  windowEnd: string;            // ISO UTC: end of its last peak hour (+1 h)
  usedSoFarWh: number | null;   // today only: Σ loadWh of actual peak hours of today; null if the window hasn't started (no actual peak hour yet); always null for tomorrow
};
```
The window is derived from the Timeline's `period === "peak"` hours of that site-local date, so it matches the chart's shading.

**UI** (`dashboard.tsx`; `Use skill: frontend-design`):
- **"Peak hours" tile:** a 3rd cell in the "Right now" strip, after "Your home now". The strip is `sm:grid-cols-2 lg:grid-cols-3`; on a phone it stacks under "Your home now". Content (Q1):
  - h3 "Peak hours" (same style as the other two h3s);
  - one row per non-null day:
    - "**Today** {4–9 PM}", then `reading` **{formatKwh(estimateWh)}** "expected";
    - if `usedSoFarWh !== null`: "{formatKwh} used so far";
    - "**Tomorrow** {window}" with its **estimate**;
  - a null day reads "{Today/Tomorrow}: no peak hours";
  - one small `text-muted-foreground text-sm` line per day: "Usual {formatKwh(historyAvgWh)} ({historyDays} days). On days near {formatTemp(highC)}: {formatKwh(similarTempAvgWh)} ({similarTempDays} days)." When `similarTempAvgWh` is null, the second sentence reads "Not enough days near {formatTemp(highC)} yet.";
  - **learning:** instead of all of the above, "Learning your usage: {historyDays} of 7 days" (Q5);
  - the window time format is the existing local `clock` style, e.g. "4:00 PM–9:00 PM".
- **Tonight card, when `rec.reserve` is present** (replaces the big `action` line and the "From … Stores … saves" line; the why list, confidence and weather tile stay):
  - big line: "Raise your backup reserve to {targetPct}%."
  - next line (normal size), the PO's wording: "With {emergencyPct}% as reserve for emergencies, an additional {extraPct}% will help you save {money(savingsCents)} for tomorrow's estimated {formatKwh(peakWh)} usage during peak hours." The money value uses `reading text-foreground`, as today;
  - if `targetPct === 100 && coveredWh < peakWh`: append " That covers about {formatKwh(coveredWh)} of it.";
  - ~~small muted line: "From {clock(validFrom)} until {clock(validTo)}."~~ **Rev 7:** replaced by the two-step line below.
  - Without `reserve`, the card is unchanged (Rev 5).

**Sample adapter** (`home/data.ts`): `historyDays: 30`.
- `today` (hot): `{ historyAvgWh: 10200, highC: 33, similarTempDays: 8, similarTempAvgWh: 11600 }` → estimate 10 900.
- `tomorrow` (cloudy, cooler, matching the weather tile's 24 °C): `{ historyAvgWh: 10200, highC: 24, similarTempDays: 6, similarTempAvgWh: 8400 }` → estimate 9 300.
- `recommendation.action` becomes "Raise backup reserve to 89%", with `reserve = reservePlan(9300, 13500)` = extra 69, target 89, covered 9 300. `savingsCents = round(9300 × (48 − 30) / 1000) = 167`. `effectWh` = 9300.
- The "11 kWh" why-line becomes "about 9.3 kWh".
- Today's used-so-far comes from the existing Timeline: the 16:00 hour is actual at 17:00.
- `checkSnapshot(sampleSnapshot)` stays `[]`.

**Hand-off:** `docs/dashboard-snapshot.md` gets a "Peak estimate and reserve advice" section (fields, helpers, check rules), and its copy in `team/middleware/research/dashboard-snapshot/README.md` is refreshed by the lead.

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


## Tonight card clarity (Rev 7, R007)
**Window semantics (advisor, `src/lib/advisor/reserve.ts`):** `validFrom` is unchanged (max(updatedAt, end of today's peak window)). `validTo` = the **start** of tomorrow's peak window (`win.startMs`), not its end. The reserve is a floor: it has to drop back to `emergencyPct` when the peak starts so the battery can cover the peak. Sample snapshot: `validTo` = 2026-07-16T23:00:00Z (4:00 PM PDT on 7/16).

**Day words:** `dayWord(iso, updatedAt, tz)`:
- the local date of `iso` equals the local date of `updatedAt` → "tonight" if the local hour ≥ 17, else "today";
- the next local date → "tomorrow";
- otherwise the weekday name ("Friday").

**Two-step line** (replaces "From … until …" when `rec.reserve` is present; `text-sm`, muted, with the times in `text-foreground`):
- start: if `validFrom` ≤ `updatedAt`: "**Now**, raise it to {targetPct}%."; otherwise "**{Dayword} at {clock(validFrom)}**, after today's peak hours end, raise it to {targetPct}%." The day word is capitalised.
- end: "**{Dayword} at {clock(validTo)}**, when peak hours start, lower it back to {emergencyPct}% so the battery covers the peak."
- Sample: "Tonight at 9:00 PM, after today's peak hours end, raise it to 89%. Tomorrow at 4:00 PM, when peak hours start, lower it back to 20% so the battery covers the peak."
- Without `reserve`, the plain-action card is unchanged.

**ⓘ info popover** (only when `rec.reserve` and `view.peakUsage.tomorrow` are both non-null; otherwise the confidence line is unchanged):
- An icon button (hugeicons info icon, `aria-label="About this advice"`) after "{Confidence} confidence. {wouldChange}". It opens on hover and keyboard focus **and** on tap/click. Built on shadcn Popover (`src/components/ui/popover.tsx`, `radix-ui`, no new dependency) in a `"use client"` component.
- Content: three sections, each a small bold title + a paragraph, max width ~20rem. `T = tomorrow`, `temp = formatTemp(T.highC, unit)`, `lo/hi = formatTemp(T.highC ∓ 3, unit)` (the ±3 °C band of the contract), `n = T.similarTempDays`, `days(n)` = "1 past day" / "{n} past days":
  1. "**Why {confidence} confidence**":
     - low: "Only {days(n)} had a high near {temp}; 3 are needed. Until then this uses your usual peak use: {formatKwh(T.historyAvgWh)} over {historyDays} days." (n = 0 → "No past days had a high near {temp} yet; 3 are needed. …")
     - medium/high: "Based on {days(n)} with a high near {temp} ({formatKwh(T.similarTempAvgWh)} on average), mixed with your usual peak use: {formatKwh(T.historyAvgWh)} over {historyDays} days."
  2. "**If tomorrow's forecast high changes**": "This uses days with a high between {lo} and {hi}. If the forecast moves outside that range, other days are used. Hotter or colder days usually mean more AC or heating, so a higher reserve. The advice updates on its own."
  3. "**If your tariff changes**": "Your peak hours are {clock(T.windowStart)}–{clock(T.windowEnd)}. If they move, the raise and lower times move with them. The saving is the gap between peak and off-peak prices: a smaller gap means a smaller saving. If your plan has no peak hours, there is no advice."
- The copy comes from pure functions (`reserveSteps`, `confidenceInfo`) in `src/components/dashboard/tonight.ts`, so it is testable without opening the popover.
