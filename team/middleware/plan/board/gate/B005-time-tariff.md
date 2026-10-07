# B005: Site-local time helpers + tariff module (pure)

## Facts
- Pure TypeScript, no I/O, using `Intl` only (no new deps). Alias `~` = `src/`. Money is in integer cents, energy in integer Wh, timestamps ISO-8601 UTC or epoch ms. `TouPeriod = "off-peak" | "mid-peak" | "peak"` is exported from `~/lib/dashboard`.
- `src/lib/time.ts`:
  - `localParts(ms, tz)` → `{year, month (1-12), day, hour, minute, weekday}` with **weekday 0 = Monday … 6 = Sunday**;
  - `localDate(ms, tz)` → `"YYYY-MM-DD"`;
  - `addDays(date, n)` on `YYYY-MM-DD` strings;
  - `localMidnight(date, tz)` → UTC ms of local 00:00 on that date. It is DST-safe; e.g. `America/Los_Angeles` 2026-03-08 → 2026-03-08T08:00Z, and the next midnight is 23 h later; 2026-11-01 is 25 h.
- Input tariff: Tesla's `site_info.tariff_content` JSON, as stored in `tariff_schedule.content`. Real example: `fixtures/fleet-api/site_info.json` → `response.tariff_content` (SCE TOU-D-4-9PM). Validate it with zod; anything unparseable → `null` from a `parseTariff(json)` helper.
- Season: `seasons[name] = {fromMonth, fromDay, toMonth, toDay, tou_periods}`, inclusive, and it may wrap the year (Winter 10/1 → 5/31). Seasons with an empty object or no `tou_periods` never match.
- Period: `tou_periods[NAME]` is an array of `{fromDayOfWeek, toDayOfWeek, fromHour, fromMinute, toHour, toMinute}`.
  - Day of week 0 = Monday … 6 = Sunday. Evidence: the SCE summer weekday ON_PEAK is 0–4 and the weekend PARTIAL_PEAK is 5–6.
  - The time window is `[from, to)` in site-local time and wraps midnight when from ≥ to (OFF_PEAK 21:00→16:00).
  - No match → `off-peak`.
- Name map: `ON_PEAK`→`peak`, `PARTIAL_PEAK`→`mid-peak`, everything else → `off-peak`.
- Rates: `energy_charges[season][NAME]` in $/kWh (+ `energy_charges.ALL.ALL` when it is a number), ×100 → cents per kWh. Export: the same lookup on `tariff_content.sell_tariff`; when it is absent → 0.
- `tariffAt(tariff, ms, tz)` → `{period, importCentsPerKwh, exportCentsPerKwh, endsAt}`.
  - `endsAt` (ISO UTC) = the first later 15-minute step where the period differs, searching up to 8 days, else +8 days.
  - Add a `// ponytail: 15-min scan` comment.
  - Fixture checks (America/Los_Angeles):
    - 2026-07-15 (Wed) 17:00 local → peak, 58.972 c, endsAt 21:00 local;
    - 2026-07-18 (Sat) 17:00 → mid-peak 47.816;
    - 2026-10-06 (Tue) 22:00 → mid-peak (Winter PARTIAL_PEAK 21→8) 39.406, endsAt 08:00 next day;
    - 2026-10-06 10:00 → off-peak 35.776.
- `costToday(tariff, hours, tz)`: `hours` = today's actual hours `{hour: ISO, gridImportWh, gridExportWh}`; each hour is priced at its start instant.
  - Returns `{periods, exportCreditCents, netCents}`;
  - `periods` = always 3 entries in the order off-peak, mid-peak, peak, each `{period, importWh: Σ, costCents: round(Σ importWh × importCents / 1000)}` (round per period);
  - `exportCreditCents = round(Σ exportWh × exportCents / 1000)`;
  - `netCents = Σ costCents − exportCreditCents`;
  - Σ `importWh` must equal the input's total import.
- Env notes: worktrees have no node_modules. Link main's from PowerShell: `cmd /c mklink /J node_modules "D:\Programming Projects\voltops\node_modules"`. Lint needs `SKIP_ENV_VALIDATION=1`.

## Owned files
- Tester: `src/lib/time.test.ts`, `src/lib/tariff/tariff.test.ts`
- Implementer: `src/lib/time.ts`, `src/lib/tariff/index.ts`

## Base
Tester: `main`. Implementer: the tester's branch.

## Judged by
- `pnpm vitest run src/lib/time.test.ts src/lib/tariff`: green, including the DST days (2026-03-08, 2026-11-01) and a wrap-around season/period;
- the full `pnpm vitest run` green, `pnpm typecheck`, `SKIP_ENV_VALIDATION=1 pnpm lint` 0 warnings.
