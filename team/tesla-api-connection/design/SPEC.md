# SPEC — Tesla API Connection

Revision 1

## Goal
Confirm, against the PO's real Tesla account, that the Fleet API GET requests the MVP needs work, and record anonymized responses as fixtures. This is the ground truth for field names and signs (CLAUDE.md §5).

## Scope (decisions R1: Q1–Q4)
- MVP GETs, all read-only on scope `energy_device_data`:
  1. `GET /api/1/products`
  2. `GET /api/1/energy_sites/{id}/site_info`
  3. `GET /api/1/energy_sites/{id}/live_status`
  4. `GET /api/1/energy_sites/{id}/calendar_history?kind=energy&period=day&start_date&end_date&time_zone`
- Out: `kind=backup`, the undocumented `kind=power` and `kind=soe`, `telemetry_history`, and every write endpoint.
- Base URL: `https://fleet-api.prd.na.vn.cloud.tesla.com`. Token URL: `https://auth.tesla.com/oauth2/v3/token`.

## Tool: `scripts/verify-tesla-gets.mjs`
The PO runs it locally (`pnpm verify:tesla`). Agents never run it against the real API.

### Flow (`run(deps)`)
1. `loadToken()` gives the single stored token row. Decrypt it (AES-256-GCM, same format as `src/lib/crypto.ts`: hex ciphertext with the 16-byte auth tag appended, plus a hex 12-byte IV).
2. Refresh: `POST` the token URL with `Content-Type: application/x-www-form-urlencoded`, `Authorization: Basic base64(clientId:clientSecret)`, and body `grant_type=refresh_token&refresh_token=…&client_id=…`. If the refresh fails, throw an error that includes the HTTP status and never the token. Do not save anything and do not make any GET.
3. **Before any Fleet call**, encrypt the rotated `refresh_token` and `await saveToken(...)`. Tesla invalidates the old refresh token, so skipping this locks out the Netlify app.
4. GET products. The site is the first item with `resource_type === "battery"`. If there's none, record a failure and stop.
5. GET site_info. `tz = response.installation_time_zone`, or `"UTC"` if it's missing or the call fails.
6. GET live_status, then log the `checkInvariant` result.
7. GET calendar_history for yesterday in site-local time (`yesterdayRange(tz, now)`).
8. One failing GET (other than products) doesn't stop the rest.
9. For each 2xx JSON response, `writeFixture(name, anonymize(json, secrets))`. Names: `products`, `site_info`, `live_status`, `calendar_history_energy`. `secrets` = the site id as both string and number, plus every `id`, `din`, `serial_number`, `gateway_id`, and `vin` value seen in products.
10. Print a table and return `[{ name, path, status, ok }]`. `ok` = 2xx and the body has a `response` key.
11. Never log an access token, a refresh token, or the client secret. Error bodies are anonymized and truncated to 300 chars before logging.

### Pure helpers
- `anonymize(value, secrets)`: deep copy. Keys matching (case-insensitive) `energy_site_id, id, id_s, asset_site_id, site_name, gateway_id, din, serial_number, vin, email, user_id, address, address_line1, address_line2, city, state, zip, postal_code` become `"REDACTED"`. Keys `latitude`, `longitude`, `lat`, `lon`, `lng` are rounded to 1 decimal. Every occurrence of a secret inside any string becomes `"REDACTED"`, and a number equal to a numeric secret becomes `"REDACTED"`.
- `yesterdayRange(timeZone, now)` returns `{ start_date, end_date }`: local 00:00:00 and 23:59:59 of the day before `now`, in `timeZone`, as RFC3339 with that instant's local offset (e.g. `2026-10-03T00:00:00-07:00`). The offset can differ between start and end on DST days. The date format Tesla expects is **unverified**, and this run tests it.
- `checkInvariant(live)` returns `{ ok, residualW }`, where `residualW = solar_power + battery_power + grid_power - load_power` and `ok = |residualW| <= max(50, 0.05 * load_power)`. If `ok` holds, Tesla's signs match the VoltOps canonical signs.

### Wiring (`main`, only when run directly)
dotenv loads `.env.local`. `postgres` (already installed) connects with `DATABASE_URL`. The table is `voltops_tesla_token` with quoted camelCase columns: `"userId"`, `"encryptedRefreshToken"`, `iv`, `"accessTokenExpiresAt"`, `"updatedAt"`. Exactly one row is required, otherwise exit 1 with the row count. Fixtures go to `fixtures/fleet-api/<name>.json` (pretty JSON). Uses global `fetch`.

## Tests
`node:test` (stdlib, no new dependency). Command: `node --test "scripts/*.test.mjs"`. Everything is mocked: no network, no DB.
