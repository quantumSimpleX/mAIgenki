# P3: Extraction Pipeline Rebuild

## Scope
Tasks 3.1–3.7 in `doc.userDataFlow/userDataTask.md`, Phase 3 — page boundaries, structure analysis, chunking, bounded concurrency, `enrich.ts` rewrite, and wiring chunk output into `pipeline.ts` via IndexedDB.

## Out of Scope
Image capture (Phase 4), UI wiring (Phase 5).

## Dependencies
Phase 2 must be in `kb4-DONE` (Task 3.6 needs `putConditionLocation`/computed-position return from Tasks 2.4/2.7, and Task 2.13's app cutover so `pipeline.ts` actually receives an `IDBDatabase`). Task 3.1 depends on Task 0.3's benchmark result.

## Assigned Agents
- ArchAgent:
- DevAgent:
- QAAgent:

## Allowed Files/Directories
`src/lib/pdf/extract.ts`, `src/lib/llm/structure.ts`, `src/lib/llm/chunk.ts`, `src/lib/llm/pool.ts`, `src/lib/llm/enrich.ts`, `src/lib/pipeline.ts`, corresponding test files, this card.

## Implementation Checklist

- [ ] P03-01 **Task 3.1 — Page boundaries in text extraction** — see `userDataTask.md` Task 3.1.
- [ ] P03-02 **Task 3.2 — Structure-analysis module** — see `userDataTask.md` Task 3.2.
- [ ] P03-03 **Task 3.3 — Chunking module** — see `userDataTask.md` Task 3.3.
- [ ] P03-04 **Task 3.4 — Bounded concurrency pool** — see `userDataTask.md` Task 3.4.
- [ ] P03-05 **Task 3.5 — Rewrite `enrich.ts` orchestration** — see `userDataTask.md` Task 3.5.
- [ ] P03-06 **Task 3.6 — Wire chunk output into `pipeline.ts` via IndexedDB** — see `userDataTask.md` Task 3.6.
- [ ] P03-07 **Task 3.7 — Unit tests for Phase 3** — see `userDataTask.md` Task 3.7.

## Acceptance Criteria
Every checklist item is implemented and independently QA-approved. LLM attempt count scales with chunk count, not condition count. A record with one failing chunk still produces a usable partial result.

## Required Validation
- `npx jest src/lib/llm/pool.test.ts src/lib/llm/chunk.test.ts tests/lib/enrich.test.ts --runInBand --silent`
- `npm run typecheck`

## Developer Verification

## QA Test Plan

## Implementation Record

## QA Record

## Defects and Retests

## Blockers

## Completion

## History
