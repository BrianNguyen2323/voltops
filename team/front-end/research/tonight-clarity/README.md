# Topic 3 — Tonight card clarity (valid window + "what would change it" tooltip)

PO, 2026-10-08. Two asks about the Tonight card (`src/components/dashboard/dashboard.tsx` ~L284-298):
1. "From 9:00 PM until 9:00 PM" is confusing. What is this window for?
2. Add an info tooltip on hover, next to "{confidence} confidence. {wouldChange}". It explains the confidence level and the real scenarios behind "a different forecast high" and "a tariff change".

## Findings (code read, no web research needed)

### Where the window comes from
`src/lib/advisor/reserve.ts` (middleware-owned; `team/middleware/design/SPEC.md` L166):
- `validFrom = max(updatedAt, end of TODAY's peak window)`. That's 9 PM tonight for a 4-9 PM peak.
- `validTo = end of TOMORROW's peak window`. That's 9 PM tomorrow.
- The UI prints only `clock()` (time, no day), so 24 h apart reads as "9:00 PM until 9:00 PM".

### The window is wrong for the advice, not just badly labelled
A Powerwall backup reserve is a floor: the battery won't discharge below it. The advice is "hold an extra x% for tomorrow's peak". So the battery has to be **allowed to discharge during the peak**, which means the reserve goes back down to the 20% emergency floor **when the peak starts**. If the reserve stays raised until 9 PM tomorrow (the current `validTo`), the stored energy stays locked through the peak and the saving never happens.
- Correct window: raise after today's peak ends (9 PM tonight) and lower back to 20% when tomorrow's peak **starts** (4 PM tomorrow).
- Fix at the root: `validTo = start of tomorrow's peak window` (`win.startMs`, already computed in `peakWindow`). That is one line in `reserve.ts`, plus its test and the middleware SPEC line. Without it, the UI would have to re-derive the peak start from the timeline, so two places would define the window.
- The sample snapshot (`src/app/(protected)/home/data.ts` L161-162) has the same 24 h window. It moves to 4 PM too.

### What the tooltip can say with today's snapshot data
- Confidence (`reserve.ts` L115): `low` when `similarTempDays < 3`, else `medium`. It is never `high` today. The inputs are already in `view.peakUsage.tomorrow`: `similarTempDays`, `highC`, `historyAvgWh`, `similarTempAvgWh`. So the tooltip can explain it with real numbers, e.g. "Low: only 1 past day had a high near 75°F; 3 are needed. Until then the estimate uses your 30-day usual of 9.3 kWh."
- "A different forecast high": the estimate is the average over days within ±3 °C (≈ ±5 °F) of tomorrow's high. If the forecast moves out of that band, a different set of days is used. The snapshot holds only ONE band's average, so the UI can describe the effect in words but cannot quantify it ("at 85°F you'd need 72%") without new data.
- "A tariff change": the peak window (4-9 PM) comes from the timeline `period`. The saving = covered kWh × (peak rate − cheapest off-peak rate). The snapshot has only the current rates (`tariffNow`), not tomorrow's peak/off-peak pair, so the UI can name the hours but not show the rate gap without new data.
- `wouldChange` is a fixed string today. The tooltip should be built in the UI from structured fields, not by parsing that string.

### Tooltip mechanics
- `radix-ui` is installed. shadcn `tooltip` / `popover` aren't added yet (`src/components/ui` has badge, button, card, chart).
- A pure hover tooltip doesn't open on phones, and the dashboard must work on a phone (CLAUDE.md §9). The fix: an ⓘ button that opens on hover/focus **and** on tap. Either a shadcn Popover with hover handlers, or a Tooltip with controlled `open` toggled on click.
