# Resume board — Tesla API Connection

- **Topic:** verify that the Fleet API GET requests VoltOps needs actually work against the PO's real account.
- **Current round:** M1 build done. Waiting on the PO review (TODO.md, "Review M1 / B001").
- **Last action:** B001 merged to main (6663f5e). Tests 23/23, typecheck and build are green, and the reviewer returned PASS. Worktrees and branches removed. B001 is in done.
- **Next action:** When the PO reports:
  1. Check the fixtures, then commit `fixtures/fleet-api/*.json`.
  2. Write `research/fleet-api-responses/README.md`: real field names, sign conventions (from the invariant), the calendar_history date format and period behaviour, and the Powerwall model from site_info.
  3. Open Decision round 2 (next topic: `fleet-api` adapter / DataSource per CLAUDE.md §5).
  If any GET failed, diagnose from the status and body first.
- **Follow-ups (reviewer nits, non-blocking, do after the real run shows the actual field names):**
  1. Add the products ids to `secrets` *before* anonymizing products.json.
  2. Add `warp_site_number` (and any other ID keys the real responses show) to the redaction list.
  3. Fail fast with a clear message when an env var is missing.
- **Open branches:** none.
