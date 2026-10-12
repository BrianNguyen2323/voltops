# B038: Request counter + one-time history backfill + archive weather

Hand-off from front-end (2026-10-08, front-end SPEC Rev 8 "Backfill budget"). PO condition: one time only, inside Tesla's free requests, leaving enough for normal use. Lead plan: SPEC Rev 4 → "Request budget + backfill" (Q4 A: UTC months). Read it first. The snapshot fields (`backfill`, `estRequestsPerMonth`) are B042, not here.

## Facts
- Tesla (developer.tesla.com billing-and-limits, checked 2026-10-08): ~5,000 free Data requests a month; any status < 500 is billed; 60 req/min per device.
- **Counter** in `src/lib/sources/fleet-api/client.ts` `call`: after a response with `status < 500`, upsert `fleet_requests` for the current UTC month (`YYYY-MM` from `deps.now()`), `total += 1`, in one synchronous statement (`INSERT … ON CONFLICT(month) DO UPDATE SET total = total + 1`). Network failures and ≥ 500 don't count. The token endpoint doesn't count.
- **Env** (`src/env.schema.js`, `.env.example` with a comment on the budget): `TESLA_BACKFILL_MAX_PER_MONTH` int ≥ 0, default 2500 (0 = off); `TESLA_MONTHLY_REQUEST_CAP` int ≥ 1, default 4500. The worker parses them once, like `parseSiteSettings`.
- **`src/worker/backfill.ts`** (new):
  - `backfillStep(deps, limits)`: SPEC Rev 4 steps 1–5, for the first `fleet-api` Site with `installedOn`. **At most 1 Tesla request per call.** It uses `energyHistory(db, site).isComplete`/`putIntervals` and `dayRange` from `jobs.ts`. After a successful fetch: `backfill += 1` for the UTC month, then the cursor steps back. On an error the cursor stays and the error propagates to `guarded`;
  - `backfillState(db, site, limits, now)` → `{ state, daysDone, daysTotal }` per SPEC Rev 4 (B042 wires it into the snapshot);
  - day arithmetic via `addDays`/`localDate` from `src/lib/time.ts`.
- **`src/worker/main.ts`**: call `backfillStep` every tick, after the hourly jobs, through `guarded("backfill", …)` and only when `!isTeslaIdle(db)`.
- **Weather** (`src/server/history/index.ts` `weatherGaps`, `src/worker/jobs.ts` `fillWeatherGaps`, `src/lib/weather/open-meteo.ts`):
  - `weatherGaps` returns every gap day (drop the 92-day floor);
  - gaps within 92 UTC days: today's forecast-API path, unchanged;
  - older gaps: **one** archive request per run for `[oldest, newest older]` (`fetchArchive` in `open-meteo.ts`, URL in SPEC Rev 4), keep only gap days, `putObserved`;
  - `mapForecast`'s schema makes `precipitation_probability` optional (0 when absent), so the archive reuses it. Archive response shape verified 2026-10-12: `hourly.time` unix seconds plus `temperature_2m`, `cloud_cover`, `shortwave_radiation`, `precipitation`.
- Tests: fake `DataSource`, fake `fetch`, fixed `now`. **No network.**
- Env notes:
  - link the main node_modules: `cmd /c mklink /J node_modules "D:\Programming Projects\voltops\node_modules"`. Remove it with `cmd /c rmdir node_modules` before you finish. Never `git worktree remove --force` while it exists;
  - lint needs `SKIP_ENV_VALIDATION=1`; vitest can flake under load, so re-run once; test files must lint clean too;
  - run `pnpm format:check`;
  - **COMMIT before handing off, and give the commit hash and branch name.**

## Owned files
- Tester: `src/worker/backfill.test.ts` (new), `src/lib/sources/fleet-api/client.test.ts`, `src/worker/jobs.test.ts` (gap-fill cases), `src/lib/weather/open-meteo.test.ts`, `src/server/history/index.test.ts` (`weatherGaps` only).
- Implementer: `src/worker/backfill.ts` (new), `src/worker/main.ts`, `src/worker/jobs.ts`, `src/lib/sources/fleet-api/client.ts`, `src/lib/weather/open-meteo.ts`, `src/server/history/index.ts` (`weatherGaps` only), `src/env.schema.js` (the 2 keys), `.env.example` (the 2 keys).

## Base
- Tester: `middleware`, branch `phase2b/middleware-backfill-tests`.
- Implementer: the tester's branch rebased onto `middleware` **after B039 and B036 merge** (both touch `env.schema.js` and the history module), branch `phase2b/middleware-backfill`.

## Judged by
- Counter: 200 and 404 count; 500 and a network failure don't; a new UTC month starts a new row.
- Backfill:
  - the budget stops at both caps (`backfill >= MAX`, `total >= CAP`) with no request made;
  - a month rollover resumes;
  - complete days are skipped without a request;
  - `done` persists across a fresh `backfillStep` call (a "restart") and makes no request;
  - at most 1 request per call;
  - MAX 0 → `off` and no request;
  - an error leaves the cursor;
  - `backfillState` counts on a 10-day install.
- Weather: an old gap triggers one archive request, a recent gap the forecast path; the archive mapper handles the missing `precipitation_probability`.
- Full `pnpm vitest run`, `pnpm test:scripts`, tsc, lint, `pnpm format:check`, `pnpm build:worker` and `pnpm build` are green.
