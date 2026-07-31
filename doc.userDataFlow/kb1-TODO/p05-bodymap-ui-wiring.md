# P5: Bodymap UI Wiring

## Scope
Tasks 5.1–5.7 in `doc.userDataFlow/userDataTask.md`, Phase 5 — multi-location dot rendering, persistent image/chart timeline, real image thumbnails/lightbox.

## Out of Scope
Editing non-primary condition locations (future work per PRD §11).

## Dependencies
Phase 2 in `kb4-DONE` (needs `getConditionLocations`/`getRecordImageThumbnail`/`getRecordImageBlob` and the app cutover from Task 2.13). Phase 4 in `kb4-DONE` for real images to display.

## Assigned Agents
- ArchAgent:
- DevAgent:
- QAAgent:

## Allowed Files/Directories
`src/model/conditions.ts`, `src/hooks/useConditions.ts`, `src/app/bodymap.tsx`, this card.

## Implementation Checklist

- [ ] P05-01 **Task 5.1 — Extend `ConditionRecord` type** — see `userDataTask.md` Task 5.1.
- [ ] P05-02 **Task 5.2 — `useConditionDots` hook** — see `userDataTask.md` Task 5.2.
- [ ] P05-03 **Task 5.3 — Refactor dot-rendering components** — see `userDataTask.md` Task 5.3.
- [ ] P05-04 **Task 5.4 — Make the image/chart timeline persistent** — see `userDataTask.md` Task 5.4.
- [ ] P05-05 **Task 5.5 — Real image thumbnails** — see `userDataTask.md` Task 5.5.
- [ ] P05-06 **Task 5.6 — Real images in the lightbox** — see `userDataTask.md` Task 5.6.
- [ ] P05-07 **Task 5.7 — Manual UI regression pass** — see `userDataTask.md` Task 5.7.

## Acceptance Criteria
A multi-location condition renders multiple dots, all opening the same condition sheet. The image timeline is visible whenever a condition is selected, not gated on chat. Demo data (post-cutover) renders visually identical to the pre-cutover SQLite-backed demo.

## Required Validation
- Manual: demo flow regression pass across desktop and mobile viewport widths.
- `npm run typecheck`, `npx expo lint`

## Developer Verification

## QA Test Plan

## Implementation Record

## QA Record

## Defects and Retests

## Blockers

## Completion

## History
