# SPEC — Front end: home dashboard (`/home`)

Revision 1

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
- Components: `button`, `card`, `badge`, `chart`, `separator`. Add others only if a section needs them.
- Allowed new deps: `radix-ui`, `recharts`, plus whatever the shadcn CLI requires for these components (e.g. `tw-animate-css`, `shadcn` for its CSS import). List each one in the handoff.

## Data contract: `src/app/(protected)/home/data.ts`
Exports `type DashboardData` and `const sampleDashboard: DashboardData`. All units are canonical (CLAUDE.md §5):
- power in **W** and energy in **Wh**, both integers; money in integer **cents**;
- times are ISO-8601 UTC strings.
- Signs: `batteryW` > 0 discharging; `gridW` > 0 importing.

```ts
type TouPeriod = "off-peak" | "mid-peak" | "peak";
type DashboardData = {
  site: { name: string; timezone: string };            // IANA tz
  source: "fleet-api" | "local-gateway" | "replay";
  updatedAt: string;
  currency: string;                                     // ISO 4217, e.g. "USD"
  live: { solarW: number; loadW: number; batteryW: number; gridW: number;
          socPct: number; usableCapacityWh: number; gridStatus: "connected" | "islanded" };
  tariffNow: { period: TouPeriod; importCentsPerKwh: number; exportCentsPerKwh: number; endsAt: string };
  recommendation: null | {
    action: string;                                     // "Raise backup reserve to 65%"
    validFrom: string; validTo: string;
    effectWh: number; savingsCents: number;
    why: string[];                                      // 1–3 plain sentences
    confidence: "low" | "medium" | "high";
    wouldChange: string;
  };
  timeline: Array<{                                     // 48 consecutive hours
    hour: string;                                       // start of hour, UTC
    kind: "actual" | "forecast";                        // all actuals precede all forecasts
    loadWh: number; solarWh: number; socPct: number; period: TouPeriod;
    loadP10Wh?: number; loadP90Wh?: number;             // forecast rows only
    solarP10Wh?: number; solarP90Wh?: number;           // p10 ≤ value ≤ p90
  }>;
  today: { solarWh: number; loadWh: number; gridImportWh: number; gridExportWh: number;
           batteryChargeWh: number; batteryDischargeWh: number; selfPoweredPct: number };
  costToday: { periods: Array<{ period: TouPeriod; importWh: number; costCents: number }>;
               exportCreditCents: number; netCents: number };   // net = Σcost − credit
  last7Days: Array<{ date: string; solarWh: number; loadWh: number }>;  // 7 site-local dates, oldest first
  accuracy: Array<{ target: "load" | "solar"; model: string; baseline: string;
                    maePct: number; baselineMaePct: number; days: number }>;
  health: { lastPollAt: string; estRequestsPerMonth: number; warnings: string[] };
};
```

The sample is one plausible summer day for a 13.5 kWh Powerwall home in `America/Los_Angeles`, frozen at a fixed `updatedAt` in the late afternoon. It is deterministic: no `Date.now()`, no randomness. The live flows obey `solarW + batteryW + gridW ≈ loadW` (±50 W).

## Formatters: `src/lib/format.ts`
- `formatKw(w)`: absolute value, 1 decimal, e.g. `4180` → `"4.2 kW"`, `-2100` → `"2.1 kW"`, `0` → `"0.0 kW"`.
- `formatKwh(wh)`: 1 decimal, e.g. `11040` → `"11.0 kWh"`.
- `formatMoney(cents, currency)`: `Intl.NumberFormat("en-US", { style: "currency" })`, e.g. `310, "USD"` → `"$3.10"`.
- Direction is a word chosen by the component ("Exporting", "Charging"), never a minus sign.

## Page: `/home`
- `page.tsx` stays a server component:
  - it reads `connected` (a `credentials` row exists, as today);
  - it renders `<Dashboard data={sampleDashboard} connected={connected} isSample />`.
- `Dashboard` and its sections live in `src/components/dashboard/`. They are pure: props in, markup out, no fetching.
- **Header:** h1 = site name, "Updated <time>" in site-local time, the "Sample data" badge when `isSample`, and Log out. Log out moves from the absolute-positioned form in `(protected)/layout.tsx` into the header. The header gets the form via `logoutAction`, which keeps `isAuthDisabled()` hiding it.
- **Not connected:** a slim banner above the content with the text "Connect your Tesla account to see your own system" and a primary button "Connect Tesla" (`href="/api/auth/tesla"`). The sample dashboard still renders below it.

Sections, in DOM order. On mobile they stack in this order; desktop follows the wireframe in the research README.

| h2 text | content |
|---|---|
| Right now | **Hero, no card frame.** SVG power-flow diagram: Solar, Home, Powerwall (SoC ring + %), Grid. Each node has its kW value; the grid shows "Importing"/"Exporting", the battery "Charging"/"Discharging"/"Idle". The SVG has `role="img"` and an `aria-label` that reads all four flows in words. Below it is a chip with the current TOU period and its import price per kWh. |
| Tonight | The only raised panel: action, valid window, effect (kWh) and savings, the `why` list, confidence and what would change it. If `recommendation` is null: "No changes needed tonight." |
| Today and tomorrow | shadcn chart: 48 h of load (forecast hours show a p10–p90 band) vs solar, shaded TOU peak bands, and a "now" marker at the first forecast hour. Fixed height. Legend in kWh. |
| Today so far | solar, home, grid import/export, battery charge/discharge in kWh, self-powered % |
| Cost today | cost per TOU period, export credit, net |
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
