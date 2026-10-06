# B008 — Stop logging Tesla response bodies in the OAuth callback

## Facts
- CLAUDE.md §12: never log real site IDs, addresses or coordinates. Tesla `products`/`site_info` bodies contain them.
- `src/app/api/auth/callback/route.ts` today:
  - ~line 125 `console.warn("[Tesla OAuth] Could not fetch site_info:", await infoRes.text())`
  - ~line 129 `console.warn("[Tesla OAuth] Could not fetch products:", await productsRes.text())`
  - ~line 134 `console.log("[Tesla OAuth] Tariff:", siteInfo?.tariff_id ?? "none")`
- The token-exchange failure path (~lines 66–76) already does it right: parse JSON with `.catch(() => ({}))`, log `status` + `error` (string, else `"unknown"`).
- Spec (Rev 3, PO answer Q3):
  - Both failure logs become `console.warn("[Tesla OAuth] Could not fetch <products|site_info>:", status, <error code or "unknown">)`. Never the body.
  - **Keep** the "Energy site: found/none" and "Timezone:" lines. **Delete** the tariff-ID line.
  - No other behaviour changes (redirects, DB upserts).
- Existing callback tests: `src/app/callback-redirect.test.ts`, `src/app/auth-routes.test.ts` (vitest, fetch mocked). Reuse their mocking pattern.

## Owned files
- **Tester:** `src/app/callback-logging.test.ts` (new).
- **Implementer:** `src/app/api/auth/callback/route.ts`.

## Base
- Tester: `main` → `phase1/callback-logs-tests`.
- Implementer: `phase1/callback-logs-tests` → `phase1/callback-logs-impl`.

## Judged by
`rm -rf .next && pnpm test && pnpm typecheck && pnpm lint`. The new test spies on `console.log/warn/error` and fails if any call argument contains a marker string planted in the mocked Tesla responses: a fake site ID, an address, a `tariff_id`, or a body-only field. It covers:
- `products` non-OK with a JSON body containing the marker → logs status + error code only;
- `site_info` non-OK → same;
- success path → no tariff ID logged, timezone still logged;
- non-JSON error body → `"unknown"`, no crash.

## Gate log
- Tests 737afc1 → impl 154c8dd → test lint typing a24ed4f. Reviewer: **PASS**. Merged d4f40ae. Main gate: vitest 39/39, test:scripts 45/45, typecheck, lint 0 errors, build OK.
- Follow-up (non-blocking): `errorCode()` throws on a JSON body of literal `null` (use `(await res.json().catch(() => null))?.error`). There's no test for the token-exchange failure log.
