# B003 — redaction hardening (reviewer nits from B002)

## Facts
`scripts/verify-tesla-gets.mjs` writes anonymized Fleet API fixtures from the PO's real account. B002 is merged. Its reviewer left three defence-in-depth nits, and they should land before the PO's next real run:
1. **`cached_data` redacted by key.** Add `cached_data` to `REDACT_KEYS` (case-insensitive like the rest). Today it only appears in vehicle items, which are filtered out, but a base64 blob holding the VIN and owner name must never reach a fixture.
2. **Products filter, missing `device_type`.** Current filter: `(i?.device_type ?? "energy") === "energy" && i?.resource_type !== "vehicle"`. New rule: keep an item when `device_type === "energy"`, OR when `device_type` is absent AND `resource_type` is a non-empty string other than `"vehicle"`. Drop everything else (no device_type and no resource_type → dropped). Set `count` to the filtered length if `count` exists.
3. **Non-array `response`.** If the products body's `response` is not an array, the products fixture is written with `response: []` (and `count: 0` if `count` exists). Do not change the site-selection behaviour of `run()` (it already fails cleanly when no battery is found).

Everything else stays exactly as it is (B001 and B002 behaviour, all existing tests).

## Owned files
- tester: `scripts/verify-tesla-gets.test.mjs` (add tests; keep the existing 32 passing)
- implementer: `scripts/verify-tesla-gets.mjs`

## Base
- tester: `main`
- implementer: the tester's branch

## Judged by
`node --test "scripts/*.test.mjs"` exits 0, and `pnpm typecheck` stays green. The new tests cover:
- `anonymize({ a: { cached_data: "QkFT" } })` → `cached_data` is `"REDACTED"`, and so is `Cached_Data`.
- run() with products `[ {resource_type:"battery", energy_site_id:SITE}, {id:"x"}, {device_type:"vehicle", resource_type:"battery"} ]` → the written fixture has only the first item, and `count` is 1 if it was present.
- run() with a products body whose `response` is an object (not an array) → the written products fixture has `response: []`, and the run fails cleanly the same way it does today when there's no battery.
