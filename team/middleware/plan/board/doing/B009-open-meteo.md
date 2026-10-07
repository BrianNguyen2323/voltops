# B009: Open-Meteo client + mapper (+ recorded fixture)

## Facts
- Open-Meteo needs no key and no account (CLAUDE.md D8). Tests must not hit the network: inject `fetch`. The **tester** records ONE real response as a fixture with curl, using a public landmark location (Los Angeles City Hall, `latitude=34.05&longitude=-118.24`), never the PO's location:
  `curl -s "https://api.open-meteo.com/v1/forecast?latitude=34.05&longitude=-118.24&hourly=temperature_2m,cloud_cover,shortwave_radiation,precipitation,precipitation_probability&past_days=1&forecast_days=3&timezone=UTC&timeformat=unixtime" -o fixtures/open-meteo/forecast.json`
  Record the fetch time (epoch ms) in `fixtures/open-meteo/README.md`.
- Response shape: `hourly.time` is an array of unix seconds (with `timeformat=unixtime`), with parallel arrays per variable. Values may be `null`.
- **`shortwave_radiation` (W/m²) at time T is the mean of the PRECEDING hour.** So the GHI for the hour *starting* at H is the value at H+1h. The other variables are used at H as-is.
- `src/lib/weather/open-meteo.ts`:
  - `mapForecast(json, fetchedAtMs)` (pure, zod-validated) → `{observed: Row[], forecast: Row[]}`.
    - `Row = {hour: ms (UTC hour start), tempC, cloudPct, ghiWm2, precipMm, precipProbPct}`;
    - nulls become `0` for `precipMm`/`precipProbPct`; a row whose temp/cloud/ghi is null is dropped;
    - the last hour, which has no H+1 radiation value, is dropped;
    - `observed` = rows with `hour + 1h <= fetchedAtMs`; `forecast` = the rest.
  - `fetchWeather({fetch, lat, lon, now})` builds the URL above (lat/lon with 2 decimals) and returns `mapForecast(json, now)`.
  - Errors: a non-2xx or a zod failure → `throw new Error("open-meteo: <status | 'bad response'>")`.
- Env notes: worktrees have no node_modules. Link main's from PowerShell: `cmd /c mklink /J node_modules "D:\Programming Projects\voltops\node_modules"`. Lint needs `SKIP_ENV_VALIDATION=1`.

## Owned files
- Tester: `fixtures/open-meteo/forecast.json`, `fixtures/open-meteo/README.md`, `src/lib/weather/open-meteo.test.ts`
- Implementer: `src/lib/weather/open-meteo.ts`

## Base
Tester: `main`. Implementer: the tester's branch.

## Judged by
- `pnpm vitest run src/lib/weather`: green. The tests cover the 1-hour GHI shift, the observed/forecast split, null handling, the URL (2-decimal coords, params), the non-2xx error and a bad-shape error;
- the full `pnpm vitest run` green, `pnpm typecheck`, `SKIP_ENV_VALIDATION=1 pnpm lint` 0 warnings.
