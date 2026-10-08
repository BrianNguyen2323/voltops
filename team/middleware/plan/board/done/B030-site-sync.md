# B030: Site info on the DataSource + `syncSite` + login path

## Facts
- SPEC Rev 3 "Site sync". Today only `src/app/api/auth/callback/route.ts` reads Tesla's `products` and `site_info`, with its own `fetch`, a hard-coded `FLEET_BASE` and `findNameplate`. Site facts go stale until a re-login.
- `src/lib/core/types.ts`: `DataSource` gains:
  ```ts
  listSites(): Promise<string[]>;                 // external ids of energy sites with resource_type "battery" (GET /api/1/products), in response order
  getSiteInfo(siteId: string): Promise<SiteInfo>; // GET /api/1/energy_sites/{id}/site_info
  export type SiteInfo = { name: string | null; timezone: string | null; usableCapacityWh: number | null; backupReservePct: number | null;
    tariff: { id: string; name: string | null; utility: string | null; currency: string | null; content: unknown } | null };
  ```
- fleet-api (`src/lib/sources/fleet-api/`):
  - `client.ts`:
    - both calls go through the existing `call`/token/base-URL path, with typed errors; messages never contain site ids;
    - add `primeToken(value: string, expiresAt: number)`. It sets the in-memory access token, so the next call doesn't refresh. `createFleetClient` returns `DataSource & { primeToken }`, and `fleetClient` forwards it;
  - `map.ts`:
    - `mapSiteInfo(raw)` → `SiteInfo`: `site_name`, `installation_time_zone` and `backup_reserve_percent`. `usableCapacityWh` = `findNameplate(components)`, moved unchanged from the callback (the first `nameplate_energy` found, in Wh). `tariff` = `{ id: tariff_id, name: tariff_content.name, utility, currency: tariff_content.currency, content: tariff_content }` when `tariff_id` is set, else `null`. Missing fields → `null`;
    - `mapProducts(raw)` → the ids (stringified `energy_site_id`).
  - Fixtures `fixtures/fleet-api/site_info.json` and `products.json` are read-only. Read expected values from the fixture; never pin literals (the PO re-records the fixtures).
- `src/server/site-sync.ts` (new): `syncSite(db, source: DataSource, externalId: string): Promise<number>`:
  - call `getSiteInfo`;
  - upsert `sites` keyed on `external_id`: `source = source.id`; name, timezone, usableCapacityWh, backupReservePct; `createdAt` on insert, `updatedAt` always;
  - upsert `tariff_schedule` (one per site: `tariffId`, `name`, `utility`, `currency`, `content`) only when `tariff` is non-null;
  - return the site id. Never touch `latitude`, `longitude` or `temperatureUnit`. Copy the upsert shapes from today's callback.
- Login (`route.ts`):
  - token exchange → **store credentials** (unchanged code) → `fleetClient.primeToken(access_token, now + expires_in·1000)` → `listSites()` → `syncSite` for the first id;
  - any error after the credentials are stored: `console.warn("[Tesla OAuth] site sync", err.name)`, and still redirect to `/home`;
  - delete `FLEET_BASE`, `findNameplate` and the hand-written products/site_info fetches.
- Test fakes that implement `DataSource` (`load.test.ts`, `seed.test.ts`, …) need the 2 new methods; stub them.
- Env notes:
  - link the main node_modules: `cmd /c mklink /J node_modules "D:\Programming Projects\voltops\node_modules"`. Remove it with `cmd /c rmdir node_modules` before you finish. Never `git worktree remove --force` while it exists;
  - lint needs `SKIP_ENV_VALIDATION=1`; vitest can flake under load, so re-run once; test files must lint clean too;
  - run `pnpm format:check`; no network in tests;
  - **COMMIT before handing off, and give the commit hash and branch name.**

## Owned files
- Tester: `src/lib/sources/fleet-api/map.test.ts`, `client.test.ts`, `src/server/site-sync.test.ts` (new), `src/app/callback-logging.test.ts` (only if the login flow needs a case there)
- Implementer: `src/lib/core/types.ts`, `src/lib/sources/fleet-api/map.ts`, `client.ts`, `src/server/site-sync.ts`, `src/app/api/auth/callback/route.ts`, plus stubbing the 2 methods in the DataSource fakes of existing test files

## Base
- Tester: `middleware`, branch `phase2b/middleware-site-sync-tests`.
- Implementer: the tester's branch **rebased onto `middleware` after B029 merges**, then branch `phase2b/middleware-site-sync`.

## Judged by
Full `pnpm vitest run`, `pnpm test:scripts`, `pnpm tsc --noEmit`, `SKIP_ENV_VALIDATION=1 pnpm lint`, `pnpm format:check` and `pnpm build` are green. The tests cover:
- `mapSiteInfo`: on the fixture (all 5 facts, values read from the fixture), and with fields missing. `mapProducts` keeps battery sites only;
- the client: the right paths on `TESLA_FLEET_BASE_URL`; typed errors (401/429/5xx); after `primeToken`, the next call makes no token request;
- `syncSite` on a temp DB with a fake DataSource:
  - insert, then update the same row (one row per external id);
  - the tariff is replaced, and `tariff: null` leaves the existing schedule;
  - lat/lon/temperatureUnit are untouched;
  - it returns the id.
