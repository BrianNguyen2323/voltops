# Research — home dashboard (`/home`) round 1

Done by the lead on 2026-10-06, with skill `frontend-design` (planning pass).

## What exists today
- `/home` (`src/app/(protected)/home/page.tsx`) shows only "Connect Tesla" or "Tesla connected". The page sits behind `requireAdmin()` in `(protected)/layout.tsx`, which also renders the "Log out" button.
- Theme (`src/styles/globals.css`, Tailwind v4 `@theme`, dark only):
  - `primary` #00ffb2 · `accent` #ff0066 · `background` #08070e · `surface` #17171d · `border` #202026 · `foreground` #f5f5f5 · `muted` #b0b0b0 (a **text** colour).
- Tokens are used in 4 places only: `login/auth-form.tsx`, `(protected)/layout.tsx`, `home/page.tsx` (`bg-surface`, `text-muted`, `bg-primary`...).
- Fonts: `layout.tsx` loads **both** Geist and Figtree. Both write `--font-sans`, so which one wins depends on CSS order. Nobody chose this on purpose; it's T3 + shadcn-init leftovers.
- shadcn:
  - `components.json` is there (style `radix-maia`, icons `hugeicons`, aliases `~/components/ui`), but there are no components;
  - db-docker B012 removed the unused deps `shadcn`, `radix-ui` and `tw-animate-css`. Adding components brings `radix-ui` back (plus `recharts` for charts);
  - `@hugeicons/react` + `@hugeicons/core-free-icons` and `cn()` in `~/lib/utils` are already installed.
- Tests: Vitest, node environment, `src/**/*.test.ts` only. No jsdom, no Testing Library, no Playwright.
- Live data shape today: `PowerwallReading` in `src/lib/tesla.ts` is in kW. CLAUDE.md §5 says the canonical units are W/Wh integers, converted to kW/kWh only in the UI.

## Token clash: shadcn vs the current theme
shadcn components use `bg-card`, `bg-muted`, `text-muted-foreground`, `text-primary-foreground`, `ring`, `input`, `popover`, and `--chart-1..5`. In the current theme, `muted` is a text colour. shadcn uses `muted` as a background and `muted-foreground` as the text colour. So the theme must be mapped onto shadcn's names:
- `surface` → `card`/`popover`;
- `muted` (text) → `muted-foreground`;
- `primary-foreground` → #08070e.

That changes 2 class names in 2 existing files (Q2).

## shadcn styles (Feb 2026)
Set as `"style": "{library}-{style}"` in `components.json`:
- **Vega**: medium radius, balanced spacing (the classic look).
- **Nova**: tighter padding, for compact dashboards.
- **Maia**: large, often fully rounded radii and generous spacing. Made for consumer products. This is the current setting.
- **Lyra**: zero radius, sharp and boxy.
- **Mira**: the most compact, for dense UIs.

The chart component is Recharts with theme-aware container/tooltip/legend (`npx shadcn add chart` adds `recharts` and `components/ui/chart.tsx`). It needs an explicit height on `ChartContainer`.

## Design plan (frontend-design pass 1)

**Subject:** VoltOps, a self-hosted companion for a Tesla Solar + Powerwall household.
**Audience:** the owner, a technical homeowner who checks it on a phone in the evening and on a desktop at the weekend.
**Primary job of `/home`:** at a glance, show what the house is doing right now and what to do tonight. Then give one doorway into each MVP pillar (Observe, Understand, Predict, Advise).

### Colour (pinned by the PO: the existing theme)
| role | hex | contrast vs surface |
|---|---|---|
| background | #08070e | — |
| surface (card) | #17171d | — |
| border | #202026 | 1.10 (hairline only, never the sole carrier of meaning) |
| text | #f5f5f5 | 16.4 |
| text secondary | #b0b0b0 | 8.2 |
| **battery / brand** | #00ffb2 primary | 13.6 |
| **grid import / cost / alerts** | #ff0066 accent | 4.6 |
| **solar** (new) | #ffb547 amber | 10.2 |
| **grid export** (new) | #8b93ff periwinkle | 6.6 |
| home load | #f5f5f5 | 16.4 |

Every series colour is ≥ 3:1 against the surface (WCAG non-text). The meaning is fixed across the whole app: the sun is amber, stored energy is the brand mint, and money leaving the house is pink. That vocabulary is the point of the palette.

### Type (draft → revised, see the review below)
- Draft: Geist for everything (it's already loaded).
- **Revised: Archivo (variable, `wdth` axis 62–125), one family only.**
  - Live readings (kW, %, kWh): semi-expanded width, heavy weight, tabular numerals. They should read like utility-meter or switchgear signage.
  - Body and labels: normal width, 400/500.
- Scale (1.25 ratio): 12 / 14 / 16 / 20 / 25 / 31 / 39 / 49 px. Body 16 on desktop, 15 on mobile.

### Layout
The **power-flow diagram is the hero**, not a row of KPI tiles. It is the one thing only an energy dashboard has.

Desktop (≥ 1024 px):
```
┌ VoltOps · Home site ─────────────────── updated 2 min ago · Log out ┐
├───────────────────────────────────────────┬─────────────────────────┤
│  HERO: live power flow (no card frame)    │  Tonight (advice)       │
│     Solar 4.2 kW ──▶ Home 1.8 kW          │  Raise backup reserve   │
│        │                 ▲                │  to 65% from 9 PM       │
│        ▼                 │                │  Why: tomorrow cloudy,  │
│     Powerwall 82% ◀──▶ Grid −2.1 kW       │  4–9 PM needs ~11 kWh   │
│     peak period now: $0.48/kWh            │  Saves ≈ $3.10 · conf.  │
├───────────────────────────────────────────┴─────────────────────────┤
│ Today → tomorrow (48 h): load band p10–p90 vs solar, TOU bands, now │
├────────────────┬────────────────┬────────────────┬──────────────────┤
│ Today so far   │ Cost today     │ Last 7 days    │ Forecast accuracy │
│ (kWh)          │ by TOU period  │ solar vs load  │ vs baseline       │
└────────────────┴────────────────┴────────────────┴──────────────────┘
  system: Fleet API · last poll 14:05 · ~2,900 requests/month (est.)
```
- Mobile: one column, in order hero → advice → 48 h chart → the four panels → system line.
- Everything is left-aligned. Numbers are right-aligned in tables.
- The bottom row is **one panel split by vertical rules**, not four identical cards.
- Radius hierarchy:
  - the hero has no frame;
  - the advice panel is the only raised surface;
  - small controls use the style's radius.

### Principles
1. Show the energy, not the software. The flow diagram and the advice lead; system status is one quiet line at the bottom.
2. One motion moment: the flow lines move in the direction energy really flows, at a speed scaled to kW. With `prefers-reduced-motion`, they are static arrows.
3. kW for power and kWh for energy. Always labelled, never mixed. One formatter does all conversions.
4. The colour of an energy type never changes between widgets.
5. Placeholder data is visibly marked as sample data, so no one mistakes it for their house.

### Review against the brief (pass 2: what I changed and why)
- **Hero.** My first instinct was a big-number KPI row (Solar / Home / Battery / Grid tiles). That is the generic "big number + small label" default and fits any dashboard. Replaced it with the power-flow diagram, which comes from the subject (CLAUDE.md §9 "Now").
- **Cards.** The draft had 8 equal rounded cards. That is the SaaS-card kit. Revised to: a frameless hero, one raised advice panel, one divided strip.
- **Type.** Geist is the T3 default, not a choice. Revised to Archivo with the width axis, so the readings get the meter/signage voice from the subject's own world.
- **Palette.** Near-black + acid green is itself a known default (trait 2). The PO pinned it, so it stays. I spend the freedom on a semantic series palette instead of decorative gradients.
- **Chrome rules for the build:**
  - no all-caps eyebrow labels and no monospace micro-labels;
  - no "→" appended to buttons, and no fade-up on every section;
  - the only middle-dot meta string is the system status line. Revisit it at review if it reads as template.
- **Copy** is user-facing and specific:
  - "Tonight", "Today so far", "Cost today", "Last 7 days", "How good were yesterday's forecasts";
  - not "Analytics" or "Insights".

## Testing approach (no new test deps)
- Keep the dashboard a pure component, `<Dashboard data={...} />`. The page only decides connected/not connected and passes in the sample data. That gives the middleware team a single swap point.
- Tests: `react-dom/server` `renderToStaticMarkup` in Vitest (node env), plus pure unit tests for the unit formatter and the sample-data invariants (`solar + battery + grid ≈ load`, signs per CLAUDE.md §5). `vitest.config.ts` must include `src/**/*.test.tsx`.
- Visual check: the reviewer screenshots `/home` at 390 px and 1440 px with skill `agent-browser`.

## Sources
- shadcn component styles (Vega/Nova/Maia/Lyra/Mira), Feb 2026: https://www.shadcnblocks.com/blog/shadcn-component-styles-vega-nova-maia-lyra-mira
- shadcn styles docs: https://www.shadcnblocks.com/docs/blocks/styles
- shadcn chart (Recharts, ChartContainer needs a height, `--chart-*` vars): https://ui.shadcn.com/docs/components/chart
- CLAUDE.md §5 (units/signs), §7 (forecasts p10/p50/p90, "learning" < 7 days), §8 (advice shape), §9 (screens and UI rules)
- Contrast: WCAG 2.x relative-luminance formula, computed locally.
