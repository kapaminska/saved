---
change_id: testing-critical-path-coverage
title: Critical-path coverage — assignment and payment integrity tests
status: implemented
created: 2026-09-03
updated: 2026-09-03
archived_at: null
---

## Notes

Open a change folder for rollout Phase 1 of context/foundation/test-plan.md: "Critical-path coverage".
Risks covered: #1 (saved check-in credits the wrong goal; dashboard still looks plausible), #2 (payment duplicated, dropped, or booked to the wrong month). Test types planned: unit + integration.
Risk response intent: #1 prove after save each amount lands on the goal the user confirmed on review — not the name the model guessed; #2 prove same month cannot produce two rows, a missing month is 0 not deleted history, and future months are rejected.
