# B010: Fleet client hardening (B001 review follow-ups)

## Facts
- `src/lib/sources/fleet-api/client.ts` (merged in B001) refreshes the Tesla token inside `BEGIN IMMEDIATE` on the **shared** better-sqlite3 connection (`deps.db`), held across `await fetch`.
  - Any other DB call in the same process during that window runs inside that transaction. A failed refresh rolls back those unrelated writes, and a `db.transaction()` elsewhere would throw "cannot start a transaction within a transaction".
- Fix 1: run the refresh transaction on a **short-lived second connection** to the same file. Use `openDb(deps.db.$client.name)` from `~/server/db`; better-sqlite3's `Database#name` is the file path. Close it in `finally`.
  - The order stays `BEGIN IMMEDIATE` → re-read credentials id=1 → POST → write the rotated token (encrypted) → `COMMIT`, with rollback on error.
  - The shared connection is never inside a transaction across an await.
  - Keep the in-process shared in-flight promise and the cache rule (refresh when < 5 min left).
  - The `busy_timeout` pragma is already set by `openDb` (5000 ms).
- Fix 2: an API 401 (not the token endpoint) clears the cached access token before throwing `AuthExpired`, so the next call refreshes instead of reusing a dead token.
- Fix 3: strip the UTF-8 BOM (bytes EF BB BF) from the first line of each owned file that has one. Write files as UTF-8 **without** BOM; don't use PowerShell `Set-Content`/`Out-File`.
- Unchanged: typed errors and no tokens, bodies or site ids in messages.
- Env notes:
  - worktrees have no node_modules; link main's from PowerShell with `cmd /c mklink /J node_modules "D:\Programming Projects\voltops\node_modules"`, and remove it with `cmd /c rmdir node_modules`, never `--force`;
  - lint needs `SKIP_ENV_VALIDATION=1`;
  - commit on your branch before handing off.

## Owned files
- Tester: `src/lib/sources/fleet-api/client.test.ts`
- Implementer: `src/lib/sources/fleet-api/client.ts`, plus a BOM strip only (no other edits) in `src/lib/core/types.ts`, `src/lib/sources/fleet-api/map.ts`, `src/app/api/powerwall/live/route.ts`, `src/env.js`, `scripts/verify-tesla-gets.test.mjs`

## Base
Tester: `main`. Implementer: the tester's branch.

## Judged by
- `pnpm vitest run src/lib/sources`: green. New tests:
  - while a refresh is in flight (fetch held on a deferred promise), a write through the shared `db` succeeds and **survives** a refresh that then fails;
  - the shared `db` can run `db.transaction(...)` during an in-flight refresh;
  - after an API 401, the next call POSTs to the token endpoint again;
  - all the existing B001 tests still pass.
- The full `pnpm vitest run` green, `pnpm typecheck`, `SKIP_ENV_VALIDATION=1 pnpm lint` exit 0, `pnpm test:scripts` green.
- `git grep -l $'\xEF\xBB\xBF' -- src scripts` lists none of the owned files.
