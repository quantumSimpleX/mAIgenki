# Task Breakdown: User Data Flow (PDF Upload → Bodymap Display)

Implements `doc.userDataFlow/userDataReq.md`. Each task is independently implementable and testable, references exact files/functions verified against the current codebase, and lists its dependencies so tasks can be picked up in order (or in parallel where no dependency is listed). Suggested use: one kanban card per task, moved through `kb1-TODO` → `kb2-CODE` → `kb3-TEST` → `kb4-DONE`.

Platform: mAIgenki is a browser-only, fully responsive web app (see `CLAUDE.md`'s Platform section). Storage is IndexedDB via `src/lib/db/indexedDb.ts`. This revision replaces an earlier draft written before that pivot.

Ground truth used throughout (confirmed by direct file reads, not assumed):
- `src/lib/db/indexedDb.ts` — existing scaffold: `INDEXED_DB_NAME`/`INDEXED_DB_VERSION`, `openIndexedDb()`, `IndexedCondition`/`IndexedConditionLocation`/`IndexedConditionDot` types, `putIndexedCondition`, `putIndexedConditionLocation`, `getIndexedConditionDots` (already implements the location-fallback join logic), `seedIndexedDbDemoData`. Object stores created so far: `health_records`, `conditions`, `condition_locations`, `record_images`, `condition_records`, `settings` (all `keyPath: 'id'` except `settings`, which is `keyPath: 'key'`). Indices so far: `condition_locations.condition_id`, `condition_records.condition_id`.
- `src/lib/db/indexedDbBackup.ts` — `INDEXED_DB_BACKUP_STORES`, `buildIndexedDbBackup`/`restoreIndexedDbBackup`. Reads/writes IndexedDB stores directly via `getAll()`/`put()` inside a single transaction — correct for IndexedDB-to-IndexedDB round-trips, but does **not** yet handle converting `Blob` values for a portable JSON file export (see Task 2.10).
- `src/lib/db/blob.ts` — dependency-free `uint8ArrayToBase64`/`base64ToUint8Array`, already implemented and correct; needed for the JSON-export `Blob` encoding step.
- `src/lib/db/schema.ts`/`queries.ts`/`backup.ts` — the project's original `expo-sqlite`-targeting persistence code. Still present in the repo; not the target for new work. Reference only for the data-model shape they captured correctly (field names, relationships) — do not extend their SQL.
- `src/lib/pipeline.ts` — `processHealthRecord`; already fixed for provider attribution (Phase 1, done). Not yet wired to `indexedDb.ts` for the new locations/images work.
- `src/hooks/useConditions.ts` — `useConditions()`/`useConditionRecords()` hook pattern (currently reads the `expo-sqlite` path via `getConditions`/`getConditionRecords` from `queries.ts`) — the pattern to mirror for a new `useConditionDots()` hook backed by `getIndexedConditionDots`, and eventually to re-point at IndexedDB entirely.
- `src/app/bodymap.tsx` — `GhostDots` (line 527), `BodySvg` (595), `ConditionRipples` (671), `RecordsCarousel` (945), `renderRecordThumb` (222), `RecordLightbox` (~1340), chat footer button (~1255), carousel currently gated at `chatOpen` (1268).
- `src/model/conditions.ts` — `DesignCondition`, `ConditionRecord`, `getSvgX`/`getSvgY`, `defaultConditionPosition`.

---

## Phase 0 — Environment Spike

**Status: DONE** (2026-07-31, QA-approved, `doc.userDataFlow/kb4-DONE/p00-environment-spike.md`). No schema or app-code changes. De-risks the two open items from the PRD (§9) before Phase 4 depends on them. The native-library spike from the pre-pivot draft is gone — `pdfjs-dist` already handles PDF page rendering in the browser.

**Task 0.1 — Confirm `pdfjs-dist` page → Canvas → Blob** — **BLOCKED, documented in `kb4-DONE/p00-environment-spike.md`; the temporary probe was removed after its findings were recorded.**
The temporary probe was removed after its findings were recorded in `kb4-DONE/p00-environment-spike.md`.
This project's Jest `testEnvironment` (jest-expo → `@react-native/jest-preset`'s `react-native-env.js`, extending `jest-environment-node`) is not jsdom: no `document`/`HTMLCanvasElement`, and `node-canvas` isn't installed — no `<canvas>` is obtainable in Jest at all. Separately, `pdfjs-dist` ^6.1.200 ships only `.mjs` builds that fail to import under this project's Jest transform config (`import.meta` error outside a real ES module). **Conclusion for Phase 4**: `renderPageToBlob` (Task 4.1) cannot be unit-tested in Jest and must be verified in a real browser (manual or Playwright) instead.
Depends on: none.

**Task 0.2 — Verify IndexedDB Blob storage/retrieval** — **BLOCKED, documented in `kb4-DONE/p00-environment-spike.md`; the temporary probe was removed after its findings were recorded.**
The temporary probe was removed after its findings were recorded in `kb4-DONE/p00-environment-spike.md`.
A `Blob` written via `objectStore.put()` under `fake-indexeddb` does **not** read back as a `Blob` via `get()`/`getAll()` in this project's specific Jest environment — it comes back as an empty `{}`. Root cause: `fake-indexeddb` clones inserted values via the global `structuredClone()`, and Node's `structuredClone()` fails to clone a `Blob` across this Jest environment's per-file VM context isolation. Reproduces independent of `fake-indexeddb` (`structuredClone(new Blob([...]))` alone fails the same way); does not reproduce outside Jest (plain `node -e`); expected to work correctly in a real browser. **Conclusion for Phase 2/4**: any Jest test asserting Blob fidelity via direct `put()`/`get()` will spuriously fail — the only Jest-provable Blob-fidelity path is the base64 JSON export/import round trip (`blob.ts`/`indexedDbBackup.ts`'s `encodeBlobFields`/`decodeBlobFields`), already exercised by Task 2.11. Direct-storage Blob correctness can only be verified in a real browser.
Depends on: none.

**Task 0.3 — Benchmark per-page text extraction** — **Done, with caveat; the temporary timing probe was removed after its findings were recorded in `kb4-DONE/p00-environment-spike.md`.**
The temporary timing probe was removed after its findings were recorded in `kb4-DONE/p00-environment-spike.md`.
Both repo PDF fixtures (`.playwright-mcp/maigenki-fixture-multi.pdf`, `maigenki-fixture-scanned.pdf`) are actually single-page despite their names (1265 and 581 bytes) — no true multi-page timing data exists in the repo. Measured single-page extraction time ~26.65ms, dominated by fixed load/parse overhead, not meaningfully extrapolable to per-page cost at scale. Task 3.1 should treat per-page timing as unproven at scale and prefer the length-proportional estimate unless a real multi-page fixture is added later.
Depends on: none.

---

## Phase 1 — Provider Attribution Fix

**Status: DONE.** Storage-agnostic fix in `src/lib/pipeline.ts` — unaffected by the IndexedDB migration. Kept here for record-keeping; no remaining work.

**Task 1.1 — Remove the blanket provider fallback in `pipeline.ts`** — done.
**Task 1.2 — Regression test for provider attribution** — done.

---

## Phase 2 — IndexedDB Schema & Persistence Layer

Foundational — extends the existing `indexedDb.ts`/`indexedDbBackup.ts` scaffold. Nothing writes to the new pieces until Phase 3/4, so this phase is safe to ship standalone once tested.

**Task 2.1 — Extend `record_images` store's real shape**
Files: `src/lib/db/indexedDb.ts`.
The store already exists (created in `openIndexedDb`'s `onupgradeneeded`); add the `RecordImage` type (per `userDataReq.md` §6: `id, record_id, page_number, source_file, title, mime_type, width, height, byte_size, image_blob: Blob, thumbnail_blob: Blob | null, date, notes, created_at`) and confirm/add the `record_id` index (`records.createIndex('record_id', 'record_id')` alongside the existing `condition_locations`/`condition_records` index creation in the same `onupgradeneeded` block).
Depends on: none.

**Task 2.2 — `condition_records.image_id` linkage**
Files: `src/lib/db/indexedDb.ts`.
Add an optional `image_id: string | null` field to whatever type represents `condition_records` records (add one if not yet typed here — mirror `ConditionRecordRow`'s shape from `schema.ts` for field-name continuity: `id, condition_id, record_type, title, image_id, chart_json, table_json, color, date, source_file, notes, created_at`). No index needed — reads always go through `condition_id` (existing index), then filter for `image_id` in memory.
Depends on: 2.1.

**Task 2.3 — `inferred_fields` on conditions/measurements**
Files: `src/lib/db/indexedDb.ts`.
Add `inferred_fields: string[] | null` to `IndexedCondition` and to whatever type represents measurement records (add a `Measurement`/`IndexedMeasurement` type + `measurements` object store if not yet present — `keyPath: 'id'`, index on `record_id`). IndexedDB records are schemaless per-record, so no migration mechanics are needed — existing records simply lack the field until next written.
Depends on: none.

**Task 2.4 — `putConditionLocation` / `getConditionLocations`**
Files: `src/lib/db/indexedDb.ts`.
```ts
export async function putConditionLocation(db: IDBDatabase, location: IndexedConditionLocation): Promise<void>
export async function getConditionLocations(db: IDBDatabase, conditionId: string): Promise<IndexedConditionLocation[]>
```
`putConditionLocation` already exists as `putIndexedConditionLocation` — this task is to add the paired read (`getConditionLocations`, `objectStore('condition_locations').index('condition_id').getAll(conditionId)`), following the promise-wrapper pattern (`requestToPromise`) already used throughout this file.
Depends on: none.

**Task 2.5 — `putRecordImage` / lazy image reads**
Files: `src/lib/db/indexedDb.ts`.
```ts
export async function putRecordImage(db: IDBDatabase, image: RecordImage): Promise<void>
export async function getRecordImageThumbnail(db: IDBDatabase, imageId: string): Promise<Blob | null>
export async function getRecordImageBlob(db: IDBDatabase, imageId: string): Promise<{ blob: Blob; mimeType: string } | null>
```
Both read functions do a single `objectStore('record_images').get(imageId)` — no bulk read, so the lightbox/thumbnail path never loads more than one image's bytes at a time. Follow the existing `putIndexedCondition`/`transactionToPromise` pattern.
Depends on: 2.1.

**Task 2.6 — `getConditionRecords` gains `image_id`**
Files: `src/lib/db/indexedDb.ts`.
Add a read function `getConditionRecords(db: IDBDatabase, conditionId: string): Promise<ConditionRecordEntry[]>` (`objectStore('condition_records').index('condition_id').getAll(conditionId)`) that includes the `image_id` field from Task 2.2 in its return shape — this is a new function, not a fix to an existing one (unlike the `expo-sqlite` path's `getConditionRecords` in `queries.ts`, which has the historical SELECT-drops-columns bug noted in the pre-pivot draft — that bug doesn't carry over here since this is new code).
Depends on: 2.2.

**Task 2.7 — `putHealthRecord`/`putCondition` return computed position**
Files: `src/lib/db/indexedDb.ts`, `src/lib/pipeline.ts` (once wired in Phase 3).
Whatever function creates a new condition record (extend `putIndexedCondition` or add a dedicated `insertCondition` helper) should compute and return `{ id, cx, cy }` so callers can seed the matching `is_primary` `condition_locations` record without recomputing position — mirrors the intent of the original `expo-sqlite` design's `insertCondition` change, adapted to this file's existing function style.
Depends on: none (independent of the rest of Phase 2, but needed by Task 3.6).

**Task 2.8 — `src/lib/db/blob.ts` — confirm reuse for export**
Files: `src/lib/db/blob.ts` (already exists, correct — no code change expected).
Confirm `uint8ArrayToBase64`/`base64ToUint8Array` are the functions used by Task 2.10's export/import Blob-encoding step; no changes needed to this file itself.
Depends on: none.

**Task 2.9 — Port the full demo dataset to IndexedDB, through the real persistence path**
Files: `src/lib/db/indexedDb.ts` (`seedIndexedDbDemoData`).
Per `userDataReq.md` §2a (Demo Data Principle): `seedIndexedDbDemoData` must NOT write its own parallel set of `put()` calls into `conditions`/`condition_locations`/`condition_records`. Instead, it converts all 22 `CONDITIONS` entries (`src/model/conditions.ts`) plus their `CONDITION_RECORDS` into the same `ConditionInput`/`MeasurementInput` shapes `src/lib/llm/enrich.ts` produces (a mapping function, e.g. `designConditionToConditionInput(c: DesignCondition): ConditionInput`), runs that array through `applyInferenceRules` exactly as `processHealthRecord` does (even though today's hardcoded set has no underlying measurements to trigger additional inferred conditions — the point is exercising the identical code path, not that it currently changes output), and then calls `persistEnrichmentResult` (Task 2.15) — the same function `processHealthRecord` calls — rather than reimplementing persistence. Keep the bilateral-locations detail for `stones` as the multi-location example (via `ConditionInput.locations`, per Task 3.5's type extension). Also seed one placeholder `record_images` record (small embedded `Blob`) plus a `condition_records` record with `image_id` set on one condition, through the same `insertRecordImage`/`condition_records` write path Task 4.3 uses — not a demo-only shortcut — so the demo path exercises the real-image UI (Task 5.5/5.6) rather than only placeholder SVG art.
Depends on: 2.1, 2.5, 2.6, 2.15.

**Task 2.12 — IndexedDB provider hook**
Files: `src/lib/db/indexedDbProvider.tsx` (new, mirrors `src/lib/db/provider.tsx`'s pattern for `expo-sqlite`).
Add `useOptionalIndexedDb(): IDBDatabase | null` — opens the database via `openIndexedDb()` once (e.g. on mount / module-level promise cache) and exposes it the same way `useOptionalDatabase()` exposes the SQLite connection today, so call sites can swap one hook for the other with minimal churn.
Depends on: none.

**Task 2.13 — Cut the app over from `expo-sqlite` to IndexedDB**
Files: `src/app/analyzing.tsx`, `src/hooks/useConditions.ts`, `src/app/bodymap.tsx` (any remaining direct SQLite calls).
This is the task that actually makes the migration real, not just present in isolated new files. Today, `analyzing.tsx` imports `useOptionalDatabase` (SQLite) and calls `seedDemoData`/`clearDemoData` (from `src/lib/db/seed.ts`) for the demo path, and passes the SQLite `db` into `processHealthRecord` for the upload path — zero real screens reference `indexedDb.ts` yet. Switch both paths to `useOptionalIndexedDb()` (2.12) and the IndexedDB seed/query functions (`seedIndexedDbDemoData`, and whatever `processHealthRecord` now expects per Task 3.6). Update `useConditions()`/`useConditionRecords()` in `useConditions.ts` to call the IndexedDB read functions (`getIndexedConditionDots`-based queries, `getConditionRecords` from 2.6) instead of `queries.ts`'s SQLite versions. After this task, the demo path and the upload path both run entirely on IndexedDB — verify by confirming zero remaining imports from `@/lib/db/queries` or `@/lib/db/seed` in `src/app`/`src/hooks`.
Depends on: 2.9, 2.12, 3.6 (pipeline.ts must already expect an `IDBDatabase` before this task wires a real one into it — coordinate sequencing with Phase 3's Dev/QA if 2.13 lands before 3.6 completes).

**Task 2.10 — Blob-aware JSON export/import**
Files: `src/lib/db/indexedDbBackup.ts`.
`buildIndexedDbBackup`/`restoreIndexedDbBackup` currently move `Blob` values between IndexedDB stores directly (fine — IndexedDB's structured clone handles `Blob` natively) but the user-facing **JSON file** export (wherever that's wired to a download, e.g. an `exportIndexedDbBackupToFile`-style function — add one if it doesn't exist yet) needs an explicit conversion step: for every store listed in a new `BLOB_FIELDS: Record<string, string[]>` map (`{ record_images: ['image_blob', 'thumbnail_blob'] }`), convert each `Blob` to bytes (`await blob.arrayBuffer()` → `new Uint8Array(...)`) and base64-encode via `blob.ts` before `JSON.stringify`; reverse (base64 → `Uint8Array` → `new Blob([bytes], {type: mimeType})`) on import, before the records are `put()` back into IndexedDB.
Depends on: 2.1, 2.8.

**Task 2.11 — Unit tests for Phase 2**
Files: extend `tests/lib/indexedDb.test.ts`, `tests/lib/indexedDbBackup.test.ts`, `tests/lib/blob.test.ts` (all already exist).
- A condition with 2 `condition_locations` records yields 2 dots sharing one `conditionId` from `getIndexedConditionDots` (already covered — extend with a `record_images`/`image_id` case if not present).
- A condition with 0 location records synthesizes exactly 1 dot from the condition's own `cx`/`cy` (already covered).
- JSON export round-trip: insert a `record_images` record with a real `Blob`, run the new export path, `JSON.parse` it back, run import, assert the restored `Blob`'s bytes are identical to the original.
- After Task 2.9: `seedIndexedDbDemoData()` writes exactly 22 conditions (one `put()` per `CONDITIONS` entry) and the same total `condition_records` count as `CONDITION_RECORDS` sums to — a regression check that the demo port didn't silently drop conditions.
Depends on: 2.9, 2.10.

**Task 2.14 — Demo visual-parity regression test**
Files: new or extended UI/snapshot test covering `bodymap.tsx`'s demo render, or a manual checklist item if no automated visual test exists yet.
After Task 2.13's cutover, confirm the demo body map (all 22 conditions, all 11 systems reachable via `activeSystems` toggles, correct hotspot positions) renders identically to the pre-cutover `expo-sqlite`-backed demo. This is the concrete check that answers "does the demo data path still work" for the new architecture — don't rely on Task 2.9/2.13 "should" statements alone.
Depends on: 2.9, 2.13.

**Task 2.15 — Extract a shared persistence function so demo and real data use one path**
Files: `src/lib/pipeline.ts`.
Per `userDataReq.md` §2a: the "rest of the pipeline" — clinical inference rules onward — must be identical for demo and real data, not just similar. Extract `processHealthRecord`'s persistence steps (health-record write; loop over conditions writing the condition, its `condition_locations` records, provider/care-event links; loop over measurements) into a standalone exported function:
```ts
export type EnrichedInput = {
  filename: string
  pageCount: number | null
  extractionMethod: string | null
  conditions: ConditionInput[]
  measurements: MeasurementInput[]
  providers?: ProviderInput[]
}
export async function persistEnrichmentResult(db: IDBDatabase, input: EnrichedInput): Promise<PipelineResult>
```
`processHealthRecord` calls `applyInferenceRules` and then `persistEnrichmentResult` with the merged conditions/measurements — same as it does today, just factored out. This function becomes the single write path both real uploads (via the full extraction→enrichment pipeline) and demo seeding (via a hand-authored `EnrichedInput` built from `CONDITIONS`/`CONDITION_RECORDS`, Task 2.9) go through — no separate demo-only persistence logic can exist once this lands.
Depends on: 2.4, 2.5, 2.6, 2.7 (needs the IndexedDB write functions this wraps).

---

## Phase 3 — Extraction Pipeline Rebuild

**Task 3.1 — Page boundaries in text extraction**
Files: `src/lib/pdf/extract.ts`.
Add `pageBreaks: number[]` (character offsets where each page begins) to the extraction result type. The existing per-page `pdfjs-dist` loop already has a running offset before each page's text is appended — just record it. If Task 0.3's benchmark showed unacceptable latency for very large PDFs, compute a length-proportional estimate (`pageCount` even splits of `text.length`) instead. Document which approach was chosen and why in a code comment.
Depends on: 0.3.

**Task 3.2 — Structure-analysis module**
Files: `src/lib/llm/structure.ts` (new).
```ts
type SectionType = 'visit' | 'problem_list' | 'labs' | 'imaging' | 'summary' | 'other'
type RecordSection = {
  heading: string
  startOffset: number; endOffset: number
  inferredDate: string | null
  sectionType: SectionType
  imageWorthy: boolean
  pageStart: number | null; pageEnd: number | null
}
type RecordStructure = { organization: 'chronological' | 'problem_based' | 'mixed'; sections: RecordSection[] }
export async function analyzeRecordStructure(
  text: string, apiKey: string, models: string[], routing?: EnrichRoutingOptions,
): Promise<RecordStructure>
```
One `callLLMWithFallback` call (same pattern as existing `enrich.ts` calls) with a new `STRUCTURE_PROMPT`. Resolve `pageStart`/`pageEnd` against `pageBreaks` from Task 3.1. On total failure (all models exhausted), return a single synthetic section spanning the whole text (`organization: 'mixed'`, `imageWorthy: false`) rather than throwing — this is a resilience fallback, not an error path.
Depends on: 3.1.

**Task 3.3 — Chunking module**
Files: `src/lib/llm/chunk.ts` (new).
```ts
type TextChunk = { sectionHeading: string; sectionType: SectionType; inferredDate: string | null; pageStart: number | null; pageEnd: number | null; text: string }
export function chunkRecordBySections(text: string, structure: RecordStructure, maxCharsPerChunk?: number): TextChunk[]
```
Pure function, no LLM calls. Offsets are sliced deterministically from `text` (re-anchor via heading-string search if the LLM's reported offsets don't exactly line up — never trust them blindly). Oversized sections split further on paragraph boundaries, inheriting the parent's `sectionHeading`/`inferredDate`. Sections under a minimum size threshold merge into the next section rather than becoming their own chunk.
Depends on: none (pure function — can be built/tested independent of 3.2, wired together in 3.5).

**Task 3.4 — Bounded concurrency pool**
Files: `src/lib/llm/pool.ts` (new).
```ts
export async function runWithConcurrency<T, R>(
  items: T[], limit: number, worker: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]>
```
Dependency-free fixed-size worker pool pulling from a shared cursor — no `Promise.all` unlimited fan-out. Safe under `src/lib/llm/service.ts`'s existing module-level `cooldownLedger` (single-threaded JS; a 429 on one concurrent call correctly cools that `provider:model` for the others via the existing fallback logic already in `client.ts`/`engine.ts`).
Depends on: none.

**Task 3.5 — Rewrite `enrich.ts` orchestration**
Files: `src/lib/llm/enrich.ts`.
Replace `INVENTORY_PROMPT`/`CONDITION_PROMPT`'s inventory→per-condition-loop with a new `CHUNK_EXTRACTION_PROMPT` that extracts conditions+measurements from one `TextChunk`, given its heading/`sectionType`/`inferredDate`, and instructs the model to list any field filled from that surrounding context (rather than text restated in-chunk) in a new `inferred_from_structure: string[]` array on the returned condition/measurement.
Extend types: `ConditionInput.inferred_from_structure?`, `ConditionInput.locations?: {anatomical_location, laterality, evidence}[]` (beyond the primary), `MeasurementInput.inferred_from_structure?`, `EnrichmentResult.partialFailures?: {section: string; reason: string}[]`.
New `enrichFromText` orchestration:
1. `structure = await analyzeRecordStructure(...)` (3.2's fallback applies on failure).
2. `chunks = chunkRecordBySections(text, structure)` (3.3).
3. `settled = await runWithConcurrency(chunks, POOL_SIZE=2 or 3, extractConditionsFromChunk)` (3.4).
4. Merge succeeded results: group conditions by normalized `name_medical` + organ/location across chunks into one entry each; earliest date wins on conflict; evidence/care_events concatenate.
5. `succeeded.length === 0` → throw `EnrichmentFailedError` (the only remaining all-or-nothing case).
6. Otherwise return `{conditions, measurements, providers, partialFailures}`.
`onChunkProgress?: (completed, total)` replaces `onConditionProgress` with the same call shape as today, so `pipeline.ts`'s `report(1, 0.4 + 0.35*completed/total)` math and `analyzing.tsx` need zero changes.
Depends on: 3.2, 3.3, 3.4.

**Task 3.6 — Wire chunk output into `pipeline.ts` via IndexedDB**
Files: `src/lib/pipeline.ts`.
- Persist `inferred_fields` alongside condition/measurement writes via the Phase 2 IndexedDB functions (not the `expo-sqlite` `queries.ts` path).
- After creating a condition (now returning `{id, cx, cy}` per Task 2.7), write one `is_primary: true` `condition_locations` record mirroring that computed position, then loop any additional `c.locations` entries via `putConditionLocation`.
- Trace `enrichment.partialFailures` via the existing `trace()` helper for diagnostics visibility.
Depends on: 2.4, 2.7, 3.5.

**Task 3.7 — Unit tests for Phase 3**
Files: `src/lib/llm/pool.test.ts`, `src/lib/llm/chunk.test.ts` (new), extend `tests/lib/enrich.test.ts`.
- `pool.test.ts`: never exceeds `limit` concurrent in-flight (assert via a counting mock worker), all items processed exactly once, one rejection doesn't block/skip others.
- `chunk.test.ts`: offset slices are exact substrings of the source text (no drift), oversized-section splitting produces valid sub-chunks, tiny sections merge into neighbors.
- `enrich.test.ts`: structure-analysis failure falls back to single-chunk mode; one chunk failing among several still returns partial results (`partialFailures` populated) without throwing; all chunks failing still throws `EnrichmentFailedError`; cross-chunk dedup picks the earliest date and merges evidence for the same condition appearing in two chunks.
Depends on: 3.2, 3.3, 3.4, 3.5.

---

## Phase 4 — Image Capture Pipeline

No new native or third-party rendering dependency needed — `pdfjs-dist` (already a dependency, already used for text extraction) renders pages to Canvas directly in the browser.

**Task 4.1 — Page-render helper**
Files: `src/lib/pdf/renderPage.ts` (new).
```ts
export async function renderPageToBlob(uri: string, pageNumber: number, mimeType: string, quality: number): Promise<{ blob: Blob; width: number; height: number }>
```
Uses `pdfjs-dist`: load the document, get the page, render to an off-screen `<canvas>` via `page.render({canvasContext, viewport})`, then `canvas.toBlob(...)` wrapped in a Promise.
Depends on: 0.1.

**Task 4.2 — Compression loop**
Files: `src/lib/media/compress.ts` (new).
```ts
export async function compressToTarget(canvas: HTMLCanvasElement, maxBytes: number): Promise<{ blob: Blob; byteSize: number }>
```
Iteratively lowers `canvas.toBlob`'s `quality` argument (and/or downscales the canvas) until the resulting `Blob.size` is under `maxBytes` — `toBlob` output size varies with image content, so a single fixed quality value isn't reliable.
Depends on: 0.1.

**Task 4.3 — Image-capture step in the pipeline**
Files: `src/lib/pipeline.ts`.
For each section flagged `imageWorthy` with a resolved page range (available via Task 3.6's wiring): call `renderPageToBlob` (4.1), `compressToTarget` (4.2), then `putRecordImage` (2.5) and a `condition_records` write with `image_id` set (2.2/2.6), linked to whichever condition(s) that section's chunk extraction associated with it. A rendering/compression failure for a given page is caught and skipped (per PRD §8) — never fails the whole record.
Depends on: 4.1, 4.2, 2.5, 2.6, 3.6.

**Task 4.4 — Manual verification**
No new files — verification task.
Upload a record with real imaging-style pages in a browser; confirm images render in the (not-yet-built, see Phase 5) carousel once that lands, and separately confirm via browser devtools' IndexedDB inspector that stored blob sizes are proportionate (hundreds of KB, not multi-MB) and that non-`imageWorthy` pages produced zero records.
Depends on: 4.3.

---

## Phase 5 — Bodymap UI Wiring

**Task 5.1 — Extend `ConditionRecord` type**
Files: `src/model/conditions.ts`.
Add `imageId?: string | null` and `mimeType?: string | null` to `ConditionRecord` (lazy reference only — never raw bytes inline in this type).
Depends on: none (paired with 2.6's return-shape change).

**Task 5.2 — `useConditionDots` hook**
Files: `src/hooks/useConditions.ts`.
```ts
export function useConditionDots(sourceOverride?: ConditionSource): IndexedConditionDot[]
```
Mirrors the existing `useConditions()` pattern in this same file (state seeded with a safe fallback, a DB-access hook + `getIndexedConditionDots` in a `useEffect`) — do not introduce a different loading pattern. Requires whatever this file's IndexedDB-access hook is (add one analogous to `useOptionalDatabase()` if `bodymap.tsx`'s DB access hasn't already moved to IndexedDB by this point).
Depends on: 2.4.

**Task 5.3 — Refactor dot-rendering components**
Files: `src/app/bodymap.tsx`.
`GhostDots` (line 527), `BodySvg` (595), and `ConditionRipples` (671) currently take `conditions: DesignCondition[]` and read `c.cx_percent`/`c.cy_percent` directly. Change all three to accept the flattened dot list from `useConditionDots()` (5.2) instead — each item already carries `system`/`yearFrac` needed for the existing `activeSystems`/date filtering logic in each component, so the filter predicates need minimal changes (swap `c.system`/`c.yearFrac` reads to the dot's own fields). `pressNearest` (538) resolves a tapped dot's `conditionId` back to the full `DesignCondition` via the existing `useConditions()`-sourced array (still needed for name/date/evidence display) — two parallel lists joined by id at press time, not merged into one. Relocation (`onRelocationPlace`, `updateConditionPositionLocally`) continues to operate on the primary location only this phase — no changes needed to the relocation gesture itself, only to how the resulting position is looked up/written; editing non-primary locations is out of scope per the PRD.
Depends on: 5.2.

**Task 5.4 — Make the image/chart timeline persistent**
Files: `src/app/bodymap.tsx`.
`RecordsCarousel` currently renders only inside `{chatOpen && (...)}` (line 1268). Hoist `{condRecords.length > 0 && <RecordsCarousel records={condRecords} />}` out of that block to render whenever `selectedCondition` is set and the sheet is open (i.e., also inside the `{!chatOpen && selectedCondition && (...)}` branch, or refactored to sit above both branches) — per the PRD, this is its own persistent section, not merged into the chat thread.
Depends on: none directly, but only meaningful to test once 5.5 shows real images.

**Task 5.5 — Real image thumbnails**
Files: `src/app/bodymap.tsx`.
`renderRecordThumb` (line 222) gets an early branch: when `rec.imageId` is set, a small inline component lazily fetches `getRecordImageThumbnail(db, rec.imageId)` (2.5) in a `useEffect` keyed on `imageId`, converts the returned `Blob` to an object URL (`URL.createObjectURL(blob)`, revoked on cleanup) or renders it directly via `expo-image`'s `Blob`/URI support, with `contentFit="cover"`. Falls back to the existing SVG placeholder art while loading or on fetch error — no layout flash.
Depends on: 2.5, 5.1.

**Task 5.6 — Real images in the lightbox**
Files: `src/app/bodymap.tsx`.
`RecordLightbox` (~line 1340) gets the same lazy-fetch pattern as 5.5, but calling `getRecordImageBlob` (2.5, full resolution) only when `lightboxRecord` changes to a record with an `imageId`.
Depends on: 2.5, 5.1.

**Task 5.7 — Manual UI regression pass**
No new files — verification task.
Confirm: demo-data flow (`seedIndexedDbDemoData` output) renders visually identical to today (dots in the same positions, carousel showing the same placeholder cards where no real image exists); the seeded bilateral kidney-stones demo condition (Task 2.9) renders two dots that both open the same condition sheet; a condition with a real stored image (from Phase 4 or the demo placeholder) shows a real thumbnail instead of SVG art.
Depends on: 5.3, 5.4, 5.5, 5.6, 2.9.

---

## Phase 6 — Full Verification Pass

**Task 6.1 — Automated suite**
Run `npm run typecheck`, `npx expo lint`, `npm test` (80% coverage target on `src/lib`, `src/model`, `src/store` per `jest.config.js`). All Phase 1–5 unit tests must be green; extend coverage for any new file that falls short.
Depends on: all prior phases.

**Task 6.2 — Large-record manual test**
Build/obtain a synthetic ~80-100 page PDF (chronological visit notes + problem list + a few chart/lab-style pages, fake PII only). In a browser: confirm via `pipeline.ts`'s existing `trace()` logs that LLM attempt count scales with chunk count, not condition count; confirm the progress bar advances smoothly across chunk boundaries with no changes needed in `analyzing.tsx`; force a mid-run 429 (temporarily misconfigure one model in the chain) and confirm the record still completes with partial results instead of a hard failure.
Depends on: 3.5, 3.6, 6.1.

**Task 6.3 — Export/import round trip with real data**
Export the DB (JSON, per Task 2.10) after uploading a record that produced real images and multi-location conditions; reimport into a fresh browser profile; confirm images render correctly and condition locations are preserved.
Depends on: 2.10, 4.3, 6.1.

**Task 6.4 — Final acceptance pass**
Walk every bullet in `userDataReq.md` §10 (Acceptance Criteria) explicitly and confirm pass/fail; file follow-up tasks for anything not met rather than silently deferring.
Depends on: 6.1, 6.2, 6.3.

---

## Phase 7 — Multi-Location Editing UI

**Status: DONE** (2026-08-01, QA-approved, `doc.userDataFlow/kb4-DONE/p07-multi-location-editing.md`). Tasks 7.1–7.8 implemented and independently verified against source by QAAgent; no blocking defects found. Task 7.9 (manual browser verification) carried forward as a known, documented gap — no browser-automation tool was available to either DevAgent or QAAgent in-session — consistent with how Phase 5's Task 5.7 gap was handled.

Implements `userDataReq.md` §5.10. Ground truth confirmed by direct file reads:
- `src/lib/db/indexedDb.ts` already has everything the persistence side needs: `putIndexedConditionLocation`, `getConditionLocations`, `deleteConditionLocation` (line ~280), and `getIndexedConditionDots` (line ~643, flattens `condition_locations` into one dot per location, falling back to the condition's own `cx`/`cy` when a condition has zero location rows). `IndexedConditionLocation` (line 64) has `is_primary`. `updateIndexedConditionPosition` (line ~350) shows the existing dual-write pattern (condition's own `cx`/`cy` + its primary location) to mirror for the "first location on a fallback condition" case.
- `src/store/useAppStore.ts`: today's single-location relocation flow — `relocatingCondition`, `preRelocationSystems`, `startRelocation` (line 288, solos `[c.system]`, closes the sheet), `cancelRelocation` (line 295, restores `activeSystems`) — is the pattern this phase generalizes into an add/remove editing session, then retires.
- `src/app/bodymap.tsx`: `NavBar` (line 388) renders the relocation banner at ~413-435 (this is where the new Add/Remove/Done controls go); the pencil icon is at ~1246 (`onPress={() => startRelocation(selectedCondition)}`); tap handling flows through `BodySvg`'s `onRelocationPlace`/`pressNearest` (~583-660) into `handleRelocationPlace` (~2092, converts SVG coords to `cx`/`cy` percent — reuse this conversion, don't reimplement it).

**Task 7.1 — `IndexedConditionDot` gains `locationId`**
Files: `src/lib/db/indexedDb.ts`.
Add `locationId: string | null` to `IndexedConditionDot`. In `getIndexedConditionDots`, set it to the source `condition_locations` row's `id` for real rows, `null` for the synthesized fallback dot (a condition with zero location rows). The Remove tool (Task 7.6) needs this to know exactly which row to delete, and to detect the no-real-row fallback case.
Depends on: none.

**Task 7.2 — Store: location-editing state machine**
Files: `src/store/useAppStore.ts`.
Remove `relocatingCondition`, `preRelocationSystems`, `startRelocation`, `cancelRelocation`. Add:
```ts
locationEditingCondition: DesignCondition | null
locationEditMode: 'add' | 'remove' | null
preLocationEditSystems: SystemId[]
```
```ts
startLocationEditing: (c: DesignCondition) => void
setLocationEditMode: (mode: 'add' | 'remove') => void
finishLocationEditing: () => void
```
`startLocationEditing`: same framing as today's `startRelocation` (`preLocationEditSystems: [...activeSystems]`, `activeSystems: [c.system]`, `sheetOpen: false`, `selectedCondition: null`), plus `locationEditingCondition: c`, `locationEditMode: 'add'` (Add is the default tool, per §5.10).
`setLocationEditMode`: sets `locationEditMode` to the given value; no other side effects.
`finishLocationEditing`: restores `activeSystems: [...preLocationEditSystems]`, sets `selectedCondition: locationEditingCondition` and `sheetOpen: true` (Done always lands back on the edited condition's sheet — every add/remove already persisted immediately, so there is no separate cancel/discard path), clears `locationEditingCondition: null`, `locationEditMode: null`, `preLocationEditSystems: []`.
Depends on: none.

**Task 7.3 — Nav bar Add/Remove/Done controls**
Files: `src/app/bodymap.tsx` (`NavBar`, ~388-435).
Replace the `relocatingCondition` block with one keyed on `locationEditingCondition`: keep the existing condition-name label (reuse `navRelocationText` styling, `getLocalName`) so the user still sees which condition they're editing, and add three `TouchableOpacity` controls — `+ Add`, `− Remove`, `✓ Done` — in the center of the nav bar. Add/Remove are toggles: highlighted (using `SYSTEM_META[locationEditingCondition.system]?.color`) when `locationEditMode` matches; pressing either calls `setLocationEditMode('add' | 'remove')`. Done calls `finishLocationEditing()`. Remove now-orphaned styles/handlers tied to the old single-location relocation banner only if nothing else references them.
Depends on: 7.2.

**Task 7.4 — Pencil icon enters the new flow**
Files: `src/app/bodymap.tsx` (~1246).
Change `onPress={() => startRelocation(selectedCondition)}` to `onPress={() => startLocationEditing(selectedCondition)}`.
Depends on: 7.2.

**Task 7.5 — Add-mode tap handling**
Files: `src/app/bodymap.tsx` (tap handlers in `BodySvg`, ~583-660; replaces `handleRelocationPlace`, ~2092).
When `locationEditMode === 'add'`, a tap on the body map converts SVG coords to `cx`/`cy` percent exactly as today's `handleRelocationPlace` does, then calls `putIndexedConditionLocation` with a new `uuid()` id, `condition_id: locationEditingCondition.id`, the tapped `cx`/`cy`, and `is_primary: true` only if the condition currently has zero real location rows (first location on a legacy/fallback condition — in that case also write the condition's own denormalized `cx`/`cy`, mirroring `updateIndexedConditionPosition`'s dual-write, since `getIndexedConditionDots` only uses that field when zero location rows exist). Call `refreshDots()` (and `refreshConditions()` only for that first-location case). Editing mode does **not** auto-exit — the user can place multiple locations in a row while Add stays active.
Depends on: 7.1, 7.2.

**Task 7.6 — Remove-mode tap handling**
Files: `src/app/bodymap.tsx`.
When `locationEditMode === 'remove'`, a tap does nearest-dot hit-testing (reuse the existing `pressNearest` distance-threshold logic) scoped to `dots.filter(d => d.conditionId === locationEditingCondition.id)` only — dots belonging to any other condition must not be tappable while editing this one. If a dot is hit:
- If the condition has more than 1 location (real rows, or 1 real + the synthesized fallback doesn't count as removable — see below) and `dot.locationId` is non-null, call `deleteConditionLocation(idb, dot.locationId)` then `refreshDots()`.
- If the hit dot is the synthesized fallback (`dot.locationId === null`, meaning zero real `condition_locations` rows exist) or the condition has exactly 1 real location remaining, reject the removal instead of deleting anything — a condition must always keep at least one location (§5.10). Surface a brief inline message (reuse `navCenterMessage` styling/position) rather than silently no-opping or crashing.
Depends on: 7.1, 7.2.

**Task 7.7 — Verify Done re-selection**
Files: `src/app/bodymap.tsx`.
Confirm `finishLocationEditing()` (7.2) is sufficient to reopen the sheet correctly (selected condition, its records/timeline reloading as needed) — if any other code path currently only re-derives sheet content from a dedicated `selectCondition(c)` call rather than raw `selectedCondition`/`sheetOpen` store fields, call it explicitly from the Done handler instead of relying on the store action alone.
Depends on: 7.2, 7.3.

**Task 7.8 — Unit tests**
Files: extend `tests/lib/indexedDb.test.ts`; new or extended store test file for `useAppStore.ts`.
- `getIndexedConditionDots`: a condition with 2 real `condition_locations` rows returns 2 dots each with a non-null, distinct `locationId`; a condition with zero rows returns 1 dot with `locationId: null`.
- Store: `startLocationEditing` solos `[c.system]` into `activeSystems`, saves the prior systems, closes the sheet, defaults `locationEditMode` to `'add'`; `setLocationEditMode` switches the mode without other side effects; `finishLocationEditing` restores the prior `activeSystems`, selects the edited condition, opens the sheet, and clears all editing state.
- Removal guard: a condition with exactly 1 location is rejected; a condition with 2 locations allows removing down to 1 successfully.
Depends on: 7.1–7.7.

**Task 7.9 — Manual UI verification**
No new files — verification task.
In a browser: select a condition, click the pencil, confirm Remove is highlighted by default (see Amendments below); tap an existing dot away in Remove mode and confirm it disappears, including removing every location down to zero; confirm Done grays out and cannot be pressed while zero locations remain; switch to Add, tap the body twice and see two new dots appear, confirming Done re-enables; click Done and confirm it exits to the bare bodymap (not the condition's sheet) with edits persisted; reload the page and confirm all edits persisted through IndexedDB.
Depends on: 7.1–7.8.

**Amendments (post-DONE, 2026-08-01–02, user feedback after manual testing)**

Phase 7 shipped and moved to `kb4-DONE` with the behavior exactly as speced in Tasks 7.1–7.9 above (Add default, reject-the-last-location guard, Done reopens the sheet). Three rounds of user feedback after hands-on testing changed that shipped behavior; the task text above is left as-is for historical accuracy — this section is the current source of truth for these three points, superseding the corresponding lines above:

1. **Removing every location down to zero is now allowed.** The original Task 7.6 guard (reject removing the last real location, or the synthesized fallback dot) is removed for the last-real-location case — a condition can be edited down to zero real `condition_locations` rows. What still can't be removed is the synthesized fallback dot itself (`locationId === null`), since there's no real row behind it to delete.
2. **Done is gated on location count, not the removal handler.** Instead of blocking removal at zero, the nav bar's Done button is disabled (grayed out, not pressable) whenever the condition being edited has zero real locations, re-enabling once at least one exists. This replaces Task 7.6's original enforcement point without changing the underlying invariant (a condition can't exit editing with zero locations).
3. **Done exits to the bare bodymap, not the condition's sheet.** `finishLocationEditing` now sets `selectedCondition: null`, `sheetOpen: false` instead of reopening the sheet on the edited condition — users place/remove dots to see the result on the map itself, not to reopen the card. Task 7.2/7.7's "Done always lands back on the edited condition's sheet" description above is superseded by this.
4. **Remove, not Add, is the default tool on entry.** `startLocationEditing` now sets `locationEditMode: 'remove'` instead of `'add'`. Rationale (explicit product feedback, not the original design intent): most users opening the location editor are there to fix/erase an existing wrong location first, not to place a brand-new one — erase-first is the more common entry intent. Tasks 7.2, 7.3, 7.8, and 7.9 above all describe Add as the default; treat every such mention as superseded by this.

Implemented directly (not routed through a new kanban card, since these are small, already-QA-covered-pattern amendments to a DONE phase, not new scope) across `src/store/useAppStore.ts` (`startLocationEditing`, `finishLocationEditing`), `src/app/bodymap.tsx` (`NavBar`'s Done button gating, `handleLocationRemoveAttempt`), and their corresponding tests in `__tests__/store/useAppStore.test.ts`.

**Codex automated PR review findings (2026-08-02) and disposition:**

An automated Codex review of PR #2 flagged 2 P1 and 3 P2 findings. Two directly re-asserted the *pre-amendment* Task 7.6/7.2/7.7 text above (reject deleting the last location; reopen the condition's sheet on Done) — both are amendments 1 and 3 above, made on explicit user direction, not bugs. Left as-is; not reverted. The other three were genuine and fixed directly in `src/app/bodymap.tsx`:

5. **Legacy/fallback conditions could permanently disable Done on entry (P1).** `editingLocationCount` only counts real `condition_locations` rows, so a condition that never had any (rendering only its synthesized `locationId: null` fallback dot) hit `editingLocationCount === 0` — and therefore a disabled Done — the instant edit mode opened, with no cancel action to escape. Fixed by materializing a real primary location row (mirroring `handleLocationAdd`'s existing first-location dual-write, at the condition's current position) as soon as `locationEditingCondition` is set, via a new `useEffect` in `BodyMapScreen`. Done is now enabled from the first frame for every condition; amendment 2's "Done disables once the user empties a condition's locations" behavior is unaffected, since it still applies once a condition drops back to zero *within* the current session.
6. **Rapid double-tap on a legacy condition's first Add could drop a location (P2).** Two near-simultaneous calls into the "zero real locations" branch (of either the new materialize effect or `handleLocationAdd`) could both read zero rows before either write committed, then both write to the same deterministic `${conditionId}-primary` key — the second silently overwrites the first. This was flagged as a known low-severity gap in QA's original Phase 7 pass (`kb4-DONE/p07-multi-location-editing.md`); now fixed by serializing every such write through a single promise-chain queue (`enqueueLocationWrite`) shared by the materialize effect and `handleLocationAdd`.
7. **Sheet height didn't recompute on viewport resize/rotation (P2).** `ConditionSheet`'s `sheetH` used the module-level `SH` constant (`Dimensions.get('window')`, captured once at load). Fixed by reading height reactively via `useWindowDimensions()` inside `ConditionSheet` instead.

**Round 2 (2026-08-02): one more Codex P2 finding plus a related user-reported UX bug, fixed together**

8. **Done could stay pressable during a pending delete (Codex P2).** After removing the final real location, `editingLocationCount` only reflects the deletion once `refreshDots()` resolves — a fast double-press of Done during that awaited round trip could exit with zero locations, bypassing the amendment-2 invariant. Fixed by tracking in-flight location writes (`locationWritePendingCount`, incremented/decremented by `enqueueLocationWrite`) and gating Done on `editingLocationCount > 0 && locationWritePendingCount === 0`, not the count alone.
9. **Removing the last location surfaced an untappable "ghost" dot with an unreadable message (user report, same underlying gap as #8).** Once real locations hit zero, `getIndexedConditionDots` synthesizes its usual fallback dot from the condition's own (now-stale) `cx`/`cy` — it looked like a location "popped up out of nowhere" mid-removal, and tapping it in Remove mode surfaced an inline rejection message (`"Add a location before removing this one"`) that rendered visually behind the condition-name label in the nav bar, unreadable. Fixed with two changes: (a) the synthesized fallback dot for the condition currently being edited is filtered out of the map/tap targets (`bodyMapDots`, a `dots` derivative used only for rendering — `editingLocationCount`'s own DB-backed derivation is untouched), so removing the last location leaves the screen visibly free of dots for that condition instead of a ghost reappearing; (b) `handleLocationRemoveAttempt`, on detecting zero remaining real locations after a delete, calls `setLocationEditMode('add')` so the tool auto-switches to Add and highlights it, guiding the user straight to placing a new one. The inline rejection message mechanism (`locationEditMessage`/`setLocationEditMessage`, store + `NavBar`) is removed entirely — it's unreachable now that the fallback dot is never a tap target during editing.
10. **Remove and Done should both be unavailable at zero locations, not just Done (user follow-up request).** #9's auto-switch-to-Add covered the *mode*, but the Remove button itself remained clickable (and, if pressed, highlightable) with nothing left to remove. Added `canRemoveLocation = editingLocationCount > 0`, disabling/graying out Remove exactly like Done's existing `canFinishLocationEditing` treatment, plus a safety-net `useEffect` that forces `locationEditMode` back to `'add'` if it's ever `'remove'` while `canRemoveLocation` is false (belt-and-suspenders alongside #9's handler-level switch). With zero locations, Add is now the only selectable/highlighted tool.

All of #8–#9 in `src/app/bodymap.tsx` (`enqueueLocationWrite`, the materialize effect, `handleLocationAdd`, `handleLocationRemoveAttempt`, `bodyMapDots`) and `src/store/useAppStore.ts` (removal of `locationEditMessage`/`setLocationEditMessage`), with `__tests__/store/useAppStore.test.ts` updated to drop the removed-message test.

**Round 3 (2026-08-02): two more Codex P2 findings plus UI polish (padding, disabled-state contrast, mobile icon-only buttons)**

11. **`refreshDots()` wasn't actually awaitable, reopening the #8 race (Codex P2).** `useConditionDots()`'s `refresh` fired-and-forgot its fetch (returned `void`), so `handleLocationRemoveAttempt`'s `await refreshDots()` resolved immediately rather than once `dots` actually updated — the pending-write counter from #8 could still be decremented before the refreshed zero-count state landed. Fixed by changing `useConditionDots`'s return type to `[IndexedConditionDot[], () => Promise<void>]` and returning the underlying `.then()`-chain's promise from `refresh`, with `setDots()` calls kept inside the `.then()`/`.catch()` callbacks (not a top-level `async`/`await`) to avoid tripping the `react-hooks/set-state-in-effect` lint rule.
12. **Location editing had no exit when IndexedDB is unavailable (Codex P2).** The #5 materialize-fallback fix only runs when `idb` is non-null; if IndexedDB failed to open, a fallback condition's `editingLocationCount` stays 0 forever (nothing can persist), permanently disabling Done, while Add also no-ops (its handler requires `idb`) — the user could get stuck in the location editor. Fixed by changing `canFinishLocationEditing` to `!idb || (editingLocationCount > 0 && locationWritePendingCount === 0)`: Done is unconditionally available when there's no database to protect, since nothing can be persisted incorrectly in that state either.
13. **UI polish (user report after hands-on testing): tighter button padding, unreadable disabled-state contrast, and no mobile-compact mode.** The Add/Remove/Done nav-bar buttons had too much horizontal padding and gap; the disabled (grayed-out) Remove/Done buttons combined a whole-button `opacity: 0.35` with the already-muted `C.inkMuted` text color, compounding into near-invisible text against the dark nav background; and the buttons kept their full text labels ("+ Add", "− Remove", "✓ Done") at all viewport widths, which could crowd out the condition name on narrow screens. Fixed by (a) reducing `navLocationEdit`/`navLocationEditControls` gaps and `navLocationEditBtn` padding/border-radius; (b) replacing the compounding-opacity disabled style with distinct dim border/background colors (`navLocationEditBtnDisabled`) plus a fixed-alpha readable text color (`navLocationEditBtnTextDisabled`), so disabled state no longer relies on multiplying two dimming effects; (c) adding a `compactLocationEditBtns` boolean (`useWindowDimensions().width < 480`, read reactively so it responds to in-session resize) that swaps the three buttons to bare symbols (`+`, `−`, `✓`) with a tighter icon-only style (`navLocationEditBtnCompact`) below that breakpoint.

Implemented in `src/hooks/useConditions.ts` (`useConditionDots`'s `refresh`) and `src/app/bodymap.tsx` (`idb` hoisted earlier in `BodyMapScreen` and deduplicated, `canFinishLocationEditing`, `handleLocationRemoveAttempt`'s `await refreshDots()`, `NavBar`'s button styles/compact-mode logic).
## Phase 08 — OpenRouter OAuth Onboarding, Free-Model Selection & Gated Document Intake

**Status: TODO.** This phase implements `userDataReq.md` §5.0. It changes the landing page from upload-first to connection-first while reusing the existing LMF/BYOK implementation. No application code is being changed by this planning card; tasks below are the implementation and verification work to execute later.

### Phase 08 product decisions (locked for implementation)

- The first-run connection path is OpenRouter's single-click OAuth PKCE flow. The onboarding UI does not display an API-key field and does not ask a user to create a developer account, create a key, copy a key, or paste a key. The existing `ProviderSettings` manual-key path remains available in Settings for advanced users and other providers, but is not the primary onboarding path.
- After OAuth succeeds, the onboarding model picker exposes only OpenRouter free models. It has no paid-model entries and no arbitrary free-text model-id escape hatch. The selected model is persisted in the existing `LMFProfile` and is validated before document intake is shown.
- The selected model is attempted first. `fallbackToFree` is forced on for the onboarding profile, and the existing OpenRouter free chain is tried automatically when the selected model is rate-limited or otherwise fails. The fallback chain is sanitized so a stale or crafted IndexedDB value cannot introduce a paid OpenRouter model.
- Provider credentials remain in the existing platform `KeyStore` (`expo-secure-store` on native, browser `localStorage` on web); non-secret profile metadata remains in the IndexedDB `settings` store. No app account, remote profile, cloud sync, or new health-data service is introduced.
- A returning user does not repeat OAuth setup when the local profile and credential are intact. The app performs a lightweight connection check; a missing/invalid credential or unavailable network keeps document intake unavailable but leaves the demo and local data available. A successful local recovery can come from a provider-only JSON bundle or a QR payload generated by the app.
- The explore demo is always rendered at the bottom of the landing page and bypasses connection, upload, extraction, redaction, and LLM enrichment. It enters the same IndexedDB persistence and bodymap rendering path as a real record.

### Existing implementation surfaces to reuse

- `src/components/ProviderSettings.tsx`: current profile hydration, `Connect`/`Disconnect`, model loading, validation messaging, fallback preference, and persistence wiring. Refactor its controller/state into a shared surface instead of duplicating OAuth or model-selection logic in the landing screen.
- `src/lib/llm/oauth.ts` + `src/app/oauth/openrouter.tsx`: existing OpenRouter PKCE app glue, pending-verifier persistence/cleanup, web `maybeCompleteAuthSession`, native cold-launch completion, and user-facing error states. `src/lib/lmf/oauth/openrouterPkce.ts` remains the pure crypto/URL/exchange implementation.
- `src/lib/llm/profile.ts` + `src/lib/llm/keystore.ts`: existing non-secret `LMFProfile` persistence and platform key storage. Do not move the credential into IndexedDB or add another key store.
- `src/lib/lmf/models.ts`, `src/lib/llm/refresh.ts`, `src/lib/llm/client.ts`: existing model-list parsing, `:free` defaults, OpenRouter `max_price=0` refresh, ranking, and IndexedDB chain persistence. Extract one shared free-model predicate/listing path rather than maintaining a second free-model definition.
- `src/lib/lmf/route.ts`, `src/lib/lmf/engine.ts`, and `src/lib/llm/service.ts`: existing primary-candidate-plus-free-chain route, rate-limit classification, cooldown ledger, fallback attempts, and LLM telemetry. Phase 08 must wire the persisted profile/key into real upload and chat call sites; it must not replace the fallback engine.
- `src/app/index.tsx`: current upload handlers, demo CTA, settings entry point, privacy copy, and responsive layout. Gate only the document-intake section; keep the demo CTA and offline copy visible.
- Existing tests in `tests/lib/oauth.test.ts`, `tests/lib/lmf/oauthPkce.test.ts`, `tests/components/ProviderSettings.test.tsx`, `tests/lib/lmf/route.test.ts`, `tests/lib/lmf/engine.test.ts`, `tests/lib/llm-refresh.test.ts`, `tests/lib/pipeline.test.ts`, `__tests__/screens/upload.test.tsx`, and `__tests__/app/oauthRoute.test.tsx` should be extended before creating parallel test infrastructure.

### Task 8.1 — Freeze the connection contract and close the LMF call-site dependency

Files: `src/lib/lmf/types.ts`, `src/lib/llm/profile.ts`, `src/lib/pipeline.ts`, `src/app/analyzing.tsx`, `src/app/bodymap.tsx`, `src/lib/llm/service.ts`, existing LMF card `doc.lmFallbackBuild/kanban/TODO/pB09-T01-wireByokIntoCallSites.md`, and their tests.

- Confirm whether pB09-T01 is complete on the implementation branch. If it is not, finish or explicitly consume that card before the landing gate is considered valid: the upload pipeline and condition chat must load `LMFProfile` and the real `KeyStore` and pass them into `lmfEnrich`/`lmfChat`.
- Remove any app-upload or chat dependency on the legacy `openrouter_api_key` IndexedDB setting. `PipelineOptions.apiKey` remains only as a test/compatibility injection if needed; the user path must use the persisted profile/key store.
- Define one connection-readiness contract used by the landing gate: `loading`, `needs_connection`, `needs_model`, `checking`, `ready`, `offline`, and `invalid` (exact names may be refined, but one canonical source is required). Keep `useAppStore.llmTier`/`llmStatus` for existing telemetry/status UI; do not create a second unrelated readiness flag in Zustand.
- Extend `LMFProfile` with optional non-secret verification metadata (for example `connectionVerifiedAt`) or an equivalent settings value. Existing profiles without the field must load safely and be rechecked once. Clear the marker whenever provider, model, credential, or disconnect state changes.

Test plan:

- Add/extend service and pipeline tests proving a stored OAuth profile and `KeyStore` key are present in the route used by enrichment; fail the test if the route silently becomes tier-0 anonymous.
- Prove legacy `openrouter_api_key` is not read by the app upload/chat path and that profile JSON contains no credential.
- Test backward-compatible loading of profiles with and without the verification field, plus invalid/expired markers.

Depends on: existing pB02/pB03/pB05 LMF work; pB09-T01 must be completed or folded into this task before 8.9.

### Task 8.2 — Build the shared connection-state/controller layer

Files: new `src/lib/llm/connection.ts` and/or `src/hooks/useLlmConnection.ts` (choose one pure service plus one React hook if needed), `src/lib/db/indexedDbProvider.tsx`, `src/lib/llm/profile.ts`, `src/lib/llm/keystore.ts`, and focused tests.

- Reuse `loadProfile`, `saveProfile`, `makeKeyStore`, `validateKey`, `BUILT_IN_PROVIDERS.openrouter`, and the existing `connectOpenRouter`; do not duplicate storage or fetch logic.
- Expose a single load/refresh/check operation that waits for IndexedDB opening and key-store creation before rendering the landing intake. Distinguish “database still opening” from “database unavailable” so the upload area never flashes briefly on first paint.
- Derive readiness from provider id, key presence, selected model, `connectionVerifiedAt`, and a successful lightweight OpenRouter validation. Persist only non-secret status metadata. A network failure is `offline`, not a successful connection; it must not reveal document intake.
- Provide actions for `connect`, `selectModel`, `validate/save`, `retry`, `disconnect`, `exportBundle`, and `importBundle` to both the onboarding UI and Settings. Actions must be serialized so double taps cannot overwrite profile/key state.
- Map OAuth/validation/network errors to short actionable messages; never expose raw response bodies, keys, or authorization URLs containing secrets.

Test plan:

- Pure tests for every state transition: first visit, profile/key missing, OAuth success before model selection, model selected but not verified, valid restore, 401/403 invalid credential, network-offline, retry success, disconnect, and IndexedDB unavailable.
- Hook tests verify loading prevents upload controls from rendering and that exactly one key-store/profile load occurs per mount.
- Test that cancellation leaves the previous verified profile untouched and that a failed new connection cannot clear a good existing connection.

Depends on: 8.1.

### Task 8.3 — Refactor `ProviderSettings` into a reusable connection controller and panels

Files: `src/components/ProviderSettings.tsx`, new shared presentational/controller module if needed, `tests/components/ProviderSettings.test.tsx`, `tests/lib/providerSettingsLogic.test.ts`.

- Extract the existing profile/key hydration, validation, OAuth connect, model selection, save, disconnect, and fallback state so both the Settings panel and the landing onboarding panel call the same handlers.
- Add an explicit presentation mode such as `settings` versus `onboarding`. Onboarding is OpenRouter-only, hides manual API-key entry/provider switching, uses plain-language labels, and locks `fallbackToFree: true`; Settings preserves the existing advanced provider/manual-key controls unless a later product decision changes them.
- Preserve current SettingsSheet behavior, dirty-state callbacks, provider dropdown behavior for advanced users, and existing error copy. Do not make Settings a second source of truth.
- Ensure the OAuth button is invoked directly from the user gesture so browser popup blocking does not regress.

Test plan:

- Extend existing ProviderSettings tests for shared controller behavior: OAuth success, cancel, 403/error, profile reload, model selection, save, disconnect, and onboarding versus settings visibility.
- Assert onboarding never renders a text input labeled API key, custom base URL, paid model, or free-text model field.
- Assert Settings still supports its existing advanced path and does not regress `onDirtyChange` or persisted profile updates.

Depends on: 8.2.

### Task 8.4 — Centralize and enforce the OpenRouter free-model catalog

Files: `src/lib/lmf/models.ts`, `src/lib/llm/refresh.ts`, `src/lib/llm/client.ts`, `src/lib/llm/service.ts`, `src/lib/lmf/route.ts`, `src/components/ProviderSettings.tsx`, and model/refresh/route tests.

- Add one shared OpenRouter free-model predicate based on the existing contract (`id` ends in `:free`; preserve any stricter zero-pricing metadata check if the API exposes it). Use it in onboarding, OpenRouter Settings, dynamic refresh, default-chain validation, and persisted-chain reads.
- Reuse the existing `/models?max_price=0` refresh and ranking. When the network is unavailable, fall back only to `DEFAULT_MODELS`/free curated entries; never show an empty paid-capable picker or insert a paid fallback.
- OpenRouter model selection must be a finite searchable list of free IDs. Hide free-text model entry for OpenRouter; retain it only for non-OpenRouter/custom settings where the existing product supports it.
- Sanitize stored `llm_model_chain` values on read/write, dedupe the selected primary model, and guarantee every fallback candidate is OpenRouter and free. Keep chain refresh fire-and-forget behavior and 30-day gating.

Test plan:

- Model-list tests mix free and paid API entries and assert only free IDs reach the picker.
- Refresh tests assert `max_price=0`, ranking, fallback defaults, persistence, and exclusion of paid/stale/crafted IDs.
- Route tests assert selected free model is first, remaining free chain follows, duplicates are removed, and `fallbackToFree` cannot introduce paid candidates.

Depends on: 8.1; existing LMF model/refresh code.

### Task 8.5 — Wire the first-run OpenRouter PKCE onboarding action

Files: `src/app/index.tsx`, shared onboarding component from 8.3, `src/lib/llm/oauth.ts` only if the shared controller needs a narrow result/cleanup extension, existing OAuth route/tests.

- Add a connection card above the document-intake area. Its primary action calls the existing `connectOpenRouter(db)` directly from the press/click handler; no API-key field or developer-account instructions appear in this path.
- Keep the existing pending-verifier/redirect implementation: `lmf_oauth_pending` is written before opening the browser, success exchanges the code, cancel/dismiss cleans up, web returns through `maybeCompleteAuthSession`, and native cold-launch support remains covered even though the product is browser-first.
- After OAuth success, return to the landing card in `needs_model` state rather than automatically revealing uploads. Show a plain-language success message and the free-model picker.
- On OAuth error/cancel/locked/network failure, keep uploads hidden, retain the explore demo, show a retryable message, and never overwrite a previously verified profile.

Test plan:

- Extend OAuth glue tests for success, cancel, dismiss, locked, redirect error, exchange 403, missing code/verifier, and pending-verifier cleanup.
- Extend upload-screen tests to assert the Connect action calls the existing OAuth function and that cancellation/error leaves intake absent.
- Browser smoke test the actual web popup/redirect path with a test OpenRouter account or a controlled mock redirect; do not log or commit real credentials.

Depends on: 8.2, 8.3; existing pB05 OAuth route work.

### Task 8.6 — Select, validate, and persist one free model before unlocking intake

Files: shared connection controller/panel, `src/lib/lmf/validateKey.ts` if a narrow validation option is needed, `src/lib/llm/profile.ts`, `src/lib/llm/types.ts`, `src/store/useAppStore.ts` only for existing tier/status synchronization, and tests.

- Populate the picker from the centralized free catalog. Select a sensible free default when the catalog is available; require an explicit selection if no default can be safely chosen.
- Validate the OAuth-derived OpenRouter key against the selected model/provider using existing `validateKey`/model-list logic. Do not make a completion request with health data merely to test the key.
- On success, persist `tier: 1`, `activeProviderId: 'openrouter'`, selected free `model`, `keySource: 'oauth'`, `fallbackToFree: true`, and the verification timestamp. Only then transition to `ready` and reveal PDF/photo intake.
- On validation failure, preserve a recoverable profile/key state without claiming readiness; show retry/change-model guidance. If an imported bundle is invalid, restore the prior profile/key atomically.

Test plan:

- Unit-test profile serialization and defaulting, free-model requiredness, successful validation, 401/403, network error, and retry.
- Assert no health-record text is sent during connection validation.
- Assert profile JSON never contains the key and the KeyStore receives exactly the exchanged/imported credential.

Depends on: 8.2, 8.4, 8.5.

### Task 8.7 — Implement local provider-profile recovery through JSON and QR

Files: new `src/lib/llm/connectionBundle.ts`, new QR UI/codec module, `src/components/ProviderSettings.tsx`/onboarding panel, existing IndexedDB backup/import UI patterns, `package.json`/`package-lock.json` only if a web-compatible QR dependency is required, and bundle tests.

- Define a versioned provider-only bundle containing non-secret profile metadata plus the credential intentionally included for recovery. It must not include health records, PDFs, images, chat, or arbitrary remote endpoints. For this onboarding phase, accept OpenRouter profiles; advanced provider support may reuse the same schema only after provider/base-URL validation.
- Reuse the existing document-picker/download patterns for JSON export/import, but do not confuse a provider bundle with a full IndexedDB health-data backup. Import validates schema/version/provider/model/free constraint before any write, then writes KeyStore and profile with rollback on failure.
- Generate a compact QR payload from the same canonical bundle. Display it only after a clear warning that it contains a provider credential; provide a download/shareable image and a copy/import fallback without sending it to an app server.
- Add a web-only scanner path using a web-compatible QR decoder/encoder selected by a small compatibility spike (for example, `qrcode` plus `@zxing/browser` if Expo Web/camera tests pass). No native-only module or EAS/dev-client build is allowed. Also support scanning an image file when camera permission/browser support is unavailable.
- Enforce payload size, version, checksum/parse failure, provider allowlist, and explicit confirmation. Never log bundle JSON, QR text, or key values.

Test plan:

- Pure codec tests: JSON/QR round trip, Unicode, malformed/truncated payload, unknown version, oversized payload, paid-model rejection, custom-endpoint rejection, and credential preservation in the intentional bundle only.
- Import tests verify atomicity/rollback, existing-profile preservation on failure, and no health-data store writes.
- Browser tests verify QR generation, camera/image decode where supported, permission denial fallback, warning/confirmation copy, and recovery into a fresh profile.

Depends on: 8.2, 8.4; QR dependency decision must respect the browser-only platform constraint.

### Task 8.8 — Gate landing-page document intake while preserving demo/offline paths

Files: `src/app/index.tsx`, new onboarding component/styles if needed, `src/lib/db/indexedDbProvider.tsx`, `__tests__/screens/upload.test.tsx`, and accessibility/browser tests.

- Render the connection onboarding card while state is `loading`, `needs_connection`, `needs_model`, `checking`, `offline`, or `invalid`; render the existing upload zone only in `ready`.
- Guard every upload entry point (`PDF`, camera/photo, image picker, drag/drop if later added) with the same readiness predicate so hiding the controls is not the only protection. Do not put the guard on the demo handler.
- Keep “Explore demo data” at the bottom in every state. Demo navigation must continue directly to analyzing/demo persistence/bodymap without an OAuth call, API validation, or connection requirement.
- Keep privacy/offline messaging truthful: app shell, demo, and locally persisted records remain usable offline; new analysis requires a live verified connection. Avoid an upload-control flash while IndexedDB/profile state is loading.
- Use accessible labels, focus order, keyboard activation, large touch targets, readable status/error copy, and responsive layout at desktop and narrow mobile-browser widths.

Test plan:

- Upload-screen tests for each connection state: intake absent/blocked until ready, ready reveals all supported controls, demo always present, demo bypasses connection, and failed handlers do not set `pendingUpload` or navigate.
- Test loading/unavailable IndexedDB, offline state, invalid profile, and rehydrated ready profile.
- Browser responsive/accessibility pass checks keyboard tab order, screen-reader labels, touch target size, and no upload flash on cold load.

Depends on: 8.2, 8.5, 8.6, 8.7.

### Task 8.9 — Verify the real upload/chat route uses the connected profile and automatic fallback

Files: `src/lib/pipeline.ts`, `src/app/analyzing.tsx`, `src/app/bodymap.tsx`, `src/lib/llm/service.ts`, `src/lib/lmf/route.ts`, existing pB09 tests and pipeline/engine tests.

- Complete the pB09 call-site wiring if not already landed: real uploads and condition-scoped chat must pass the loaded `LMFProfile` and `KeyStore` into the LMF service. Remove stale direct key reads and do not add a second OpenRouter client.
- Confirm `buildRoute` puts the selected free model first, then the persisted/refreshed free chain, with deduplication. Keep `fallbackToFree: true` for the onboarding profile and ensure the engine's existing 429/rate-limit classification, cooldown, retry order, and total-exhaustion behavior are unchanged.
- Confirm the same route is used for structure, chunk enrichment, and any other pipeline LLM calls; raw PDF/image bytes remain local and only redacted extracted text reaches OpenRouter.
- Preserve existing progress/error contracts in `analyzing.tsx`; a complete fallback success is a normal result, while all-candidate exhaustion remains truthful and retryable.

Test plan:

- Integration test a connected OAuth profile with a mocked selected-model 429 followed by a successful free-chain response; assert call order and no paid model request.
- Test a selected model success (no unnecessary fallback), repeated rate-limit cooldown skip, all-free exhaustion, network failure, and telemetry status transitions.
- Pipeline test asserts profile/key routing for structure and chunk calls and asserts no API key/plain PDF/image appears in logs or requests outside the configured OpenRouter endpoint.

Depends on: 8.1, 8.4, 8.6; pB09-T01.

### Task 8.10 — Reconnect, disconnect, legacy profile, and Settings interoperability

Files: `src/components/ProviderSettings.tsx`, `src/lib/llm/profile.ts`, `src/lib/llm/keystore.ts`, `src/app/index.tsx`, `src/app/bodymap.tsx`, migration/settings tests.

- A returning verified OAuth profile auto-restores without redoing setup, then performs the lightweight live check. A cleared local profile can be restored through JSON/QR without an app account.
- Disconnect deletes the OpenRouter key from the existing KeyStore, clears profile model/verification metadata, sets tier 0, and immediately returns the landing gate to connection-required state. It must not delete health records or demo data.
- Preserve idempotent migration of legacy `openrouter_api_key` data into the existing KeyStore/profile migration where applicable; never write new secrets to IndexedDB settings.
- Keep the advanced Settings panel and onboarding panel synchronized after connect/import/disconnect/model changes. Avoid stale local draft state reopening the upload gate incorrectly.

Test plan:

- Existing profile migration tests plus cases for disconnect, repeated disconnect, import over an existing profile, browser-storage clear, and Settings-to-landing state synchronization.
- Verify health-record stores are unchanged by credential/profile operations.

Depends on: 8.2, 8.3, 8.7, 8.8.

### Task 8.11 — Automated Phase 08 test suite and regression coverage

Files: all Phase 08 unit/component/integration test files; no production-code changes unless a test exposes a defect.

- Add deterministic tests for the connection state machine, free-model filtering, fallback route/engine behavior, profile/key persistence, bundle import/export/QR codec, landing gating, OAuth panel wiring, and pipeline/profile routing.
- Reuse existing mocks and fake IndexedDB setup. Never use a real OpenRouter credential in Jest, fixtures, snapshots, logs, or committed browser artifacts.
- Keep tests focused on public behavior and pure helpers; do not render the full heavyweight bodymap screen when a smaller controller/component test covers the contract.

Required commands:

- `npm run typecheck`
- `npx expo lint`
- Targeted Jest suites for OAuth, provider settings, models/refresh/route/engine, connection bundle/state, upload screen, and pipeline.
- `npm test` with the repository's existing coverage target; record pre-existing failures separately from Phase 08 failures.

Depends on: 8.1–8.10 as applicable.

### Task 8.12 — Browser end-to-end and manual acceptance pass

Use `npx expo start --web` and the project's available browser automation/manual browser tooling. Use a test OpenRouter account or deterministic mock endpoints; never capture a real key in screenshots or logs.

Checklist:

1. Fresh browser profile: connection card appears; PDF/photo controls do not; no API-key input is shown; Explore demo remains at the bottom.
2. Click Connect: OpenRouter login opens from the user gesture; cancel/dismiss/error returns to the same blocked state with actionable copy.
3. Complete OAuth: selected free models only; paid and free-text options are absent; a default can be selected; intake remains hidden until validation succeeds.
4. Successful validation: PDF/photo intake appears; upload reaches the existing analyzing pipeline; profile/key are persisted locally.
5. Simulated selected-model 429: next free-chain model is attempted automatically and succeeds; no paid model or non-OpenRouter endpoint is requested.
6. Returning visit: local profile restores without OAuth setup; a network/credential check determines ready versus offline/invalid state.
7. JSON and QR recovery in a fresh browser profile: warning appears, explicit confirmation is required, profile/key restore, health stores remain untouched, and intake unlocks only after validation.
8. Disconnect: intake disappears; demo and local health data remain available; reconnect works.
9. Offline: app shell, demo, and existing local records remain usable; new intake is hidden/blocked with a truthful explanation.
10. Desktop and narrow mobile-browser widths: no layout overflow, all controls keyboard/touch accessible, status/error text readable, no upload flash.

Depends on: 8.8, 8.9, 8.10, 8.11.

### Task 8.13 — Final acceptance, security, and documentation handoff

- Walk every §5.0 and §10 acceptance bullet and record PASS, FAIL, or a named follow-up with evidence in the Phase 08 card.
- Perform a hard-constraint audit: no app account/cloud storage; no raw PDF/image to LLM; only OpenRouter receives the OpenRouter key; no key in logs/telemetry/errors; no chat persistence; demo uses shared downstream persistence/rendering.
- Record QR dependency/license/bundle-size decision and browser support limitations. If camera scanning is unavailable in a browser, document the image-file/JSON import fallback rather than silently claiming universal scanning.
- Move the card from `kb1-TODO` only after implementation, automated validation, and browser acceptance are honestly recorded in `kb3-TEST`; do not mark this planning card DONE in advance.

Depends on: 8.11, 8.12.
## Pipeline diagnostics

- Add runtime-switchable `globalThis.__MAIGENKI_DEBUG__` logging with `off`/`error`/`warn`/`info`/`debug`/`trace` levels and category filters.
- Instrument PDF byte loading, document parsing, per-page text extraction, pipeline stages, LLM events, media capture, and IndexedDB persistence/transaction failures.
- Keep diagnostics disabled by default and verify no extracted health text, PII, or API keys are logged.
- Use `doc.userDataFlow/pipelineDebugging.md` as the QA capture and triage procedure.
## Phase 09 — Whole-document extraction and body-map enrichment tasks

1. Define extraction schema, hierarchy inheritance, and provenance rules.
2. Replace structure/chunk extraction prompts with longitudinal condition/provider extraction while retaining context-limit fallback.
3. Add deterministic earliest-date/year-fraction calculation and merge tests.
4. Define condition-level organ/system/anatomical-region enrichment schema.
5. Add local body-map alpha-mask coordinate validation and repair/fallback.
6. Map results into existing `ConditionInput`, `condition_locations`, and IndexedDB persistence.
7. Add sparse-report, inheritance, context-limit, coordinate-mask, fallback, and regression fixtures.
8. Run browser acceptance and compare body-map rendering before/after.

Detailed kanban card: `doc.userDataFlow/kb1-TODO/p09-llm-extraction-enrichment.md`.
