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

**Result (DONE 2026-10-05 11:06):** 4/4 OK, invariant residual 0. The app showed battery charging at 1.3 kW and solar at 5.5 kW; the fixture has battery -1267 W and solar 5469 W. Signs match the canonical ones 1:1. The PO said "fixtures clean", and the lead's leak scan is clean too. Committed as b452729.

_Storage/hosting moved to `team/db-docker/TODO.md` on 2026-10-05._

## USER INPUT REQUIRED — Decision round 2 (fleet-api adapter)

Research: `research/fleet-api-adapter/README.md`. Tesla's signs match VoltOps' 1:1, and the 5-minute calendar_history data balances exactly (residual 0 Wh in all 288 intervals).

**Q1. Where does the adapter code live?**
- **A (recommended):** new files in the current app, `src/lib/core/` (DataSource + LiveSample/EnergyInterval types) and `src/lib/sources/fleet-api/`. They'll be pure, so they move to `packages/` unchanged later. This doesn't collide with db-docker.
- B: Scaffold the CLAUDE.md §4 pnpm monorepo first (Phase 1-A). That's a big move while db-docker is mid-flight in `src/`.

**Q2. What's in the first adapter milestone?**
- **A (recommended):** the DataSource interface, the pure mappers (live_status → LiveSample, calendar_history → EnergyInterval[]), and a fleet client (in-memory access-token cache, refresh serialized via a SQLite write transaction, typed errors `AuthExpired`/`RateLimited`/`SourceUnavailable`, invariant warning). Everything is tested against the committed fixtures, with no network. `src/lib/tesla.ts` and the Now route switch to it after db-docker B002 merges.
- B: A, plus the worker process, polling and a `samples` table. That's CLAUDE.md Phase 2a-C; I'd keep it a separate scope.

**Q3. Default data budget (CLAUDE.md open question 4)?** At about $1 per 500 requests (unverified for energy endpoints) with a $10/month credit:
- **A (recommended):** calendar_history once an hour as the history source (5-minute Wh, about 720 req/month ≈ $1.44), and live_status only while the Now screen is open (at most 1/min). That's well under the credit. It needs one check: does calendar_history for *today* return the partial day? I'd add that as a probe to `pnpm verify:tesla` (1 extra GET) for you to run once.
- B: live_status every 5 min, the CLAUDE.md default: 8,640 req/month ≈ $17.28, about $7.28 over the credit.
- C: live_status every 15 min: 2,880 req/month ≈ $5.76, inside the credit, but coarse.
- Optional for you: developer.tesla.com → your app → billing/usage. Do your verify runs show up as charged? That settles the energy-endpoint price.

**Q4. Region (the base URL is hard-coded to North America)?**
- **A (recommended):** env `TESLA_FLEET_BASE_URL`, default NA, documented in `.env.example`. Auto-detect via `/api/1/users/region` later, when an EU user shows up.
- B: Auto-detect at connect time now and store it. That needs a db-docker schema column.

**Q5. Fix the token refresh in the current `src/lib/tesla.ts` now?** Today it rotates the refresh token on *every* live request, and two concurrent requests can lock you out.
- **A (recommended):** no separate fix. The Q2 client replaces it once db-docker B002 merges, and B002 already owns that file.
- B: A small hot-fix brief in db-docker now (cache the access token in memory).

Answer inline (e.g. "1A 2A 3A 4A 5A") or in chat.
