# B011 — Gate-log nits (tester → implementer)

## Facts
SPEC Rev 4, "Optimization round 1". Small fixes logged at the B007–B009 gates.
1. **check-env must never echo a received value.**
   - `src/env.schema.js` has `AUTH_DISABLED: z.enum(["true"]).optional()` and `NODE_ENV: z.enum(["development","test","production"]).default("development")`.
   - zod's default enum message includes the received value (e.g. `received 's3cret'`), and `scripts/check-env.mjs` prints `${key}: ${i.message}`.
   - Fix: fixed-string messages in the schema, e.g. `must be "true" or unset` (AUTH_DISABLED) and `must be development, test or production` (NODE_ENV). zod 3: `z.enum([...], { errorMap: () => ({ message: "..." }) })`.
   - `src/env.js` uses the same schema via `createEnv`, so keep it a plain zod schema.
2. **CLI guard:** `scripts/check-env.mjs:19` is `import.meta.url === pathToFileURL(process.argv[1]).href`, which throws if `argv[1]` is undefined. Make it `process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href`.
3. **Callback `errorCode()`** in `src/app/api/auth/callback/route.ts:12`:
   - today `const { error } = (await res.json().catch(() => ({})))` throws on a JSON body of literal `null`;
   - fix: `const body = await res.json().catch(() => null)`, read `error` only if `body` is an object, and return `"unknown"` unless `error` is a string.
4. **Test gaps (tester only):**
   - a test that a failed token exchange logs `["[Tesla OAuth] Token exchange failed:", status, code]` and no body. `src/app/callback-logging.test.ts` already covers products/site_info; reuse its helpers;
   - a test that a `null` JSON body on a failed products call logs `unknown` and doesn't throw;
   - in `scripts/verify-sqlite.test.mjs:110`, give `assert.throws` a matcher. better-sqlite3 with `fileMustExist` throws a `SqliteError`, so match the code or message; check what it really throws;
   - in `scripts/check-env.test.mjs`, a test that `checkEnv` with `AUTH_DISABLED: "s3cret-marker"` and `NODE_ENV: "s3cret-marker2"` returns lines naming both keys, and none of them contains a marker.

## Owned files
- Tester: `src/app/callback-logging.test.ts`, `scripts/verify-sqlite.test.mjs`, `scripts/check-env.test.mjs`.
- Implementer: `src/env.schema.js`, `scripts/check-env.mjs`, `src/app/api/auth/callback/route.ts`.

## Base
- Tester: `optimization-round` → branch `phase1/gate-nits-test`. The new echo and `null`-body tests must FAIL on the base. The token-exchange test and the matcher may already pass; say which.
- Implementer: `phase1/gate-nits-test` → branch `phase1/gate-nits-impl`.

## Judged by
- `rm -rf .next && pnpm test && pnpm test:scripts && pnpm typecheck && SKIP_ENV_VALIDATION=1 pnpm lint && SKIP_ENV_VALIDATION=1 pnpm build`, all green.
- Lint: 0 errors and no new warnings (2 warnings already exist: `postcss.config.js`, `prettier.config.js`).
- Worktree:
  - link main's node_modules: `cmd //c mklink //J node_modules "D:\Programming Projects\voltops\node_modules"`;
  - never copy the PO's `.env`;
  - vitest can time out under load, so re-run once before calling a failure real.
