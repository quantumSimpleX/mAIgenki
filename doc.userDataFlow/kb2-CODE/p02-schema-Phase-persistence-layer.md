# P2: IndexedDB Schema & Persistence Layer

**Reset note (2026-07-31):** This card's checklist previously targeted `expo-sqlite` (`schema.ts`/`backup.ts`) before the project's platform pivot to browser-only/IndexedDB (see `CLAUDE.md`'s Platform section). The checklist below is reset to the corrected Task 2.1–2.11 from `doc.userDataFlow/userDataTask.md`, targeting `src/lib/db/indexedDb.ts`/`indexedDbBackup.ts`. Prior Implementation Record and QA Record entries are kept below as history — the real code they describe (`indexedDbBackup.ts`, `blob.ts`) is correct and still applies; the SQLite-specific `backup.ts` work they also cover is no longer the target and does not need further investment. Note the QA-found regression in that history (`tests/lib/backup.test.ts`/`__tests__/db/backup.test.ts` failing on `db.getEachAsync`) is a real bug in the legacy SQLite path — leave it as a known issue rather than a blocker for this reset, since new work here targets IndexedDB, not `expo-sqlite`.

## Scope
Tasks 2.1–2.11 in `doc.userDataFlow/userDataTask.md`, Phase 2 — IndexedDB object stores, indices, query functions, and Blob-aware JSON export/import.

## Out of Scope
Later-phase implementation (Phase 3+). The legacy `expo-sqlite` path (`schema.ts`, `queries.ts`, `backup.ts`) — reference only, not a target for new work.

## Dependencies
None (Phase 2 has no upstream phase dependency). Individual tasks depend on each other per their own `Depends on:` lines in `userDataTask.md`.

## Assigned Agents
- ArchAgent:
- DevAgent:
- QAAgent:

## Allowed Files/Directories
`src/lib/db/indexedDb.ts`, `src/lib/db/indexedDbBackup.ts`, `src/lib/db/blob.ts`, `tests/lib/indexedDb.test.ts`, `tests/lib/indexedDbBackup.test.ts`, `tests/lib/blob.test.ts`, this card.

## Implementation Checklist

- [ ] P02-01 **Task 2.1 — Extend `record_images` store's real shape** — see `userDataTask.md` Task 2.1 for the full `RecordImage` type and index requirement.
- [ ] P02-02 **Task 2.2 — `condition_records.image_id` linkage** — see `userDataTask.md` Task 2.2.
- [ ] P02-03 **Task 2.3 — `inferred_fields` on conditions/measurements** — see `userDataTask.md` Task 2.3.
- [ ] P02-04 **Task 2.4 — `putConditionLocation` / `getConditionLocations`** — see `userDataTask.md` Task 2.4.
- [ ] P02-05 **Task 2.5 — `putRecordImage` / lazy image reads** — see `userDataTask.md` Task 2.5.
- [ ] P02-06 **Task 2.6 — `getConditionRecords` gains `image_id`** — see `userDataTask.md` Task 2.6.
- [ ] P02-07 **Task 2.7 — `putHealthRecord`/`putCondition` return computed position** — see `userDataTask.md` Task 2.7.
- [ ] P02-08 **Task 2.8 — `src/lib/db/blob.ts` — confirm reuse for export** — see `userDataTask.md` Task 2.8 (likely a no-op confirmation, file already correct).
- [ ] P02-09 **Task 2.9 — Port the full demo dataset to IndexedDB** — see `userDataTask.md` Task 2.9. All 22 conditions, not just the bilateral-stones stub.
- [ ] P02-10 **Task 2.10 — Blob-aware JSON export/import** — see `userDataTask.md` Task 2.10.
- [ ] P02-11 **Task 2.11 — Unit tests for Phase 2** — see `userDataTask.md` Task 2.11.
- [ ] P02-12 **Task 2.12 — IndexedDB provider hook** — see `userDataTask.md` Task 2.12.
- [ ] P02-13 **Task 2.13 — Cut the app over from `expo-sqlite` to IndexedDB** — see `userDataTask.md` Task 2.13. This is the task that makes the demo/upload paths actually run on IndexedDB, not just have IndexedDB code exist alongside the untouched SQLite paths.
- [ ] P02-14 **Task 2.14 — Demo visual-parity regression test** — see `userDataTask.md` Task 2.14.
- [ ] P02-15 **Task 2.15 — Extract a shared persistence function so demo and real data use one path** — see `userDataTask.md` Task 2.15. Foundational to 2.9 — do this before or alongside the demo port, not after.

## Acceptance Criteria
Every checklist item is implemented and independently QA-approved; blocked or unverified items remain unchecked. `npx jest tests/lib/indexedDb.test.ts tests/lib/indexedDbBackup.test.ts tests/lib/blob.test.ts` passes in full.

## Required Validation
- `npx jest tests/lib/indexedDb.test.ts tests/lib/indexedDbBackup.test.ts tests/lib/blob.test.ts --runInBand --silent`
- `npm run typecheck`

## Developer Verification

## QA Test Plan

## Implementation Record

*(Reset for the IndexedDB-targeted checklist above — entries below are historical, from the pre-reset checklist.)*

- 2026-07-31 Track B repair: Added `getEachAsync` async-generator compatibility to `__tests__/db/backup.test.ts` and shared `__tests__/db/fakeDb.ts`, matching the production backup adapter's row-by-row BLOB read path. (Legacy `expo-sqlite` path — not a target for the reset checklist above.)
- 2026-07-31 Track B DevAgent: Added `src/lib/db/indexedDbBackup.ts`, a browser-only IndexedDB backup/restore adapter covering all current object stores with envelope validation and transactional clear/restore. **Still applies** — Task 2.10 extends this file with Blob-aware JSON export/import.
- 2026-07-31 Track B DevAgent: Reused existing `seedIndexedDbDemoData` and `getIndexedConditionDots` canonical condition/location path; added round-trip and invalid-envelope coverage in `tests/lib/indexedDbBackup.test.ts`. **Still applies.**

## QA Record

*(Historical, from the pre-reset checklist — retained for the known legacy-path regression noted below.)*

### Independent QA retest — 2026-07-31 — NOT APPROVED

- Re-ran `npx jest tests/lib/indexedDb.test.ts tests/lib/indexedDbBackup.test.ts tests/lib/blob.test.ts tests/lib/backup.test.ts __tests__/db/backup.test.ts --runInBand --silent`.
- Result: 3 suites passed, 2 failed; 19 tests total, 14 passed and 5 failed.
- `tests/lib/backup.test.ts` and `__tests__/db/backup.test.ts` (legacy `expo-sqlite` path) throw `TypeError: db.getEachAsync is not a function` at `src/lib/db/backup.ts:93` — a real regression in that file's fake-DB test fixture, unrelated to the IndexedDB stores/adapter, which passed.
- **Known issue, not a blocker for this reset**: the legacy SQLite backup path is no longer the target of new work; fix only if/when someone actively revisits `src/lib/db/backup.ts`.

## Defects and Retests

- P02-QA-01 (legacy path, informational): `expo-sqlite` fake-DB fixture doesn't implement `getEachAsync`, causing `tests/lib/backup.test.ts`/`__tests__/db/backup.test.ts` to fail. Not part of the reset checklist's scope.

## Blockers
None for the reset checklist above.

## Completion

## History
- 2026-07-31: Checklist reset from `expo-sqlite`-targeted to IndexedDB-targeted (Tasks 2.1–2.11 per corrected `userDataTask.md`). Prior Implementation Record/QA Record retained above as history.
