# PRD: User Data Flow — PDF Upload to Bodymap Display

Covers the complete pipeline: user uploads a medical PDF/image → text extraction → structure-aware enrichment → clinical inference → SQLite persistence → rendering on the bodymap. This is the current-phase spec for `doc.userDataFlow/` (see `kb1-TODO`/`kb2-CODE`/`kb3-TEST`/`kb4-DONE` for per-task tracking), same role as `doc.lmFallbackBuild/lmfPlan.md` for its phase.

## 1. Objective

The existing pipeline (`processHealthRecord` in `src/lib/pipeline.ts`) fails on real-world records: extraction hangs and hits OpenRouter rate limits on 50–100 page uploads, provider attribution is inaccurate, and the schema cannot represent conditions occurring at multiple body locations or store any image/chart evidence (X-rays, MRI, CT, endoscopy, lab-trend charts). This PRD defines the target behavior across the full upload→display path so mAIgenki can function as a reliable longitudinal "health explorer," not just a demo.

## 2. Scope

**In scope**: text extraction page-boundary plumbing; a structure/hierarchy analysis stage; chunked, concurrency-bounded LLM enrichment with partial-failure tolerance; structurally-inferred-field provenance; provider-attribution accuracy; multi-location condition support; per-condition image/chart capture and storage; export/import (backup) integrity for binary data; bodymap rendering of multi-location dots and a persistent per-condition image timeline.

**Out of scope**: chat UI/session-only chat behavior (unchanged, still governed by existing hard constraints); OCR image-upload path beyond what's already implemented; storing the whole original PDF file (explicitly rejected — see §5.8); editing non-primary condition locations via the relocation UI (view-only this phase); any cloud sync/account system.

## 3. User Journey (target state)

1. User picks a PDF (or photo) via the existing upload flow (`src/app/index.tsx` → `analyzing.tsx`).
2. Text is extracted on-device, with page numbers preserved.
3. PII is redacted before any network call (unchanged, `src/lib/privacy/redact.ts`).
4. The record's structure (chronological / problem-based / mixed, with heading hierarchy) is analyzed in one LLM call.
5. The record is split into sections per that structure and extracted **concurrently, in bounded batches** — not resent in full per condition.
6. Conditions, measurements, providers, care events, multi-location data, and image-worthy page flags are merged across sections.
7. Clinical threshold rules add inferred conditions (unchanged, `src/lib/inference/rules.ts`).
8. Image-worthy pages are rendered, compressed, and stored as BLOBs, linked to the record and to the condition(s) they support.
9. Everything persists to SQLite; progress reports at each boundary (existing mechanism, unchanged).
10. The bodymap renders one hotspot dot per condition location (multiple dots for multi-location conditions), and each condition's card shows a persistent, DB-backed image/chart timeline in addition to the existing session-only chat.
11. A partially-successful upload (some sections failed) still produces a usable result instead of a hard failure.

## 4. Current State vs. Target State

| Concern | Current | Target |
|---|---|---|
| Extraction calls | 1 inventory call + 1 full-record-resend call **per condition** (N+1, sequential) | 1 structure call + M **section-chunk** calls (bounded concurrency, section text only) |
| Failure mode | Any one failed call aborts the whole record (`EnrichmentFailedError`) | Only total wipeout (zero successful sections) aborts; partial results otherwise persist |
| Provider linking | Condition with no explicit provider gets linked to **every** provider in the document | Condition gets linked only to providers with direct evidence (explicit field or care event) |
| Condition location | One location per condition (`conditions.cx`/`cy`) | N locations per condition (`condition_locations`), each an independent hotspot dot |
| Images | None — `condition_records.image_uri` is an unused path string; no BLOB storage anywhere | Compressed images stored as BLOBs in `record_images`, linked to record + optional conditions |
| Inferred fields | No distinction between explicit and inferred data | Fields filled from structural context (not restated text) are marked (`inferred_fields`) |
| Backup/export | Would silently corrupt any BLOB column (`JSON.stringify` on `Uint8Array`) | Base64-encoded round-trip for all BLOB columns |

## 5. Functional Requirements

### 5.1 Text extraction with page boundaries

- `src/lib/pdf/extract.ts` must return `pageBreaks: number[]` (character offsets per page start) alongside existing `text`/`pageCount`.
- Native: use `expo-pdf-text-extract`'s per-page API (`extractTextFromPage`, `getPageCount` — confirmed present) instead of only the flattened `extractTextWithInfo()`. If per-page native calls prove too slow on large PDFs (benchmark required), fall back to a length-proportional page-boundary estimate — this only weakens exact page↔chunk/image mapping, not extraction correctness.
- Web: preserve the page index already available in the existing `pdfjs-dist` loop (currently discarded).

### 5.2 Structure & hierarchy analysis

- One LLM call classifies the record's `organization` (`chronological | problem_based | mixed`) and returns an ordered list of `sections`, each with heading text, character offsets, an inherited/inferred date (if the section is a dated block), a coarse `sectionType` (`visit | problem_list | labs | imaging | summary | other`), an `imageWorthy` flag, and resolved page range.
- Chunk boundaries are computed deterministically in code from the returned offsets (re-anchored via heading-string search if offsets drift) — the LLM never generates chunk text itself, preventing hallucinated content.
- **Failure fallback**: if structure analysis fails outright, treat the whole record as one synthetic section (`organization: mixed`) — equivalent to today's single-call behavior, never a hard failure at this stage.

### 5.3 Chunked, concurrent enrichment

- Oversized sections split further (paragraph boundaries, inheriting the parent section's provenance); trivially small sections merge into their neighbor rather than costing a dedicated call.
- Chunks are extracted with **bounded concurrency** (pool of 2–3 concurrent LLM calls, not fully parallel and not fully sequential), since free-tier rate limits are roughly per-API-key.
- Each chunk's extraction prompt includes its section heading, section type, and inherited date, and instructs the model to explicitly list any field it filled from that context rather than from text restated in the chunk (`inferred_from_structure`).
- Cross-chunk merge: conditions are grouped by normalized name (+ organ/location) across all chunks into one entry each; earliest date wins on conflict; evidence and care events concatenate.
- **Partial-failure behavior**: a chunk that fails (after normal model-fallback exhaustion) is recorded in `partialFailures` and excluded from the merge — the record still completes using whatever chunks succeeded. Only zero successful chunks is a hard failure.
- Progress reporting keeps its existing external contract (`onProgress(phase, fraction)`) — no changes required in `analyzing.tsx`.

### 5.4 Clinical inference rules

Unchanged. `applyInferenceRules` continues to run once on the fully merged `conditions`/`measurements` arrays.

### 5.5 Provider attribution

- A condition is linked to a provider only when there is direct evidence connecting them: either the chunk extraction's per-condition `provider` field, or a `condition_care_events` row (provider + facility + date + event type).
- The current blanket fallback — attaching *every* provider found anywhere in the document to any condition lacking an explicit provider — is removed. This is a correctness fix with no loss of legitimately-evidenced linkage, since care events already cover the well-evidenced case.

### 5.6 Multi-location conditions

- A condition is one entity (one set of dates/evidence/status) that may have **multiple location rows**: e.g. bilateral kidney stones, a fracture at several points along a limb.
- Each location independently renders a hotspot dot on the bodymap; tapping any dot opens the same condition detail/timeline (not a separate condition).
- Legacy/demo conditions with no explicit multi-location data render exactly as they do today (single dot, synthesized from the condition's own position).
- Editing a location's position via the existing relocation gesture applies to the primary location only this phase; editing additional locations is future work.

### 5.7 Image/chart capture and storage

- **What gets captured**: only pages flagged `imageWorthy` by the structure-analysis stage (§5.2) are rendered — never all pages of a large report.
- **What gets stored**: the rendered page image, compressed to a target byte budget (iterative compression loop, since output size varies meaningfully by platform), as a BLOB — never the whole original PDF file (rejected: 10–50x larger for a full raster of a scanned 100-page report vs. a handful of compressed clinical images; filename + page number is sufficient provenance for "which report this came from").
- **Linkage**: every image always attaches to its source health record. It may additionally link to zero, one, or many conditions (e.g. a shared summary chart, or an image genuinely relevant to no specific condition stays attached to the record only, never orphaned).
- **Storage location**: new `record_images` table (BLOB + metadata), linked into the existing per-condition `condition_records` timeline abstraction via a nullable `image_id` — reusing established UI plumbing rather than duplicating it.
- **Lazy loading**: list/browse views never select the raw BLOB, only lightweight metadata (dimensions, mime type); the full image loads only when a user opens the lightbox.
- **New native dependency required**: no library in the current stack can extract or render PDF images/pages on native iOS/Android (`expo-pdf-text-extract` is confirmed text-only). A native PDF-page-render library must be added. **Open decision, resolve via a Phase 0 spike** (not pre-committed): `react-native-pdf-jsi` (popular, has an Expo config plugin, but is a full PDF-viewer package with bundled zoom/search/bookmarks/analytics — more than this feature needs, and "analytics" in a no-telemetry health app warrants scrutiny) vs. `react-native-pdf-page-image` (minimal single-purpose wrapper around the same PDFKit/PdfRenderer libraries already used by `expo-pdf-text-extract`, but far less battle-tested). Spike both against a real multi-page PDF on iOS simulator + Android emulator before committing.

### 5.8 Export/import integrity

- `src/lib/db/backup.ts`'s `buildBackup`/`restoreBackup` must base64-encode/decode every BLOB column (`record_images.image_blob`, `.thumbnail_blob`) before/after JSON serialization — without this fix, a `Uint8Array` serializes as `{"0":1,"1":2,...}` and corrupts on export, breaking the hard constraint that users can export/import the complete database.
- Any query reading a BLOB column must use `getEachAsync` or single-row `getFirstAsync` — not `getAllAsync` — due to a known web-platform (wa-sqlite/OPFS) issue where multi-row BLOB reads can return corrupted memory. Verify against the installed `expo-sqlite` version at implementation time.

### 5.9 Bodymap display

- Hotspot dot rendering (`GhostDots`, `BodySvg`, `ConditionRipples` in `src/app/bodymap.tsx`) reads from a flattened per-location dot list (one row per condition-location) instead of one dot per condition — multi-location conditions render multiple dots, all resolving back to the same condition on tap.
- The per-condition image/chart timeline (`RecordsCarousel`, already built but currently only rendered inside the chat view) becomes its own persistent section, visible whenever a condition is selected — not gated on chat being open. It sits alongside, not merged into, the existing session-only chat.
- Thumbnails render the real stored (compressed) image when present, lazily fetched, falling back to today's placeholder art while loading or if absent.

## 6. Data Model Changes

New tables:

```sql
CREATE TABLE condition_locations (
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

CREATE TABLE record_images (
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
```

Additive migrations to existing tables:
```
ALTER TABLE conditions ADD COLUMN inferred_fields TEXT      -- JSON array of structurally-inferred field names
ALTER TABLE measurements ADD COLUMN inferred_fields TEXT
ALTER TABLE condition_records ADD COLUMN image_id TEXT REFERENCES record_images(id)
```

`condition_records` (existing table) is reused as the many-to-many image↔condition surface: multiple `condition_records` rows may share one `image_id` when an image is relevant to multiple conditions; a `record_images` row with zero referencing `condition_records` rows is a record-level, unattributed image.

New query functions needed in `src/lib/db/queries.ts`: `insertConditionLocation`, `getConditionLocations`, `getConditionDots` (bulk dot list with legacy single-dot fallback), `insertRecordImage`, `getRecordImageThumbnail`, `getRecordImageBlob` (both single-row lazy fetches).

## 7. Non-Functional Requirements

- **Reliability**: a record with N sections and one failing section must still produce a usable result (N-1 sections' worth of data), not a total failure.
- **Rate-limit resilience**: bounded concurrency (2–3 in flight) must not exceed what free-tier OpenRouter keys can sustain for a large record; the existing per-model cooldown mechanism (`src/lib/llm/service.ts`) continues to apply per concurrent call.
- **Storage budget**: image storage must be proportionate — hundreds of KB per stored image, not multi-MB — validated by the compression loop, and no whole-PDF storage.
- **Privacy**: no change to existing constraints — raw PDF/image bytes are never sent to an LLM; only extracted, redacted text and (locally rendered/compressed) images that never leave the device are involved. Any new native image-rendering dependency must not introduce network calls or telemetry.
- **Backward compatibility**: existing installs must migrate additively (`ALTER_COLUMNS_SQL` pattern) with no data loss; legacy single-location conditions and existing demo data must render unchanged.

## 8. Error Handling & Partial Failure

- Structure-analysis failure → single-section fallback (§5.2), never a hard failure by itself.
- Individual chunk-extraction failure → excluded from merge, recorded in `partialFailures`, record still completes.
- Zero successful chunks → `EnrichmentFailedError`, same as today's total-failure UX in `analyzing.tsx`.
- Image rendering/compression failure for a given page → skip that image, do not fail the record.

## 9. Open Decisions / Risks

1. **PDF-page-render library** — unresolved, see §5.7. Requires a Phase 0 spike before Phase 3 (image capture) work begins.
2. **Native per-page text extraction latency** — unbenchmarked; may require the length-proportional fallback for page boundaries on very large PDFs.
3. **Compression target** — exact byte-size budget per image not yet fixed; needs a concrete number once real imaging-page samples are available.

## 10. Acceptance Criteria

- Uploading an 80–100 page synthetic record (chronological notes + problem list + chart/lab-style pages) on a dev-client build completes without hitting `EnrichmentFailedError` under normal conditions, and produces a partial-but-usable result when a mid-run rate-limit is forced.
- LLM attempt count in pipeline traces scales with section-chunk count, not condition count.
- A condition with no explicit provider and no care event produces zero `condition_providers` rows (regression test against today's over-attachment bug).
- A bilateral/multi-point condition renders multiple hotspot dots, all opening the same condition sheet.
- A stored image survives export → reimport with byte-identical content.
- Demo-data flow (unchanged inputs) renders visually identical to today post-migration.

## 11. Out of Scope / Future Work

- Editing non-primary condition locations from the UI.
- Surfacing `inferred_fields` provenance visually to the user (data is captured this phase; UI treatment is future work).
- Any image extraction on the web platform beyond what `pdfjs-dist` already does incidentally.
- OCR-sourced (photo upload) image capture — this PRD covers the PDF path only.

## 12. Dependencies / Phased Ordering

1. **Phase 0**: spike PDF-render library candidates; confirm expo-sqlite BLOB behavior; add `expo-image-manipulator`/`expo-file-system`; benchmark native per-page text extraction.
2. **Phase 1**: schema + query layer + backup fix (§6, §5.8) — additive, safe to ship alone.
3. **Phase 2**: extraction rebuild (§5.1–5.3) + provider-linking fix (§5.5) together (both touch `pipeline.ts`'s persistence loop).
4. **Phase 3**: image capture (§5.7), depends on Phase 0's library choice and Phase 2's `imageWorthy` flags.
5. **Phase 4**: bodymap UI wiring (§5.9), depends on Phase 1's queries and Phase 3's real images.

The provider-linking fix (§5.5) is a small, isolated change and may ship ahead of the rest independently.
