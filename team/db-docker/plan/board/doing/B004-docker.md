# B004 — Dockerfile + compose; retire the Netlify app

## Facts
- `next.config.js`: `output: "standalone"`, `serverExternalPackages: ["better-sqlite3", "@node-rs/argon2"]`.
- `Dockerfile` (repo root), multi-stage `node:22-slim`:
  - pnpm via corepack, `pnpm install --frozen-lockfile`;
  - build with `SKIP_ENV_VALIDATION=1`;
  - the runtime stage copies `.next/standalone`, `.next/static`, `public`, `drizzle/`, `scripts/migrate.mjs` (plus the node_modules migrate needs);
  - `mkdir /data && chown node`, `USER node`, `EXPOSE 3000`, `ENV PORT=3000 HOSTNAME=0.0.0.0 DATABASE_PATH=/data/voltops.db`;
  - `CMD ["sh","-c","node scripts/migrate.mjs && node server.js"]`.
- `.dockerignore`: node_modules, .next, .git, data, .env*, fixtures, team, db.sqlite.
- `compose.yaml` (repo root): service `web` (`build: .`, `ports: ["3000:3000"]`, `env_file: .env`, volume `voltops-data:/data`, `restart: unless-stopped`) + named volume `voltops-data`. No worker.
- Remove deps `@supabase/ssr`, `@supabase/supabase-js`, `@netlify/plugin-nextjs` (confirm they're unused first). `netlify.toml` → `[build]` with `publish = "public"` only, so Netlify keeps serving `/.well-known/appspecific/com.tesla.3p.public-key.pem`.
- README: a "Run with Docker" section: copy `.env.example` → `.env`, fill it in, `docker compose up -d`, open http://localhost:3000 → /setup.

## Owned files
- **Tester:** `scripts/docker-smoke.sh`.
- **Implementer:** `Dockerfile`, `.dockerignore`, `compose.yaml`, `next.config.js`, `netlify.toml`, `package.json`, `pnpm-lock.yaml`, `README.md`, `.gitattributes` (add `*.sh text eol=lf` so the smoke script keeps LF on Windows).

## Base
`database-docker` (the PO's integration branch for this scope; B001–B003 are merged there). Branches `phase1/docker-tests` → `phase1/docker-impl`. The tests branch adds `scripts/docker-smoke.sh`. It expects compose service `web` on `localhost:3000` and `better-sqlite3` requireable from the container workdir (`node -e` WAL check).

## Judged by
`bash scripts/docker-smoke.sh` exits 0. The script:
1. writes a throwaway `.env` from dummy values if absent;
2. runs `docker compose -p voltops-smoke up -d --build`;
3. polls until `GET /login` or `/setup` returns 200 (≤ 90 s);
4. checks that `/data/voltops.db` exists in the container and `PRAGMA journal_mode` = wal;
5. `docker compose restart` and the file still exists;
6. `docker compose -p voltops-smoke down -v`.

Plus `pnpm test && pnpm typecheck && SKIP_ENV_VALIDATION=1 pnpm build` green. No Tesla network calls.
- Docker Desktop must be running. If `docker version` can't reach the engine, report that; don't try to start it.
- Windows note: run `rm -rf .next` before `pnpm build` in a reused checkout. A stale `.next` cache crashes webpack (`WasmHash … 'length'`) and leaves stale `.next/types` that break `tsc`.
