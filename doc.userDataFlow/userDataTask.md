# Task Breakdown: User Data Flow (PDF Upload → Bodymap Display)

Implements `doc.userDataFlow/userDataReq.md`. Each task is independently implementable and testable, references exact files/functions verified against the current codebase, and lists its dependencies so tasks can be picked up in order (or in parallel where no dependency is listed). Suggested use: one kanban card per task, moved through `kb1-TODO` → `kb2-CODE` → `kb3-TEST` → `kb4-DONE`.

Ground truth used throughout (confirmed by direct file reads, not assumed):
- `src/lib/db/queries.ts` — `uuid()` helper, `insertCondition`/`findOrCreateProvider`/etc. signatures, `getConditions`/`getConditionRecords` read shapes.
- `src/lib/db/backup.ts` — `BACKUP_TABLES` currently omits `condition_care_events`, `provider_affiliations`, `facility_relationships`, `provider_facility_roles`, `evidence_sources`, `clinical_events*` entirely (pre-existing gap, unrelated to this PRD but touched in Phase 2 — see Task 2.11).
- `src/lib/db/seed.ts` — demo seeding is `INSERT OR IGNORE` keyed on fixed design ids; `clearDemoData` deletes children before parents manually (no `ON DELETE CASCADE`).
- `src/hooks/useConditions.ts` — `useConditions()`/`useConditionRecords()` hook pattern to mirror for the new dot hook.
- `src/app/bodymap.tsx` — `GhostDots` (line 527), `BodySvg` (595), `ConditionRipples` (671), `RecordsCarousel` (945), `renderRecordThumb` (222), `RecordLightbox` (~1340), chat footer button (~1255), carousel currently gated at `chatOpen` (1268).
- `src/model/conditions.ts` — `DesignCondition`, `ConditionRecord`, `getSvgX`/`getSvgY`, `defaultConditionPosition`.

---

## Phase 0 — Environment & Library Spike

No schema or app-code changes. De-risks the two open decisions from the PRD (§9) before other phases depend on them.

**Task 0.1 — Spike `react-native-pdf-jsi` page export**
Files: throwaway spike branch/script only.
Install `react-native-pdf-jsi` in a dev-client build, call its page-export API (`ExportManager.exportPageToImage`) against a real multi-page PDF on iOS simulator + Android emulator. Confirm: output format/quality control works as documented, install size/build impact, and whether its bundled "analytics" feature makes any network call (must confirm it doesn't, given the app's no-telemetry constraint).
Depends on: none.

**Task 0.2 — Spike `react-native-pdf-page-image`**
Files: throwaway spike branch/script only.
Same test as 0.1 using `react-native-pdf-page-image`'s `open`/`generate`/`close` API. Confirm autolinking works with a standard Expo config plugin (or write a minimal one if needed) and it coexists with `expo-pdf-text-extract` without native conflicts (both may touch iOS PDFKit).
Depends on: none. Can run in parallel with 0.1.

**Task 0.3 — Decide PDF-render library and add as dependency**
Files: `package.json`, `app.json`.
Based on 0.1/0.2 results, commit to one library, add it to `package.json`, wire its Expo config plugin entry (or hand-written plugin) into `app.json`, run `npx expo prebuild` to confirm it builds cleanly.
Depends on: 0.1, 0.2.

**Task 0.4 — Add compression/file-read dependencies**
Files: `package.json`.
Add `expo-image-manipulator` (compression) and `expo-file-system` (reading manipulated output back as bytes) via `npx expo install`. Confirm SDK-56-compatible versions resolve.
Depends on: none.

**Task 0.5 — Verify expo-sqlite BLOB behavior**
Files: throwaway test script.
Confirm the installed `expo-sqlite ~56.0.5` supports binding `Uint8Array` as a BLOB param in `runAsync`, and reproduce (or rule out) the known web-platform `getAllAsync`-corrupts-multi-row-BLOBs issue by inserting 3+ rows with distinct blob content and reading them back via both `getAllAsync` and `getEachAsync` on web. This determines whether Task 2.7/2.10's "use `getEachAsync`, not `getAllAsync`" requirement is still necessary.
Depends on: none.

**Task 0.6 — Benchmark native per-page text extraction**
Files: throwaway test script using `expo-pdf-text-extract`.
On a real ~100-page PDF, time a loop of `extractTextFromPage(uri, i)` calls (native bridge round-trip per page) versus the current single `extractTextWithInfo()` call. If per-page looping adds more than ~1-2s total, flag that Task 3.1 should use the length-proportional page-boundary fallback instead of true per-page extraction.
Depends on: none.

---

## Phase 1 — Provider Attribution Fix

Independent of every other phase — a one-line correctness fix in already-existing tables. Can ship first.

**Task 1.1 — Remove the blanket provider fallback in `pipeline.ts`**
Files: `src/lib/pipeline.ts`.
In the condition-persistence loop, change `const conditionProviders = c.provider ? [...] : providers` to `const conditionProviders = c.provider ? [...] : []`. The well-evidenced case is already handled by the unconditional `insertConditionCareEvent` loop directly above (gated on `event.date && event.provider?.name`); this only removes the over-attachment of every document-wide provider to conditions with neither an explicit `provider` nor a care event.
Depends on: none.

**Task 1.2 — Regression test for provider attribution**
Files: extend `tests/lib/pipeline.test.ts` (or `__tests__/db/pipeline.test.ts`, whichever currently covers `processHealthRecord`).
Add a case: a condition with no `c.provider` and no matching `care_events` entry, alongside a document that has other providers extracted at the top level, must produce **zero** `condition_providers` rows for that condition (was: one row per document provider). Keep the existing "condition_care_events populated correctly" tests passing.
Depends on: 1.1.

---

## Phase 2 — Schema & Persistence Layer

Foundational — purely additive, nothing writes to the new tables until Phase 3/4, so this phase is safe to ship standalone once tested.

**Task 2.1 — Add `condition_locations` table**
Files: `src/lib/db/schema.ts`.
Add to `CREATE_TABLES_SQL`:
```sql
CREATE TABLE IF NOT EXISTS condition_locations (
  id TEXT PRIMARY KEY,
  condition_id TEXT NOT NULL REFERENCES conditions(id),
  anatomical_location TEXT,
  laterality TEXT,
  render_x REAL, render_y REAL,
  cx REAL, cy REAL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  evidence TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_condition_locations_condition ON condition_locations(condition_id);
```
Add a matching `ConditionLocationRow` type export next to the other row types in this file.
Depends on: none.

**Task 2.2 — Add `record_images` table**
Files: `src/lib/db/schema.ts`.
Add to `CREATE_TABLES_SQL`:
```sql
CREATE TABLE IF NOT EXISTS record_images (
  id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL REFERENCES health_records(id),
  page_number INTEGER,
  source_file TEXT,
  title TEXT,
  mime_type TEXT NOT NULL DEFAULT 'image/webp',
  width INTEGER, height INTEGER, byte_size INTEGER,
  image_blob BLOB NOT NULL,
  thumbnail_blob BLOB,
  date TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_record_images_record ON record_images(record_id);
```
Add a matching `RecordImageRow` type.
Depends on: none. Can run in parallel with 2.1.

**Task 2.3 — Additive column migrations**
Files: `src/lib/db/schema.ts`.
Append to `ALTER_COLUMNS_SQL` (same swallow-duplicate-column pattern as existing entries):
```
ALTER TABLE conditions ADD COLUMN inferred_fields TEXT
ALTER TABLE measurements ADD COLUMN inferred_fields TEXT
ALTER TABLE condition_records ADD COLUMN image_id TEXT REFERENCES record_images(id)
```
Depends on: 2.2 (the `image_id` FK target table must exist — order within `initDatabase` doesn't strictly enforce this since SQLite FK targets aren't validated at ALTER time, but keep logically dependent).

**Task 2.4 — `insertConditionLocation` / `getConditionLocations`**
Files: `src/lib/db/queries.ts`.
```ts
type ConditionLocationInput = {
  conditionId: string
  anatomicalLocation?: string | null
  laterality?: string | null
  cxPercent: number
  cyPercent: number
  isPrimary?: boolean
  evidence?: string | null
}
export async function insertConditionLocation(db: SQLiteDatabase, input: ConditionLocationInput): Promise<string>
export async function getConditionLocations(db: SQLiteDatabase, conditionId: string): Promise<ConditionLocationRow[]>
```
Follow the existing `uuid()` + parameterized-insert convention used by every other `insertX` function in this file.
Depends on: 2.1.

**Task 2.5 — `getConditionDots` (bulk, render-ready)**
Files: `src/lib/db/queries.ts`.
```ts
export async function getConditionDots(
  db: SQLiteDatabase, mode: 'auto' | 'demo',
): Promise<{ conditionId: string; system: SystemId; cx_percent: number; cy_percent: number; yearFrac: number }[]>
```
LEFT JOIN `conditions` ↔ `condition_locations`. For a condition with ≥1 location rows, emit one dot per row (using the location's `cx`/`cy`). For a condition with zero location rows, synthesize exactly one dot from `conditions.cx`/`cy` (mirrors the existing fallback logic already in `getConditions`, lines 528-530, for old-DB compatibility) — this keeps legacy/demo data rendering identically to today. Reuse the same `mode`-based visibility filtering (`hasUserRecords`/demo-record-id logic) already implemented in `getConditions` (lines 494-509) rather than duplicating it — consider factoring the visibility-row-selection logic into a shared helper both functions call.
Depends on: 2.1.

**Task 2.6 — `insertCondition` returns computed position**
Files: `src/lib/db/queries.ts`, `src/lib/pipeline.ts`, any test calling `insertCondition`.
Change `insertCondition`'s return type from `Promise<string>` to `Promise<{ id: string; cxPercent: number; cyPercent: number }>`, returning the same `pos`/`input.cxPercent ?? pos.cx` values already computed inside the function (lines 172-199) instead of discarding them. Update the one production call site in `pipeline.ts` and any test call sites to destructure `{ id }` instead of using the string directly.
Depends on: none (independent of the rest of Phase 2, but needed by Task 3.6).

**Task 2.7 — `insertRecordImage` / lazy image reads**
Files: `src/lib/db/queries.ts`.
```ts
type RecordImageInput = {
  recordId: string
  pageNumber?: number | null
  sourceFile?: string | null
  title?: string | null
  mimeType: string
  width?: number | null
  height?: number | null
  byteSize?: number | null
  imageBlob: Uint8Array
  thumbnailBlob?: Uint8Array | null
  date?: string | null
  notes?: string | null
}
export async function insertRecordImage(db: SQLiteDatabase, input: RecordImageInput): Promise<string>
export async function getRecordImageThumbnail(db: SQLiteDatabase, imageId: string): Promise<Uint8Array | null>
export async function getRecordImageBlob(db: SQLiteDatabase, imageId: string): Promise<{ blob: Uint8Array; mimeType: string } | null>
```
Both read functions use single-row `getFirstAsync` (not `getAllAsync`) per Task 0.5's finding — single-row reads sidestep the web multi-row BLOB issue regardless of whether it's still present.
Depends on: 2.2, 0.5 (confirms whether the `getFirstAsync`-only constraint is load-bearing or precautionary).

**Task 2.8 — Wire images into `condition_records`**
Files: `src/lib/db/queries.ts`.
Extend `ConditionRecordInput` with `imageId?: string | null` and add it to `insertConditionRecord`'s INSERT column list. Fix `getConditionRecords`'s `SELECT` (currently `'SELECT id, record_type, title, color, date FROM condition_records WHERE condition_id = ? ...'`, line 460 — silently drops `image_uri`/`chart_json`/`table_json`/the new `image_id`) to also select `image_id`, and when non-null, LEFT JOIN `record_images` for `mime_type`/`width`/`height` only — never `image_blob`/`thumbnail_blob` in this listing query. Extend the mapped `ConditionRecord` return shape accordingly (paired with Task 5.1's type change).
Depends on: 2.3, 2.7.

**Task 2.9 — `src/lib/db/blob.ts` (new)**
Files: `src/lib/db/blob.ts` (new).
Dependency-free `uint8ArrayToBase64(bytes: Uint8Array): string` / `base64ToUint8Array(b64: string): Uint8Array`, following the no-dependency convention already used in `src/lib/lmf/`. Verify `btoa`/`atob` availability under Hermes/RN 0.85 (per Task 0.5's spike); if unreliable there, implement a manual byte-loop codec instead of adding a base64 package.
Depends on: none.

**Task 2.10 — Fix `backup.ts` for BLOB columns**
Files: `src/lib/db/backup.ts`.
- Add `'record_images'`, `'condition_locations'` to `BACKUP_TABLES` (respecting existing parent-before-child ordering — `record_images` before anything referencing it, `condition_locations` after `conditions`).
- Add `const BLOB_COLUMNS: Record<string, string[]> = { record_images: ['image_blob', 'thumbnail_blob'] }`.
- `buildBackup`: for tables in `BLOB_COLUMNS`, read via `getEachAsync` instead of `getAllAsync` (per Task 0.5), and for each listed column, replace the `Uint8Array` with `uint8ArrayToBase64(...)` before it reaches the `tables[t] = rows` assignment.
- `restoreBackup`: for the same tables/columns, `base64ToUint8Array(...)` the string back into a `Uint8Array` before the existing column-intersection (`PRAGMA table_info`) filtering runs (lines 102-116), so that logic stays untouched.
Depends on: 2.2, 2.9, 0.5.

**Task 2.11 — [Found gap] Add missing longitudinal tables to `BACKUP_TABLES`**
Files: `src/lib/db/backup.ts`.
Not in the original PRD — discovered while reading `backup.ts` directly: `BACKUP_TABLES` currently omits `condition_care_events`, `provider_affiliations`, `facility_relationships`, `provider_facility_roles`, `evidence_sources`, `clinical_events`, and its join tables entirely. Since `pipeline.ts` already populates `condition_care_events`/`provider_affiliations` today, this means the app's multi-provider/multi-facility longitudinal data (the exact nuance this whole effort is built around) **silently does not survive export/import today**, independent of anything else in this task list. Recommend adding at minimum `condition_care_events` and `provider_affiliations` to `BACKUP_TABLES` in the same pass as Task 2.10, in correct parent-child order (`facilities`/`providers`/`conditions` before them). `evidence_sources`/`clinical_events*` can be deferred if not yet populated by any code path — verify before including. Flagging for an explicit decision rather than silently expanding scope.
Depends on: 2.10 (same file, same pass).

**Task 2.12 — Extend demo seed data**
Files: `src/lib/db/seed.ts`.
- Add one placeholder image (small bundled/base64-literal `Uint8Array` defined in the module) via `insertRecordImage`, plus a `condition_records` row with `image_id` set on an existing demo condition, to exercise the real-image UI path in the demo — follow the existing `INSERT OR IGNORE`-with-fixed-id idempotency pattern used throughout this file.
- Add a second `condition_locations` row on the existing `stones` (kidney stones) demo condition, with a fixed id, as the canonical bilateral multi-location example.
- Add `condition_locations` and `record_images` rows to `clearDemoData`'s manual child-first delete cascade (currently deletes `condition_localnames` → `condition_records` → `conditions` → `health_records`, lines 119-133 — insert the two new deletes in the correct child-before-parent position).
Depends on: 2.4, 2.7, 2.8.

**Task 2.13 — Extend fake-DB test fixture**
Files: `__tests__/db/fakeDb.ts`.
Add `condition_locations` and `record_images` to the fixture's `SCHEMA`/`PK` maps, plus the three new columns (`inferred_fields` ×2, `image_id`), so existing fake-DB-based tests keep passing and new tests can target the new tables/columns.
Depends on: 2.1, 2.2, 2.3.

**Task 2.14 — Unit tests for Phase 2**
Files: `src/lib/db/blob.test.ts` (new), extend `tests/lib/queries.test.ts` (or wherever `queries.ts` is tested), extend `tests/lib/backup.test.ts`.
- `blob.test.ts`: base64 round-trip of arbitrary byte arrays, including empty and non-multiple-of-3 lengths.
- Queries: a condition with 2 `condition_locations` rows yields 2 dots sharing one `conditionId` from `getConditionDots`; a condition with 0 location rows synthesizes exactly 1 dot from `conditions.cx/cy`.
- Backup: insert a `record_images` row with a real `Uint8Array` blob, round-trip through `buildBackup` → `JSON.stringify`/`JSON.parse` → `restoreBackup`, assert the restored blob is byte-identical.
Depends on: 2.4, 2.5, 2.10, 2.13.

---

## Phase 3 — Extraction Pipeline Rebuild

**Task 3.1 — Page boundaries in text extraction**
Files: `src/lib/pdf/extract.ts`.
Add `pageBreaks: number[]` (character offsets where each page begins) to the extraction result type.
- Web path: the existing per-page `pdfjs-dist` loop already has a running offset before each `parts.push(pageText)` — just record it.
- Native path: per Task 0.6's benchmark, either switch to a loop of `extractTextFromPage(uri, i)` (1-indexed, confirmed present in `expo-pdf-text-extract`'s type defs) + `getPageCount(uri)`, tracking real offsets, or — if that benchmark showed unacceptable latency — compute a length-proportional estimate (`pageCount` even splits of `text.length`) instead. Document which path was chosen and why in a code comment.
Depends on: 0.6.

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
4. Merge succeeded results: group conditions by normalized `name_medical` + organ/location across chunks into one entry per distinct condition; earliest date wins on conflict; evidence/care_events concatenate.
5. `succeeded.length === 0` → throw `EnrichmentFailedError` (the only remaining all-or-nothing case).
6. Otherwise return `{conditions, measurements, providers, partialFailures}`.
`onChunkProgress?: (completed, total)` replaces `onConditionProgress` with the same call shape as today, so `pipeline.ts`'s `report(1, 0.4 + 0.35*completed/total)` math and `analyzing.tsx` need zero changes.
Depends on: 3.2, 3.3, 3.4.

**Task 3.6 — Wire chunk output into `pipeline.ts`**
Files: `src/lib/pipeline.ts`.
- Persist `inferred_fields` (`JSON.stringify(c.inferred_from_structure ?? [])` or `null`) alongside the existing condition/measurement inserts.
- After `insertCondition` (now returning `{id, cxPercent, cyPercent}` per Task 2.6), insert one `is_primary=1` `condition_locations` row mirroring that computed position, then loop any additional `c.locations` entries via `insertConditionLocation`.
- Trace `enrichment.partialFailures` via the existing `trace()` helper for diagnostics visibility.
Depends on: 2.4, 2.6, 3.5.

**Task 3.7 — Unit tests for Phase 3**
Files: `src/lib/llm/pool.test.ts`, `src/lib/llm/chunk.test.ts` (new), extend `tests/lib/enrich.test.ts`.
- `pool.test.ts`: never exceeds `limit` concurrent in-flight (assert via a counting mock worker), all items processed exactly once, one rejection doesn't block/skip others.
- `chunk.test.ts`: offset slices are exact substrings of the source text (no drift), oversized-section splitting produces valid sub-chunks, tiny sections merge into neighbors.
- `enrich.test.ts`: structure-analysis failure falls back to single-chunk mode; one chunk failing among several still returns partial results (`partialFailures` populated) without throwing; all chunks failing still throws `EnrichmentFailedError`; cross-chunk dedup picks the earliest date and merges evidence for the same condition appearing in two chunks.
Depends on: 3.2, 3.3, 3.4, 3.5.

---

## Phase 4 — Image Capture Pipeline

**Task 4.1 — Page-render wrapper**
Files: `src/lib/pdf/renderPage.ts` (new).
```ts
export async function renderPageToImage(uri: string, pageNumber: number): Promise<{ uri: string; width: number; height: number }>
```
Thin wrapper around whichever library Task 0.3 selected — isolates the rest of the app from that library's exact API shape.
Depends on: 0.3.

**Task 4.2 — Compression module**
Files: `src/lib/media/compress.ts` (new).
```ts
export async function compressImageToTarget(uri: string, maxBytes: number): Promise<{ blob: Uint8Array; width: number; height: number; mimeType: string; byteSize: number }>
```
Uses `expo-image-manipulator` (Task 0.4) with an iterative loop stepping down quality/dimensions until under `maxBytes` (compression output size varies meaningfully by platform per known `expo-image-manipulator` behavior — a single fixed `compress` value isn't reliable). Reads the manipulated file back as bytes via `expo-file-system`.
Depends on: 0.4.

**Task 4.3 — Image-capture step in the pipeline**
Files: `src/lib/pipeline.ts`.
After structure analysis (Task 3.2's output is available in the pipeline by this point via Task 3.6's wiring), for each section flagged `imageWorthy` with a resolved page range: call `renderPageToImage` (4.1) for each page in range, `compressImageToTarget` (4.2), then `insertRecordImage` (2.7) and `insertConditionRecord({..., imageId})` (2.8) linked to whichever condition(s) that section's chunk extraction associated with it. A rendering/compression failure for a given page is caught and skipped (per PRD §8) — never fails the whole record.
Depends on: 4.1, 4.2, 2.7, 2.8, 3.6.

**Task 4.4 — Manual verification**
No new files — verification task.
On iOS simulator + Android emulator dev-client builds, upload a record with real imaging-style pages; confirm images render in the (not-yet-built, see Phase 5) carousel once that lands, and separately confirm via direct SQLite inspection that stored blob sizes are proportionate (hundreds of KB, not multi-MB) and that non-`imageWorthy` pages produced zero rows.
Depends on: 4.3.

---

## Phase 5 — Bodymap UI Wiring

**Task 5.1 — Extend `ConditionRecord` type**
Files: `src/model/conditions.ts`.
Add `imageId?: string | null` and `mimeType?: string | null` to `ConditionRecord` (lazy reference only — never raw bytes inline in this type).
Depends on: none (paired with 2.8's return-shape change).

**Task 5.2 — `useConditionDots` hook**
Files: `src/hooks/useConditions.ts`.
```ts
export function useConditionDots(sourceOverride?: ConditionSource): { conditionId: string; system: SystemId; cx_percent: number; cy_percent: number; yearFrac: number }[]
```
Mirrors the existing `useConditions()` pattern in this same file (state seeded with a safe fallback, `useOptionalDatabase()` + `getConditionDots` in a `useEffect`, `useAppStore`'s `conditionSource` for the default source) — do not introduce a different loading pattern.
Depends on: 2.5.

**Task 5.3 — Refactor dot-rendering components**
Files: `src/app/bodymap.tsx`.
`GhostDots` (line 527), `BodySvg` (595), and `ConditionRipples` (671) currently take `conditions: DesignCondition[]` and read `c.cx_percent`/`c.cy_percent` directly. Change all three to accept the flattened dot list from `useConditionDots()` (5.2) instead — each item already carries `system`/`yearFrac` needed for the existing `activeSystems`/date filtering logic in each component, so the filter predicates need minimal changes (swap `c.system`/`c.yearFrac` reads to the dot's own fields). `pressNearest` (538) resolves a tapped dot's `conditionId` back to the full `DesignCondition` via the existing `useConditions()`-sourced array (still needed for name/date/evidence display) — two parallel lists joined by id at press time, not merged into one. Relocation (`onRelocationPlace`, `updateConditionPositionLocally`) continues to operate on the primary location only this phase — no changes needed to the relocation gesture itself, only to how the resulting position is looked up/written (still via `conditions.cx/cy` for the primary; editing non-primary locations is out of scope per the PRD).
Depends on: 5.2.

**Task 5.4 — Make the image/chart timeline persistent**
Files: `src/app/bodymap.tsx`.
`RecordsCarousel` currently renders only inside `{chatOpen && (...)}` (line 1268). Hoist `{condRecords.length > 0 && <RecordsCarousel records={condRecords} />}` out of that block to render whenever `selectedCondition` is set and the sheet is open (i.e., also inside the `{!chatOpen && selectedCondition && (...)}` branch, or refactored to sit above both branches) — per the PRD, this is its own persistent section, not merged into the chat thread.
Depends on: none directly, but only meaningful to test once 5.5 shows real images.

**Task 5.5 — Real image thumbnails**
Files: `src/app/bodymap.tsx`.
`renderRecordThumb` (line 222) gets an early branch: when `rec.imageId` is set, a small inline component lazily fetches `getRecordImageThumbnail(db, rec.imageId)` (2.7) in a `useEffect` keyed on `imageId`, converts the returned `Uint8Array` to a base64 `data:` URI (via `blob.ts`'s `uint8ArrayToBase64`, Task 2.9), and renders it through `expo-image` (already imported elsewhere in this file, e.g. for `BodyLayers`) with `contentFit="cover"`. Falls back to the existing SVG placeholder art while loading or on fetch error — no layout flash.
Depends on: 2.7, 2.9, 5.1.

**Task 5.6 — Real images in the lightbox**
Files: `src/app/bodymap.tsx`.
`RecordLightbox` (~line 1340) gets the same lazy-fetch pattern as 5.5, but calling `getRecordImageBlob` (2.7, full resolution) only when `lightboxRecord` changes to a record with an `imageId`.
Depends on: 2.7, 2.9, 5.1.

**Task 5.7 — Manual UI regression pass**
No new files — verification task.
Confirm: demo-data flow (`seedDemoData` output) renders visually identical to today (dots in the same positions, carousel showing the same placeholder cards where no real image exists); the seeded bilateral kidney-stones demo condition (Task 2.12) renders two dots that both open the same condition sheet; a condition with a real stored image (from Phase 4 or the demo placeholder) shows a real thumbnail instead of SVG art.
Depends on: 5.3, 5.4, 5.5, 5.6, 2.12.

---

## Phase 6 — Full Verification Pass

**Task 6.1 — Automated suite**
Run `npm run typecheck`, `npx expo lint`, `npm test` (80% coverage target on `src/lib`, `src/model`, `src/store` per `jest.config.js`). All Phase 1–5 unit tests (1.2, 2.14, 3.7) must be green; extend coverage for any new file that falls short.
Depends on: all prior phases.

**Task 6.2 — Large-record manual test**
Build/obtain a synthetic ~80-100 page PDF (chronological visit notes + problem list + a few chart/lab-style pages, fake PII only). On iOS simulator + Android emulator dev-client builds: confirm via `pipeline.ts`'s existing `trace()` logs that LLM attempt count scales with chunk count, not condition count; confirm the progress bar advances smoothly across chunk boundaries with no changes needed in `analyzing.tsx`; force a mid-run 429 (temporarily misconfigure one model in the chain) and confirm the record still completes with partial results instead of a hard failure.
Depends on: 3.5, 3.6, 6.1.

**Task 6.3 — Export/import round trip with real data**
Export the DB (web) after uploading a record that produced real images and multi-location conditions; reimport into a fresh profile; confirm images render correctly, condition locations are preserved, and (per Task 2.11) care-event/provider-affiliation data survives if that gap was addressed.
Depends on: 2.10, 2.11, 4.3, 6.1.

**Task 6.4 — Final acceptance pass**
Walk every bullet in `userDataReq.md` §10 (Acceptance Criteria) explicitly and confirm pass/fail; file follow-up tasks for anything not met rather than silently deferring.
Depends on: 6.1, 6.2, 6.3.
