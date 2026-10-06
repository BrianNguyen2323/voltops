# B007 — Fail fast on bad config at container start

## Facts
- Why: `src/env.js` (t3 `createEnv`, zod) is only loaded on the first request in the Next standalone server. The PO's `.env` had `ENCRYPTION_KEY` instead of `VOLTOPS_SECRET_KEY`, so the container started "healthy" and then every request returned 500.
- Spec (Rev 3):
  - Move the zod `server` schema object out of `src/env.js` into `src/env.schema.js` (plain JS, `export const server = {...}`). `src/env.js` imports it and passes it to `createEnv`. Keep the `runtimeEnv`, `skipValidation` and `emptyStringAsUndefined` behaviour.
  - New `scripts/check-env.mjs`:
    - validate `process.env` against `z.object(server)`, with empty strings treated as unset;
    - if `SKIP_ENV_VALIDATION` is set: exit 0;
    - on failure: one line per bad key, `KEY: <zod message>`, **never print the value**, then exit 1;
    - if `VOLTOPS_SECRET_KEY` is missing and `ENCRYPTION_KEY` is present, print `VOLTOPS_SECRET_KEY missing (old name: ENCRYPTION_KEY — rename it)`;
    - on success: print nothing, exit 0.
    - Export a pure `checkEnv(envObject) → string[]` (error lines) so it's unit-testable, and run it only when the file is the entry point.
  - `Dockerfile` runtime stage: copy `src/env.schema.js` and `scripts/check-env.mjs`. `CMD ["sh","-c","node scripts/check-env.mjs && node scripts/migrate.mjs && node server.js"]`. zod is a prod dep, so it should already be in the runtime `node_modules`. Check the import path resolves inside the image.
  - `compose.yaml` service `web`:
    - `ports: ["${VOLTOPS_PORT:-3000}:3000"]`;
    - `healthcheck` with:
      - `test: ["CMD","node","-e","fetch('http://localhost:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]`
      - `interval: 10s`, `timeout: 5s`, `retries: 5`, `start_period: 20s`.
  - `.env.example`: one comment line for `VOLTOPS_PORT` (host port, default 3000; `TESLA_REDIRECT_URI` must use the same port).
  - `scripts/docker-smoke.sh`:
    - `SMOKE_PORT` (default 3000) is exported as `VOLTOPS_PORT` for compose and used in every curl URL;
    - new assertions:
      - (a) the `web` container health becomes `healthy` within 90 s (`docker inspect --format '{{.State.Health.Status}}'`);
      - (b) inside the container (`exec -T web node -e`):
        - insert `admin` row id=1 with `password_hash='x'`, `created_at` = now in ms, into `/data/voltops.db` (`INSERT OR IGNORE`);
        - build the cookie `voltops_session=admin.` + hex HMAC-SHA256 of `"admin"` keyed by `process.env.SESSION_SECRET`;
        - `fetch('http://localhost:3000/api/auth/tesla', {redirect:'manual', headers:{cookie}})` must return a 3xx whose `Location` URL has `redirect_uri` === `process.env.TESLA_REDIRECT_URI`;
        - no external network: the redirect is not followed;
      - (c) `docker compose -p voltops-smoke run --rm --no-deps -e VOLTOPS_SECRET_KEY= web` exits non-zero and its output contains `VOLTOPS_SECRET_KEY`.
- Never print secret values in logs, tests or smoke output.

## Owned files
- **Tester:** `scripts/check-env.test.mjs` (new, `node --test`), `scripts/docker-smoke.sh`.
- **Implementer:** `src/env.schema.js` (new), `src/env.js`, `scripts/check-env.mjs` (new), `Dockerfile`, `compose.yaml`, `.env.example`. Not the tests.

## Base
- Tester: `main` → branch `phase1/fail-fast-env-tests`.
- Implementer: `phase1/fail-fast-env-tests` → branch `phase1/fail-fast-env-impl`.

## Judged by
From a worktree on D: (Docker bake refuses a Temp-folder context):
- `rm -rf .next && pnpm test && pnpm test:scripts && pnpm typecheck && pnpm lint && SKIP_ENV_VALIDATION=1 pnpm build`;
- `SMOKE_PORT=3100 bash scripts/docker-smoke.sh` exits 0 and prints PASS. Use 3100 because the PO may be running VoltOps on 3000.

`check-env.test.mjs` covers:
- a valid env → `[]`;
- missing key → a line naming it;
- empty-string value → treated as missing;
- `SESSION_SECRET` shorter than 32 → error;
- `ENCRYPTION_KEY` set without `VOLTOPS_SECRET_KEY` → the rename hint;
- no output line contains a value from the input env;
- the CLI exits 1 on bad env and 0 on good env (spawn `node scripts/check-env.mjs` with a crafted env).

## Gate log

- Tests a29aeba → impl b07ceb8. Reviewer: **PASS**. Merged 84b059c. Main gate: vitest 39/39, test:scripts 55/55, typecheck, lint 0 errors, build OK, `SMOKE_PORT=3100` docker smoke PASS (with the PO's real `.env`).

- Follow-up nits: (1) zod enum messages echo the received value for `AUTH_DISABLED`/`NODE_ENV` (not secrets; fix with a custom `message`). (2) Smoke (c) would hang, not fail, if check-env were dropped from CMD; wrap it in `timeout 60`. (3) `check-env.mjs:19` needs a `process.argv[1] &&` guard.
