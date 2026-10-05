# Resume board — Tesla API Connection

- **Topic:** verify that the Fleet API GET requests VoltOps needs actually work against the PO's real account.
- **Current round:** M1, waiting on the PO's daytime re-run (TODO.md, "Daytime re-run").
- **Last action:** B002 merged (9c69ba1). Tests 32/32, typecheck and build are green, and the reviewer returned PASS. Worktrees and branches removed. B001 and B002 are in done.
- **Next action:** When the PO reports:
  1. Inspect the fixtures yourself (decode-check products.json: no vehicle, no UUIDs, no site id), then commit `fixtures/fleet-api/*.json`.
  2. Add the solar and battery signs to `research/fleet-api-responses/README.md`, matched against what the PO saw in the Tesla app (invariant ok plus battery charging → `battery_power < 0` = charging?).
  3. Mark M1 done, then open Decision round 2 (fleet-api adapter / DataSource, CLAUDE.md §5).
- **Fixtures on disk (untracked, NOT committed):** the old site_info, live_status and calendar_history files from the night run. The re-run overwrites them.
- **Follow-ups (non-blocking reviewer nits):**
  1. Add `cached_data` to REDACT_KEYS (defence in depth).
  2. Products filter: keep items with no device_type only when resource_type is set.
  3. Filter products even when `response` isn't an array.
- **Next-topic candidates (from the PO):** weather location. Tesla gives no coordinates, so the user must provide them (ZIP/city geocoding via Open-Meteo, browser geolocation, or manual lat/lon). This is for a separate future scope.
- **Open branches:** none.
