# B010: Fleet client hardening (B001 review follow-ups). Revised after the tester's finding

## Facts
- Problem: `src/lib/sources/fleet-api/client.ts` (B001) refreshes the Tesla token inside `BEGIN IMMEDIATE` on the shared better-sqlite3 connection, held across `await fetch`. Other writes in the same process join that transaction and are rolled back if the refresh fails. Moving it to a second connection is worse: better-sqlite3 blocks synchronously on `busy_timeout`, which freezes the event loop for up to 5 s.
- **Fix 1 (revised): a refresh lease. No transaction is ever held across an `await`.**
  - New nullable column `credentials.refresh_lock_until` (`timestamp_ms`). Add it in `src/server/db/schema.ts` and generate the migration with `pnpm db:generate` (→ `drizzle/0002_*.sql` + meta). Never edit 0000/0001.
  - Acquire: one synchronous `db.transaction(() => …)` (immediate). Read credentials id=1 (none → `AuthExpired("No Tesla credentials stored")`). If `refreshLockUntil` is null or `<= now()`, set it to `now() + 30_000` and return the decrypted refresh token. Otherwise not acquired.
  - Not acquired → `await` 250 ms (an injectable `sleep` dep, default `setTimeout`) and retry, for up to 35 s total. Then throw `SourceUnavailable("token refresh lock timeout")`.
  - Acquired → POST to the token endpoint (unchanged) → one synchronous transaction stores the rotated refresh token (encrypted), `accessTokenExpiresAt`, `updatedAt`, and sets `refreshLockUntil = null`.
  - On any error after acquiring: clear the lease (sync), then rethrow the mapped error.
  - Keep the in-process shared in-flight promise and the "refresh when < 5 min left" cache rule.
- Fix 2: an API 401 (not the token endpoint) clears the cached access token before throwing `AuthExpired`, so the next call refreshes.
- Fix 3: strip the UTF-8 BOM (bytes EF BB BF) from the first line of each owned file that has one. Write UTF-8 without BOM; no PowerShell `Set-Content`/`Out-File`.
- Unchanged: typed errors and no tokens, bodies or site ids in messages.
- Env notes:
  - worktrees have no node_modules; link main's from PowerShell with `cmd /c mklink /J node_modules "D:\Programming Projects\voltops\node_modules"`, and remove it with `cmd /c rmdir node_modules`, never `--force`;
  - lint needs `SKIP_ENV_VALIDATION=1`;
  - **commit on your branch before handing off.**

## Owned files
- Tester: `src/lib/sources/fleet-api/client.test.ts`
- Implementer:
  - `src/lib/sources/fleet-api/client.ts`, `src/server/db/schema.ts` (credentials column only), `drizzle/0002_*.sql`, `drizzle/meta/*`;
  - BOM strip only in `src/lib/core/types.ts`, `src/lib/sources/fleet-api/map.ts`, `src/app/api/powerwall/live/route.ts`, `src/env.js`, `scripts/verify-tesla-gets.test.mjs`.

## Base
Tester: the existing branch `worktree-agent-a336ae0c09f0f45d3` (69da342, 3 hardening tests). Implementer: the tester's latest branch.

## Judged by
- `pnpm vitest run src/lib/sources`: green, including:
  - the existing 3 hardening tests;
  - lease tests:
    - two clients built on **two separate `openDb` connections to the same file** (two "processes") refresh concurrently: exactly one token POST is in flight at a time, and the second POST uses the rotated refresh token the first stored;
    - a stale lease (`refresh_lock_until` in the past) is taken over;
    - a held lease that never clears → `SourceUnavailable` after the timeout (use the fake `sleep`/`now`);
    - a failed POST clears the lease.
- The full `pnpm vitest run` green, `pnpm typecheck`, `SKIP_ENV_VALIDATION=1 pnpm lint` exit 0, `pnpm test:scripts` green.
- `drizzle/0000_*` and `0001_*` are unchanged.
