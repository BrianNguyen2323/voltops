# B001 — Theme tokens → shadcn names, Nova style, Archivo, shadcn components

## Skills
`Use skill: frontend-design` (implementer: the type/token work is the design foundation).

## Facts
- **Stack:** Next 15 App Router, Tailwind v4 (CSS-only `@theme`, no tailwind.config), pnpm, Vitest (node env). The app is dark only (`<html class="dark">`, `color-scheme: dark`).
- **Current** `src/styles/globals.css`: `@theme` with `--color-primary #00ffb2`, `--color-accent #ff0066`, `--color-foreground #f5f5f5`, `--color-muted #b0b0b0` (text colour), `--color-background #08070e`, `--color-surface #17171d`, `--color-border #202026`.
- **Target** (SPEC Rev 1, PO decision Q2 = keep every hex, rename to shadcn names). Raw vars go on `:root` and are mapped in `@theme inline` as `--color-<name>: var(--<name>)`:

| var | value |
|---|---|
| `--background` | #08070e |
| `--foreground`, `--card-foreground`, `--popover-foreground`, `--secondary-foreground`, `--accent-foreground` | #f5f5f5 |
| `--card`, `--popover` | #17171d |
| `--primary` | #00ffb2 |
| `--primary-foreground` | #08070e |
| `--secondary`, `--muted`, `--accent` | #202026 |
| `--muted-foreground` | #b0b0b0 |
| `--destructive` | #ff0066 |
| `--border`, `--input` | #202026 |
| `--ring` | #00ffb2 |
| `--chart-1` | #ffb547 (solar) |
| `--chart-2` | #00ffb2 (battery) |
| `--chart-3` | #f5f5f5 (home) |
| `--chart-4` | #ff0066 (grid import) |
| `--chart-5` | #8b93ff (grid export) |

  - Add semantic colours `--color-solar`, `--color-battery`, `--color-home`, `--color-grid-import` and `--color-grid-export` in `@theme inline`, pointing at `var(--chart-1..5)`.
  - The names `surface` and `accent`-as-pink are gone.
- **Renames** in existing code (the login page must look identical):
  - `bg-surface` → `bg-card` (`src/app/login/auth-form.tsx`);
  - `text-muted` → `text-muted-foreground` (`auth-form.tsx`, `src/app/(protected)/layout.tsx`).

  Grep `src/` for any other `surface`/`text-muted`/`accent` usage.
- **Font (Q4):**
  - Archivo via `next/font/google`: `Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo" })`;
  - `--font-sans: var(--font-archivo), ui-sans-serif, system-ui, sans-serif`;
  - remove Geist and Figtree from `src/app/layout.tsx`. Keep the auth-disabled banner and `TRPCReactProvider`.
- **shadcn (Q3, Q6):**
  - set `components.json` `"style": "radix-nova"`, keep the other keys;
  - add `button`, `card`, `badge`, `chart` and `separator` into `src/components/ui/` with the shadcn CLI (`pnpm dlx shadcn@latest add ...`). If the CLI rewrites `globals.css`, re-apply the token table above: **the hex values in the table win**;
  - allowed new deps: `radix-ui`, `recharts`, and what the CLI needs (`tw-animate-css`, `shadcn` for its CSS import). Nothing else. List each one in the handoff.
- **Vitest** must pick up `.tsx` tests: `include: ["src/**/*.test.{ts,tsx}"]`.

## Owned files
- Tester:
  - `vitest.config.ts`;
  - `src/styles/theme.test.ts`;
  - `src/app/login/auth-form.test.tsx`.
- Implementer:
  - `src/styles/globals.css`, `src/app/layout.tsx`, `components.json`;
  - `src/app/login/auth-form.tsx`, `src/app/(protected)/layout.tsx` (class renames only);
  - `src/components/ui/**`, `package.json`, `pnpm-lock.yaml`.

## Base
- Tester: `front-end-development` → branch `phase2a/ui-theme-test`. The tests must FAIL on the base.
- Implementer: `phase2a/ui-theme-test` → branch `phase2a/ui-theme-impl`.

## Judged by
- Tests (tester writes them, it's fine to read files as text):
  - `theme.test.ts`:
    - `globals.css` defines each var in the table with its hex (case-insensitive);
    - it maps them in `@theme inline`, including the 5 semantic energy colours;
    - it has no `--color-surface`;
    - `components.json` style is `radix-nova`;
    - `src/components/ui/{button,card,badge,chart,separator}.tsx` exist;
    - `src/app/layout.tsx` imports `Archivo` and not `Geist`/`Figtree`.
  - `auth-form.test.tsx`: `renderToStaticMarkup` of `AuthForm` (with a hint) contains `bg-card` and `text-muted-foreground`, and no `bg-surface`.
- Command: `rm -rf .next && pnpm test && pnpm typecheck && SKIP_ENV_VALIDATION=1 pnpm lint && SKIP_ENV_VALIDATION=1 pnpm build`, all green, lint with 0 warnings.
- Deps change, so: `SMOKE_PORT=3100 bash scripts/docker-smoke.sh` prints PASS (image ≤ 400 MB).
- **Worktree:**
  - deps change, so run a real `pnpm install` (not a node_modules junction);
  - never copy the PO's `.env`;
  - before removing the worktree, delete its node_modules from PowerShell: `cmd /c rmdir /s /q "\\?\<full path>\node_modules"`.

## Gate log
- Tests fd7d504 on `phase2a/ui-theme-test`: 63 new FAIL on base (41 existing pass). Vitest needs `oxc: { jsx: { runtime: "automatic" } }` for .tsx (Vite 8). Hex tests expect literal `--name: #hex;`. Implementer spawned.
