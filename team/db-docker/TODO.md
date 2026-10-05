# PO to-do — db-docker

## USER INPUT REQUIRED — Decision round 1 (storage / hosting). Research: `research/storage/README.md`

(Moved from tesla-api-connection "Decision round 2" on 2026-10-05.)

**Q1. Where does VoltOps run?** A (recommended): self-hosted Docker Compose + SQLite volume. B: stay on Netlify + Supabase.
- Answer: **A** (PO, 2026-10-05).

**Q2. Database engine?** A (recommended): SQLite (WAL) via Drizzle + the built-in `node:sqlite`. B: better-sqlite3. C: Postgres.
- Answer: **A** (PO, 2026-10-05).

**Q3. Skip the `energy_hourly` table for now?** (Re-asked: the PO asked what an ADR is, and about request limits.)
- This does **not** change how many Tesla requests we make. `calendar_history` returns the whole day's 288 five-minute intervals in **one** request, about 30 a month. Q3 only decides whether we *also* keep a second, hourly copy of data we already store, or add up the 5-minute rows with SQL when a chart needs hourly totals. That runs locally and costs nothing.
- ADR = Architecture Decision Record: a ~10-line file in `docs/adr/NNNN-title.md` (context, decision, consequences). CLAUDE.md §3 requires one whenever we deviate from a PROPOSED item, and §6 lists `energy_hourly`.
- Recommended: **yes, skip it.** I write `docs/adr/0001-no-hourly-rollup-table.md`. We add the table later only if a chart query is measurably slow.
- Answer:

**Q4. Existing Supabase data:** migrate the token, or re-login?
- Answer: **Re-login** (PO, 2026-10-05).

**Q5. Logging in to Tesla from the Docker instance.** Tesla's redirect URI must match exactly what's registered. Today that's `https://voltops.netlify.app/api/auth/callback`. Sources disagree on whether `http://localhost` is allowed.
- **A (recommended), try first:** add `http://localhost:3000/api/auth/callback` to Allowed Redirect URIs in your app on developer.tesla.com. Tell me whether Tesla accepts it when you save. It's a zero-code test.
- B (fallback if A is rejected): keep the Netlify URL registered. Netlify serves one static HTML file at that path that forwards `?code=&state=` to `http://localhost:3000/api/auth/callback` in your browser. Tesla never sees localhost. PKCE + state still protect it.
- C: a tunnel (Cloudflare Tunnel / Tailscale Funnel) with a real HTTPS hostname. More setup.
- Answer:

**Q6. Who can log in once the multi-user `users` table is gone?**
- **A (recommended):** Tesla OAuth stays as the login. The first Tesla account that connects becomes the owner (its `sub` is saved in `settings`). Any other Tesla account is rejected. The session cookie then means just "owner". The admin password (D10) is a later scope.
- B: build the D10 admin password now, in this scope.
- Answer:

**Q7. Scope boundary.**
- **Recommended:**
  - **In:** swap the schema to SQLite (single owner; tables `settings`, `credentials`, `sites`, `tariff_schedule`), Drizzle migrations run at container start, Dockerfile (Next `output: "standalone"`, `node:22-slim` to match your local Node 22) + `docker-compose.yml` (`web` service + named volume `/data`), `.env.example`, the verify script reads the token from SQLite, and remove the Supabase/Postgres deps.
  - **Out:** the monorepo split, the worker container (added when the worker scope starts), the admin password, and the Phase 2 tables (samples, intervals, weather...).
- Answer:

**Q8. Retire the Netlify app deploy?** SQLite can't persist on Netlify, so the app there stops working once this merges.
- **Recommended: yes.** Netlify keeps serving only static files: the Tesla public key `.well-known/.../public-key.pem`, plus the Q5-B forwarder if needed. Do your daytime `pnpm verify:tesla` run **before** this merges, because it reads the token from Supabase.
- Answer:
