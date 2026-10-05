# B001 — verify-tesla-gets script

## Facts
Build a read-only Node ESM script that the PO runs locally to confirm 4 Tesla Fleet API GETs work, and that saves anonymized responses. **Never call real Tesla or a real DB in tests or while developing. Everything is mocked.**

Module `scripts/verify-tesla-gets.mjs` exports exactly:
```js
export function encrypt(plaintext, keyHex)        // -> { ciphertext, iv }
export function decrypt(ciphertext, iv, keyHex)   // -> string
export function anonymize(value, secrets)         // -> deep copy
export function yesterdayRange(timeZone, now)     // -> { start_date, end_date }
export function checkInvariant(live)              // -> { ok, residualW }
export async function run(deps)                   // -> [{ name, path, status, ok }]
// deps = { fetch, clientId, clientSecret, encryptionKey, now: Date, log: (msg) => void,
//          loadToken: async () => ({ userId, encryptedRefreshToken, iv }),
//          saveToken: async ({ userId, encryptedRefreshToken, iv, accessTokenExpiresAt }) => void,
//          writeFixture: async (name, data) => void }
```
`main()` runs only when the file is executed directly (`import.meta.url === pathToFileURL(process.argv[1]).href`). Importing the module must have no side effects.

**Crypto format** (must match `src/lib/crypto.ts`): AES-256-GCM, key = `Buffer.from(keyHex, "hex")` (32 bytes), random 12-byte IV, `ciphertext` = hex of (encrypted bytes ‖ 16-byte auth tag), `iv` = hex.

**run(deps) flow:**
1. `loadToken()`, then decrypt the refresh token.
2. `POST https://auth.tesla.com/oauth2/v3/token`. Headers: `Content-Type: application/x-www-form-urlencoded`, `Authorization: Basic base64(clientId:clientSecret)`. Body (URLSearchParams): `grant_type=refresh_token`, `refresh_token`, `client_id`. Response: `{ access_token, refresh_token, expires_in }`. If it's not ok, throw an Error whose message includes the status and does **not** contain the refresh token. In that case don't call saveToken and don't make any Fleet call.
3. Encrypt the new refresh_token and `await saveToken({ userId, encryptedRefreshToken, iv, accessTokenExpiresAt: new Date(now + expires_in*1000) })` **before** any Fleet request.
4. Fleet base `https://fleet-api.prd.na.vn.cloud.tesla.com`. Every Fleet request is method GET (or no method given) with header `Authorization: Bearer <access_token>`.
   - `products` → `/api/1/products`. Site id = the `energy_site_id` of the first item with `resource_type === "battery"`. If there's none (or the call fails), record the result and stop.
   - `site_info` → `/api/1/energy_sites/{id}/site_info`. `tz = response.installation_time_zone`, or `"UTC"` if it's missing or the call fails.
   - `live_status` → `/api/1/energy_sites/{id}/live_status`. Log the `checkInvariant(response)` result.
   - `calendar_history_energy` → `/api/1/energy_sites/{id}/calendar_history?kind=energy&period=day&start_date=…&end_date=…&time_zone=…` (values from `yesterdayRange(tz, now)`, URL-encoded).
   - Failure of site_info, live_status, or calendar_history doesn't stop the later calls.
5. For each 2xx response: `writeFixture(name, anonymize(json, secrets))`. `secrets` = the site id as both string and number, plus every value under keys `id`, `din`, `serial_number`, `gateway_id`, `vin` found in the products response.
6. Result per call: `{ name, path, status, ok }`, where `ok` = 2xx and the JSON has a `response` key. `path` is without the query string. Log a table.
7. Never pass the access token, refresh token (old or new), or client secret to `log`. Error bodies are anonymized and truncated to 300 chars before logging.

**anonymize(value, secrets):** deep copy, input unchanged. Object keys matching (case-insensitive) `energy_site_id, id, id_s, asset_site_id, site_name, gateway_id, din, serial_number, vin, email, user_id, address, address_line1, address_line2, city, state, zip, postal_code` get the value `"REDACTED"`. Keys `latitude, longitude, lat, lon, lng` with numeric values are rounded to 1 decimal. Any other string has every occurrence of each secret (stringified) replaced with `"REDACTED"`. Any other number equal to a numeric secret becomes `"REDACTED"`.

**yesterdayRange(timeZone, now):** the calendar day before `now` in `timeZone`. `start_date` = local 00:00:00 and `end_date` = local 23:59:59, both formatted `YYYY-MM-DDTHH:mm:ss±HH:MM` with the local offset at that instant (`Z` is not allowed; UTC → `+00:00`). Example: tz `America/Los_Angeles`, now `2026-11-02T12:00:00Z` → `{ start_date: "2026-11-01T00:00:00-07:00", end_date: "2026-11-01T23:59:59-08:00" }` (DST ends that day). Stdlib only (Intl).

**checkInvariant(live):** `residualW = solar_power + battery_power + grid_power - load_power`; `ok = Math.abs(residualW) <= Math.max(50, 0.05 * load_power)`.

**main():** `dotenv` `config({ path: ".env.local" })`. Env: `DATABASE_URL, TESLA_CLIENT_ID, TESLA_CLIENT_SECRET, ENCRYPTION_KEY`. DB through the installed `postgres` package. Table `voltops_tesla_token`, quoted camelCase columns `"userId"`, `"encryptedRefreshToken"`, `iv`, `"accessTokenExpiresAt"`, `"updatedAt"`. Exactly one row is required, otherwise print the row count and exit 1. saveToken runs an UPDATE … WHERE `"userId"` = $1 and sets `"updatedAt"` = now(). writeFixture writes `fixtures/fleet-api/<name>.json` (2-space JSON, creating the directory). Close the DB connection and exit 1 if any result is not ok. Add package.json scripts `"verify:tesla": "node scripts/verify-tesla-gets.mjs"` and `"test:scripts": "node --test scripts/"`.

## Owned files
- tester: `scripts/verify-tesla-gets.test.mjs`
- implementer: `scripts/verify-tesla-gets.mjs`, `package.json` (scripts block only), `fixtures/fleet-api/.gitkeep`

## Base
- tester: `main`
- implementer: the tester's branch

## Judged by
`node --test scripts/` must exit 0. The tests cover:
- encrypt/decrypt round trip, and decrypt of a ciphertext produced inline in the test with node:crypto in the documented format.
- anonymize: redacted keys at nested depth and inside arrays, coordinate rounding, secret substrings inside strings and numeric secrets, input not mutated.
- yesterdayRange: the DST example above, plus UTC (`+00:00`).
- checkInvariant: one passing and one failing case.
- run() with a fake fetch:
  - the refresh request is shaped correctly;
  - saveToken is called before the first Fleet request;
  - all Fleet requests are GET with Bearer auth;
  - the 4 calls hit the right paths and the calendar query has the right params;
  - fixtures are anonymized (no site id anywhere in the written data);
  - a refresh failure throws, with no saveToken and no Fleet calls;
  - a no-battery products response stops after products;
  - a site_info 500 still runs live_status and calendar (tz falls back to UTC);
  - no token or secret string ever appears in `log` output.
- `pnpm typecheck` still passes (scripts aren't in tsconfig include; just don't break it).
