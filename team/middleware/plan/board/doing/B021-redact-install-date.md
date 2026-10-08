# B021: `verify:tesla` redacts the Powerwall installation date

## Facts
- PO decision (2026-10-08): `pnpm verify:tesla` must hide the exact Powerwall installation time.
  - The Haiku privacy scan flagged `site_info.json` `$.response.installation_date` (e.g. `"2025-09-15T11:07:01-07:00"`). With the timezone and utility, it is a quasi-identifier.
- `scripts/verify-tesla-gets.mjs` has `anonymize(value, secrets)`. Keys in `REDACT_KEYS` become `"REDACTED"` at any depth. **Add `installation_date` to `REDACT_KEYS`.** Nothing in `src/` or `scripts/` reads `installation_date` (checked with grep), so `"REDACTED"` is safe.
- Also redact it in the committed fixture `fixtures/fleet-api/site_info.json`: set `response.installation_date` to `"REDACTED"`, and change nothing else in the file. The PO owns fixtures, but this edit is the PO's request.
- Out of scope: `components.gateways[].updated_datetime` (low risk, and the PO didn't ask); git history (rewriting it is the PO's call).
- Script tests run with `pnpm test:scripts` (`node --test "scripts/*.test.mjs"`); see `scripts/verify-tesla-gets.test.mjs` for how `anonymize` is tested.
- Env notes:
  - link the main node_modules: `cmd /c mklink /J node_modules "D:\Programming Projects\voltops\node_modules"`. Remove it with `cmd /c rmdir node_modules` before you finish;
  - lint needs `SKIP_ENV_VALIDATION=1`;
  - **COMMIT, and give the hash and branch name.**

## Owned files
- Tester: `scripts/verify-tesla-gets.test.mjs`
- Implementer: `scripts/verify-tesla-gets.mjs`, `fixtures/fleet-api/site_info.json`

## Base
- Tester: `middleware`, branch `phase2b/middleware-redact-install-tests`.
- Implementer: the tester's branch, then `phase2b/middleware-redact-install`.

## Judged by
- `pnpm test:scripts` is green, including a new test: `anonymize` turns a nested `installation_date` into `"REDACTED"` and keeps sibling fields.
- `pnpm vitest run` is green: the fixture edit breaks nothing.
- `fixtures/fleet-api/site_info.json` has `"installation_date": "REDACTED"`, and its diff is that one line.
