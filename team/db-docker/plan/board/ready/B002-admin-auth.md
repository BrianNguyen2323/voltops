# B002 — Admin password auth (D10); Tesla becomes "connect"

## Facts
- argon2id via `@node-rs/argon2`. One `admin` row (id=1, from B001).
- `src/lib/auth.ts`:
  - `hashPassword` / `verifyPassword`;
  - `requireAdmin()` returns ok, or redirects to `/setup` if no admin row exists, else to `/login`. For API routes it gives a 401 JSON;
  - `isAuthDisabled()` = env `AUTH_DISABLED === "true"`.
- `/setup` page + server action:
  - only while no admin row exists;
  - password ≥ 12 chars and confirmation must match;
  - insert the hash, then `setSession("admin")` → `/home`;
  - if an admin exists, redirect to `/login`;
  - insert atomically: a concurrent second setup must fail on the CHECK/pk, not overwrite.
- `/login`: a password form replaces the "Login with Tesla" page. Wrong password → generic "Incorrect password". Success → `setSession("admin")` → `/home`. Add a logout action that clears the cookie.
- Gate everything except `/login`, `/setup`, `/_next/*`, `/favicon.ico`, `/.well-known/*`:
  - pages via a protected layout calling `requireAdmin()`;
  - each API route handler;
  - tRPC `protectedProcedure`.
  - `/api/auth/tesla` and `/api/auth/callback` require admin.
- On the home page (`/home`): a "Connect Tesla" button → `/api/auth/tesla`, or "Tesla connected" when a credentials row exists.
- `AUTH_DISABLED=true` → requireAdmin passes. The root layout shows the red banner "Authentication is disabled — anyone on your network can access VoltOps."
- Never log passwords, hashes, or tokens.

## Owned files
- **Tester:** `src/**/*.test.ts`.
- **Implementer:** `src/lib/auth.ts`, `src/lib/session.ts`, `src/app/setup/**`, `src/app/login/**`, `src/app/home/**`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/(protected)/**` (if used), `src/app/api/**`, `src/server/api/trpc.ts`, `package.json`, `pnpm-lock.yaml`.

## Base
main after B001 merges. Branches `phase1/auth-admin-tests` → `phase1/auth-admin-impl`.

## Judged by
`pnpm test && pnpm typecheck && pnpm lint && SKIP_ENV_VALIDATION=1 pnpm build`, all green. Tests cover:
- hash/verify round-trip, and a wrong password fails;
- setup refuses when an admin exists, and a second insert is rejected;
- requireAdmin: no admin → setup, no session → login, valid session → ok, AUTH_DISABLED → ok;
- the API route returns 401 without a session;
- the callback returns 401 or redirects without a session.
