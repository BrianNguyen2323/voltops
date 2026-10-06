# Architecture friction review: VoltOps /home dashboard

Skill vocabulary: module, interface, implementation, depth, seam, adapter, leverage, locality, deletion test.
Read-only review at `front-end-development` (e375372). No code changed. Line refs are to that commit.

## Shape today

- `data.ts` (274 lines) is three modules in one file: the `DashboardData` interface (1-82), a tariff rule + sample constants (84-94, 170-176), and a battery dispatch simulation that builds `sampleDashboard` (96-274).
- `dashboard.tsx` (378) is one big module: layout, six panels, and derived-number logic (day-2 solar, % less sun, home cost lines).
- `flow-diagram.tsx` and `charts.tsx` are rendering modules with domain rules embedded. `cost-now.ts` (18 lines) and `format.ts` (17) are small pure modules.
- The only seam that matters is `DashboardData`. Its only adapter today is the sample simulation, hard-wired in `page.tsx:12`. The middleware team will be the second adapter, so the seam is about to become real.

## Candidates (ranked)

### 1. `DashboardData` has a much bigger interface than its type: hidden indexing rules and stored-but-derivable numbers (Strong)

Files: `dashboard.tsx:91-94`, `data.ts:33-44, 144-149, 193-199, 233`, `charts.tsx:135-161`, `data.test.ts:169-280, 363`.

Problem:
- `timeline` really means "48 rows, hour-aligned, first 24 = site-local today, last 24 = tomorrow, actuals strictly before forecasts". Nothing states this. `dashboard.tsx:91-94` hard-codes `slice(0,24)` / `slice(24,48)` for the "x% less sun than today" line, and a test ties `weatherTomorrow.date` to "row 24". An adapter whose timeline starts at the current hour, or has a 23/25-hour DST day, yields a wrong comparison with no error.
- `live` mixes instants: power is "the hour just completed", SoC is "first forecast row" (`data.ts:144, 196-198`). That is a simulation artefact the contract does not document.
- Derived numbers are both stored and recomputable: `today.*`, `costToday.*`, `selfPoweredPct`, `last7Days[6]` duplicate sums over `timeline`, and `Dashboard` re-sums solar from `timeline` itself. Two adapters will compute these two ways, and the page can show "Today solar 40 kWh" beside a comparison built from a different sum.
- The invariants (power balance, ordering, p10<=v<=p90) are tested only against the sample, not as something a second adapter's output can be checked against.

Solution: decide which numbers are inputs and which are derived, and derive the derived ones in one place (day sums, comparison with today, self-powered %). State the timeline day rule where the type is defined, or carry explicit day boundaries computed from the site timezone instead of an index convention. Turn the invariant checks in `data.test.ts` into something any adapter's output can run through.

Benefits:
- Locality: "what do today and tomorrow mean" lives in one place, not the sim, `Dashboard`, `charts.tsx` and a test.
- Leverage: Plan and Trends read `timeline` too and get day sums instead of copying `slice(24,48)`.
- Tests: the invariant suite becomes the acceptance test for the middleware team's adapter; today it certifies only the fake.

Before: the UI and every adapter must separately know "row 24 is tomorrow". After: one module answers today/tomorrow solar and their comparison from timeline + timezone; the UI asks.

Deletion test: delete `dashboard.tsx:91-94` and the day-boundary complexity reappears in each screen that compares days, so it belongs behind the seam.

### 2. Tariff and TOU knowledge is scattered and baked into the sample (Strong, timing-dependent)

Files: `data.ts:88-94, 170-188, 204-209`, `cost-now.ts:1-18`, `charts.tsx:154-161`, `dashboard.tsx:96-131, 172-173`, `schema.ts:44-54` (`tariffSchedule.content` is untyped JSON).

Problem: "the current TOU price" takes four places. `periodOf` and the rate table live in the sample's `data.ts`; `costNow` applies rates to live power; `charts.tsx` re-derives peak runs from `row.period`; `dashboard.tsx` re-derives `bought = max(gridW,0)` and `loadW - bought` (`:98, :116`), duplicating `costNow`'s `bought` (`cost-now.ts:8, :14`). Per-period cost maths (`data.ts:177-188`) and `costNow` are two implementations of "energy x rate -> cents" with the same rounding. The explanation strings ("Solar and battery cover X...") are built in the UI from numbers `costNow` already had. When the real tariff arrives, the period rule and rates move, and they are buried in the fake data file next to the simulation.

Solution: treat tariff as its own module (period at a time, rate at a time, next change, cost of an energy amount) used by both the sample adapter and the real adapter; `costNow`, the per-period cost table and the chart's peak bands get answers from it. Have `costNow` return everything the UI shows (amounts and the grid/covered split) so the UI stops re-deriving them.

Benefits:
- Locality: tariff rules and rounding in one place; a rate or boundary change touches one module.
- Leverage: costNow, cost-today, the future Plan savings and the advisor share one cost maths.
- Tests: `cost-now.test.ts` (5 cases) and the cost rows in `data.test.ts:245-272` (which just restate the formula) collapse into one tariff test set.

Before: rate table in sample data, formula in two spots, UI re-derives the split. After: one tariff module; `costNow` hands the UI finished lines. `costNow` is shallow today (18 lines; `dashboard.tsx` already does half its job), so this deepens it rather than deleting it.

YAGNI caution: do not design the full `tariff` package now. Gather only the existing duplicated rules, and ask the middleware team what shape `tariffSchedule.content` will take first.

### 3. Time formatting and site-local time are re-implemented in three places (Worth exploring)

Files: `dashboard.tsx:38-43` (`clock`), `charts.tsx:26-37` (`hourLabel`, `localHour`), `charts.tsx:295-298` (week label forced to UTC), `data.ts:86` (hard-coded PDT midnight).

Problem: three `Intl.DateTimeFormat("en-US", ...)` wrappers, none in `format.ts`, where the other formatters live. "Site-local" is a convention each caller re-applies by threading `tz` through props (`Dashboard` -> `TimelineChart` -> `TimelineTooltip`). The week chart uses `T12:00:00Z` as a different zone-avoidance trick. Tick choice `localHour % 6 === 0` (`charts.tsx:162`) is wrong for half-hour-offset zones and unexamined on 23/25-hour DST days (CLAUDE.md requires DST tests; the dashboard has none). `format.ts` has no direct test file.

Solution: gather the time formatters and local-hour/local-date helpers into the same place as the other formatters, all taking the site timezone, with one test file that includes a DST day.

Benefits: locality for zone/DST bugs; leverage for Plan/Trends (more time axes coming); `format.ts` gains real tests. Low effort, closer to a tidy-up. `format.ts` itself is shallow but fine (tiny, stable, many callers); do not merge it into anything.

### 4. Sign convention and "what is the battery/grid doing" are applied in five places (Worth exploring)

Files: `flow-diagram.tsx:11, 32-35, 51, 145-153, 181, 198`, `dashboard.tsx:98`, `cost-now.ts:8, 16`, `lib/tesla.ts:9-16`.

Problem: `IDLE_W = 50`, `batteryState`, `gridState` live in the SVG module. Both state functions are exported but imported nowhere (only `flow-diagram.tsx:145-146`); tests reach them via markup regexes (`dashboard.test.tsx:139-166`). Rules disagree at zero: `gridState(0)` says "Importing", `costNow` treats 0 as neither buying nor selling, colours use `gridW > 0`. The sign convention (battery > 0 discharging, grid > 0 importing) is re-applied in the diagram, cost maths and the dashboard. For the real data path, `PowerwallReading` is float kW with `*_kw` names, while `live` is integer W; the conversion and the balance invariant (`data.test.ts:17`) are the middleware team's to own, so tell them the target shape and invariant explicitly.

Solution: one place answers "what is this flow doing" (direction, idle or not, word, buying/selling), used by the diagram, `costNow` and the aria label.

Benefits: locality for sign and threshold rules; the 49 W / 50 W boundary becomes a plain rule test, not render-and-regex. Weaker today because it is small; it grows if Plan/Trends or the advisor need the same words.

### 5. `sampleDashboard` is the only adapter and is tested by re-deriving itself (Speculative)

Files: `data.ts:96-274`, `data.test.ts:200-280`, `page.tsx:11-14`.

Problem: once real data lands, the simulation becomes a demo/`replay` fixture. `data.test.ts:200-280` recomputes per-row flows to check the sim, so the test restates the implementation. Low-value but also low-risk because it is a fixture.

Solution: when the middleware lands, name it as the sample adapter and keep only the invariant checks from candidate 1. Do nothing now.

## What I would do first

Candidate 1. It fixes the seam the other team is about to build against; getting day/timeline semantics wrong is paid by them and by Plan/Trends. Concretely: agree what is input vs derived and write the today/tomorrow rule down before they wire data. Candidates 2-4 are then cheap and local; do 2 once the real tariff shape is known, 3 opportunistically when Plan/Trends adds time axes. Skip 5.

## Untested or hard to test through the current interface

- Day-1/day-2 sums and the "x% less/more sun" line: only via full-page markup (`dashboard.test.tsx:471-500`); no DST day, no timeline that does not start at local midnight.
- `TimelineChart` internals: Recharts is client-side, so `renderToStaticMarkup` covers legend/caption only (`dashboard.test.tsx:512-532`); the peak-band, Now-line and tick logic (`charts.tsx:135-164`) are untested.
- `WeekChart` labels and `format.ts`: no direct tests.
- Contract invariants run only against the sample, not any adapter output.
- The 50 W idle threshold is tested through markup regex, not at the rule.
