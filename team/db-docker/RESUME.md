# Resume board — db-docker

- **Topic (PO, 2026-10-05):** database adjustments and a Docker setup with the SQLite file. Move VoltOps off Netlify + Supabase Postgres to self-hosted Docker Compose + SQLite on a volume (CLAUDE.md D1, D2, D5, D6, D10).
- **Current round:** Build M1. B001 is in gate with reviewer PASS, merge HELD (PO daytime run + merge-target question). B002 + B003 are in doing, based on `phase1/db-sqlite-impl`.
- **Last action:** B001 reviewer PASS (4 nits folded into B002). Spawned the B002 and B003 testers in parallel.
- **Next action:** B002/B003 testers → implementers → reviewers. After the PO does the daytime run and answers the merge target: merge B001, then B002, then B003 (each `--no-ff`, full gate on the target after each). Then B004.
- **Hold:** don't merge B003 until the PO's daytime `pnpm verify:tesla` run (tesla-api-connection) is done, because it still reads the token from Supabase. Note: B001 merging also breaks the Supabase-based app code. The PO's daytime run uses the script on main, so the safest course is to **not merge B001 until the daytime run is done either**.
- **Open branches:** `phase1/db-sqlite-tests`, `phase1/db-sqlite-impl` (B001 PASS, held), `phase1/auth-admin-tests` (B002), `phase1/verify-sqlite-tests` (B003). Records are on `database-docker`.
