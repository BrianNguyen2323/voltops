# B003 — Verify script reads the token from SQLite

## Facts
- `scripts/verify-tesla-gets.mjs` `main()` currently uses `postgres` with `DATABASE_URL` and the table `voltops_tesla_token`. Switch it to the SQLite file at `DATABASE_PATH` (default `./data/voltops.db`), using `better-sqlite3` (installed by B001; plain JS via `createRequire`), with `busy_timeout=5000`.
- Table `credentials` (id=1): `encrypted_refresh_token`, `iv`, `access_token_expires_at` (int ms UTC), `updated_at` (int ms).
  - `loadToken` maps the row to `{ encryptedRefreshToken, iv }`.
  - `saveToken` UPDATEs the same row.
- If there's no row → exit 1 with "No Tesla credentials in <path>. Connect Tesla in the app first."
- Required env: `TESLA_CLIENT_ID`, `TESLA_CLIENT_SECRET`, `VOLTOPS_SECRET_KEY` (renamed from ENCRYPTION_KEY). Update the usage comment.
- `run(deps)`, `anonymize`, `yesterdayRange` and `checkInvariant` are unchanged. Never log tokens.

## Owned files
- **Tester:** `scripts/*.test.mjs`.
- **Implementer:** `scripts/verify-tesla-gets.mjs`.

## Base
`phase1/db-sqlite-impl` (B001, PASS but not merged yet; held). Branches `phase1/verify-sqlite-tests` → `phase1/verify-sqlite-impl`. **The lead holds the merge until the PO's daytime verify run is done.**

## Judged by
`pnpm test:scripts` green (node:test). New tests use a temp SQLite file with the B001 migration applied:
- load/save round-trip on `credentials`;
- a missing row gives the exact error;
- the missing-env message lists `VOLTOPS_SECRET_KEY`.

No network.
