# B009 — Cleaner pass over the front-end code (optimization round 1)

## Facts
- **This is optimization round 1** (SPEC Rev 4, M4). **No behaviour change.** Every existing test must still pass unchanged, and the page must look the same.
- **In scope:**
  - `src/components/dashboard/` (`dashboard.tsx`, `flow-diagram.tsx`, `charts.tsx`, `cost-now.ts`, `dashboard.test.tsx`, `cost-now.test.ts`);
  - `src/app/(protected)/home/` (`page.tsx`, `data.ts`, `data.test.ts`);
  - `src/lib/format.ts` (+ `format.test.ts`);
  - `src/styles/globals.css`;
  - `src/components/ui/*.tsx` (vendored shadcn).

  These were built over 7 briefs (B001–B008) by different members, so look for:
  - dead code: unused exports, helpers, constants, props, CSS utilities/keyframes/tokens that nothing uses (grep before removing);
  - duplication: e.g. local time/hour formatters repeated across `dashboard.tsx`/`charts.tsx`/`data.ts`, repeated class strings, two ways of doing the same thing;
  - needless complexity, and comments that restate the code;
  - `src/components/dashboard/charts.tsx` imports `ChartLegend`/`ChartLegendContent`/`ChartTooltipContent`; remove any that are no longer used;
  - `src/components/ui/chart.tsx` has a file-wide eslint-disable for 4 type-safety rules. Narrow it to the lines that need it, if that's clean;
  - unused shadcn components in `src/components/ui/` (e.g. if `separator` is never imported, delete it).
- **Formatting:** run `pnpm exec prettier --write` on the in-scope files. The B008 review found `dashboard.test.tsx` (a mangled one-line `it(...)`) and `dashboard.tsx` failing `prettier --check`. In test files, only formatting and dead-code removal are allowed; **never weaken or delete an assertion**.
- **Off limits:**
  - `package.json` deps: don't swap `recharts` or anything else. The perf options are for the PO; see `team/front-end/research/optimization/README.md`;
  - `drizzle/`, `scripts/`, `src/server/`, `src/lib/auth*`, `src/lib/tesla.ts`, `src/app/login`, `src/app/setup`, `src/app/api`;
  - the `DashboardData` type shape (the middleware team's contract), and the `sampleDashboard` values.
- **Size baseline** (`research/optimization/README.md`): `/home` route JS 217 kB, First Load 320 kB. Report the after numbers from `pnpm build`; they must not grow.

## Owned files
`src/components/dashboard/**`, `src/app/(protected)/home/**`, `src/lib/format.ts`, `src/lib/format.test.ts`, `src/styles/globals.css`, `src/components/ui/**`.

## Base
`front-end-development` (at or after d386e12) → branch `phase2a/ui-cleaner`.

## Judged by
- `rm -rf .next && pnpm test && pnpm test:scripts && pnpm typecheck && SKIP_ENV_VALIDATION=1 rtk proxy pnpm lint && SKIP_ENV_VALIDATION=1 pnpm build`, all green, with the same test count (196 vitest, 58 scripts) or more.
- `pnpm exec prettier --check` passes on every in-scope file.
- The `/home` route JS and First Load JS are ≤ the baseline. Report both.
- The handoff lists every removal and consolidation with one line of why each.
- **Worktree:** junction `cmd //c mklink //J node_modules "D:\Programming Projects\voltops\node_modules"`; `cmd //c rmdir node_modules` before finishing; never use `--force`. Keep commands bounded.

## Gate log
