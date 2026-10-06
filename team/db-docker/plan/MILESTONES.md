# Milestones — db-docker

## M1 — SQLite + single owner + admin auth (`pnpm dev` works on SQLite)
- B001 SQLite schema, connection, migrations, env, Vitest, ADR 0001. Tesla OAuth stays as the login for now.
- B002 Admin password auth (D10). Tesla OAuth becomes "connect". Starts after B001 merges.
- B003 Verify script on SQLite. Starts after B001 merges, parallel with B002. **Merge only after the PO's daytime verify run.**

## M2 — Docker (`docker compose up` works, data survives a restart)
- B004 Dockerfile, compose, standalone, migrate at start, remove Postgres/Supabase/Netlify app. Starts after B002 merges.

## M3 — Config + hygiene (bad `.env` fails at start; no Tesla bodies in logs) — DONE 2026-10-05 (84b059c)
- B007 Fail-fast env check, healthcheck, configurable host port, smoke-test assertions. Tester → implementer.
- B008 Callback log redaction. Tester → implementer. Parallel with B007.
- B009 Cleanup batch (cleaner). Parallel with B007/B008; no shared files.
