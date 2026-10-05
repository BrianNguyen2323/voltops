# Resume board — Tesla API Connection

- **Topic:** verify that the Fleet API GET requests VoltOps needs actually work against the PO's real account.
- **Current round:** M1, B002 build (redaction leak fix).
- **Last action:** The PO ran `pnpm verify:tesla` and all 4 GETs returned 200. Findings are in `research/fleet-api-responses/README.md`: Powerwall 3, 5-min calendar history, no location in the API, and only the grid sign verified. products.json leaked the vehicle VIN and name, so it was deleted (untracked). The B002 tester was spawned on branch `phase0/tesla-redaction-fix-tests`.
- **Next action:** tester → implementer (`phase0/tesla-redaction-fix-impl`) → reviewer → merge, then run the tests, typecheck and build on main. Then add a USER INPUT REQUIRED item: PO re-runs in daytime (11–14h, battery charging), checks the fixtures, and sends the table and invariant line. After that, commit the fixtures and record the solar and battery signs in the research note.
- **Fixtures on disk (untracked, NOT committed yet):** `fixtures/fleet-api/{site_info,live_status,calendar_history_energy}.json`. site_info has unredacted UUIDs, so it gets replaced by the re-run.
- **Next-topic candidates (from the PO):** weather location. Tesla gives no coordinates, so the user must provide them (ZIP/city geocoding via Open-Meteo, browser geolocation, or manual lat/lon). This is for a separate future scope.
- **Open branches:** `phase0/tesla-redaction-fix-tests` (tester, in progress).
