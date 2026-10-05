# Resume board — db-docker

- **Topic (PO, 2026-10-05):** database adjustments and a Docker setup with the SQLite file. Move VoltOps off Netlify + Supabase Postgres to self-hosted Docker Compose + SQLite on a volume (CLAUDE.md D1, D2, D5, D6, D10).
- **Current round:** Build M1. B001 is in gate with reviewer PASS, merge HELD (PO daytime run + merge-target question). B002 + B003 are in doing, based on `phase1/db-sqlite-impl`.
- **Last action:** B003 reviewer PASS (48175fe). B001 + B003 are in gate with PASS, merge HELD. The B002 implementer is still running.
- **Next action:** B002/B003 testers → implementers → reviewers. After the PO does the daytime run and answers the merge target: merge B001, then B002, then B003 (each `--no-ff`, full gate on the target after each). Then B004.
- **Hold:** don't merge B003 until the PO's daytime `pnpm verify:tesla` run (tesla-api-connection) is done, because it still reads the token from Supabase. Note: B001 merging also breaks the Supabase-based app code. The PO's daytime run uses the script on main, so the safest course is to **not merge B001 until the daytime run is done either**.
- **Follow-ups:** (1) verify script `sqliteTokenStore`: open with `{ fileMustExist: true }` so a missing DB gives the friendly error (B003 review nit). (2) Drop the dead `userId` in `run()` + its test together, someday.
- **Open branches:** `phase1/db-sqlite-tests`, `phase1/db-sqlite-impl` (B001 PASS, held), `phase1/auth-admin-tests` (B002 tests), `phase1/auth-admin-impl` (B002 impl running), `phase1/verify-sqlite-tests` (B003 tests), `phase1/verify-sqlite-impl` (B003 PASS, held). Records are on `database-docker`.
