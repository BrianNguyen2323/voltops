# B027: one-off repo-wide prettier --write

## Facts
- PO decision (Decision round 3 Q2, 2026-10-08): reformat the whole repo now. No team has an open branch (all branches are merged into main 10edebf; no brief in doing/gate in any team).
- `pnpm format:check` (= `prettier --check "**/*.{ts,tsx,js,jsx,mdx}" --cache`) reported 453 files, but ~200+ are under `.claude/worktrees` (agent worktrees, untracked). The real repo count is ~80 files (src/lib 25, src/app 20, src/server 16, src/components 10, src/worker 3, plus root configs).
- Steps:
  1. create `.prettierignore` with `.claude` (also `.next`, `dist`, `drizzle`, `fixtures`, `data`; prettier 3 already skips gitignored paths and node_modules);
  2. run `pnpm prettier --write "**/*.{ts,tsx,js,jsx,mdx}"`;
  3. `pnpm format:check` must now exit 0.
- **Formatting only.** No hand edits besides `.prettierignore`. Commit as `style: prettier --write across the repo (B027)`.
- Env notes:
  - link the main node_modules: `cmd /c mklink /J node_modules "D:\Programming Projects\voltops\node_modules"`. Remove it with `cmd /c rmdir node_modules` before you finish, and never let prettier run while the junction is present without the ignore file (it would format node_modules otherwise; check `.prettierignore` first);
  - lint needs `SKIP_ENV_VALIDATION=1`; vitest can flake under load, so re-run once;
  - **COMMIT, and give the hash and branch name.**

## Owned files
`.prettierignore` (new); formatting-only changes in any tracked `*.{ts,tsx,js,jsx,mdx}` file.

## Base
`middleware` (10edebf or later). Branch `phase2b/middleware-prettier`.

## Judged by
- `pnpm format:check` exits 0.
- `pnpm vitest run`, `pnpm test:scripts`, `pnpm tsc --noEmit`, `SKIP_ENV_VALIDATION=1 pnpm lint`: same as baseline (563, 71, 0, clean).
- `git diff --stat` shows only `.prettierignore` + formatting changes (the reviewer spot-checks with `git diff -w`).
