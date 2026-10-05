# PO to-do

## Decision round 1 — ANSWERED 2026-10-04 (see design/revisions/R001.md) (Verify Fleet API GETs)

Research: `research/fleet-api-get-endpoints/README.md`

**Q1. How do we verify the GETs against your real account?**
- **A (recommended):** I build `scripts/verify-tesla-gets.mjs`, a read-only script you run locally (`node scripts/verify-tesla-gets.mjs`). It reads the encrypted refresh token that your Netlify login already stored in Supabase, refreshes it (writing the rotated token back so the deployed app keeps working), calls each GET once, prints a PASS/FAIL table, and writes anonymized responses to `fixtures/fleet-api/`. You never share a password or token with me. I never call Tesla myself (CLAUDE.md §12).
- B: You paste a short-lived access token into a local env var and I run the calls. That puts a token in this session. Not recommended.
- C: You give me your Tesla login. **No.** That account controls your home hardware and uses MFA.
- D: Add a debug route to the Netlify app that calls all the GETs. This needs a deploy cycle and exposes raw site data on a public URL.
- Answer: **A** — script.

**Q2. Which endpoints are in scope?**
- **Recommended:** Required: `products`, `site_info`, `live_status`, `calendar_history?kind=energy`. Nice to have: `calendar_history?kind=backup`. Optional probes (undocumented, may 4xx): `kind=power`, `kind=soe`. Excluded: `telemetry_history?kind=charge` (vehicle) and all writes.
- Answer: **Required four only.** (Lead: these cover the MVP; backup/power/soe can come later.)

**Q3. Save the responses as anonymized fixtures in `fixtures/fleet-api/` and commit them?**
- **Recommended: yes.** CLAUDE.md requires recorded fixtures before building the adapter, and the field names and signs can't be verified any other way. The script strips site IDs, serials, DINs, emails, names, and addresses, and rounds coordinates. You look the files over before I commit them.
- Answer: **Yes.**

**Q4. Is a one-off run of about 8 requests against your Fleet API budget OK?**
- Energy pricing is unverified (see research). The cost is negligible either way, but it's your bill.
- Answer: **Yes.** (Lead: wake limits are vehicle-only; energy sites don't sleep.)

### Housekeeping (no decision needed, just your action)
- `.env.local` has the **Supabase DB password in plain text in a comment line**. The file is gitignored, but please delete that comment. I tried to check whether any `.env*` file was ever committed, and that check was blocked, so please run this yourself and rotate the password if it prints anything:
  `git log --all --oneline -- .env .env.local`

## Review M1 / B001: run the Fleet API GET check (DONE 2026-10-04)

**Result:** PO ran it at ~20:38 and all 4 GETs returned 200 OK. The PO found no site id. The lead found the vehicle VIN and name in `products.json` (inside the vehicle entry's base64 blob), plus unredacted hardware UUIDs. products.json was deleted, and the fix is B002. Details: `research/fleet-api-responses/README.md`.

Merged to main (6663f5e). Gate: 23/23 tests, typecheck, and `pnpm build` are all green, and the reviewer returned PASS. Agents have never run it against the real API. You are the first.

1. In the repo root (where `.env.local` lives), run:
   `pnpm verify:tesla`
   - Don't log in on voltops.netlify.app while it runs. Both would rotate the same refresh token.
   - It makes 1 token refresh plus 4 GETs, and the new refresh token is saved to Supabase *before* the GETs.
2. Expected: a 4-row table (`products`, `site_info`, `live_status`, `calendar_history_energy`) with status and ok, plus an invariant line (`ok` / `residualW`) showing whether Tesla's signs match VoltOps' conventions.
   - If the refresh fails with 400/401, the stored token is stale. Log in again on Netlify, then re-run.
   - The exit code is 1 if any row is not ok. Send me the table either way; a failure is useful information too.
3. **Before I commit the fixtures**, look over `fixtures/fleet-api/*.json`. In particular, look for your site ID, gateway/battery serials, `warp_site_number`, address, and your name or email. Quick check (PowerShell): `Select-String -Path fixtures\fleet-api\*.json -Pattern "<your site id>"` should print nothing.
4. Paste the printed table and invariant line here. They contain no tokens. Tell me "fixtures clean" or what you found. Then I'll commit the fixtures and write up the field names and signs as research for the `fleet-api` adapter.

## USER INPUT REQUIRED — Daytime re-run of `pnpm verify:tesla` (follow-up after M1; verifies the battery and solar signs)

**2026-10-04: M1 closed by the PO. The night fixtures are committed as the baseline.** The PO will run this tomorrow morning. Nothing else is blocked on it except the adapter's battery and solar sign handling.

**Status 2026-10-04:** a re-run at 21:14 PDT (night) passed all 4 GETs, and the lead's leak scan of the fixtures is clean (no vehicle, no UUIDs, no VIN-like or ID-like values). But solar = 0 and battery = 0 (SoC 19%, below the 20% reserve), so the battery sign is still unverified. **The re-run is still needed in daytime, 11:00–14:00, while the battery is charging.**

B002 (9c69ba1) and B003 (d4bd5c8, extra redaction hardening) are merged. Gate: 37/37 tests, typecheck and build are green, and the reviewer returned PASS. The script now keeps only energy entries in products.json, redacts every UUID and the extra ID keys, and stops with `Missing env: …` if `.env.local` is incomplete. It also strips `cached_data` everywhere.

1. Run it **between about 11:00 and 14:00 while the sun is up and the battery is charging** (check the Tesla app: solar > 0 and the battery showing "charging"):
   `pnpm verify:tesla`
   Don't log in on Netlify while it runs.
2. It overwrites the 3 old fixtures and recreates products.json.
3. Check `fixtures/fleet-api/*.json`:
   - `Select-String -Path fixtures\fleet-api\*.json -Pattern "<your site id>","<your VIN>","vehicle"` should print nothing.
   - Look for your name, address, or serials too.
4. Paste the table and the `live_status invariant` line. Also tell me what the Tesla app showed at the time ("battery charging at X kW, solar Y kW"), so I can match the signs against what you saw. Then say "fixtures clean".

## USER INPUT REQUIRED — Decision round 2 (storage / hosting). Research: `research/storage/README.md`

**Q1. Where does VoltOps run?**
- **A (recommended):** Self-hosted Docker Compose (web + worker + SQLite volume), per CLAUDE.md D1/D2/D5. Netlify stays only as a static host for the Tesla public key `.well-known/...pem`, if needed.
- B: Stay on Netlify + Supabase. There's no worker, so no polling or history (this breaks pillars 1–4), and it's a SaaS shape.
- Answer:

**Q2. Database engine?**
- **A (recommended):** SQLite (WAL) via Drizzle with the built-in `node:sqlite` driver, so there's no native dependency.
- B: SQLite via `better-sqlite3` (mature, but a native build per arch).
- C: Keep Postgres. Overkill for tens of MB/yr, and it adds a container.
- Answer:

**Q3. Skip the `energy_hourly` rollup table (compute hourly from Tesla's 5-min intervals with SQL) until it's measurably slow?** Recommended: **yes** (this deviates from CLAUDE.md §6, and an ADR is needed if accepted).
- Answer:

**Q4. Existing Supabase data:** migrate the token row, or just re-login on the new instance? Recommended: **re-login** (nothing else in Supabase is history worth keeping).
- Answer:
