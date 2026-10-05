# Resume board — db-docker

- **Topic (PO, 2026-10-05):** database adjustments and a Docker setup with the SQLite file. Move VoltOps off Netlify + Supabase Postgres to self-hosted Docker Compose + SQLite on a volume (CLAUDE.md D1, D2, D5, D6, D10).
- **Current round:** Design Revision 1 is written (SPEC, R001, M1/M2, briefs B001–B004 in board/ready). Waiting on the PO for **Q2b** (SQLite driver; this blocks B001) and the **Q5 result** (redirect URI test; blocks nothing).
- **Last action:** Recorded the PO's answers Q1 A, Q2 A, Q3 yes, Q4 re-login, Q5 A, Q6 B, Q7 recommended, Q8 yes. Found that stable drizzle 0.45 lacks a node:sqlite driver, so Q2b was raised.
- **Next action:** When Q2b is answered, update the B001/B003/B004 driver line and spawn the B001 tester (`phase1/db-sqlite-tests`), then the implementer. After B001 merges: B002 and B003 in parallel. Then B004.
- **Hold:** don't merge B003 until the PO's daytime `pnpm verify:tesla` run (tesla-api-connection) is done, because it still reads the token from Supabase. Note: B001 merging also breaks the Supabase-based app code. The PO's daytime run uses the script on main, so the safest course is to **not merge B001 until the daytime run is done either**.
- **Open branches:** none.
