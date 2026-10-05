# PO to-do

## USER INPUT REQUIRED — Decision round 1 (Verify Fleet API GETs)

Research: `research/fleet-api-get-endpoints/README.md`

**Q1. How do we verify the GETs against your real account?**
- **A (recommended):** I build `scripts/verify-tesla-gets.mjs`, a read-only script you run locally (`node scripts/verify-tesla-gets.mjs`). It reads the encrypted refresh token that your Netlify login already stored in Supabase, refreshes it (writing the rotated token back so the deployed app keeps working), calls each GET once, prints a PASS/FAIL table, and writes anonymized responses to `fixtures/fleet-api/`. You never share a password or token with me. I never call Tesla myself (CLAUDE.md §12).
- B: You paste a short-lived access token into a local env var and I run the calls. That puts a token in this session. Not recommended.
- C: You give me your Tesla login. **No.** That account controls your home hardware and uses MFA.
- D: Add a debug route to the Netlify app that calls all the GETs. This needs a deploy cycle and exposes raw site data on a public URL.
- Answer:

**Q2. Which endpoints are in scope?**
- **Recommended:** Required: `products`, `site_info`, `live_status`, `calendar_history?kind=energy`. Nice to have: `calendar_history?kind=backup`. Optional probes (undocumented, may 4xx): `kind=power`, `kind=soe`. Excluded: `telemetry_history?kind=charge` (vehicle) and all writes.
- Answer:

**Q3. Save the responses as anonymized fixtures in `fixtures/fleet-api/` and commit them?**
- **Recommended: yes.** CLAUDE.md requires recorded fixtures before building the adapter, and the field names and signs can't be verified any other way. The script strips site IDs, serials, DINs, emails, names, and addresses, and rounds coordinates. You look the files over before I commit them.
- Answer:

**Q4. Is a one-off run of about 8 requests against your Fleet API budget OK?**
- Energy pricing is unverified (see research). The cost is negligible either way, but it's your bill.
- Answer:

### Housekeeping (no decision needed, just your action)
- `.env.local` has the **Supabase DB password in plain text in a comment line**. The file is gitignored, but please delete that comment. I tried to check whether any `.env*` file was ever committed, and that check was blocked, so please run this yourself and rotate the password if it prints anything:
  `git log --all --oneline -- .env .env.local`
