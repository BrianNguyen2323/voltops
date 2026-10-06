# B012 — Cleaner pass over `src/` + `scripts/` (cleaner)

## Facts
SPEC Rev 4, "Optimization round 1". **No behaviour change.** The repo is one package: the Next app in `src/` and node scripts in `scripts/`. Look for:
- dead code:
  - e.g. the T3 example `src/server/api/routers/post.ts` (wired in `src/server/api/root.ts`). Remove it only if no page or test uses it;
  - also unused exports, files and components;
- duplication between `src/` and `scripts/` (e.g. crypto / DB-open helpers). Dedupe only where the Docker runtime won't break: the image ships just `scripts/check-env.mjs`, `scripts/migrate.mjs` and `src/env.schema.js`;
- unused dependencies in `package.json`:
  - check imports plus config files such as `components.json`, `postcss.config.js` and `eslint.config.js`;
  - if you remove deps, run `pnpm install` so the lockfile matches, and list them in the handoff;
- needless complexity, and comments that restate code.

Off limits: `drizzle/` (applied migrations), `fixtures/`, `team/`, `docs/adr/`, `public/.well-known/`, `Dockerfile`, `compose.yaml`, `scripts/docker-smoke.sh`. Don't weaken or delete tests to make code removable.

## Owned files
`src/**`, `scripts/*.mjs` (not `docker-smoke.sh`), `package.json`, `pnpm-lock.yaml`, `components.json`, `eslint.config.js`, `tsconfig.json`.

## Base
`optimization-round` (after B010 + B011 merge) → branch `phase1/cleaner-pass`.

## Judged by
- `rm -rf .next && pnpm test && pnpm test:scripts && pnpm typecheck && SKIP_ENV_VALIDATION=1 pnpm lint && SKIP_ENV_VALIDATION=1 pnpm build`, all green.
- Lint: 0 errors and no new warnings.
- If deps changed: `SMOKE_PORT=3100 bash scripts/docker-smoke.sh` prints PASS.
- The handoff lists every removal with one line of why.
- Worktree:
  - if deps are unchanged, link main's node_modules (`cmd //c mklink //J node_modules "D:\Programming Projects\voltops\node_modules"`);
  - never copy the PO's `.env`.

## Gate log
- Cleaner 8f01cf1: removed `src/server/api/routers/post.ts` (+ its `root.ts` import), `createHydrationHelpers`/`HydrateClient` in `src/trpc/server.ts` (unused), deps `shadcn`, `radix-ui`, `tw-animate-css` (no references anywhere; lockfile −284 entries, removals only). Reviewer: **PASS**. Merged 4d263ca into `optimization-round`.
- Gate there: install synced, test:scripts 56/56, typecheck, lint 0 warnings, build OK, smoke PASS 303 MB. vitest 39/41 under load (the worktree deletion ran in parallel), then 41/41 twice in a clean re-run: the known flake (CLOSEOUT item 3), now seen 3 times.
- Nits (non-blocking): `src/trpc/server.ts` is now entirely unused (could be deleted with `server-only`); the tRPC `appRouter` is empty and `protectedProcedure` unused; `components.json` still names radix/hugeicons aliases (inert).
