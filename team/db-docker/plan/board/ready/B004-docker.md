# B004 — Dockerfile + compose; retire the Netlify app

## Facts
- `next.config.js`: `output: "standalone"`, `serverExternalPackages: [<sqlite driver from B001>, "@node-rs/argon2"]`.
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
- **Implementer:** `Dockerfile`, `.dockerignore`, `compose.yaml`, `next.config.js`, `netlify.toml`, `package.json`, `pnpm-lock.yaml`, `README.md`.

## Base
main after B002 merges. Branches `phase1/docker-tests` → `phase1/docker-impl`.

## Judged by
`bash scripts/docker-smoke.sh` exits 0. The script:
1. writes a throwaway `.env` from dummy values if absent;
2. runs `docker compose -p voltops-smoke up -d --build`;
3. polls until `GET /login` or `/setup` returns 200 (≤ 90 s);
4. checks that `/data/voltops.db` exists in the container and `PRAGMA journal_mode` = wal;
5. `docker compose restart` and the file still exists;
6. `docker compose -p voltops-smoke down -v`.

Plus `pnpm test && pnpm typecheck && SKIP_ENV_VALIDATION=1 pnpm build` green. No Tesla network calls.
