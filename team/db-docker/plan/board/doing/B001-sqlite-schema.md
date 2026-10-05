# B001 — SQLite schema, connection, migrations

## Facts
- Replace Postgres (postgres-js) with SQLite via Drizzle `sqlite-core`. Driver: `better-sqlite3` + `drizzle-orm/better-sqlite3` (Q2b A). Stay on drizzle-orm 0.45.x.
- File `DATABASE_PATH` (default `./data/voltops.db`; mkdir the parent). On open: `PRAGMA journal_mode=WAL; foreign_keys=ON; busy_timeout=5000`. Export `db` and an `openDb(path)` factory for tests.
- Tables (no prefix; timestamps `integer` `timestamp_ms`; JSON `text` json):
  - `admin`: id int pk CHECK(id=1), password_hash text NOT NULL, created_at.
  - `credentials`: id int pk CHECK(id=1), encrypted_refresh_token NOT NULL, iv NOT NULL, scope, access_token_expires_at, updated_at.
  - `sites`: id int pk autoinc, source text NOT NULL, external_id text NOT NULL UNIQUE, name, timezone, latitude real, longitude real, usable_capacity_wh int, created_at, updated_at.
  - `tariff_schedule`: site_id int pk FK→sites ON DELETE CASCADE, tariff_id, name, utility, currency, content (json), updated_at.
  - Drop `users` and `tesla_token`.
- `drizzle.config.ts`: dialect `sqlite`, `dbCredentials.url` = DATABASE_PATH, out `drizzle/`. Generate the initial migration into `drizzle/` and commit it. `scripts/migrate.mjs`: plain JS, opens the DB with the same pragmas and runs the drizzle migrator on `drizzle/`. `pnpm db:migrate` → `node scripts/migrate.mjs`.
- Env (`src/env.js`, `.env.example`): `.env.example` sets `TESLA_REDIRECT_URI=http://localhost:3000/api/auth/callback` (the PO confirmed Tesla accepts it, Q5). Remove DATABASE_URL. Add DATABASE_PATH (optional) and AUTH_DISABLED (optional, enum "true"). Rename ENCRYPTION_KEY → VOLTOPS_SECRET_KEY (`src/lib/crypto.ts` follows).
- Callers become single owner, with Tesla OAuth still the login in this brief:
  - The callback upserts `credentials` id=1, `sites` by external_id (source "fleet-api"), and `tariff_schedule`, then calls `setSession("owner")`. Remove the id_token decode and every log of email/sub.
  - `src/lib/tesla.ts`: `getAccessToken()` and `getPowerwallLiveStatus()` take no args.
  - The powerwall route and home page only check that a session exists.
- `src/lib/session.ts` `verify`: return null on a wrong-length or malformed signature (today `timingSafeEqual` throws).
- Add Vitest (`pnpm test` = `vitest run`, with `~/` alias support). Remove the `postgres` dep. `.gitignore` adds `/data/`.
- Write `docs/adr/0001-no-hourly-rollup-table.md` (context: CLAUDE.md §6 lists energy_hourly. Decision: compute hourly with SQL GROUP BY over 5-min intervals. Consequence: add the table only if a query is measurably slow).

## Owned files
- **Tester:** `src/**/*.test.ts`.
- **Implementer:** `src/server/db/**`, `drizzle/**`, `drizzle.config.ts`, `scripts/migrate.mjs`, `src/env.js`, `.env.example`, `src/lib/crypto.ts`, `src/lib/session.ts`, `src/lib/tesla.ts`, `src/app/api/auth/callback/route.ts`, `src/app/api/powerwall/live/route.ts`, `src/app/home/page.tsx`, `src/server/api/trpc.ts`, `package.json`, `pnpm-lock.yaml`, `vitest.config.ts`, `.gitignore`, `docs/adr/0001-no-hourly-rollup-table.md`.

## Base
main. The tester branches `phase1/db-sqlite-tests`; the implementer branches `phase1/db-sqlite-impl` from the tester's branch.

## Judged by
`pnpm test && pnpm typecheck && pnpm lint && SKIP_ENV_VALIDATION=1 pnpm build && pnpm test:scripts`, all green. Tests must cover:
- migrations apply to a fresh temp file, and WAL is on;
- a second `admin` row or `credentials` row with id≠1 is rejected;
- `sites.external_id` is unique;
- deleting a site cascades to `tariff_schedule`;
- session verify returns null for tampered, wrong-length, and dot-less values.

No network.
