# B037 — Equipment health measurements (hand-off from front-end, 2026-10-08)

## Facts
- Contract: front-end SPEC Rev 8, field `equipmentHealth` (minus `backfill`, which is B038). The front-end view owns the thresholds and status. The middleware supplies **measurements only**. null = learning.
- Research and method: `team/front-end/research/system-info/HEALTH.md`. A pure module (no I/O) in the advisor/forecast style, fed by SQL GROUP BY reads (ADR 0001), tested on fixtures and synthetic data:
  - **solarClearDay:**
    - clear hours = `weather_observed.cloud_pct <= 10` and `ghi_wm2 >= 600`;
    - the ratio = the hour's solar Wh / ghi;
    - take the monthly median for the last complete month vs the same month a year earlier, as `pctOfBaseline` (rounded);
    - null when either month has < 20 clear hours.
  - **sunnyDayMiss:**
    - a clear day = daytime mean cloud ≤ 15%;
    - expected Wh = Σ hourly ghi × that site's median ratio for the hour of day, over the trailing 60 days;
    - flag the most recent day in the last 7 with actual < 75% of expected;
    - null otherwise, or with < 14 days of data.
  - **batteryCapacity:**
    - a swing = a monotonic SoC run (from `samples`, hourly today) moving ≥ 40 points;
    - Wh moved = Σ `battery_discharge_wh` (or charge) over that span from `energy_intervals`;
    - estimate = Wh / points × 100. Correct for the conversion loss: use discharge swings only, which are measured on the AC side; document the choice;
    - take the median over the last complete month;
    - null with < 5 swings.
  - **efficiency:** last complete month, Σ discharge / Σ charge × 100, rounded; null with < 10 days of data.
- Units: Wh integers, % integers, `YYYY-MM` months site-local (CLAUDE.md §5). DST days need tests.

## Judged by
- Each measurement has a synthetic-data test with a known answer, plus its learning/null threshold.
- The sample DB (replay) yields non-null values once it holds enough weeks.
- The full gate is green.
