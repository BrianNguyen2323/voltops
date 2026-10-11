# CLAUDE.md — VoltOps

> Read this file fully before starting any task. It is the source of truth for architecture,
> conventions, and boundaries. If something here conflicts with code in the repo, this file wins
> unless an ADR in `docs/adr/` says otherwise. If you think this file is wrong, say so in your PR
> description — do not silently diverge.

---

## 1. What VoltOps is

VoltOps is an **open-source, self-hosted** companion dashboard for Tesla Solar + Powerwall owners.
It collects live energy data from the user's own system, logs weather, learns the household's
usage and generation patterns, and produces **clear, explainable instructions** (e.g. "raise
backup reserve to 65% tonight — tomorrow is cloudy and your 4–9 PM peak needs ~11 kWh") along
with costs in the user's own utility rates.

**It is not a SaaS.** Each user runs their own instance (Docker on a home server, NAS, Raspberry
Pi, or a cheap VPS). Their data and Tesla credentials never leave their instance.

### Product pillars

1. **Observe** — collect solar, battery, home load, and grid flow; store history.
2. **Understand** — usage trends (by hour, weekday, season), cost breakdowns.
3. **Predict** — tomorrow's load and solar generation, using weather forecasts + learned history.
4. **Advise** — actionable, explainable recommendations (reserve level, mode), with the math shown.
5. **(Later) Act** — opt-in automation of the advice, behind strict guardrails.

### Non-goals (do not build)

- Multi-tenant accounts, organizations, teams, or user sign-up flows.
- Billing, subscriptions, Stripe, plans, paywalls, usage metering.
- Marketing/landing pages inside the app.
- Any data collection back to the maintainers (no telemetry, no analytics, no phone-home).
- Vehicle features. VoltOps is energy-only.

---

## 2. Migration context (project is coming out of cold storage)

The repo was originally scaffolded as a SaaS. **Phase 0 is an audit before any rewrite.**
The first agent task is to produce `docs/audit.md` that lists:

- Current stack, package layout, and how to run it (or why it doesn't run).
- What is reusable: Tesla Fleet API OAuth/token code, any API client, DB schema for energy data,
  chart components.
- What is SaaS-only and must be removed: multi-tenancy, org/user tables beyond a single admin,
  billing, email providers, marketing pages, hosted-only infra (Vercel/serverless assumptions,
  cloud cron), feature flags tied to plans.
- Secrets or tokens committed anywhere in git history (flag them; the owner will rotate them).

Do not delete code during the audit. Removal happens in Phase 1 as reviewed PRs.

---

## 3. Architecture decisions

Status key: **DECIDED** = build to this. **PROPOSED** = build to this unless the owner overrides;
record changes as an ADR. **OPEN** = do not build until resolved.

| #   | Topic                   | Decision                                                                                                                                    | Status                                             |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| D1  | Deployment model        | Single-household, self-hosted. One instance = one owner, 1..n energy sites.                                                                 | DECIDED                                            |
| D2  | Packaging               | Docker Compose as the primary install. Multi-arch images (amd64 + arm64) on GHCR.                                                           | DECIDED                                            |
| D3  | Language                | TypeScript end-to-end, strict mode. Node LTS. pnpm workspaces monorepo.                                                                     | PROPOSED (confirm against existing stack in audit) |
| D4  | Web app                 | Next.js (App Router) for dashboard + API routes, run as a long-lived Node server (not serverless).                                          | PROPOSED                                           |
| D5  | Background work         | Separate `worker` process for polling, weather fetch, model fitting, recommendation generation. Never poll from the web process.            | DECIDED                                            |
| D6  | Database                | SQLite (WAL mode) via Drizzle ORM by default — zero-config, Pi-friendly. Postgres support is a later, optional ADR.                         | PROPOSED                                           |
| D7  | Data source abstraction | All hardware access goes through a `DataSource` interface (see §5). No feature code calls Tesla directly.                                   | DECIDED                                            |
| D8  | Weather                 | Open-Meteo (no API key, includes solar irradiance forecasts). Behind a `WeatherProvider` interface.                                         | PROPOSED                                           |
| D9  | Tariffs                 | User-defined TOU plans in-app (import + export rates, seasons, weekday/weekend). Optional import from OpenEI URDB.                          | PROPOSED                                           |
| D10 | Auth                    | Single admin password (argon2id) + signed session cookie. Optional `AUTH_DISABLED=true` for LAN-only setups, with a loud warning in the UI. | PROPOSED                                           |
| D11 | Control of hardware     | MVP is **advisory only**. Writes to the Powerwall (reserve, mode) are Phase 3, opt-in, with guardrails (§8).                                | DECIDED                                            |
| D12 | Forecasting             | Simple, explainable models first, always benchmarked against a naive baseline (§7). No heavy ML until the simple models are measured.       | DECIDED                                            |
| D13 | License                 | AGPL-3.0 (keeps hosted forks open) vs MIT/Apache-2.0 (max adoption).                                                                        | OPEN — owner decides before first public release   |
| D14 | Telemetry               | None.                                                                                                                                       | DECIDED                                            |

ADRs live in `docs/adr/NNNN-title.md` (short: context, decision, consequences). Any agent that
changes a PROPOSED decision writes an ADR in the same PR.

---

## 4. Repository layout (target)

```
voltops/
  apps/
    web/            # Next.js dashboard + API routes (UI, settings, setup wizard)
    worker/         # Long-running scheduler: polling, weather, forecasting jobs, recommendations
  packages/
    core/           # Domain types, units, sign conventions, pure business logic. No I/O.
    db/             # Drizzle schema, migrations, query helpers
    sources/        # DataSource adapters: fleet-api, local-gateway (via pypowerwall proxy), replay
    weather/        # WeatherProvider adapters (open-meteo)
    tariff/         # Rate plan model, cost calculation, URDB import
    forecast/       # Load + solar forecasting, backtesting harness
    advisor/        # Recommendation engine (pure functions over forecasts + tariff + battery state)
    ui/             # Shared chart/table components
  fixtures/         # Recorded, anonymized API responses + a multi-week demo dataset
  docs/             # audit.md, adr/, setup guides, architecture notes
  docker/           # Dockerfiles, compose files
  CLAUDE.md
```

**Dependency direction is one-way:** `apps → packages`, and inside packages:
`advisor → forecast → core`, `tariff → core`, `sources → core`, `weather → core`, `db → core`.
`core` imports nothing internal. Pure-logic packages (`core`, `forecast`, `advisor`, `tariff`)
must not do network or disk I/O — pass data in, get results out. This is what makes them
testable and lets agents work on them in parallel.

---

## 5. Getting data from Tesla (the hard part of being open source)

A SaaS would register one Tesla developer app and let users click "Connect Tesla". An open-source
self-hosted app cannot share one app's credentials (and the owner would pay every user's API bill).
So VoltOps supports **multiple connection modes** behind one interface, and the setup wizard
guides users to the easiest one that works for their hardware.

### DataSource interface (in `packages/core`)

```ts
interface DataSource {
  id: "fleet-api" | "local-gateway" | "replay";
  listSites(): Promise<SiteInfo[]>;
  getLiveStatus(siteId: string): Promise<LiveSample>; // instantaneous power flows + SoC
  getHistory?(siteId: string, range: DateRange): Promise<EnergyInterval[]>; // backfill if supported
  capabilities(): SourceCapabilities; // e.g. canSetReserve, maxReservePct, minPollSeconds
  // Phase 3 only, gated by capabilities + settings:
  setBackupReserve?(siteId: string, pct: number): Promise<void>;
  setOperationMode?(
    siteId: string,
    mode: "self_consumption" | "autonomous",
  ): Promise<void>;
}
```

### Modes

1. **`fleet-api` (bring your own Tesla developer app)** — official API; works for all Powerwall
   models. The user must create their own app at developer.tesla.com, generate a key pair, host
   the public key at `https://<domain>/.well-known/appspecific/com.tesla.3p.public-key.pem`,
   and register as a partner. Tesla bills Fleet API pay-per-use with a monthly credit for small
   developers, so **polling frequency directly affects the user's bill**.
   - The setup wizard must automate everything it can: generate the key pair, serve the public
     key from VoltOps itself when the instance is publicly reachable (Cloudflare Tunnel /
     Tailscale Funnel docs), or give copy-paste steps for hosting it on GitHub Pages.
   - Scopes needed: `openid offline_access energy_device_data` (+ `energy_cmds` only when the
     user enables Phase 3 control).
   - Default poll: every 5 minutes for live status, configurable; daily `calendar_history`
     backfill for authoritative energy totals. Show an estimated monthly request count in settings.
2. **`local-gateway`** — talks to the Powerwall gateway on the user's LAN. No Tesla account,
   no API cost, higher resolution (10–30 s polling). Implemented by running the MIT-licensed
   **pypowerwall proxy** as an optional sidecar container and calling its HTTP API — we do not
   reimplement Tesla's local protocols in TypeScript. Coverage differs by hardware
   (Powerwall 2/+ vs Powerwall 3); expose this through `capabilities()`.
3. **`replay`** — reads `fixtures/`. Used for tests, local development, CI, and a public demo
   mode. **Every feature must work against `replay`.** Contributors without a Powerwall must be
   able to build the whole app.

A future `teslemetry` (third-party paid proxy) adapter is acceptable as a community contribution;
it is not on the MVP path.

### Canonical units and sign conventions (enforced in `core`)

- Power in **watts** (integer), energy in **watt-hours** (integer). Convert to kW/kWh only in the UI.
- Timestamps stored in **UTC**; every site has an IANA timezone; TOU and "day" boundaries are
  computed in site-local time. DST transitions must have tests.
- Signs (VoltOps canonical, normalize in each adapter):
  - `solarW` ≥ 0 (generation)
  - `loadW` ≥ 0 (home consumption)
  - `batteryW` > 0 discharging, < 0 charging
  - `gridW` > 0 importing from grid, < 0 exporting to grid
  - Invariant (within tolerance): `solarW + batteryW + gridW ≈ loadW`. Adapters log a warning
    when it fails; never silently "fix" data.
- `socPct` 0–100 as reported; `usableCapacityWh` stored per site.
- Verify Tesla's raw field names and signs against recorded fixtures before coding an adapter;
  do not trust memory or blog posts.

### Credentials

- Tesla refresh tokens, client secrets, and gateway passwords are encrypted at rest
  (AES-256-GCM) with `VOLTOPS_SECRET_KEY` from the environment. Never log them. Never put them
  in fixtures. Redact in error messages.
- Token refresh is handled in one place in the `fleet-api` adapter with a lock so concurrent jobs
  don't double-refresh.

---

## 6. Data model (starting point — refine in `packages/db`)

- `sites` — id, source, name, timezone, lat/lon (user-editable; used for weather), usable capacity,
  panel tilt/azimuth/kWp (optional, improves solar forecasts).
- `samples` — site_id, ts, solar_w, load_w, battery_w, grid_w, soc_pct, grid_status. Raw resolution.
- `energy_hourly` — rollup: per site per hour Wh for solar, load, battery in/out, grid import/export.
  All analytics read rollups, not raw samples.
- `weather_observed` — per site per hour: temp, cloud cover, shortwave/GHI, precipitation.
- `weather_forecast` — per site, **issued_at**, target hour, same fields. Store forecasts as they
  were issued so backtests are honest (never evaluate a model with weather it couldn't have known).
- `tariff_plans`, `tariff_periods` — import and export rates by season, day type, hour range.
- `forecasts` — model id/version, issued_at, target hour, predicted load Wh / solar Wh, with
  intervals (p10/p50/p90).
- `recommendations` — issued_at, valid window, action, target values, explanation (structured
  JSON of the inputs + human text), status (shown / accepted / dismissed / applied).
- `settings`, `admin` (single row), `job_runs` (for the health page).

Retention: Energy history (`energy_intervals`, `samples`, `weather_observed`, `weather_forecast`) is never pruned; hourly figures are computed by GROUP BY (ADR 0001).

---

## 7. Analytics and forecasting

### Usage trends (Phase 2a)

- Hour-of-day × weekday heatmap, monthly totals, peak-window consumption, self-consumption %,
  solar coverage %, grid import/export, cost by TOU period.

### Load forecast (MVP model)

- Baseline: seasonal-naive (same hour last week).
- Model v1: hour-of-week profile with exponential weighting of recent weeks, plus a temperature
  term (heating/cooling) once ≥ 4 weeks of data exist.

### Solar forecast (MVP model)

- Use Open-Meteo hourly irradiance forecast (tilted irradiance if the user gave tilt/azimuth,
  otherwise GHI) and learn a site-specific conversion from irradiance to actual Wh from history
  (per hour-of-day, re-fit weekly). This automatically absorbs shading, soiling, and inverter limits.
- Baseline: yesterday's generation.

### Rules for every model

- Lives in `packages/forecast`, pure functions, versioned (`load-v1`, `solar-v1`).
- Ships with a backtest using `fixtures/` that reports MAE and MAPE against its baseline.
  A model that doesn't beat the baseline doesn't get merged.
- Outputs intervals, not just a point estimate. The advisor plans against p10 solar / p90 load
  (conservative) by default.
- Cold start: with < 7 days of data, the UI says "learning" and the advisor uses conservative
  defaults instead of pretending to know.

---

## 8. Advisor (recommendations) and safety

### How it works

Inputs: current SoC, usable capacity, tomorrow's hourly load + solar forecast, tariff periods,
export rates, user's minimum comfort reserve. Output: a small set of recommendations, each with:

- the action (e.g. "set backup reserve to 65% from 9 PM", "switch to time-based control"),
- the expected effect in kWh and money vs. doing nothing,
- a plain-language "why" built from the structured inputs (e.g. predicted peak-window need,
  predicted solar shortfall),
- confidence and what would change the advice.

Start with a transparent rule-based planner (cover the expected peak-window deficit, with margin).
A small LP optimizer is a later upgrade; keep the same output shape so the UI doesn't change.
Export-rate-aware logic matters: under net-billing tariffs, exporting is worth far less than
avoiding peak imports, so storing surplus usually beats selling it.

### Phase 3 automation guardrails (do not implement before Phase 3 is approved)

- Off by default; enabled per site with an explicit confirmation screen.
- Dry-run mode that logs "would have set X" for at least a week before live mode is offered.
- Hard floor/ceiling on reserve set by the user; respect source `capabilities()` limits.
- Rate limit: max N changes per day; never change while the grid is down / islanded.
- Every write is logged to `recommendations` with before/after values and is reversible from the UI.
- **Agents never send commands to real hardware.** Tests use `replay` or mocks only.

---

## 9. Dashboard (UI)

Primary screens:

1. **Now** — live power-flow diagram (solar → home / battery / grid), SoC gauge, today's totals,
   current tariff period and price, active recommendation card.
2. **Plan** — tomorrow's forecast chart (stacked load vs. solar, battery SoC projection, TOU
   bands shaded), the recommendations with their reasoning, weather strip.
3. **Trends** — usage heatmap, daily/monthly bars, cost by period, self-sufficiency over time.
4. **Accuracy** — forecast vs. actual, error metrics per model (builds trust; also our debug view).
5. **Settings** — data source setup wizard, site location/panels, tariff editor, retention,
   automation (Phase 3), backup/export (CSV + full DB download).
6. **Health** — job runs, last successful poll, API request count/estimate, warnings.

UI rules: works on a phone, light + dark theme, every chart has a table/CSV view, units always
labeled (kW for power, kWh for energy — never mix them up in labels), loading/empty/"learning"
states designed, not afterthoughts.

---

## 10. Phased roadmap (for task planning)

Each phase lists workstreams that can run in parallel. A lead agent should split work along these
lines and package boundaries to avoid merge conflicts.

**Phase 0 — Audit (1 agent):** `docs/audit.md` (§2). Record fixtures from the owner's real system
if credentials are available — anonymized (strip site IDs, addresses, coordinates rounded).

**Phase 1 — Foundation**

- A: Monorepo scaffold, tooling (lint, format, typecheck, test), CI, Docker Compose, `.env.example`.
- B: Remove SaaS code; single-admin auth.
- C: `core` types/units/sign conventions + `db` schema and migrations.
- D: `replay` source + demo dataset generator (several weeks, realistic seasonal shapes).

**Phase 2a — Observe & Understand**

- A: `fleet-api` adapter + setup wizard. B: `local-gateway` adapter via pypowerwall sidecar.
- C: worker scheduler, polling, rollups, retention. D: weather ingestion (observed + forecast-as-issued).
- E: tariff model + editor + cost calculation. F: Now + Trends screens.

**Phase 2b — Predict & Advise (MVP release)**

- A: load forecast + backtest. B: solar forecast + backtest. C: advisor rules engine.
- D: Plan + Accuracy screens. E: docs site / README / install guide; v0.1.0 release.

**Phase 3 — Act (opt-in automation)** — §8 guardrails. Requires owner approval to start.

**Later / community:** Home Assistant + MQTT export, Postgres option, LP optimizer, Teslemetry
adapter, notifications (ntfy/email), multi-site households.

---

## 11. Engineering conventions

- **TypeScript strict**, no `any` without a comment explaining why. Validate all external input
  (Tesla, Open-Meteo, user forms, env) with zod at the boundary.
- **Tests:** Vitest. Pure packages target high coverage; adapters are tested against recorded
  fixtures; key UI flows get Playwright smoke tests running on `replay` data.
  **No test may hit the network.** No real Tesla calls in CI, ever.
- **Config:** everything via env vars documented in `.env.example`; a single `config.ts` parses
  and validates them at startup and fails fast with a readable message.
- **Logging:** structured (pino), redact secrets, include `siteId` and job name.
- **Errors:** adapters throw typed errors (`AuthExpired`, `RateLimited`, `SourceUnavailable`);
  the worker backs off and surfaces them on the Health screen instead of crashing.
- **Migrations:** Drizzle migrations only, never edit an applied migration.
- **Dependencies:** prefer few, well-maintained ones; check license compatibility with D13.
- **Commits:** Conventional Commits (`feat(forecast): ...`). Changesets for versioning.

### Definition of done (every task)

1. Typecheck, lint, and tests pass locally and in CI.
2. New behavior has tests; bug fixes include a regression test.
3. Works against the `replay` source.
4. Docs updated (README, `.env.example`, ADR if a PROPOSED decision changed).
5. Commit only; the owner opens PRs
6. PR description, once project owner approves the PR, states what changed, how it was tested, and anything left undone.

---

## 12. Rules for agents and subagents

- Read this file and the relevant `docs/adr/` entries before starting. Read `docs/audit.md` once it exists.
- Stay inside the package(s) your task names. If you need a change in another package (especially
  `core` types or `db` schema), make it a small separate PR or flag it to the lead agent — shared
  types and schema are the main source of merge conflicts.
- One task = one branch = one focused PR. Branch names: `phaseN/<area>-<short-desc>`.
- Never commit secrets, real tokens, real site IDs, addresses, or precise coordinates.
  Fixtures must be anonymized.
- Never call real Tesla endpoints except in an explicit, owner-run fixture-recording task, and
  never send write commands to hardware.
- Do not add SaaS concepts back (accounts, tenants, billing, hosted-only services).
- When an external API's behavior is uncertain (field names, signs, limits, pricing), verify
  against official docs or fixtures and note the source in code comments; if you can't verify,
  stop and ask rather than guess.
- If a task is blocked on an OPEN decision, stop and report; don't pick an answer silently.
- When you finish, leave the repo runnable: `docker compose up` must still start the app with
  the `replay` source.

---

## 13. Open questions for the owner

1. Existing stack — does the audit confirm TypeScript/Next.js? If not, revisit D3/D4.
2. License: AGPL-3.0 or MIT/Apache-2.0 (D13)?
3. Hardware on the reference system (Powerwall 2, +, or 3; gateway model) — decides whether
   `local-gateway` or `fleet-api` is the first adapter built.
4. Fleet API polling budget the owner is comfortable defaulting to (affects user bills).
5. Phase 3 automation — in scope for v1.0, or advisory-only through v1.0?
