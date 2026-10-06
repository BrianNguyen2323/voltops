# Milestones — front-end

## M1 — Home dashboard v1 on sample data (`/home` renders all 7 sections at 390 px and 1440 px) — SPEC Rev 1 — DONE 2026-10-06 (ff33d4e on `front-end-development`)
- B001 Theme tokens → shadcn names, `radix-nova`, Archivo, shadcn components. Tester → implementer.
- B002 `DashboardData` contract + `sampleDashboard` + `src/lib/format.ts`. Tester → implementer. Runs in parallel with B001; no shared files.
- B004 Sample consistency fix (B002 review nits). Tester → implementer. Parallel with B001.
- B003 Dashboard components + `/home` page + header/logout move. Tester → implementer. Starts after B001 + B002 merge.
- Then: a PO Review item in TODO.md.

## M2 — M1 review fixes (cross flow diagram, weather tile, readable chart, credit wording) — SPEC Rev 2 — DONE 2026-10-06 (b891873 on `front-end-development`)
- B005 Contract (`weatherTomorrow`, `temperatureUnit`, `formatTemp`) + dashboard changes. Tester → implementer → reviewer with screenshots.
- Then: a PO Review item in TODO.md.

## M3 — M2 review fixes (mobile kW size, labelled grid price + home cost now, tooltip swatches) — SPEC Rev 3 — DONE 2026-10-06 (6442b61 on `front-end-development`)
- B006 Flow-node mobile sizing/padding, the "Grid price now" / "Your home now" strip with `costNow`, shared legend/tooltip swatches. Tester → implementer → reviewer with screenshots.
- B007 Name the cost lines (Spending/Saving/Earning) + clamp saving at 0 (B006 review nits). Tester → implementer → reviewer.
- Then: a PO Review item. **The optimization round is due after M3** (3 milestones).

## M4 — M3 asks + optimization round 1 — SPEC Rev 4
- B008 "Spending" label pink + `predev` migrate. Tester → implementer → reviewer.
- B009 Cleaner pass over the front-end code (`src/components/dashboard/**`, `src/app/(protected)/home/**`, `src/lib/format.ts`, `src/components/ui/**`, `src/styles/globals.css`). Starts after B008 merges.
- Perf/size pass (lead): `/home` First Load JS from `pnpm build`, and the docker image size (smoke). Recorded in `research/optimization/README.md`.
- PO: run `/improve-codebase-architecture` in this session. The pick becomes SPEC Rev 5.
