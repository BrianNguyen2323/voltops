# SPEC — Database adjustments + Docker (SQLite file)

Revision 2

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

## Tests
Vitest (CLAUDE.md §11) for `src/**`: `pnpm test` = `vitest run`. Scripts keep `node --test`. No network. DB tests use a temp file or `:memory:`.
