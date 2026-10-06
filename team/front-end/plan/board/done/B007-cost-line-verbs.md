# B007 — "Your home now": name each line (Spending / Saving / Earning) + clamp saving

## Skills
Implementer: `Use skill: frontend-design`. `Use skill: agent-browser` for a 390 px and 1440 px screenshot of the Right now section.

## Facts
- **SPEC Rev 3 / R003.** The PO asked that an outside viewer understand what the home is currently spending, saving or earning. The "Your home now" strip in `src/components/dashboard/dashboard.tsx` lists one line per non-zero item from `costNow(live, tariffNow)` (`src/components/dashboard/cost-now.ts`).
- **Gap 1 (the B006 review).** The lines show only the reading ("$0.99/hour") and a sentence. They never name the item, so the viewer has to infer it.
  - **Fix:** each line starts with its name as a visible word: **"Spending"**, **"Saving"** or **"Earning"**, followed by the amount reading, e.g. "Saving $0.99/hour". The explanation sentence stays underneath.
  - Spending keeps `text-grid-import`; the others stay default foreground.
- **Gap 2.** `savingCentsPerHour = round((loadW − max(gridW,0)) × import / 1000)` goes **negative** when grid import exceeds the load (e.g. the battery charging from the grid).
  - **Fix:** `max(0, …)`; a zero saving line is hidden like the others.
- Sample (unchanged): saving 99, earning 13, spending 0 (hidden).

## Owned files
- Tester: `src/components/dashboard/dashboard.test.tsx`, `src/components/dashboard/cost-now.test.ts`.
- Implementer: `src/components/dashboard/dashboard.tsx`, `src/components/dashboard/cost-now.ts`.

## Base
- Tester: `front-end-development` (at or after this brief's commit) → branch `phase2a/ui-m3b-test`. The new tests must FAIL on the base.
- Implementer: `phase2a/ui-m3b-test` → branch `phase2a/ui-m3b-impl`.

## Judged by
- **`cost-now.test.ts`:** live `{loadW: 1000, gridW: 4000, …}` at 48/8 → saving 0 (not negative), spending 192, earning 0.
- **`dashboard.test.tsx`:**
  - the sample's "Your home now" markup contains "Saving" before `$0.99` and "Earning" before `$0.13` (whitespace-stripped compare is fine); it has no "Spending";
  - an importing copy (`gridW: 1500, loadW: 2000`) contains "Spending" before its amount.
- **Command:** `rm -rf .next && pnpm test && pnpm typecheck && SKIP_ENV_VALIDATION=1 rtk proxy pnpm lint && SKIP_ENV_VALIDATION=1 pnpm build`, all green.
- **Testers: your test files must lint clean**, apart from errors caused only by not-yet-existing code (none expected here).
- **Visual:**
  - scratch DB in `data/`, dev server in the background on **3100** (never 3000);
  - screenshot the Right now section at 390 px and 1440 px into `data/shots/`;
  - **stop the server and run `agent-browser close`** before handing off.
- **Worktree:** junction `cmd //c mklink //J node_modules "D:\Programming Projects\voltops\node_modules"`; `cmd //c rmdir node_modules` before finishing; never `--force`. Keep commands bounded.

## Gate log
- Tests 388b17c on `phase2a/ui-m3b-test`: 3 FAIL for the right reason (negative saving; missing Saving/Earning/Spending labels). The label must sit right before the amount (whitespace-stripped). Implementer spawned.
- Impl 0a7d81e on `phase2a/ui-m3b-impl`: 195/195, typecheck, lint clean, build OK. A muted label span precedes each strong reading; saving is clamped. The implementer checked text only, not the images. Reviewer spawned (asked to look at the label/amount spacing).
- Reviewer: **PASS**. The label and amount are visually separated (6 px, `mr-1.5`) and read "Saving $0.99/hour"; the clamp is correct; scope is the 4 files. Merged 6442b61 into `front-end-development`. Gate there: vitest 195/195, typecheck, lint clean, build OK. Worktrees/branches removed.
- Nit: the "Spending" label is muted grey like the others; only its amount is pink (not visible in the sample).
