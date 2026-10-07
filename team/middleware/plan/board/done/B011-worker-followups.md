# B011: Worker follow-ups (B003 review findings)

## Facts
- The worker is on main: `src/worker/jobs.ts` (`syncEnergy`, `takeSample`, `syncWeather`, `runTesla`, `runWeather`, `applySiteSettings`, `dayRange`) and `src/worker/main.ts` (a 60-s tick; settings parsed with the zod entries from `src/env.schema.js`). Tests: `src/worker/jobs.test.ts` (temp DB, fake DataSource, fake fetch).
- Fix 1, `syncEnergy` order and isolation: fetch **today first**, then the past days newest → oldest. Catch errors **per day**:
  - keep going after one day fails;
  - after all days, if any failed, rethrow the first error so the job wrapper logs it once (same log format).
  - Today's fetch must not be skipped because a backfill day hit a 429.
- Fix 2, blank env coords: `SITE_LATITUDE=` / `SITE_LONGITUDE=` (empty string) must count as **unset**, not 0. Treat `""` as undefined before the zod coerce, in `main.ts` (or with a `z.preprocess` in `env.schema.js`). `TEMPERATURE_UNIT=""` must also count as unset.
- Fix 3, no credentials → idle: the idle check is "no `credentials` row OR no `fleet-api` site" → log `[worker] no fleet-api site; idle` once per start and skip the Tesla jobs. Weather still runs for sites with lat/lon.
- Fix 4, smoke image name: `scripts/docker-smoke.sh` measures `img=voltops-smoke-web`, but compose now tags the build `voltops:local`. Measure `voltops:local` so the ≤ 400 MB gate checks the fresh image.
- Not in scope: minute-2 on the UTC hour is fine (`// ponytail:` comment if you touch it).
- Env notes:
  - link main's node_modules with `cmd /c mklink /J node_modules "D:\Programming Projects\voltops\node_modules"`, and remove it with `cmd /c rmdir node_modules` before finishing; never `git worktree remove --force` with a junction;
  - lint needs `SKIP_ENV_VALIDATION=1`;
  - **commit before handing off.**

## Owned files
- Tester: `src/worker/jobs.test.ts`, plus a new `src/worker/main.test.ts` (only if you test the env parsing/idle check via an exported helper)
- Implementer: `src/worker/jobs.ts`, `src/worker/main.ts`, `src/env.schema.js`, `scripts/docker-smoke.sh`

## Base
Tester: `main`. Implementer: the tester's branch.

## Judged by
- `pnpm vitest run src/worker`: green. New tests cover:
  - today fetched first, and a failing past day doesn't stop the others or today; the error is still logged once;
  - empty-string coords/unit → unset;
  - no credentials row → Tesla jobs skipped and the idle line logged once.
- Full `pnpm vitest run`, `pnpm typecheck`, `SKIP_ENV_VALIDATION=1 pnpm lint` exit 0, `pnpm test:scripts` green, `pnpm build:worker` OK.
- `grep -n "voltops:local" scripts/docker-smoke.sh` shows the size check uses it.
