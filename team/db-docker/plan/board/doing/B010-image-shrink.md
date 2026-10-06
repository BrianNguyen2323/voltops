# B010 — Image shrink + smoke size gate (tester → implementer)

## Facts
SPEC Rev 4, "Optimization round 1":
- The `web` image is 898 MB today. Target: **≤ 400 MB**, measured as `docker image inspect <image> --format '{{.Size}}'` (bytes, so divide by 1048576). With the smoke project `-p voltops-smoke`, the image is `voltops-smoke-web`. Confirm with `docker compose -p voltops-smoke images`.
- Today's Dockerfile: the build stage runs `pnpm install` (python3/make/g++ installed, because pnpm 9 runs node-gyp despite prebuilds), then `STANDALONE=1 SKIP_ENV_VALIDATION=1 pnpm build && pnpm prune --prod && rm -rf .next/standalone/node_modules`. The runtime copies the **whole pruned node_modules** plus the standalone output, `.next/static`, `public`, `drizzle/`, `scripts/migrate.mjs`, `scripts/check-env.mjs` and `src/env.schema.js`. CMD: `node scripts/check-env.mjs && node scripts/migrate.mjs && node server.js`.
- Runtime needs:
  - `server.js` (standalone trace). `next.config.js` has `serverExternalPackages: ["better-sqlite3", "@node-rs/argon2"]`; check that the trace includes their linux native `.node` files.
  - `check-env.mjs` + `migrate.mjs`, which import `zod`, `drizzle-orm`, `better-sqlite3`.
- Ideas (verify, don't trust):
  - keep the standalone `node_modules`, and add only the migrate/check-env deps (e.g. a tiny separate install of the exact lockfile versions in a deps stage, or copy those packages out of the pnpm store);
  - drop musl `@next/swc-*` / `sharp` copies;
  - no toolchain in the runtime stage.
- Add a Dockerfile comment explaining why the build stage has python3/make/g++.
- Smoke (`scripts/docker-smoke.sh`) changes:
  1. after the build, fail if the image is larger than `MAX_IMAGE_MB` (env, default 400), and print the actual MB either way;
  2. wrap check (c) (`docker compose run --rm --no-deps -e VOLTOPS_SECRET_KEY= web`) in `timeout 60`, so a missing check-env fails instead of hanging. A `timeout` exit status (124) counts as a fail.
- Everything the smoke test already asserts must still pass: boot, the WAL DB persists across restart, healthy, the `/api/auth/tesla` redirect_uri, fail-fast (c).
- Windows notes:
  - run from the repo path on D: (Docker bake refuses a Temp-folder build context);
  - the PO's own container holds port 3000, so **always use `SMOKE_PORT=3100`**;
  - never touch the PO's `voltops` compose project, container, or `voltops-data` volume. Only `-p voltops-smoke`.
- Worktree:
  - if you don't change deps, link main's node_modules: `cmd //c mklink //J node_modules "D:\Programming Projects\voltops\node_modules"`;
  - never copy the PO's `.env` into the worktree; the smoke script makes a throwaway one.

## Owned files
- Tester: `scripts/docker-smoke.sh`.
- Implementer: `Dockerfile`, `.dockerignore`, and `next.config.js` (only if needed for the trace). If you must change `package.json`/`pnpm-lock.yaml`, say why in the handoff.

## Base
- Tester: `optimization-round` → branch `phase1/image-shrink-test`. Show that the new size check FAILS on the current Dockerfile (report the MB).
- Implementer: `phase1/image-shrink-test` → branch `phase1/image-shrink-impl`.

## Judged by
- `SMOKE_PORT=3100 bash scripts/docker-smoke.sh` prints PASS with the image ≤ 400 MB (report the number).
- `pnpm test:scripts`, `pnpm typecheck` and `SKIP_ENV_VALIDATION=1 pnpm lint` are green.

## Gate log
- Tester 742127a on `phase1/image-shrink-test`: adds the `MAX_IMAGE_MB` gate (default 400) and `timeout 60` on (c); `bash -n` OK. **Not yet shown failing:** Docker Desktop crashed mid-run ("unable to start"). Blocked on the PO restarting Docker (TODO). Then I run `SMOKE_PORT=3100 bash scripts/docker-smoke.sh` on the test branch myself to confirm the FAIL, and spawn the implementer.
- Note: PowerShell `$env:SMOKE_PORT` does not reach bash; use `SMOKE_PORT=3100 bash ...`.
