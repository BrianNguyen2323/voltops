# Resume board — db-docker

- **Topic (PO, 2026-10-05):** database adjustments and a Docker setup with the SQLite file. Move VoltOps off Netlify + Supabase Postgres to self-hosted Docker Compose + SQLite on a volume (CLAUDE.md D1, D2, D5, D6).
- **Current round:** Decision round 1. Q1, Q2 and Q4 are answered. Q3 is re-asked with an explanation, and Q5–Q8 are new. Waiting on the PO.
- **Last action:** Created the scope. Moved `research/storage` and the storage decision round over from `tesla-api-connection`. Surveyed the code: Supabase/Postgres is used by `src/server/db/*`, `src/lib/tesla.ts`, `src/app/api/auth/callback/route.ts`, and `scripts/verify-tesla-gets.mjs`. The session cookie holds `users.id`.
- **Next action:** When Q3 and Q5–Q8 are answered, write SPEC Revision 1 + R001, milestones, and briefs. If Q3 is yes, the ADR goes in `docs/adr/` in the same PR.
- **Dependency:** the PO's daytime `pnpm verify:tesla` run (tesla-api-connection) reads the token from Supabase. Do not merge the Supabase removal before that run is done.
- **Open branches:** none.
