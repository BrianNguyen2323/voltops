# B019: Rewrite README.md (what VoltOps is, its goals, how to start it)

Requested by the PO on 2026-10-08, delegated to a Haiku model.

## Facts
- The current `README.md` is still the create-t3-app boilerplate (T3, NextAuth, Prisma, tRPC). None of that describes VoltOps. Replace it completely.
- **What VoltOps is** (CLAUDE.md §1; paraphrase, don't paste):
  - an open-source, **self-hosted** companion dashboard for Tesla Solar + Powerwall owners. One instance = one household;
  - it collects live energy data from the user's own system, logs weather, learns usage patterns, and gives clear, explainable advice. Example: "Raise backup reserve to 61% tonight": tomorrow's peak window needs about 11 kWh, and this saves ≈ $2.53 versus buying that energy at peak;
  - Tesla credentials and data never leave the instance. **No telemetry, no accounts, no SaaS.**
- **Pillars:** Observe → Understand → Predict → Advise → (later, opt-in) Act. Advice only today: VoltOps never writes to the Powerwall.
- **Non-goals:** multi-tenant accounts, billing, telemetry, vehicle features.
- **What works today:**
  - the `/home` dashboard: live power flow (solar / home / Powerwall / grid), today's cost by TOU period from the user's Tesla tariff, a 48 h timeline with a forecast range, the last 7 days, tomorrow's weather, the "Peak hours" estimate and the reserve advice;
  - a background **worker** that pulls Tesla `calendar_history` hourly (backfilling 7 days), one `live_status` per hour, and Open-Meteo weather every 3 h (gap-filling past weather up to 92 days). About 1,440 Tesla requests/month, inside Tesla's monthly developer credit;
  - energy history is kept forever (SQLite);
  - demo mode works without a Powerwall.
- **Roadmap** (CLAUDE.md §10, short): Plan/Trends/Accuracy/Settings/Health screens, better forecast models with backtests, a local-gateway adapter (pypowerwall), a tariff editor, Home Assistant/MQTT export, and opt-in automation with guardrails (Phase 3).
- **Stack:** TypeScript (strict), Next.js App Router run as a long-lived Node server, a separate worker process (esbuild bundle), SQLite (WAL) + Drizzle, Tailwind + shadcn/ui + Recharts, Vitest, Docker Compose. Node 22, pnpm 9 (`packageManager: pnpm@9.15.4`).
- **Env vars** (`.env.example`; copy it to `.env`):
  - `TESLA_CLIENT_ID`, `TESLA_CLIENT_SECRET`, `TESLA_REDIRECT_URI` (default `http://localhost:3000/api/auth/callback`; its port must match `VOLTOPS_PORT`);
  - `SESSION_SECRET` (≥ 32 chars), `VOLTOPS_SECRET_KEY` (64 hex chars, AES-256-GCM key for stored Tesla tokens);
  - optional: `DATABASE_PATH` (default `./data/voltops.db`), `AUTH_DISABLED`, `VOLTOPS_PORT`, `TESLA_FLEET_BASE_URL`, `SITE_LATITUDE`/`SITE_LONGITUDE` (needed for weather; 2 decimals), `TEMPERATURE_UNIT` (F/C), `VOLTOPS_DEMO=true`;
  - give working generator commands for the secrets, e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` (64 hex chars).
- **Tesla:** users bring their own Tesla developer app (developer.tesla.com): client id/secret, redirect URI, scopes `openid offline_access energy_device_data`. Fleet API is pay-per-use, so polling frequency affects the user's bill. Keep this section short and factual. Don't invent steps you can't verify in the repo.
- **Start-up paths** (verify each script exists in `package.json`):
  1. **Docker (recommended):** `cp .env.example .env` → fill it in → `docker compose up -d --build` → open http://localhost:3000. On first run, create the admin password on `/setup`, then click "Connect Tesla". `compose.yaml` runs two services, `web` and `worker`, sharing the `voltops-data` volume. Logs: `docker compose logs -f worker`.
  2. **Local dev:** `pnpm install` → `.env` as above → `pnpm dev` (`predev` runs the migrations) → http://localhost:3000. Run the worker in a 2nd terminal with `pnpm worker`.
  3. **Demo without a Powerwall:** it must use a **separate DB**, because `/home` shows the first site in the DB. PowerShell:
     ```powershell
     $env:DATABASE_PATH = "./data/demo.db"
     pnpm db:migrate
     pnpm seed:replay
     pnpm dev -p 3001
     ```
     bash: `DATABASE_PATH=./data/demo.db pnpm db:migrate && DATABASE_PATH=./data/demo.db pnpm seed:replay && DATABASE_PATH=./data/demo.db pnpm dev -p 3001`. Open http://localhost:3001/home and create a throwaway password. Delete `data/demo.db` to reset.
- **Dev commands:** `pnpm test` (vitest), `pnpm test:scripts`, `pnpm typecheck`, `pnpm lint` (needs `SKIP_ENV_VALIDATION=1` without a full `.env`), `pnpm build`, `pnpm build:worker`, `pnpm verify:tesla`. Check the exact names in `package.json` and include only scripts that exist.
- **Project layout:** a short tree of what really exists (`src/app`, `src/lib`, `src/server`, `src/worker`, `fixtures/`, `docs/`, `scripts/`, `drizzle/`, `team/`). Check with `ls`. Note that the target `apps/` + `packages/` monorepo in CLAUDE.md §4 is not done yet.
- **License:** not chosen yet (CLAUDE.md D13 is OPEN: AGPL-3.0 vs MIT/Apache-2.0). Say "License: to be decided"; don't pick one.
- **Professional design elements** (PO request): a centered title block with a one-line tagline; shields.io-style badges for TypeScript, Next.js, SQLite, Docker, Node 22, "self-hosted" and "no telemetry" (static badges only, no fake CI/coverage badges); a table of contents; a feature table or bullet list with emoji icons used sparingly; a mermaid diagram of the data flow (Tesla Fleet API + Open-Meteo → worker → SQLite → web `/home`); GitHub callouts (`> [!NOTE]`, `> [!WARNING]`) for the separate demo DB, keeping secrets out of git, and Fleet API costs; collapsible `<details>` for the full env-var table. Keep it scannable: short sentences, real commands in code blocks.
- Don't link images or screenshots that aren't committed. `data/shots/` is not in git; check with `git ls-files data/shots`.
- Facts must come from the repo. If something here conflicts with the code, the code wins. Note it in your summary.

## Owned files
`README.md` only.

## Base
`middleware`. Branch `phase2b/readme`.

## Judged by
- `README.md` replaces the T3 boilerplate entirely and covers: what/why, goals + non-goals, the features working today, architecture (mermaid), quick start (Docker), local dev, the demo, configuration, dev commands, layout, roadmap, privacy/security, license TBD.
- Every command and script name exists in `package.json` / `compose.yaml`, and every env var exists in `.env.example`.
- No invented features, badges or links. Renders as valid GitHub Markdown (mermaid fenced as ```` ```mermaid ````).
- **COMMIT before handing off, and give the commit hash and branch name in your summary.**
