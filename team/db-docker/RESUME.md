# Resume board — db-docker

- **Topic (PO, 2026-10-05):** database adjustments and a Docker setup with the SQLite file. Move VoltOps off Netlify + Supabase Postgres to self-hosted Docker Compose + SQLite on a volume (CLAUDE.md D1, D2, D5, D6, D10).
- **Current round:** Build M1. B001 is in doing: the tester writes failing tests on `phase1/db-sqlite-tests`. Q2b = better-sqlite3 and Q5 = accepted (R002).
- **Last action:** The B001 tester is done: `phase1/db-sqlite-tests` a330097 (`src/server/db/db.test.ts`, `src/lib/session.test.ts`), not run yet (the deps come with the implementer). Spawned the B001 implementer.
- **Next action:** When the tester reports, spawn the B001 implementer on top of `phase1/db-sqlite-tests`, then the reviewer. Gate, but HOLD the merge until the PO has done the daytime verify run. After that: B002 + B003 in parallel, then B004.
- **Hold:** don't merge B003 until the PO's daytime `pnpm verify:tesla` run (tesla-api-connection) is done, because it still reads the token from Supabase. Note: B001 merging also breaks the Supabase-based app code. The PO's daytime run uses the script on main, so the safest course is to **not merge B001 until the daytime run is done either**.
- **Open branches:** `phase1/db-sqlite-tests` (B001 tests), `phase1/db-sqlite-impl` (B001 impl, in progress). The PO checked out `database-docker` at 00:28, and the records live there. Asked in TODO which branch is the merge target.
