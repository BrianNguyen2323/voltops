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

## ANSWERED 2026-10-05 — Review: M1 + M2 on `database-docker` (all four briefs merged)
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

## ANSWERED 2026-10-05 — Re-test after B005 + B006 (both merged into `database-docker`)
Gate: vitest 34/34, test:scripts 45/45, typecheck, lint, build, docker smoke PASS.
1. `docker compose up -d --build`. It rebuilds on the fixed code and keeps your `voltops-data` volume (admin password + Tesla connection carry over).
2. Open http://localhost:3000. You should land on `/login`; log in. `/home` should show "Tesla connected".
3. Optional: re-run **Connect Tesla**. After Tesla's page, you should land on `http://localhost:3000/home`, not `0.0.0.0`.
4. `docker compose restart`, then reload: still "Tesla connected".
5. If all good: merge `database-docker` into `main` (your call), then check that the Netlify public-key URL still loads.
- Result: **Everything looks good** (PO, 2026-10-05). The PO merged `database-docker` into `main` (PR #7). Scope closed; see CLOSEOUT.md.

## ANSWERED 2026-10-05 — Decision round 2: config + hygiene follow-ups (see design/revisions/R003.md)
Scope reopened. Input: `CLOSEOUT.md` "Suggestions — next round". I checked each one against the code on `main` (968882e).

**Q1. What's in this round?**
- **A (recommended):** items 1 (fail-fast config), 2 (stop logging Tesla bodies), 4 (smoke `SMOKE_PORT` + redirect_uri assertion), and 6 (cleanup batch). That's one milestone, M3, with about 3 briefs. Each is small, and 1 + 2 fix real problems: the 500 you hit, and site data in logs.
- B: A plus item 3 (deflake vitest: cheaper argon2 params in tests, raised timeouts).
- C: everything (1–7), including the image shrink (5) and auth hardening (7).
- Deferred under A: item 5 fits better with the CI/GHCR scope, where image size costs push time. Item 7 is a separate small auth round.
- Answer: **A** (PO, 2026-10-05). Items 1, 2, 4, 6 → milestone M3.

**Q2. How should bad config fail?** Why it 500'd: `src/env.js` already validates every variable with zod, but the standalone server only loads it on the first request, so the container looks "healthy".
- **A (recommended):** move the zod schema into one plain file that `src/env.js` and a new `scripts/check-env.mjs` both import. The container CMD runs `check-env → migrate → server`. A bad `.env` makes `docker compose up` exit with a readable line, e.g. `VOLTOPS_SECRET_KEY missing (old name: ENCRYPTION_KEY — rename it)`. Also add a compose `healthcheck` on `/login` (using node's `fetch`, since the slim image has no curl).
- B: a Next `instrumentation.ts` hook that imports `env` at server start. Less code, but I haven't verified that a throw there stops the process in Next 15, so it might still start "healthy".
- Answer: **A** (PO, 2026-10-05).

**Q3. Tesla logging in the callback** (`src/app/api/auth/callback/route.ts` lines 125, 129, 133–134). Today a failed `site_info`/`products` call logs Tesla's full response body, and a success logs the tariff ID and timezone.
- **A (recommended):** log the HTTP status + Tesla's `error` code only (the token-exchange path at line 71 already does this). Keep "Energy site: found/none", and drop the timezone and tariff lines.
- B: also remove the live-reading printout in `src/lib/tesla.ts:128–133` (power values only, no IDs; it's used by `verify:tesla`).
- Answer: **A, but keep the timezone line** (PO, 2026-10-05). Drop only the tariff-ID line and the body logs.

**Q4. Stale local branches.** `database-docker` (merged via PR #7) and 7 leftover `worktree-agent-*` branches, which have no worktrees.
- **A (recommended):** I delete them locally with `git branch -d` (safe delete, so it refuses anything unmerged and I'll list those for you). You delete `origin/database-docker` on GitHub yourself.
- B: leave them.
- Answer: **A** (PO, 2026-10-05). Done: all 8 were merged, so `git branch -d` deleted them. The PO deletes `origin/database-docker`.

## ANSWERED 2026-10-05 — Review: M3 on `main` (84b059c)
Gate on main: vitest 39/39, test:scripts 55/55, typecheck, lint 0 errors, build, and `SMOKE_PORT=3100 bash scripts/docker-smoke.sh` PASS. The smoke test ran with **your** `.env` and came up healthy, so your config already passes the new check.

What to try:
1. **Rebuild:** `docker compose up -d --build`. Your `voltops-data` volume is kept. Then `docker compose ps`: after ~20 s, `web` should show `(healthy)`.
2. **Fail-fast:** temporarily rename `VOLTOPS_SECRET_KEY` in `.env` to `ENCRYPTION_KEY`, then run `docker compose up -d --force-recreate`.
   - `docker compose ps` shows `web` **restarting** (because of `restart: unless-stopped`).
   - `docker compose logs web` shows `VOLTOPS_SECRET_KEY missing (old name: ENCRYPTION_KEY — rename it)`. No secret value is printed.
   - Rename it back and recreate.
3. **Logs:** log in, click **Connect Tesla**, finish the Tesla login, then `docker compose logs web | findstr "Tesla OAuth"`. You should see "Energy site: found" + "Timezone: …". There should be no tariff line and no JSON bodies.
4. **Optional port:** put `VOLTOPS_PORT=3001` in `.env` and recreate. The app moves to http://localhost:3001. Only do this if you also change `TESLA_REDIRECT_URI` and the Tesla portal entry, so normally leave it unset.
5. Also gone: `src/app/page_extras.tsx` and the Supabase registry. `pnpm verify:tesla` now errors on a wrong `DATABASE_PATH` instead of creating an empty DB.
- Result (partial, PO 2026-10-05): step 3 printed nothing.
  - Lead diagnosis: not a bug. The container was created 19:03 PDT and is healthy, and its log has only startup lines. The last Tesla connect in the DB was 14:44 PDT, so Connect Tesla hasn't run on this container. `docker compose logs` shows only the current container, so step 2's `--force-recreate` started a fresh log.
  - PO to redo step 3: Connect Tesla first, then `docker compose logs web | findstr /C:"Tesla OAuth"`.
  - Second try, still nothing. **Root cause: my step was wrong.** `/home` hides the Connect Tesla button once credentials exist (`src/app/(protected)/home/page.tsx:9-19`), so the PO had nothing to click. The DB still showed the last connect at 14:44 PDT. Workaround: open http://localhost:3000/api/auth/tesla directly.
  - **Follow-up (UI gap):** add a "Reconnect Tesla" link on `/home` when connected, plus show `?error=`. Goes with CLOSEOUT item 7.

**Next (my recommendation, answer with your review):** M1–M3 are 3 milestones, so the team process calls for an **optimization round**:
- a `cleaner` pass;
- a perf/size pass: the 898 MB image shrink, CLOSEOUT item 5;
- the small nits logged in `done/B007` / `B008` / `B009`;
- you run `/improve-codebase-architecture` in this session.
- Reply "optimize", "skip", or name what you want next (e.g. CI, monorepo split, `replay` source).
- Answer: **optimize** (PO, 2026-10-05). The step 3 retry via `/api/auth/tesla` wasn't reported; treated as non-blocking. This round is M4 (SPEC Rev 4, R004), integrated on the PO's `optimization-round` branch.

## ANSWERED 2026-10-05 — Restart Docker Desktop (B010 was blocked)
Docker Desktop crashed while the B010 tester was running the smoke build. Every `docker` command now returns `Docker Desktop is unable to start`, and your `voltops-web-1` is down too. I didn't restart it myself, because it's your engine and your container.
1. Quit Docker Desktop from the tray icon, then start it again. If it still won't start: Troubleshoot (bug icon) → **Restart**, and if that fails, run `wsl --shutdown` in a terminal and start Docker Desktop again.
2. Check with `docker ps`. `voltops-web-1` should come back by itself (`restart: unless-stopped`); if not, run `docker compose up -d` in the repo.
3. Tell me "docker up". I clear the leftover smoke resources (`docker compose -p voltops-smoke down -v`, which touches only the smoke project) and re-run the B010 size check.
- **Likely cause: your C: drive filled up.** A member saw C: at 100% (0 bytes free) at about the time of the crash. It's back to 16 GB free (93% used), probably because the crashed build released space. Docker Desktop keeps its disk image and build cache on C:. Before restarting, consider freeing space on C:, or after it's up run `docker builder prune` (frees only build cache, not your volume). Optional: Settings → Resources → Advanced → move the disk image location to D:.
- Answer: **docker up** (PO, 2026-10-05). The PO moved the Docker Desktop disk image to G:. Engine 29.8.2, `voltops-web-1` healthy, C: 50 GB free. No `voltops-smoke` leftovers.

## USER INPUT REQUIRED — Optimization round: run `/improve-codebase-architecture`
Non-blocking; do it whenever suits you. M4 (B010 image shrink, B011 nits, B012 cleaner) runs meanwhile.
- In this session, run `/improve-codebase-architecture`. Tell me which of its suggestions you pick (or "none").
- Your pick becomes SPEC Revision 5. Likely candidates from CLOSEOUT: the monorepo split (`apps/web`, `packages/core`, `packages/db`), or deepening the Tesla client/`DataSource` seam.
- Answer:
