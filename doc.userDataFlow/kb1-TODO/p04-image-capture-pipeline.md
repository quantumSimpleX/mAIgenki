# P4: Image Capture Pipeline

## Scope
Tasks 4.1–4.4 in `doc.userDataFlow/userDataTask.md`, Phase 4 — render PDF pages to Canvas/Blob via `pdfjs-dist`, compress, and wire into the pipeline. No new native or third-party rendering dependency required.

## Out of Scope
UI display of captured images (Phase 5).

## Dependencies
Task 0.1 (Canvas/Blob confirmation). Phase 3 in `kb4-DONE` (Task 4.3 needs Task 3.6's `imageWorthy` section data available in the pipeline).

## Assigned Agents
- ArchAgent:
- DevAgent:
- QAAgent:

## Allowed Files/Directories
`src/lib/pdf/renderPage.ts`, `src/lib/media/compress.ts`, `src/lib/pipeline.ts`, this card.

## Implementation Checklist

- [ ] P04-01 **Task 4.1 — Page-render helper** — see `userDataTask.md` Task 4.1.
- [ ] P04-02 **Task 4.2 — Compression loop** — see `userDataTask.md` Task 4.2.
- [ ] P04-03 **Task 4.3 — Image-capture step in the pipeline** — see `userDataTask.md` Task 4.3.
- [ ] P04-04 **Task 4.4 — Manual verification** — see `userDataTask.md` Task 4.4.

## Acceptance Criteria
Only `imageWorthy`-flagged pages produce stored images. Stored blob sizes are proportionate (hundreds of KB, not multi-MB). A rendering/compression failure for one page doesn't fail the whole record.

## Required Validation
- Manual: upload a record with real imaging-style pages, inspect via browser devtools' IndexedDB inspector.
- `npm run typecheck`

## Developer Verification

## QA Test Plan

## Implementation Record

## QA Record

## Defects and Retests

## Blockers

## Completion

## History
