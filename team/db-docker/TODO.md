# PO to-do — db-docker

## Decision round 1 — ANSWERED 2026-10-05 (see design/revisions/R001.md) (storage / hosting). Research: `research/storage/README.md`

(Moved from tesla-api-connection "Decision round 2" on 2026-10-05.)

**Q1. Where does VoltOps run?** A (recommended): self-hosted Docker Compose + SQLite volume. B: stay on Netlify + Supabase.
- Answer: **A** (PO, 2026-10-05).

**Q2. Database engine?** A (recommended): SQLite (WAL) via Drizzle + the built-in `node:sqlite`. B: better-sqlite3. C: Postgres.
- Answer: **A** (PO, 2026-10-05).

**Q3. Skip the `energy_hourly` table for now?** (Re-asked: the PO asked what an ADR is, and about request limits.)
- This does **not** change how many Tesla requests we make. `calendar_history` returns the whole day's 288 five-minute intervals in **one** request, about 30 a month. Q3 only decides whether we *also* keep a second, hourly copy of data we already store, or add up the 5-minute rows with SQL when a chart needs hourly totals. That runs locally and costs nothing.
- ADR = Architecture Decision Record: a ~10-line file in `docs/adr/NNNN-title.md` (context, decision, consequences). CLAUDE.md §3 requires one whenever we deviate from a PROPOSED item, and §6 lists `energy_hourly`.
- Recommended: **yes, skip it.** I write `docs/adr/0001-no-hourly-rollup-table.md`. We add the table later only if a chart query is measurably slow.
- Answer: **Yes, skip it** (PO, 2026-10-05).

**Q4. Existing Supabase data:** migrate the token, or re-login?
- Answer: **Re-login** (PO, 2026-10-05).

**Q5. Logging in to Tesla from the Docker instance.** Tesla's redirect URI must match exactly what's registered. Today that's `https://voltops.netlify.app/api/auth/callback`. Sources disagree on whether `http://localhost` is allowed.
- **A (recommended), try first:** add `http://localhost:3000/api/auth/callback` to Allowed Redirect URIs in your app on developer.tesla.com. Tell me whether Tesla accepts it when you save. It's a zero-code test.
- B (fallback if A is rejected): keep the Netlify URL registered. Netlify serves one static HTML file at that path that forwards `?code=&state=` to `http://localhost:3000/api/auth/callback` in your browser. Tesla never sees localhost. PKCE + state still protect it.
- C: a tunnel (Cloudflare Tunnel / Tailscale Funnel) with a real HTTPS hostname. More setup.
- Answer: **A** (PO, 2026-10-05). The PO tries it in the portal; the result is still to be reported (see below).

**Q6. Who can log in once the multi-user `users` table is gone?**
- **A (recommended):** Tesla OAuth stays as the login. The first Tesla account that connects becomes the owner (its `sub` is saved in `settings`). Any other Tesla account is rejected. The session cookie then means just "owner". The admin password (D10) is a later scope.
- B: build the D10 admin password now, in this scope.
- Answer: **B** (PO, 2026-10-05). The admin password is now in scope.

**Q7. Scope boundary.**
- **Recommended:**
  - **In:** swap the schema to SQLite (single owner; tables `settings`, `credentials`, `sites`, `tariff_schedule`), Drizzle migrations run at container start, Dockerfile (Next `output: "standalone"`, `node:22-slim` to match your local Node 22) + `docker-compose.yml` (`web` service + named volume `/data`), `.env.example`, the verify script reads the token from SQLite, and remove the Supabase/Postgres deps.
  - **Out:** the monorepo split, the worker container (added when the worker scope starts), the admin password, and the Phase 2 tables (samples, intervals, weather...).
- Answer: **Recommended** (PO, 2026-10-05). Adjusted: the admin password moves in (Q6 B), and `settings` is deferred (no consumer).

**Q8. Retire the Netlify app deploy?** SQLite can't persist on Netlify, so the app there stops working once this merges.
- **Recommended: yes.** Netlify keeps serving only static files: the Tesla public key `.well-known/.../public-key.pem`, plus the Q5-B forwarder if needed. Do your daytime `pnpm verify:tesla` run **before** this merges, because it reads the token from Supabase.
- Answer: **Yes** (PO, 2026-10-05).

## Follow-up — ANSWERED 2026-10-05 (see design/revisions/R002.md)

**Q2b. SQLite driver (correction to my Q2 recommendation).** While writing the spec I found that the Drizzle you have installed (0.45, the current stable release) has **no** `node:sqlite` driver. It only exists in Drizzle 1.0 pre-releases (rc.5), and the Drizzle docs I cited describe 1.0. Sorry, I should have checked the installed version first.
- **A (recommended):** `better-sqlite3` on stable Drizzle 0.45. Mature, the most-used SQLite driver for Node. Prebuilt binaries cover Windows and linux x64/arm64, so normally nothing gets compiled.
- B: upgrade to Drizzle 1.0 rc and use `node:sqlite`. No native dependency, but a pre-release ORM plus an experimental Node module.
- The schema code is identical either way; only the connection line and one package differ.
- Answer: **A** (PO, 2026-10-05).

**Q5 result.** On developer.tesla.com → your app → Allowed Redirect URIs, add `http://localhost:3000/api/auth/callback` and save. Tell me "accepted" or paste the error. If it's rejected, I add a small brief for the Netlify forwarder page (Q5-B). Nothing in B001–B004 waits on this.
- Result: **accepted**. The portal lists `http://localhost:3000/api/auth/callback` and `https://voltops.netlify.app/api/auth/callback` (PO, 2026-10-05).

## ANSWERED 2026-10-05 — Which branch do db-docker merges go to?
You checked out a new branch `database-docker` at 00:28 (pushed to origin). Since then all db-docker records (e0d5d90..b78ef6b) are on it, and `main` is still at 32a8288. The team process assumes the lead merges finished work into `main`.
- **A (recommended):** `main`. I fast-forward `main` to `database-docker` (records only, no code), merge every brief into `main`, and you can delete `database-docker`.
- B: `database-docker` is the integration branch for this scope. I merge briefs there, and you merge it into `main` yourself when M2 is done.
- Answer: **B** (PO, 2026-10-05). Merge briefs into `database-docker`. The PO merges it into `main` after checking it.

## ANSWERED 2026-10-05 — Re-run the B002 (admin password) review?
You stopped the B002 reviewer mid-run, so it gave no verdict. Its last note hinted the build failed. I re-ran the gate command on `phase1/auth-admin-impl` (fa0d89d): 30/30 tests pass, and typecheck, lint and build are all green. The build is fine.
- **A (recommended):** spawn a fresh reviewer on `phase1/auth-admin-impl`. If it returns PASS, B002 joins B001 and B003 for merging.
- B: hold B002 (tell me why: a spec change, a different approach, or something else).
- Answer: **A** (PO, 2026-10-05).

## ANSWERED 2026-10-05 — Start Docker Desktop
B004's acceptance test builds the container and runs it with `docker compose`. Docker Desktop is installed (Compose v2.29.1), but the engine isn't running (`docker version` can't reach `dockerDesktopLinuxEngine`). Please start Docker Desktop and tell me "docker up". The B004 tester is already working; the implementer needs Docker running.
- Answer: **docker up** (PO, 2026-10-05). Engine 29.8.2 linux/amd64 confirmed.

## USER INPUT REQUIRED — Review: M1 + M2 on `database-docker` (all four briefs merged)
Gate on `database-docker`: vitest 30/30, test:scripts 43/43, typecheck, lint, clean build, and `bash scripts/docker-smoke.sh` PASS.
What to try:
1. **`.env`:** compare it with `.env.example` (I only checked key names, not values; your `.env` has no plain `KEY=value` lines, so it may need redoing). Needed: `TESLA_CLIENT_ID`, `TESLA_CLIENT_SECRET`, `TESLA_REDIRECT_URI=http://localhost:3000/api/auth/callback`, `SESSION_SECRET` (≥32 chars), `VOLTOPS_SECRET_KEY` (≥64 chars). **Leave `DATABASE_PATH` unset**: compose's `.env` overrides the image's `/data/voltops.db`.
2. **Start it:** `docker compose up -d --build`, then open http://localhost:3000. You should land on `/setup`. Set a password of 12+ characters, and you go to `/home`.
3. **Connect Tesla:** on `/home`, click **Connect Tesla**, log in at Tesla, and you're back on `/home` showing "Tesla connected". The token is now in SQLite on the `voltops-data` volume, so Tesla needs a fresh login (Q4).
4. **Persistence:** `docker compose restart`, then reload. You still have to log in with your password (no new setup), and the page still says "Tesla connected".
5. **Wrong password:** log out, try a wrong password, and you should see "Incorrect password".
6. **Merge:** merge `database-docker` into `main` when you're happy. Once that lands, Netlify publishes only `public/`. Then check that https://voltops.netlify.app/.well-known/appspecific/com.tesla.3p.public-key.pem still loads.
- Known: the image is ~900 MB (follow-up 14). On Windows, run the smoke script from a path on D:, because Docker bake refuses a Temp-folder build context.
- Result: (PO, 2026-10-05) `docker compose up -d --build` builds, but http://localhost:3000 returns 500. Lead diagnosis:
  - the `.env` has the old `ENCRYPTION_KEY` instead of `VOLTOPS_SECRET_KEY`, so env validation fails;
  - `TESLA_CLIENT_SECRET` contains `$` and Compose reads `$XU` as a variable;
  - an empty `DATABASE_PATH=` overrides `/data/voltops.db`, and the app silently uses a temp DB.
  - **PO steps:** rename `ENCRYPTION_KEY` → `VOLTOPS_SECRET_KEY` (same 64-char value), delete the `DATABASE_PATH=` line, single-quote the `TESLA_CLIENT_SECRET` value, then `docker compose up -d --force-recreate`. Code hotfix: B005.

## ANSWERED 2026-10-05 — Free port 3000 for the B005 smoke test
The B005 code is green (31 + 45 tests, typecheck, build). Its Docker smoke test needs port 3000, and your `voltops-web-1` container is using it (up since your `.env` fix).
- **A (recommended):** when you're done testing, run `docker compose down` (no `-v`, so your volume and DB are kept) and tell me "port free". I run the smoke test, merge B005, and you `docker compose up -d --build` again on the fixed code.
- B: tell me "stop it", and I run `docker compose stop` for you.
- Answer: **port free** (PO, 2026-10-05). Smoke PASS; B005 merged.
