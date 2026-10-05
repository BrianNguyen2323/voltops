# B002 — fix fixture redaction leaks in verify-tesla-gets

## Facts
The PO's real run showed that `anonymize()` and the fixture writer in `scripts/verify-tesla-gets.mjs` leak data:
1. `/api/1/products` returns vehicles as well as energy sites. Vehicle items (`device_type: "vehicle"`) contain `vin`, `vehicle_id`, `display_name`, and a base64 `cached_data` blob with the VIN and the owner's name. VoltOps is energy-only.
2. Energy items and site_info contain UUID identifiers under keys that aren't redacted: `grid_installation_id`, `device_id`, `site_id`.
3. The products fixture is anonymized before the site id is added to `secrets` (reviewer nit).
4. A missing env var gives a confusing error (reviewer nit).

Required behaviour (it adds to the B001 behaviour; everything else stays the same):
- **Products fixture filter:** before `writeFixture("products", …)`, keep only items in `response` whose `device_type === "energy"` (and set `count` to the filtered length if `count` exists). The `run()` site selection is unchanged (first `resource_type === "battery"`).
- **Redaction keys:** add `device_id`, `site_id`, `grid_installation_id`, `warp_site_number`, `vehicle_id`, `display_name` to the redacted-key set (case-insensitive like the rest).
- **UUID sweep:** in `anonymize`, any string value that *is* a UUID (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`) becomes `"REDACTED"`, whatever its key.
- **Secrets first:** collect `secrets` (site id as string and number, plus the products ID values) *before* anonymizing or writing any fixture, including products.
- **Env check:** `main()` checks `DATABASE_URL, TESLA_CLIENT_ID, TESLA_CLIENT_SECRET, ENCRYPTION_KEY` before doing anything else. If any are missing, it prints `Missing env: <names>` (names only, never values) and exits 1 without touching the DB or network. Put the check in an exported pure helper `missingEnv(env) -> string[]` so it can be tested.

## Owned files
- tester: `scripts/verify-tesla-gets.test.mjs` (add tests; keep the existing 23 passing)
- implementer: `scripts/verify-tesla-gets.mjs`

## Base
- tester: `main`
- implementer: the tester's branch

## Judged by
`node --test "scripts/*.test.mjs"` exits 0. New tests cover:
- run() with a products response holding one vehicle item (with vin, display_name, cached_data) and one energy item → the written products fixture has only the energy item, and `count` is 1.
- `device_id`, `site_id`, `grid_installation_id` are redacted at nested depth, and a UUID under an arbitrary key (e.g. `foo`) is redacted.
- The site id appearing under an unlisted key inside the products response (e.g. `{ other: <siteId> }`) is redacted in the products fixture.
- `missingEnv({ DATABASE_URL: "x" })` returns the three missing names, and `missingEnv(fullEnv)` returns `[]`.
- The tariff/number fields of a site_info sample (e.g. `nameplate_power`, `tariff_content.energy_charges`) pass through unchanged.
