# Milestones

## M1 — Verify MVP Fleet API GETs (SPEC Rev 1) — DONE
- B001 verify-tesla-gets script (tests first, then implementation). DONE
- B002 fixture redaction fix (vehicle filter, UUIDs, secrets-first, env check). Leak found in the PO run. DONE (merged 9c69ba1)
- B003 redaction hardening (B002 reviewer nits). DONE (merged d4bd5c8)
- Done when: B001–B003 are merged and clean fixtures are committed. **DONE 2026-10-04** (night fixtures; PO call). Carry-over: the daytime re-run verifies the battery and solar signs. That is a follow-up, not a blocker for M1.
