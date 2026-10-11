# B038 — One-time history backfill inside a request budget (hand-off from front-end, 2026-10-08)

## Facts
- PO decision (front-end Decision round 5, Q6 A, with conditions):
  - backfill **all existing data** so an existing system gets trends from day one;
  - **one time only**;
  - **within Tesla's request limits**, leaving enough requests for normal VoltOps use.
- Tesla Fleet API, official (https://developer.tesla.com, https://developer.tesla.com/docs/fleet-api/billing-and-limits, checked 2026-10-08):
  - Data requests cost 500 per $1, with a $10/month credit, so about **5,000 free per month**;
  - rate limit: 60 realtime-data requests per minute per device;
  - any status < 500 is billed;
  - the energy endpoints' pricing category is not stated, so assume "Data".
- Normal use today:
  - the worker makes `calendar_history` (today) + `live_status` hourly ≈ 1,440/month;
  - `site_info` daily ≈ 30/month;
  - each dashboard load makes 1 `live_status` (`src/server/snapshot/load.ts`).
- **Rule (front-end SPEC Rev 8, "Backfill budget"):**
  - Count every Fleet request per calendar month, persisted (a new table or a row in settings) and incremented in the one fleet-api client `get`.
  - The backfill fetches one past day per worker tick (60 s): `calendar_history` `period=day` via the existing `dayRange`, newest to oldest, down to `installation_date`.
  - It skips complete days (the existing `isComplete` rule), so nothing is re-fetched.
  - It stops for the month when the backfill has used `TESLA_BACKFILL_MAX_PER_MONTH` (default 2,500) or the month's total reaches `TESLA_MONTHLY_REQUEST_CAP` (default 4,500). State then = `paused-budget`, and it resumes next month.
  - When it reaches the install date: `done`, permanently (persisted).
  - Both env vars are zod-validated and documented in `.env.example`. `TESLA_BACKFILL_MAX_PER_MONTH=0` turns it off (`state: "off"`).
- Weather for the backfilled days: Open-Meteo historical archive (free, no key), a few range requests. Extends the existing gap-fill (B017/B018).
- Fill `equipmentHealth.backfill { state, daysDone, daysTotal }` in the snapshot. `health.estRequestsPerMonth` includes the backfill while it runs.
- Never hit the network in tests (fake source + fake clock).

## Judged by
- Tests:
  - a budget stop at both caps;
  - month rollover resumes;
  - complete days are skipped;
  - `done` persists across restarts;
  - at most 1 backfill request per tick;
  - `0` disables it;
  - the snapshot shows the progress.
- The full gate is green.
