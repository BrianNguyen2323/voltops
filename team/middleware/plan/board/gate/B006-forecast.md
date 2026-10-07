# B006: Baseline forecast + SoC projection (pure)

## Facts
- Pure TypeScript, no I/O. Alias `~` = `src/`. Energy in integer Wh, hours = UTC hour starts as epoch ms. Use the existing `localParts(ms, tz)` from `~/lib/time` (returns `{year, month, day, hour, minute, weekday}`) for site-local hour-of-day.
- `src/lib/forecast/baseline.ts` exports `forecastHours(input)`. Input:
  - `hours: number[]`: target hour starts, ascending;
  - `tz`;
  - `history: {hour: number, solarWh: number, loadWh: number}[]`: actual hourly totals of the past days (the caller passes up to 7 site-local days);
  - `observedGhi: {hour: number, ghiWm2: number}[]`: for history hours, may be empty;
  - `forecastGhi: {hour: number, ghiWm2: number}[]`: for target hours, may be empty;
  - `startSocPct`, `capacityWh`, `reservePct`.
- Output, one per target hour in order: `{hour: ISO string, loadWh, loadP10Wh, loadP90Wh, solarWh, solarP10Wh, solarP90Wh, socPct}`. All are integers, with `p10 <= value <= p90`.
- Percentiles: nearest-rank. `q(p) = sorted[ceil(p/100 × n) − 1]`, and the median is `q(50)`.
- **Load** per target hour: the history `loadWh` values at the same site-local hour-of-day. `loadWh = q50`, `loadP10Wh = q10`, `loadP90Wh = q90`. No values → all 0.
- **Solar**:
  - `k_h` = Σ solarWh / Σ ghi over history hours with the same local hour-of-day and observed ghi > 0.
  - When there are no such hours, use the overall `k` (the same sum over all history hours with ghi > 0).
  - When there is a usable `k` AND a forecast GHI for the target hour: `solarWh = round(k_h × forecastGhi)`. Then:
    - per-day ratios `r_d` = (actual day Σ solar) ÷ (Σ k_h × observed ghi that day), over the days where the predicted value is > 0; "day" = site-local date of the hour;
    - `solarP10Wh = min(solarWh, round(solarWh × q10(r)))`, `solarP90Wh = max(solarWh, round(solarWh × q90(r)))`;
    - no ratios → p10 = p90 = value.
  - Otherwise use the load rule (q50/q10/q90 of history solar at that hour-of-day).
- **SoC projection** (start-of-hour value):
  - `energy = startSocPct/100 × capacityWh`. For each hour in order: `socPct = round(energy / capacityWh × 100)`, clamped to 0–100.
  - Then `net = solarWh − loadWh` (point values): surplus → `energy += min(net, capacityWh − energy)`; deficit → `energy −= min(−net, max(0, energy − reservePct/100 × capacityWh))`.
  - Add the comment `// ponytail: no inverter power cap`.
- The first target hour's `socPct` = round(startSocPct).
- Include a DST case: America/Los_Angeles target hours spanning 2026-11-01 (the 01:00 local hour occurs twice; both map to hour-of-day 1).
- Env notes: worktrees have no node_modules. Link main's from PowerShell: `cmd /c mklink /J node_modules "D:\Programming Projects\voltops\node_modules"`. Remove nothing. Lint needs `SKIP_ENV_VALIDATION=1`.

## Owned files
- Tester: `src/lib/forecast/baseline.test.ts`
- Implementer: `src/lib/forecast/baseline.ts`

## Base
Tester: `main`. Implementer: the tester's branch.

## Judged by
- `pnpm vitest run src/lib/forecast`: green. The tests cover the percentile rule, the k_h + fallback k path, the naive path (no GHI), empty history → zeros, the p10 ≤ value ≤ p90 invariant on every row, SoC capping at capacity and at the reserve, and the DST day;
- the full `pnpm vitest run` green, `pnpm typecheck`, `SKIP_ENV_VALIDATION=1 pnpm lint` exit 0.
