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

## USER INPUT REQUIRED — 2 items before the build starts

**Q2b. SQLite driver (correction to my Q2 recommendation).** While writing the spec I found that the Drizzle you have installed (0.45, the current stable release) has **no** `node:sqlite` driver. It only exists in Drizzle 1.0 pre-releases (rc.5), and the Drizzle docs I cited describe 1.0. Sorry, I should have checked the installed version first.
- **A (recommended):** `better-sqlite3` on stable Drizzle 0.45. Mature, the most-used SQLite driver for Node. Prebuilt binaries cover Windows and linux x64/arm64, so normally nothing gets compiled.
- B: upgrade to Drizzle 1.0 rc and use `node:sqlite`. No native dependency, but a pre-release ORM plus an experimental Node module.
- The schema code is identical either way; only the connection line and one package differ.
- Answer:

**Q5 result.** On developer.tesla.com → your app → Allowed Redirect URIs, add `http://localhost:3000/api/auth/callback` and save. Tell me "accepted" or paste the error. If it's rejected, I add a small brief for the Netlify forwarder page (Q5-B). Nothing in B001–B004 waits on this.
