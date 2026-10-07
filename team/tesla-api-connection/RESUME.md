# Resume board — Tesla API Connection

- **Topic:** verify that the Fleet API GET requests VoltOps needs actually work against the PO's real account. Next up: the `fleet-api` adapter (CLAUDE.md §5).
- **Current round: CLOSED 2026-10-06.** Decision round 2 (the fleet-api adapter) was absorbed by `team/middleware` (its Decision round 1 Q1 A; brief B001). Nothing more is pending here.
- **Last action:** 2026-10-05 11:06: PO daytime run, 4/4 OK. Signs verified 1:1 (battery -1267 W in the fixture = charging at 1.3 kW in the app). Fixtures leak-scanned and committed (b452729). The db-docker hold for the daytime run was cleared in `team/db-docker/RESUME.md`. Adapter research written (`research/fleet-api-adapter/README.md`), and Decision round 2 opened in TODO.md (Q1–Q5).
- **Next action:** Record the PO's answers next to Q1–Q5 → SPEC Revision 2 + `design/revisions/R002.md` → milestone M2 + briefs in board/ready (tester first). If Q3=A, the first brief adds a "calendar_history for today" probe to `scripts/verify-tesla-gets.mjs` for the PO to run once. Adapter files must not overlap db-docker B002's owned files (`src/lib/tesla.ts`, `src/server/db/schema.ts`).
- **Follow-ups:** storage/hosting lives in `team/db-docker`. The swap from `src/lib/tesla.ts` to the adapter waits on db-docker B002 merging.
- **Next-topic candidates (from the PO):** weather location. Tesla gives no coordinates, so the user must provide them (ZIP/city geocoding via Open-Meteo, browser geolocation, or manual lat/lon). This is for a separate future scope.
- **Open branches:** none.
