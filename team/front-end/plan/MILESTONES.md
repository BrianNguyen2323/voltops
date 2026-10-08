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

## M4 — M3 asks + optimization round 1 — SPEC Rev 4 — DONE 2026-10-06 (d27022d on `front-end-development`; PO steps open)
- B008 "Spending" label pink + `predev` migrate. Tester → implementer → reviewer.
- B009 Cleaner pass over the front-end code (`src/components/dashboard/**`, `src/app/(protected)/home/**`, `src/lib/format.ts`, `src/components/ui/**`, `src/styles/globals.css`). Starts after B008 merges.
- Perf/size pass (lead): `/home` First Load JS from `pnpm build`, and the docker image size (smoke). Recorded in `research/optimization/README.md`.
- PO: run `/improve-codebase-architecture` in this session. The pick becomes SPEC Rev 5.

## M5 — Architecture candidate 1: deepen the Dashboard snapshot seam — SPEC Rev 5 — DONE 2026-10-06 (10f2f7f on `front-end-development`)
- B010 `src/lib/dashboard.ts` (`DashboardSnapshot`, `checkSnapshot`, `DashboardView`, `toDashboardView`) + sample adapter → `sampleSnapshot` + tests (DST day, non-midnight start). Keeps a temporary `DashboardData = DashboardView` alias so the UI builds unchanged. Tester → implementer → reviewer.
- B011 UI reads the view (`view` prop, `solarOutlook` instead of Timeline slicing), the page runs the check + logs, remove the alias, `docs/dashboard-snapshot.md`. Starts after B010 merges. Tester → implementer → reviewer with before/after screenshots (must be identical).
- Then: the lead copies the doc into `team/middleware/`; a PO review; **the PO merges `front-end-development` → `main`**.

## M6 — Peak-hours tile + reserve advice sentence (placeholders) — SPEC Rev 6 — DONE 2026-10-07 (b66599f on `front-end-development`)
- B012 contract (`peakEstimate`, `recommendation.reserve`, `peakEstimateWh`, `reservePlan`, check rules, `peakUsage` view), sample values, the tile + the Tonight sentence, the `build.ts` stub, the doc section. Tester → implementer → reviewer with screenshots.
- Then: the lead refreshes the middleware's doc copy; middleware B013 (in their backlog) fills the real numbers; a PO review.

## M7 — Tonight card clarity (window fix, two-step line, ⓘ popover) — SPEC Rev 7 — DONE 2026-10-08 (1f92288 on `front-end-development`)
- B034 advisor `validTo` = peak start, the two-step line with day words, the ⓘ popover (shadcn Popover) with confidence and scenario copy, sample `validTo`. Tester → implementer → reviewer with screenshots.
- Then: the lead updates middleware SPEC L166 and their RESUME, then a PO review. **The optimization round is due after M7.**

## M8 — Your system + Equipment health (placeholders) — SPEC Rev 8 — DONE 2026-10-08 (af94a16 on `front-end-development`)
- B035 contract (`system`, `equipmentHealth`), the view statuses, the section with 3 tiles + ⓘ + details/change log, sample values, the `build.ts` stub, `.env.example` panel vars, and the doc. Tester → implementer → reviewer with screenshots.
- Middleware backlog (their board): B036 site_info fields + panel env + best hour + change log; B037 health measurements; B038 one-time backfill within the request budget.
- Then: a PO review, then the **optimization round** (overdue since M7, by PO request).

## Architecture backlog (from the 2026-10-06 review, `research/architecture/README.md`; priority order set by the lead)
1. **Candidate 1, deepen the `DashboardData` seam:** DONE in M5 (10f2f7f).
2. **Candidate 3, one site-local time module + DST tests:** next. Unblocked, cheap, and lands the DST tests CLAUDE.md §5 requires. Do it before or with the Plan/Trends time axes.
3. **Candidate 2, one tariff module, deepen `costNow`:** Strong, but **blocked** until the middleware team settles the `tariffSchedule.content` shape. Ask them first. It also unlocks deriving `costToday` (left as an input in candidate 1).
4. **Candidate 4, one "what is this flow doing" module:** worth doing when the advisor or Plan needs the same words, or bundled with 3.
5. **Candidate 5, name the sample sim as an adapter:** mostly falls out of candidate 1. Finish it when the middleware's real adapter lands.
