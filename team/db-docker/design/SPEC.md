# SPEC — Database adjustments + Docker (SQLite file)

Revision 4

## Goal
VoltOps runs self-hosted with `docker compose up`: one `web` container plus one SQLite file on a named volume. Single owner. Supabase/Postgres and the Netlify app deploy are gone. (CLAUDE.md D1, D2, D4, D6, D10.)

## Decisions (Decision round 1, see R001)
Q1 Docker Compose · Q2 SQLite WAL via Drizzle (driver `better-sqlite3`, Q2b A) · Q3 no `energy_hourly` table, ADR 0001 · Q4 re-login, no data migration · Q5 localhost redirect URI accepted by Tesla · Q6 admin password now (D10) · Q7 scope as recommended · Q8 Netlify serves static files only.

## Database
- File: env `DATABASE_PATH`, default `./data/voltops.db` (compose: `/data/voltops.db`). Create the parent dir if missing.
- On open: `PRAGMA journal_mode=WAL; foreign_keys=ON; busy_timeout=5000`.
- Drizzle `sqlite-core`, no table prefix. Migrations: `drizzle-kit generate` → `drizzle/` (committed, never edit an applied one). Applied by `scripts/migrate.mjs` (the container runs it at start; `pnpm db:migrate` locally).
- Conventions: timestamps are `integer` UTC ms (`mode: "timestamp_ms"`), W/Wh are integers, JSON goes in `text` (`mode: "json"`).

### Tables
| table | columns | notes |
|---|---|---|
| `admin` | `id` int pk CHECK(id=1), `password_hash` text NOT NULL, `created_at` | one row max |
| `credentials` | `id` int pk CHECK(id=1), `encrypted_refresh_token` text NOT NULL, `iv` text NOT NULL, `scope` text, `access_token_expires_at`, `updated_at` | single Tesla account; AES-256-GCM as in `src/lib/crypto.ts` |
| `sites` | `id` int pk autoincrement, `source` text NOT NULL ('fleet-api'), `external_id` text NOT NULL UNIQUE, `name` text, `timezone` text, `latitude` real, `longitude` real, `usable_capacity_wh` int, `created_at`, `updated_at` | lat/lon are entered by the user later (Tesla gives none) |
| `tariff_schedule` | `site_id` int pk FK→sites ON DELETE CASCADE, `tariff_id` text, `name` text, `utility` text, `currency` text, `content` text json, `updated_at` | one per site, refreshed on connect |

Removed: `users` (multi-tenant), `tesla_token` (→ `credentials`). Deferred: `settings` (no consumer yet), and all Phase 2 tables.

## Env (`src/env.js` + `.env.example`)
Remove `DATABASE_URL`. Add `DATABASE_PATH` (optional) and `AUTH_DISABLED` (optional, `"true"` only). Rename `ENCRYPTION_KEY` → `VOLTOPS_SECRET_KEY` (64 hex chars). Keep `TESLA_CLIENT_ID`, `TESLA_CLIENT_SECRET`, `TESLA_REDIRECT_URI`, `SESSION_SECRET`.

## Auth (D10)
- Hash: argon2id via `@node-rs/argon2` (prebuilt binaries, no compiler needed).
- `/setup`: shown only while there's no `admin` row. It sets a password (≥ 12 chars, confirmed) and logs you in. Once an admin exists, `/setup` redirects to `/login`. If there's no admin, every protected route redirects to `/setup`.
- `/login`: password → verify → `setSession("admin")`. A wrong password gives a generic error.
- Session: the existing HMAC cookie in `src/lib/session.ts`. `verify` must return `null` (never throw) on a malformed or wrong-length signature.
- `requireAdmin()` (`src/lib/auth.ts`) is the one gate. It's used by the protected page layout, every API route handler, and tRPC `protectedProcedure`. Public paths: `/login`, `/setup`, `/_next/*`, `/favicon.ico`, `/.well-known/*`.
- `AUTH_DISABLED=true` → `requireAdmin()` always passes, and every page shows a red banner: "Authentication is disabled — anyone on your network can access VoltOps."
- Logout clears the cookie.

## Tesla connect (single owner)
- `GET /api/auth/tesla` (requires admin) starts PKCE OAuth as it does today. The callback requires admin and exchanges the code. Then it upserts `credentials` id=1, upserts `sites` by `external_id` (source `fleet-api`, timezone from site_info), and upserts `tariff_schedule`. Then it redirects to `/home`.
- The callback no longer decodes `id_token` and never logs email, sub, or tokens.
- `src/lib/tesla.ts`: `getAccessToken()` and `getPowerwallLiveStatus()` take no userId. They read the single credentials row and the first site, and keep the rotated-token save-before-use behaviour.

## Verify script
`scripts/verify-tesla-gets.mjs` `main()` reads and writes the token in `credentials` (id=1) of the SQLite file at `DATABASE_PATH`. It needs env `TESLA_CLIENT_ID`, `TESLA_CLIENT_SECRET`, `VOLTOPS_SECRET_KEY`. If there's no credentials row, it exits 1 with "connect Tesla in the app first". `run(deps)` and the helpers stay unchanged.

## Docker
- `next.config.js`: `output: "standalone"`, `serverExternalPackages: ["better-sqlite3", "@node-rs/argon2"]`.
- `Dockerfile` (repo root), multi-stage `node:22-slim`. pnpm via corepack. Build with `SKIP_ENV_VALIDATION=1`. The runtime stage copies the standalone output, `.next/static`, `public`, `drizzle/` and `scripts/migrate.mjs`. `USER node`, `/data` owned by node, `EXPOSE 3000`, `CMD node scripts/migrate.mjs && node server.js`. Also add `.dockerignore`.
- `compose.yaml` (repo root): service `web` (build `.`, `ports: "3000:3000"`, `env_file: .env`, `environment: DATABASE_PATH=/data/voltops.db`, volume `voltops-data:/data`, `restart: unless-stopped`). No worker yet.
- Remove deps `postgres`, `@supabase/ssr`, `@supabase/supabase-js`, `@netlify/plugin-nextjs`. `netlify.toml` becomes static only: `[build] publish = "public"`, no command, no plugin. `.gitignore` adds `/data/`.

## Fail-fast config (Rev 3, Decision round 2 Q2 A)
- The zod server schema lives in one plain-JS file, `src/env.schema.js` (export `server`). `src/env.js` passes it to `createEnv`, so there is no second copy.
- `scripts/check-env.mjs` validates `process.env` against that schema, with empty strings counting as unset (same as `emptyStringAsUndefined`). It honours `SKIP_ENV_VALIDATION`. On failure it prints one line per bad key (key + problem, never the value) and exits 1. Special hint: if `VOLTOPS_SECRET_KEY` is missing and `ENCRYPTION_KEY` is set, print `VOLTOPS_SECRET_KEY missing (old name: ENCRYPTION_KEY — rename it)`. On success it prints nothing and exits 0.
- Container `CMD`: `node scripts/check-env.mjs && node scripts/migrate.mjs && node server.js`. The runtime image copies `src/env.schema.js` and `scripts/check-env.mjs`.
- `compose.yaml` `web`: `healthcheck` = `node -e` fetching `http://localhost:3000/login` (redirects followed; healthy on 2xx). There's no curl in the slim image. Host port: `"${VOLTOPS_PORT:-3000}:3000"`.
- With `restart: unless-stopped`, a bad `.env` shows as a restarting container, and `docker compose logs web` shows the message. That's accepted.

## Logging (Rev 3, Q3 A)
- The Tesla callback never logs a Tesla response body. Failed `products`/`site_info` calls log `status` + Tesla's `error` code (string, else `unknown`), the same as the token-exchange path. Keep the "Energy site: found/none" and timezone lines. Drop the tariff-ID line.

## Smoke test (Rev 3, CLOSEOUT item 4)
`scripts/docker-smoke.sh`: honours `SMOKE_PORT` (default 3000; passed to compose as `VOLTOPS_PORT`). It also asserts:
- (a) the container reaches `healthy`;
- (b) `GET /api/auth/tesla` with an admin session returns a redirect whose `redirect_uri` equals the container's `TESLA_REDIRECT_URI`. It runs inside the container via `node -e`: insert a throwaway admin row into the smoke volume's DB, and sign the cookie `voltops_session=admin.<hex HMAC-SHA256("admin", SESSION_SECRET)>`. No network;
- (c) `docker compose run --rm -e VOLTOPS_SECRET_KEY= web` exits non-zero and prints `VOLTOPS_SECRET_KEY`.

## Cleanup (Rev 3, CLOSEOUT item 6)
- Delete `src/app/page_extras.tsx`; remove the `@supabase` registry from `components.json`.
- `drizzle.config.ts` and `scripts/verify-tesla-gets.mjs`: `DATABASE_PATH ||` instead of `??`.
- Verify script: drop the dead `userId` from `run()`'s `saveToken` payload, and open the DB with `{ fileMustExist: true }` (a missing file is an error, not a new empty DB).

## Tests
Vitest (CLAUDE.md §11) for `src/**`: `pnpm test` = `vitest run`. Scripts keep `node --test`. No network. DB tests use a temp file or `:memory:`.

## Optimization round 1 (Rev 4, M4)
No user-visible behaviour change, except where stated.
- **Image size:** the `web` image (`docker image inspect … --format '{{.Size}}'`) is **≤ 400 MB** (was 898 MB). The runtime stage ships the Next standalone trace plus only what `check-env.mjs` and `migrate.mjs` need (`zod`, `drizzle-orm`, `better-sqlite3`). There's no compiler toolchain in the runtime stage. The Dockerfile comments why the build stage has python3/make/g++ (pnpm 9 runs node-gyp despite prebuilds). `scripts/docker-smoke.sh` fails if the image exceeds `MAX_IMAGE_MB` (default 400), and it wraps check (c) in `timeout 60` so a missing check-env fails instead of hanging.
- **check-env never echoes a received value:** the zod enum messages for `AUTH_DISABLED` and `NODE_ENV` are fixed strings (e.g. `AUTH_DISABLED: must be "true" or unset`). The CLI guard is `process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href`.
- **Callback `errorCode()`:** a JSON body of literal `null` (or any non-object) logs `unknown` and doesn't throw.
- **Cleanup:** a `cleaner` pass over `src/` + `scripts/` (dead code such as the T3 `post` router if unused, duplication, unused deps). No behaviour change; the gate stays green.
