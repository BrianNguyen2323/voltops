# B005 — Hotfix: an empty DATABASE_PATH silently uses a throwaway DB

## Facts
- Found in the PO review (2026-10-05). The PO's `.env` had `DATABASE_PATH=` (empty). Compose `env_file` passed `""` into the container, overriding the image's `ENV DATABASE_PATH=/data/voltops.db`.
- `src/server/db/index.ts:22` and `scripts/migrate.mjs:7` use `process.env.DATABASE_PATH ?? "./data/voltops.db"`, and `??` doesn't catch `""`.
- better-sqlite3 opens `""` as a temporary DB, so migrations and data vanish silently. `/data` in the container stayed empty.
- `src/env.js` already treats empty strings as undefined (`emptyStringAsUndefined`); only these two raw reads are wrong.
- Fix:
  1. Treat empty as unset in both places (`||`).
  2. `compose.yaml` service `web`: add `environment: DATABASE_PATH: /data/voltops.db`. `environment` overrides `env_file`, so a `.env` value can't move the DB off the volume. This was also B004 review nit 12.
  3. `.env.example`: a comment saying Docker Compose interpolates `$` in values. Wrap any secret containing `$` in single quotes.

## Owned files
- **Tester:** `src/server/db/*.test.ts`, `scripts/*.test.mjs`, `scripts/docker-smoke.sh`.
- **Implementer:** `src/server/db/index.ts`, `scripts/migrate.mjs`, `compose.yaml`, `.env.example`.

## Base
`database-docker`. Branches `phase1/db-path-tests` → `phase1/db-path-impl`.

## Judged by
`pnpm test && pnpm test:scripts && pnpm typecheck && SKIP_ENV_VALIDATION=1 pnpm build` (`rm -rf .next` first), plus `bash scripts/docker-smoke.sh` exits 0 (run from a worktree on D:). Tests cover:
- the default `db` with `DATABASE_PATH=""` opens a real file at the default path, not a temp DB;
- `migrate.mjs` with `DATABASE_PATH=""` creates the default file;
- the smoke script's dummy `.env` includes an empty `DATABASE_PATH=` line, and the WAL check on `/data/voltops.db` still passes.
