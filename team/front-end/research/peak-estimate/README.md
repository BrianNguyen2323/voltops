# Research: peak-hours usage estimate + reserve advice (topic 2, 2026-10-07)

PO ask (chat, 2026-10-07):
- a tile **next to "Your home now"** with the estimated kWh used **during peak hours**, for **today and tomorrow**;
- the middleware computes it from two SQL averages:
  1. the home's average peak usage over all stored history;
  2. the average over days with **similar temperatures**.

  The two are combined into one estimate. The reason: weather drives usage (AC on hot days, heating on cold ones).
- The **advice text above the weather tile** (Tonight card) uses the estimate. Example wording: *"Raise your backup reserve to x%. With 20% as reserve for emergencies an additional x% will help you save $x for tomorrow's estimated x kWh usage during peak hours."*
- Front-end builds only the placeholder spots (sample data in the contract); the middleware team fills them.

## What exists (code read, `front-end-development` = `main` = 0c4936f)
- **UI** `src/components/dashboard/dashboard.tsx`:
  - "Right now" ends in a `sm:grid-cols-2` strip: **Grid price now | Your home now**. The new tile fits as a 3rd cell (`lg:grid-cols-3`).
  - The Tonight card renders `recommendation.action` (big text), then a "From … until …. Stores X more and saves about $Y." line, then the why-list, confidence and the weather tile. If `recommendation` is null it says "No changes needed tonight."
- **Contract** `src/lib/dashboard.ts`:
  - `recommendation` holds only free text (`action`) plus `effectWh` and `savingsCents`. There is no structured reserve %, so the PO's sentence can't be built from it reliably.
  - `timeline` rows carry `period` (peak / mid-peak / off-peak), so the actual peak Wh so far today can be **derived** from the timeline, with no new input field.
- **Middleware (all on main):**
  - `recommendation` is always `null` today (middleware SPEC Rev 1, "out of MVP");
  - `energy_intervals` holds 5-min `load_wh` (ms timestamps) and is never pruned;
  - `weather_observed` has hourly `temp_c`;
  - `weather_forecast` holds forecasts as issued, including `temp_c`, for today and tomorrow;
  - `sites` has `usable_capacity_wh` and `backup_reserve_pct`;
  - the tariff module (`src/lib/tariff`) classifies any instant as peak / mid-peak / off-peak in site-local time (SCE TOU-D-4-9PM → 4–9 PM peak).
- **Gaps found:**
  1. **Observed weather only goes back 1 day.** Open-Meteo is called with `past_days=1`, while energy history is backfilled 7 days and grows from there. The "similar temperature" average has almost no days until temperatures are backfilled. Open-Meteo's forecast API accepts `past_days` up to 92, free and keyless.
  2. **SQLite has no time zones.** The peak window is site-local (4–9 PM, DST-aware), so the SQL can't compute it alone. Working pattern for the middleware: compute each history day's peak window in JS (`tariff` + `time.ts`), pass it as a CTE `windows(day, from_ms, to_ms)`, then
     - `SUM(load_wh)` per day: `JOIN energy_intervals ON start >= from_ms AND start < to_ms`;
     - daily high: `MAX(temp_c)` from `weather_observed` over the same local day;
     - query 1 = `AVG` over all complete days;
     - query 2 = the same `AVG` filtered on `high BETWEEN target_high - band AND target_high + band`.
  3. **The chart's forecast differs.** The 48 h chart's forecast is the 7-day median per hour, with no temperature term. Its peak-window sum will differ from the new estimate. That's acceptable if the tile says what it is. Folding temperature into the chart forecast is CLAUDE.md §7 "load model v1", a later round.
- **Reserve math:**
  - extra % = peak Wh ÷ usable capacity Wh × 100, rounded up;
  - target = 20 + extra, capped at 100.

  Example: 27 kWh Powerwall pair, 11 kWh peak: 11/27 = 41% → reserve 61%.
- **Savings:** raising the reserve keeps energy in the battery for peak instead of using it off-peak. The home then buys that energy off-peak instead of at peak, so the honest saving is the covered kWh × (peak rate − off-peak rate). Covered kWh × the full peak rate overstates it.

## Sources
- Repo: `src/lib/dashboard.ts`, `src/components/dashboard/dashboard.tsx`, `src/server/snapshot/{load,build}.ts`, `src/server/db/schema.ts`, `src/lib/tariff/index.ts`, `src/lib/weather/open-meteo.ts`.
- Open-Meteo forecast API `past_days` (0–92): https://open-meteo.com/en/docs
- CLAUDE.md §7 (cold start < 7 days → "learning"; plan against p90 load), §8 (advisor output shape, advisory only).
