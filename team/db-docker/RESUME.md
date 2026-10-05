# Resume board — db-docker

- **Status: CLOSED (2026-10-05).** The PO re-tested and merged `database-docker` into `main` (PR #7, 36cf313). The PO is moving to a different scope with a different team.
- **Topic:** moved VoltOps off Netlify + Supabase Postgres to self-hosted Docker Compose + SQLite on a volume, with a single-admin password (CLAUDE.md D1, D2, D5, D6, D10).
- **Shipped:** B001–B006 (see `CLOSEOUT.md`). The board has all six in done. SPEC is at Revision 2.
- **Last action:** wrote `CLOSEOUT.md` (review notes, follow-ups ordered by value, suggestions for future scopes).
- **Next action (if reopened):** start from CLOSEOUT.md "Suggestions — next round". Item 1 (fail-fast env check at container start) and item 2 (stop logging Tesla bodies) come first. Run it as a decision round in TODO.md.
- **Open branches:** none of ours. `database-docker` is merged; the PO may delete it (local + origin).
