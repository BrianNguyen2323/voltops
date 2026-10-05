# Resume board — Tesla API Connection

- **Topic:** verify that the Fleet API GET requests VoltOps needs actually work against the PO's real account.
- **Current round:** M1, waiting on the PO's daytime re-run (TODO.md, "Daytime re-run").
- **Last action:** B003 (redaction hardening: cached_data key, stricter products filter, non-array response → []) merged (d4bd5c8). Tests 37/37, typecheck and build are green on main, and the reviewer returned PASS. Worktrees and branches removed. Before that: the PO's 21:14 night re-run was 4/4 OK with clean fixtures, but the battery sign is still unverified (solar 0, battery 0).
- **Next action:** When the PO reports:
  1. Inspect the fixtures yourself (decode-check products.json: no vehicle, no UUIDs, no site id), then commit `fixtures/fleet-api/*.json`.
  2. Add the solar and battery signs to `research/fleet-api-responses/README.md`, matched against what the PO saw in the Tesla app (invariant ok plus battery charging → `battery_power < 0` = charging?).
  3. Mark M1 done, then open Decision round 2 (fleet-api adapter / DataSource, CLAUDE.md §5).
- **Fixtures on disk (untracked, NOT committed):** the old site_info, live_status and calendar_history files from the night run. The re-run overwrites them.
- **Follow-ups:** none. (The B002 nits were shipped in B003. The B003 reviewer nits are harmless: the products filter also runs on non-2xx bodies, and an explicit null device_type counts as absent.)
- **Next-topic candidates (from the PO):** weather location. Tesla gives no coordinates, so the user must provide them (ZIP/city geocoding via Open-Meteo, browser geolocation, or manual lat/lon). This is for a separate future scope.
- **Open branches:** none.
