# B041: Grid outages into the change log (`backup_history`)

Lead plan: SPEC Rev 4 → "Outages" (Q1 A). **Blocked until the PO runs `pnpm verify:tesla` after B040 and `fixtures/fleet-api/backup_history.json` is committed** (Haiku sensitive-data scan first, standing rule).

## Facts
- Read the field names, the timestamp format and the duration unit **from the recorded fixture**. Tesla's docs say "in duration of seconds"; if the fixture contradicts that, the fixture wins, and note the source in a code comment (CLAUDE.md §12). If the fixture is empty (no outages), stop and report: the mapper can't be verified.
- `DataSource.getOutages(siteId): Promise<{ at: string; durationS: number }[]>` (ISO UTC). fleet-api: `calendar_history?kind=backup` through `get` (counted by B038's counter). Pure `mapBackupHistory` in `map.ts`.
- A daily worker job next to `site-sync` in `main.ts` (the same 24 h gate): `site_events` kind `outage`, text "Grid outage, {h} h {m} min", or "Grid outage, {m} min" under an hour, `onConflictDoNothing`.
- Test fakes implementing `DataSource` need the new method.

## Owned files
- Tester: `map.test.ts`, `client.test.ts`, `jobs.test.ts`.
- Implementer: `src/lib/core/types.ts`, `map.ts`, `client.ts`, `src/worker/jobs.ts`, `src/worker/main.ts`, DataSource fakes.

## Judged by
- The mapper on the fixture (values read from it); the duration text at 59 min, 1 h 0 min and 2 h 10 min; a re-run inserts nothing new; the event shows in `system.changes`.
- Full gate green.
