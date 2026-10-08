# B034 — Tonight card: reserve window fix, two-step line, ⓘ popover

## Skills
Implementer: `Use skill: frontend-design` (the line and the popover must fit the existing theme). Reviewer: `Use skill: agent-browser` for 390/1440 screenshots, including the popover open.

## Facts
- **SPEC Rev 7, section "Tonight card clarity"** (`team/front-end/design/SPEC.md`, at the end of the file). It is the exact copy and rules: read it in full. Summary:
  - **Advisor:** in `src/lib/advisor/reserve.ts`, `validTo` = `win.startMs` (the start of tomorrow's peak), not `win.endMs`. `validFrom` is unchanged. Nothing else in the advisor changes.
  - **Sample:** `src/app/(protected)/home/data.ts` `validTo: "2026-07-16T23:00:00Z"` (4:00 PM PDT). `checkSnapshot(sampleSnapshot)` stays `[]`.
  - **New pure module** `src/components/dashboard/tonight.ts` (no React, no I/O):
    - `dayWord(iso, updatedAt, tz)` → "tonight" | "today" | "tomorrow" | weekday name (the rules are in the SPEC);
    - `reserveSteps(view)` → the two sentences of the two-step line, as data the UI can bold (e.g. `{ lead: "Tonight at 9:00 PM", rest: ", after today's peak hours end, raise it to 89%." }[]`; you choose the exact shape, but keep it minimal);
    - `confidenceInfo(view)` → `{ title, text }[]` (3 sections), or null when `rec.reserve` or `peakUsage.tomorrow` is null.
  - **UI** (`dashboard.tsx`): the reserve branch's "From … until …" line → the two-step line. The confidence line gets an ⓘ button (`aria-label="About this advice"`) that opens a popover with the 3 sections, on hover/focus **and** tap/click. The popover is a `"use client"` component (`src/components/dashboard/info-popover.tsx`) on shadcn Popover (`src/components/ui/popover.tsx`: `pnpm dlx shadcn@latest add popover`, or write the standard file by hand; `radix-ui` is already installed, so **no new dependency**). `dashboard.tsx` itself is a server component: keep it that way. The plain-action (no `reserve`) branch is unchanged.
- Times use the existing `clock` format ("9:00 PM"), temperatures `formatTemp`, energy `formatKwh` (`src/lib/format.ts`). The ±3 °C band is the contract value (`PeakHistory.similarTempDays` doc in `src/lib/dashboard.ts`).
- Advisory only (D11). Canonical units (CLAUDE.md §5).
- The rest of `/home` must look unchanged.

## Owned files
- **Tester:**
  - `src/components/dashboard/tonight.test.ts` (new);
  - `src/components/dashboard/dashboard.test.tsx`;
  - `src/lib/advisor/reserve.test.ts`, `src/server/snapshot/build.test.ts`, `src/server/snapshot/load.test.ts`: only the `validTo` expectations (now 16:00 local: e.g. `2026-05-21T23:00:00.000Z` for 5/21 PDT; the DST cases are 16:00 local too). Check each case against its tariff: the expectation must be the start of the "peak" period that `reserve.ts`'s `peakWindow` finds.
  - `src/app/(protected)/home/data.test.ts` (if it pins `validTo`).
- **Implementer:**
  - `src/lib/advisor/reserve.ts` (the one `validTo` line);
  - `src/app/(protected)/home/data.ts` (`validTo` only);
  - `src/components/dashboard/tonight.ts` (new), `info-popover.tsx` (new), `dashboard.tsx`;
  - `src/components/ui/popover.tsx` (new);
  - `docs/dashboard-snapshot.md` (the `validTo` meaning, if it is described there).

## Base
- Tester: `front-end-development` → branch `phase2b/tonight-clarity-test`. New tests must FAIL on the base for the right reason (missing module/markup, old `validTo`), not because of syntax errors.
- Implementer: `phase2b/tonight-clarity-test` → branch `phase2b/tonight-clarity-impl`.

## Judged by
- **Tests (the tester writes them):**
  - `dayWord`: same date at 21:00 → "tonight", 10:00 → "today", next date → "tomorrow", +2 days → weekday name; across a DST day (America/Los_Angeles 2026-11-01).
  - `reserveSteps` on the sample view → exactly "Tonight at 9:00 PM, after today's peak hours end, raise it to 89%." and "Tomorrow at 4:00 PM, when peak hours start, lower it back to 20% so the battery covers the peak." (joined text); `validFrom` = `updatedAt` → "Now, raise it to 89%.".
  - `confidenceInfo`:
    - medium (the sample: 6 days near 75°F, 8.4 kWh, usual 10.2 kWh over 30 days) → title "Why medium confidence" and the SPEC text;
    - low with n = 1 ("Only 1 past day had a high near …; 3 are needed.") and n = 0 ("No past days had a high near …");
    - band text "between 70°F and 81°F" for the sample (24 °C ± 3);
    - tariff text "Your peak hours are 4:00 PM–9:00 PM.";
    - null without `reserve` or without `peakUsage.tomorrow`.
  - Markup: the sample renders the two-step line and a button with `aria-label="About this advice"`; it no longer contains "From 9:00 PM until"; the no-reserve card still renders "From … until …" and has no info button.
  - `reserve.ts` / `build` / `load`: `validTo` = the start of tomorrow's peak, including the DST cases.
- **Command:** `rm -rf .next && pnpm test && pnpm test:scripts && pnpm typecheck && SKIP_ENV_VALIDATION=1 rtk proxy pnpm lint && SKIP_ENV_VALIDATION=1 pnpm build`, all green.
- **Visual (reviewer):**
  - screenshots of `/home` at 390 and 1440 px with the popover **closed** and **open** (hover on desktop, click at 390). Use a scratch DB in `data/`, and a dev server in the background on **3100**, never 3000;
  - the popover is readable, doesn't overflow the viewport at 390, and closes on Escape / outside click;
  - nothing else moved;
  - run `agent-browser close` before handing off.
- **Worktree:** junction `cmd //c mklink //J node_modules "D:\Programming Projects\voltops\node_modules"`; `cmd //c rmdir node_modules` before finishing; never `--force`. Keep commands bounded (no watch mode). Prettier only on owned files. **COMMIT and give the hash.**

## Gate log
- Tests 01428f0 on `phase2b/tonight-clarity-test`:
  - 11 tests fail plus 1 suite that can't load (`tonight.ts` missing), all for the right reason.
  - Shapes fixed by the tester:
    - `dayWord` returns lowercase words or a capitalised weekday;
    - `reserveSteps` → `{ lead, rest }[]` (2 entries);
    - `confidenceInfo` → `{ title, text }[] | null`.
  - validTo expectations: 16:00 local (5/21 → 23:00Z; fall DST 11/2 → 2026-11-03T00:00Z).
  - The n = 0 copy keeps the "Until then …" tail.
  - Implementer spawned.
- Impl 32dbde9 on `phase2b/tonight-clarity-impl`: vitest 627, scripts 71, typecheck, lint clean, build OK. No edits outside the owned files. `clock` moved into `tonight.ts` and is re-imported by the dashboard. The docs don't describe `validTo` (unchanged). Reviewer spawned.
- Reviewer (32dbde9): **FAIL**, one must-fix.
  - The must-fix: a popover opened by hover can't be closed. Radix returns focus to the trigger on close, the trigger's `onFocus` reopens it, and so mouse-leave, Escape and outside click all fail. Fix: `onCloseAutoFocus={(e) => e.preventDefault()}` on `PopoverContent`.
  - Everything else verified, and the gate is green. Screenshots in `data/shots/b034-*.png`.
  - Nits:
    - the ⓘ wraps alone onto its own line at 1440;
    - at 390 the popover touches the left edge (`collisionPadding={8}`).
  - Fix-up implementer spawned on `phase2b/tonight-clarity-fix` (the must-fix + both nits).
- Fix-up 2ad2632 on `phase2b/tonight-clarity-fix`: `onCloseAutoFocus` preventDefault, `collisionPadding={8}`, the last word + ⓘ in a `whitespace-nowrap` span (only when there is info). Gate green (627/71/tsc/lint/build). Hover-leave and Escape close it at 1440. Re-review spawned.
- Re-review (2ad2632): **PASS**.
  - Diff scope OK; gate green.
  - At 1440: hover-leave, Escape, outside click and keyboard all behave; the ⓘ is on the same line.
  - At 390: tap opens it, 8 px margin, an outside tap closes it.
  - Screenshots in `data/shots/b034-fix-*.png`.
  - Nits (open): at 390 the popover bottom is ~2 px past the viewport (the page scrolls); `lastIndexOf(" ")` is computed twice in `dashboard.tsx`.
- **Merged 1f92288** into `front-end-development`. Gate there: vitest 627/627, scripts green, tsc, lint clean, build OK, `/home` 219 kB / 321 kB First Load (was 217/320). Worktrees and branches removed.
