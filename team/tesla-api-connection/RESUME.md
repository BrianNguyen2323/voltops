# Resume board — Tesla API Connection

- **Topic:** verify that the Fleet API GET requests VoltOps needs actually work against the PO's real account.
- **Current round:** M1 DONE (2026-10-04, PO call). Resumed 2026-10-05 11:04: fixtures are still the night baseline (not re-run yet). We are inside the 11:00–14:00 window, waiting on the PO to run `pnpm verify:tesla`. The script on `database-docker` is identical to main, so it can run from the current checkout.
- **Last action:** The night fixtures (run 2, 21:14 PDT) were leak-scanned by the lead (clean: IDs, serials and names REDACTED, no vehicle items, no UUIDs, no coordinates) and committed as the M1 baseline. B003 merged (d4bd5c8). Tests 37/37, typecheck and build are green.
- **Next action:** When the PO reports the daytime run:
  1. Leak-scan the fixtures again (same greps: vehicle/vin/cached_data/UUID/@/lat/long/address; IDs = REDACTED), then commit them over the night baseline.
  2. Record the solar and battery signs in `research/fleet-api-responses/README.md`, matched against what the PO saw in the Tesla app (battery charging → is `battery_power < 0`?).
  3. Open Decision round 2 (fleet-api adapter / DataSource, CLAUDE.md §5). Start with a research round.
- **Follow-ups:** 2026-10-05: storage/hosting moved to the new scope `team/db-docker` (research + decision round). The daytime verify run must happen before db-docker removes Supabase.
- **Next-topic candidates (from the PO):** weather location. Tesla gives no coordinates, so the user must provide them (ZIP/city geocoding via Open-Meteo, browser geolocation, or manual lat/lon). This is for a separate future scope.
- **Open branches:** none.
