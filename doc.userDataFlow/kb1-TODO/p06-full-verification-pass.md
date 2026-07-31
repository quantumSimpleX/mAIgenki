# P6: Full Verification Pass

## Scope
Tasks 6.1–6.4 in `doc.userDataFlow/userDataTask.md`, Phase 6 — automated suite, large-record manual test, export/import round trip, final acceptance walkthrough.

## Out of Scope
New feature work — this phase verifies, it doesn't implement.

## Dependencies
All prior phases (0–5) in `kb4-DONE`.

## Assigned Agents
- ArchAgent:
- DevAgent:
- QAAgent:

## Allowed Files/Directories
Test files only; this card. No application code changes expected except fixes for defects found here.

## Implementation Checklist

- [ ] P06-01 **Task 6.1 — Automated suite** — see `userDataTask.md` Task 6.1.
- [ ] P06-02 **Task 6.2 — Large-record manual test** — see `userDataTask.md` Task 6.2.
- [ ] P06-03 **Task 6.3 — Export/import round trip with real data** — see `userDataTask.md` Task 6.3.
- [ ] P06-04 **Task 6.4 — Final acceptance pass** — see `userDataTask.md` Task 6.4.

## Acceptance Criteria
Every bullet in `userDataReq.md` §10 is confirmed passing or has an explicit, user-acknowledged follow-up. No blocker is represented as passed.

## Required Validation
- `npm run typecheck`, `npx expo lint`, `npm test`
- Manual: 80–100 page synthetic record upload, forced mid-run 429, export→reimport round trip.

## Developer Verification

## QA Test Plan

## Implementation Record

## QA Record

## Defects and Retests

## Blockers

## Completion

## History
