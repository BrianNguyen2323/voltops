# B006 — Hotfix: the Tesla callback redirects to http://0.0.0.0:3000/home in Docker

## Facts
- Found in the PO review (2026-10-05). The Tesla login succeeded (the credentials + sites rows were written), but the browser was sent to `http://0.0.0.0:3000/home` and couldn't connect.
- Cause: `src/app/api/auth/callback/route.ts` builds redirects with `new URL("/home", request.url)` (lines ~20 and ~191). In the standalone server, with `HOSTNAME=0.0.0.0`, `request.url` carries the bind host, not the browser's host.
- Fix: build the `/home` redirect from the origin of `env.TESLA_REDIRECT_URI` (validated URL in `src/env.js`). Tesla just sent the browser to that exact origin, so it is always the browser-facing one. Use it for every redirect in that route. Don't trust `Host` / `X-Forwarded-*` headers.
- `src/app/api/auth/tesla/route.ts` redirects to Tesla's absolute authorize URL; it's fine, so leave it.

## Owned files
- **Tester:** `src/app/**/*.test.ts`.
- **Implementer:** `src/app/api/auth/callback/route.ts`.

## Base
`database-docker`. Branches `phase1/callback-host-tests` → `phase1/callback-host-impl`.

## Judged by
`pnpm test && pnpm typecheck && SKIP_ENV_VALIDATION=1 pnpm lint && SKIP_ENV_VALIDATION=1 pnpm build` (`rm -rf .next` first), all green. Tests:
- with `request.url = "http://0.0.0.0:3000/api/auth/callback?..."` and `TESLA_REDIRECT_URI=http://localhost:3000/api/auth/callback`, the success redirect `Location` is `http://localhost:3000/home`;
- an error path (e.g. a missing `code` or a bad `state`) also redirects to `http://localhost:3000/home...`, not to 0.0.0.0;
- the existing auth-route tests still pass. No network: mock `fetch`.
