# B026: lint warnings + image contents (perf/size pass)

## Facts
- `SKIP_ENV_VALIDATION=1 pnpm lint` reports 2 errors + 2 warnings in 3 files:
  - `dist/worker.mjs` (2 errors): a gitignored build artifact of `pnpm build:worker`. Add `dist` to the `ignores` in `eslint.config.js`.
  - `postcss.config.js`, `prettier.config.js`: `import/no-anonymous-default-export`. Assign the object to a const and export that.
- `Dockerfile` copies `fixtures/fleet-api/*.json` (4 files) into the runtime image. Only `src/server/replay/seed.ts` reads fixtures at runtime: `calendar_history_energy.json`, `site_info.json` and `open-meteo/forecast.json`. Verify with grep (exclude tests), then copy only the files it reads.
- Lint must end with 0 errors and 0 warnings, with `pnpm build:worker` run first so `dist/worker.mjs` exists.
- Env notes:
  - link the main node_modules: `cmd /c mklink /J node_modules "D:\Programming Projects\voltops\node_modules"`. Remove it with `cmd /c rmdir node_modules` before you finish;
  - lint needs `SKIP_ENV_VALIDATION=1`; vitest can flake under load, so re-run once;
  - **COMMIT, and give the hash and branch name.**

## Owned files
`eslint.config.js`, `postcss.config.js`, `prettier.config.js`, `Dockerfile`

## Base
`middleware` (dec2f9a or later). Branch `phase2b/middleware-clean-chores`.

## Judged by
- `pnpm build:worker && SKIP_ENV_VALIDATION=1 pnpm lint`: 0 errors, 0 warnings.
- `pnpm vitest run`, `pnpm tsc --noEmit` and `pnpm build` are green.
- The diff touches only Owned files. (The lead runs the docker smoke at the gate.)
