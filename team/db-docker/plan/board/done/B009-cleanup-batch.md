# B009 — Cleanup batch (cleaner)

## Facts
CLOSEOUT item 6, spec Rev 3 "Cleanup". No behaviour change, except item 5.
1. Delete `src/app/page_extras.tsx`. It's a SaaS marketing leftover, referenced nowhere (`grep -rn page_extras src` is empty), and the only lint warning.
2. `components.json`: remove the `"registries": { "@supabase": ... }` block (Supabase is gone).
3. `drizzle.config.ts:7` and `scripts/verify-tesla-gets.mjs:204`: change `process.env.DATABASE_PATH ?? "./data/voltops.db"` to `||`, so an empty value falls back to the default. B005 made the same fix in `src/server/db/index.ts` and `scripts/migrate.mjs`.
4. `scripts/verify-tesla-gets.mjs` `run()`, ~line 127: drop `userId: row.userId` from the `saveToken` payload (single owner, no users table). Update `scripts/verify-tesla-gets.test.mjs` at ~lines 167 and 194, which reference `userId`.
5. `sqliteTokenStore(path)`, ~line 39: `new Database(path, { fileMustExist: true })`, so a wrong path errors instead of creating an empty DB. Add one test in `scripts/verify-sqlite.test.mjs`: a non-existent path → the store throws and no file is created.

## Owned files
`src/app/page_extras.tsx`, `components.json`, `drizzle.config.ts`, `scripts/verify-tesla-gets.mjs`, `scripts/verify-tesla-gets.test.mjs`, `scripts/verify-sqlite.test.mjs`.

## Base
`main` → branch `phase1/cleanup-batch`.

## Judged by
`rm -rf .next && pnpm test && pnpm test:scripts && pnpm typecheck && pnpm lint && SKIP_ENV_VALIDATION=1 pnpm build`, all green, and `pnpm lint` has 0 errors and no new warnings. (Correction 2026-10-05: `postcss.config.js` + `prettier.config.js` already had an `import/no-anonymous-default-export` warning each on main, so "0 warnings" was wrong.)

## Gate log
- 3a17910: test:scripts 46/46, vitest 34/34 (on re-run; the first run hit load timeouts), typecheck OK. **Lint error:** `drizzle.config.ts:7` `@typescript-eslint/prefer-nullish-coalescing` on the new `||`. Fix: the same justified disable comment as `src/server/db/index.ts:23`.
- 5bbb7ad: lint fix. Reviewer: **PASS**. Merged 6879b52. Main gate: vitest 39/39, test:scripts 46/46, typecheck, lint 0 errors, build OK.
- Follow-up nit: `scripts/verify-sqlite.test.mjs:110` `assert.throws` has no matcher.
