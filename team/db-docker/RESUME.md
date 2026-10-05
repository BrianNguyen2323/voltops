# Resume board — db-docker

- **Topic (PO, 2026-10-05):** database adjustments and a Docker setup with the SQLite file. Move VoltOps off Netlify + Supabase Postgres to self-hosted Docker Compose + SQLite on a volume (CLAUDE.md D1, D2, D5, D6, D10).
- **Current round:** Build M1. B001 is in doing: the tester writes failing tests on `phase1/db-sqlite-tests`. Q2b = better-sqlite3 and Q5 = accepted (R002).
- **Last action:** B001 implementer green on `phase1/db-sqlite-impl` 268df9f (test 12/12, typecheck, lint with SKIP_ENV_VALIDATION=1, build, test:scripts 37/37). B001 is in gate and the reviewer was spawned. Note: the verify script is broken on that branch until B003 (it still uses postgres). `pnpm add better-sqlite3` hit a node-gyp failure once before a retry; watch for this in B004.
- **Next action:** When the tester reports, spawn the B001 implementer on top of `phase1/db-sqlite-tests`, then the reviewer. Gate, but HOLD the merge until the PO has done the daytime verify run. After that: B002 + B003 in parallel, then B004.
- **Hold:** don't merge B003 until the PO's daytime `pnpm verify:tesla` run (tesla-api-connection) is done, because it still reads the token from Supabase. Note: B001 merging also breaks the Supabase-based app code. The PO's daytime run uses the script on main, so the safest course is to **not merge B001 until the daytime run is done either**.
- **Open branches:** `phase1/db-sqlite-tests`, `phase1/db-sqlite-impl` (B001, in review). Records are on `database-docker`; the merge target question is in TODO.
