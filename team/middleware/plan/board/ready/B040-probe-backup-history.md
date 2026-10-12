# B040: `verify:tesla` records `backup_history`

## Facts
- SPEC Rev 4 → "Outages". Tesla documents `GET /api/1/energy_sites/{id}/calendar_history?kind=backup` as "the backup (off-grid) event history of the site in duration of seconds" (developer.tesla.com energy endpoints). The field names are not recorded anywhere yet.
- `scripts/verify-tesla-gets.mjs` makes read-only GETs and saves anonymized fixtures through `deps.writeFixture(name, anonymize(body, secrets))` (see the `site_info`, `live_status` and `calendar_history_energy` calls, ~L185–L200).
- Add one more GET named `backup_history`: `${base}/calendar_history?kind=backup`. Try it with no `period`. If the script's existing pattern for `calendar_history` needs `period`/dates, don't guess; make the call with only `kind=backup` and log the status line, so the PO's run tells us.
- Save it as `fixtures/fleet-api/backup_history.json` through the same `anonymize`. Log one line `backup_history events: N` (count only; never timestamps or ids in the log).
- This is the only Tesla endpoint change. The script stays GET-only. **Never run it yourself**: no network, no real Tesla calls. The PO runs it.
- Update the script's header comment count ("4 Tesla Fleet API GETs" → 5) and the README's `verify:tesla` line if it lists the calls.
- Env notes:
  - link the main node_modules: `cmd /c mklink /J node_modules "D:\Programming Projects\voltops\node_modules"`. Remove it with `cmd /c rmdir node_modules` before you finish. Never `git worktree remove --force` while it exists;
  - `pnpm test:scripts` covers this script with fake deps; no network;
  - **COMMIT before handing off, and give the commit hash and branch name.**

## Owned files
- Implementer: `scripts/verify-tesla-gets.mjs`, its `scripts/*.test.mjs`, `README.md` (the verify line only).

## Base
`middleware`, branch `phase2b/middleware-probe-backup`.

## Judged by
- A `test:scripts` case with a fake fetch: the `backup_history` call hits `calendar_history` with `kind=backup`, the body is written through `anonymize` to `backup_history`, and the log line carries only the count.
- `pnpm test:scripts`, `pnpm format:check` and `SKIP_ENV_VALIDATION=1 pnpm lint` are green.
