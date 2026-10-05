# Close-out — db-docker (2026-10-05)

**Status: CLOSED.** The PO re-tested and merged `database-docker` into `main` (PR #7, 36cf313).

## What shipped
| Brief | What | Result |
|---|---|---|
| B001 | SQLite (WAL) via Drizzle 0.45 + better-sqlite3; single-owner schema; migrations; Vitest; ADR 0001 (no `energy_hourly`) | merged |
| B002 | Admin password (argon2id), `/setup`, `/login`, logout; every page/API/tRPC gated; `AUTH_DISABLED` banner; Tesla OAuth becomes "Connect Tesla" | merged |
| B003 | `pnpm verify:tesla` reads the token from SQLite | merged |
| B004 | Dockerfile (node:22-slim, standalone) + `compose.yaml` + volume `/data`; Supabase/Netlify deps removed; Netlify serves `public/` only (Tesla public key) | merged |
| B005 | Hotfix: an empty `DATABASE_PATH` silently used a temp DB; compose pins `/data/voltops.db` | merged |
| B006 | Hotfix: the Tesla callback redirected to `http://0.0.0.0:3000/home` in Docker | merged |

Final gate: vitest 34/34, test:scripts 45/45, typecheck, lint, build, and `scripts/docker-smoke.sh` PASS. The PO verified setup → login → Connect Tesla → restart in Docker.

## Review notes (what went well / what didn't)
- **The PO review found two real bugs that the gates missed (B005, B006).** Both only show up with a real `.env` and a real browser: an empty env value overriding the image, and the bind host leaking into a redirect. The smoke test checks that the container *boots*, not that a user can *use* it.
- **Bad config shows up as a 500, not at startup.** The PO's old `.env` had `ENCRYPTION_KEY` instead of `VOLTOPS_SECRET_KEY`, and an unquoted `$` that Compose interpolated. The container started "healthy" and then every request returned 500. CLAUDE.md §11 asks for fail-fast config at startup.
- **One wrong recommendation, caught before any code was written.** I recommended `node:sqlite` from the Drizzle 1.0 docs, but the installed Drizzle 0.45 has no such driver (Q2b). Lesson: check installed versions before recommending.
- **Windows friction cost time:**
  - a stale `.next` cache crashed webpack (`WasmHash … 'length'`) and left stale `.next/types` that broke `tsc` (fix: `rm -rf .next` before gating);
  - Docker bake refuses a build context under the Temp folder (run the smoke test from D:);
  - `.sh` files need `eol=lf` (added in `.gitattributes`);
  - standalone output needs `STANDALONE=1` because symlinks hit EPERM locally.
- **Process notes for the next lead:**
  - remove a member's worktree before the next member needs its branch (a checked-out branch blocks reuse);
  - SendMessage is disabled here, so a small fix means a fresh agent;
  - the smoke test hardcodes port 3000 and collides with the PO's running instance.

## Suggestions — next round for this area (small, ordered by value)
1. **Fail fast on bad config at container start.** Validate env in `scripts/migrate.mjs` (it already runs first), or in a tiny `scripts/check-env.mjs`, so `docker compose up` exits with a readable message such as "VOLTOPS_SECRET_KEY missing (renamed from ENCRYPTION_KEY)". Also add a compose `healthcheck` on `/login`.
2. **Stop logging Tesla response bodies:** callback `route.ts` ~124/128/148/154. Log the status + `error` code only, since bodies may contain the site ID (CLAUDE.md §12). Drop the tariff-id log too.
3. **Deflake vitest under load.** Find the tests that time out (likely argon2/SQLite), lower the argon2 cost in tests or raise the per-test timeouts.
4. **Smoke test improvements:** `SMOKE_PORT` override; one assertion that `/api/auth/tesla` redirects to Tesla with `redirect_uri` = `TESLA_REDIRECT_URI` (no network needed).
5. **Shrink the image (898 MB):** use the standalone trace + a minimal migrate dep set (`drizzle-orm`, `better-sqlite3`), and drop the musl `@next/swc`/sharp copies. Add the Dockerfile comment explaining why python3/make/g++ are there (pnpm 9 runs node-gyp despite prebuilds).
6. **Cleanup batch (one `cleaner` brief):**
   - delete the dead `src/app/page_extras.tsx` (SaaS marketing, the only lint warning);
   - remove the `@supabase` registry from `components.json`;
   - change `??` → `||` for DATABASE_PATH in `drizzle.config.ts` and `scripts/verify-tesla-gets.mjs`;
   - drop the dead `userId` in `run()`;
   - verify script: open with `{ fileMustExist: true }`.
7. **Auth hardening:**
   - `setup/actions.ts` catch only the SQLite constraint error;
   - `requireAdmin()` in each protected page as well as the layout;
   - tighter callback/protectedProcedure tests;
   - show `?error=` on `/home`;
   - login rate limiting (later).

## Suggestions — future scopes (from the CLAUDE.md roadmap)
- **CI (Phase 1-A):** a GitHub Actions job running typecheck, lint, vitest and test:scripts, plus a docker build + smoke on ubuntu. Then **multi-arch images on GHCR** (D2: amd64 + arm64; better-sqlite3 prebuilds cover both).
- **Monorepo split (Phase 1-A/C):** `apps/web`, `packages/core` (units, sign conventions, `DataSource`), `packages/db`. Do it before more features land; today everything sits in `src/`.
- **`replay` source + demo dataset (Phase 1-D):** CLAUDE.md requires every feature to work without a Powerwall, and the fixtures from tesla-api-connection are a start.
- **Worker container (D5):** a second compose service sharing the `/data` volume, for polling + `calendar_history` backfill. SQLite WAL handles one writer plus readers. Decide which process owns writes.
- **Phase 2 tables** (samples/intervals, weather_observed/forecast-as-issued, forecasts, recommendations). Per ADR 0001, hourly rollups stay SQL-only until a chart is measurably slow.
- **Open owner decisions still blocking a public release:**
  - D13 license (AGPL vs MIT/Apache);
  - the default Fleet API poll budget (§13 Q4);
  - Phase 3 automation in or out of v1.0 (§13 Q5).

## Housekeeping
- **Branches:** `database-docker` is fully merged into `main`, so the PO can delete it (local + origin). All `phase1/*` branches and worktrees are already removed.
- **Netlify:** the app deploy is retired. Netlify now serves only `public/`. If not done yet, check that https://voltops.netlify.app/.well-known/appspecific/com.tesla.3p.public-key.pem still loads; Fleet API partner registration depends on it.
