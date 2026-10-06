# B003 — Dashboard components + `/home` page

## Skills
`Use skill: frontend-design` (implementer: read it before writing markup and re-check against it with screenshots). `Use skill: dataviz` (the two charts and the flow diagram). `Use skill: agent-browser` (screenshots at 390 px and 1440 px).

## Facts
- **Already merged** (B001, B002):
  - shadcn `radix-nova` components `button card badge chart separator` in `~/components/ui`;
  - Tailwind colours `background foreground card muted muted-foreground primary primary-foreground border ring destructive`, plus energy colours `solar` (#ffb547), `battery` (#00ffb2), `home` (#f5f5f5), `grid-import` (#ff0066), `grid-export` (#8b93ff) (e.g. `text-solar`, `stroke-battery`, `var(--chart-1..5)`);
  - font Archivo with a `wdth` axis;
  - `DashboardData` + `sampleDashboard` in `~/app/(protected)/home/data`;
  - `formatKw`, `formatKwh` and `formatMoney` in `~/lib/format`. These are the only unit conversions allowed.
- **Page `src/app/(protected)/home/page.tsx`:**
  - stays a server component;
  - keeps the existing `connected` check (a `credentials` row exists);
  - renders `<Dashboard data={sampleDashboard} connected={connected} isSample />`.
- **Log out:**
  - move it from the absolute-positioned form in `src/app/(protected)/layout.tsx` into the dashboard header. The layout keeps `requireAdmin()`;
  - the header renders `<form action={logoutAction}>` with a button "Log out", only when `!isAuthDisabled()`;
  - the page passes `showLogout={!isAuthDisabled()}` so `Dashboard` stays pure.
- **`Dashboard` and its sections** live in `src/components/dashboard/`. They are pure (props in, markup out). Use `"use client"` only where Recharts needs it.
- **Header:** h1 = `data.site.name`, "Updated <h:mm AM/PM>" in `site.timezone`, a `Badge` "Sample data" when `isSample`, and Log out.
- **Not connected** (`connected === false`): a slim banner above the sections with "Connect your Tesla account to see your own system" and a primary button "Connect Tesla", which is an `<a href="/api/auth/tesla">`. The sections still render.
- **Sections:** in DOM order, h2 texts exact:
  1. **Right now.** Hero, no card frame.
     - Hand-made SVG power-flow diagram: Solar, Home, Powerwall, Grid nodes, each with its kW (`formatKw`). The Powerwall shows an SoC ring + `socPct`%.
     - Direction words, no minus signs: grid "Importing"/"Exporting" (sign of `gridW`); battery "Charging"/"Discharging"/"Idle" (|W| < 50 → Idle).
     - `<svg role="img" aria-label="…">`: the label reads all four flows in words.
     - The flow lines animate along the real direction (`stroke-dashoffset`), with speed scaled to kW. Lines under 50 W are static and dim. Under `motion-reduce` everything is static. **This is the page's only ambient motion.**
     - Below: a chip with the TOU period ("Peak", "Mid-peak", "Off-peak") + import price as `formatMoney(cents)` + "/kWh".
  2. **Tonight.** The only raised panel (`Card`): action, window (local times), effect (`formatKwh`) and savings (`formatMoney`), the `why` list, confidence, `wouldChange`. If `recommendation` is null: "No changes needed tonight."
  3. **Today and tomorrow.** `ChartContainer` with a fixed height:
     - 48 h load (forecast hours: p10–p90 band, area at low opacity) vs solar;
     - peak periods shaded (`ReferenceArea`) and a "Now" `ReferenceLine` at the first forecast hour;
     - x ticks in local hours; the y axis labelled kWh.
  4. **Today so far**: solar, home, grid import, grid export, battery charge/discharge (kWh), self-powered %.
  5. **Cost today**: per period cost, export credit, net.
  6. **Last 7 days**: a small bar chart, solar vs home per day (kWh), with weekday tick labels.
  7. **Forecast accuracy**: per target, model error % vs baseline error %, "measured over N days".
  - Sections 4–7 share **one** panel split by rules: 4 columns ≥ lg, 2 at md, 1 on mobile.
  - Then a system status line (not a heading): source name in words ("Tesla Fleet API"), last poll time, "~N requests/month", and warnings if any.
- **Layout:**
  - ≥ lg: "Right now" (about 2/3) and "Tonight" (1/3) side by side, then the chart full width, then the strip;
  - mobile: a single column in DOM order;
  - no horizontal scroll at 390 px.
- **Design rules (SPEC Rev 1):**
  - each energy type keeps its colour everywhere; pink only for money leaving or alerts; no gradient washes;
  - readings use `font-stretch: 112.5%` (Tailwind `font-stretch-semi-expanded`), weight 700–800, `tabular-nums`;
  - type scale 12/14/16/20/25/31/39/49 px;
  - no all-caps eyebrow labels, no monospace micro-labels, no "→" in buttons, no fade-up on sections, no hover lift on panels;
  - visible focus ring; h1 → h2 order; text contrast ≥ 4.5:1;
  - plain sentence-case copy.

- **Merged state of the sample** (B004, `front-end-development` 475337a):
  - `updatedAt` 2026-07-16T00:00:00Z = 5:00 PM PDT, peak period until 9 PM, 48 c/kWh;
  - live: solar 3713 W, home 2066 W, battery 0 W at 100% (Idle), grid −1647 W (Exporting);
  - tomorrow's solar is 55% of today's (cloudy);
  - so the hero must handle Idle.
- **Typography left from B001 (do it here):** add the 1.25 type scale, a 15 px body below `md`, and the readings style (semi-expanded, 700–800, `tabular-nums`). It can be utilities in markup or a few `@theme` vars in `src/styles/globals.css` (owned for that only).
- **Lint:** this machine's RTK filter can print false lint errors. Judge lint by `SKIP_ENV_VALIDATION=1 rtk proxy pnpm lint` ("No ESLint warnings or errors").

## Owned files
- Tester: `src/components/dashboard/dashboard.test.tsx`.
- Implementer: `src/components/dashboard/**` (not the test), `src/app/(protected)/home/page.tsx`, `src/app/(protected)/layout.tsx`, `src/styles/globals.css` (type-scale additions only).

## Base
- Tester: `front-end-development` (at or after 475337a, which has B001 + B002 + B004) → branch `phase2a/ui-home-test`. The tests must FAIL on the base.
- Implementer: `phase2a/ui-home-test` → branch `phase2a/ui-home-impl`.

## Judged by
- `dashboard.test.tsx` (`renderToStaticMarkup` of `Dashboard` from `~/components/dashboard/dashboard` with `sampleDashboard`):
  - all 7 h2 texts are present, in order, and the h1 is the site name;
  - "Sample data" appears when `isSample`, and not without it;
  - `connected={false}` → "Connect Tesla" plus `href="/api/auth/tesla"`; `connected={true}` → neither;
  - `showLogout` toggles "Log out";
  - the hero markup contains `formatKw(live.solarW)`, `formatKw(live.loadW)` and `` `${socPct}%` ``, plus "Exporting" or "Importing" matching the sign of `gridW`, and "Charging"/"Discharging"/"Idle" matching `batteryW` (|W| < 50 → Idle; the sample is Idle);
  - an `svg` with `role="img"` and a non-empty `aria-label` exists;
  - the recommendation `action` text is present; with `recommendation: null`, "No changes needed tonight." is present;
  - `formatKwh(today.solarWh)` and `formatMoney(costToday.netCents, currency)` are present;
  - every "kW"/"kWh" in the text is preceded by a number (no stray unit labels is fine to skip if brittle).
- Command: `rm -rf .next && pnpm test && pnpm typecheck && SKIP_ENV_VALIDATION=1 pnpm lint && SKIP_ENV_VALIDATION=1 pnpm build`, all green, lint with 0 warnings.
- **Visual check:**
  - the implementer points `DATABASE_PATH` at a scratch file in the worktree (gitignored `data/`) and runs `pnpm db:migrate`;
  - then `SKIP_ENV_VALIDATION=1 AUTH_DISABLED=true pnpm dev -p 3100` (or with a throwaway `.env` from `.env.example`; never the PO's);
  - screenshots `/home` at 390 px and 1440 px;
  - fixes anything that breaks the design rules, and lists the screenshots' paths in the handoff.
- **Worktree:** no dep changes, so link main's node_modules (it now has radix-ui/recharts) (`cmd //c mklink //J node_modules "D:\Programming Projects\voltops\node_modules"`). Run `cmd //c rmdir node_modules` before any `git worktree remove`, and never use `--force`.

## Gate log
- Tests f176485 on `phase2a/ui-home-test`: the file FAILS on base (module missing), ~20 tests. Contract: named `Dashboard({data, connected, isSample, showLogout})`; hero = markup between "Right now" and "Tonight"; Idle < 50 W; "~8,640 requests/month". Implementer spawned (skills frontend-design, dataviz, agent-browser).
- Impl cea2eb6 on `phase2a/ui-home-impl`: 165/165, typecheck, lint clean, build OK. New: `dashboard.tsx`, `flow-diagram.tsx`, `charts.tsx`; Log out moved into the header; type scale + `reading` utility + `flow` keyframes in globals.css.
  - After its screenshot critique: fixed the invisible solar series (self-referencing colour var), the ring/text overlap, spacing, and the y-axis label.
  - Deviations: hub-based flow diagram (not the corner wireframe); `Dashboard` imports `logoutAction`. The 390 px shot covered only the viewport and scroll width wasn't measured, so the reviewer checks both.
  - Reviewer spawned.
- Reviewer attempt 1 **stalled** (watchdog, no verdict) during the PO pause. Re-spawn on "continue" after checking the worktree for a leftover junction / dev server on 3100.
