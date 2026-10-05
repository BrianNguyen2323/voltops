# Milestones

## M1 — Verify MVP Fleet API GETs (SPEC Rev 1)
- B001 verify-tesla-gets script (tests first, then implementation). DONE
- B002 fixture redaction fix (vehicle filter, UUIDs, secrets-first, env check). Leak found in the PO run. DONE (merged 9c69ba1)
- B003 redaction hardening (B002 reviewer nits). In progress; lands before the daytime run.
- Done when: B001 and B002 are merged, the PO has re-run during daytime (signs verified), and clean fixtures are committed.
