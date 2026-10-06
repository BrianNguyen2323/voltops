# Optimization round 1: perf/size pass (2026-10-06)

Measured by the lead on `front-end-development` at fffb9f3 (code = M3, 6442b61).

## Numbers
| what | value | reference |
|---|---|---|
| `/home` route JS | **217 kB** | — |
| `/home` First Load JS | **320 kB** | `/login` and `/setup` are 103 kB |
| Shared by all routes | 102 kB | |
| Docker web image | **304 MB** | 303 MB at B001 (after radix-ui/recharts/tw-animate-css); 400 MB cap |

Commands:
- `rm -rf .next && SKIP_ENV_VALIDATION=1 rtk proxy pnpm build` (route table);
- `SMOKE_PORT=3100 bash scripts/docker-smoke.sh` (PASS).

## Reading
- The image barely moved (+1 MB). Next's standalone output only traces server code, and the dashboard's client JS is small next to the Node runtime.
- **`/home` carries about 217 kB of route JS, almost all Recharts** (two charts: the 48 h composed chart and the 7-day bars) plus the shadcn chart wrapper. The flow diagram, the cards and the formatters are a few kB.
- This is fine on a LAN or a home server. It matters most on a phone over a slow link.

## Options (for the PO; not done in this round)
- **A. Keep it.** This is the cheapest option. Revisit once real data and the Plan/Trends screens exist, since they'll reuse Recharts and share the chunk.
- **B. Lazy-load the charts** (`next/dynamic`, `ssr: false`) with a sized placeholder.
  - The first paint gets lighter, because the hero and "Tonight" render first.
  - It's a few lines and keeps Recharts.
- **C. Hand-written SVG for the two charts.** Drops the `recharts` dependency and most of the 217 kB, but it's more code to own when tooltips and real data arrive (this was decision Q6 B, which the PO declined).

The cleaner pass (B009) covers code hygiene only: no behaviour change, and no dependency swaps.
