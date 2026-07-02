# Implementation Plan: mAIgenki

Reference: SPEC.md for requirements, SPEC-research.md for all technology decisions.

---

## Architecture Overview

Three tracks converging at Phase 3:

```
Track A — Pipeline (data)        Track B — UI Shell               Track C — Anatomy Assets
─────────────────────────         ─────────────────────────         ──────────────────────────
Phase 0: Foundation        ──┐
Phase 1: PDF → SQLite      ──┤    Phase 2: UI (3 screens)          Track C: SVG path tracing
                              └──► Phase 3: Integration + Polish ◄── (unblocks Phase 3)
```

Track C (anatomy asset production) is a design task running in parallel with coding.
It does not block Phases 0–2, but must be completed before Phase 3 polish.

**Navigation model (finalized in design handoffs 01–04):**
- 3 Expo Router screens: `index` → `analyzing` → `bodymap`
- Condition detail, chat, and settings are **bottom sheets** within `bodymap`, not separate routes
- Anatomy is rendered as **SVG** (`react-native-svg`, viewBox `0 0 260 460`), not stacked PNGs

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `expo-pdf-text-extract` requires dev build | High | Medium | Set up dev build before testing PDF extraction |
| User uploads scanned (image-based) PDF | Medium | Medium | Detect via text density; show actionable error message |
| LLM returns malformed JSON | High | High | Strict output schema + robust parser with fallback to `[]` |
| OpenRouter free tier rate limits on large PDFs | Medium | Medium | Chunk large PDFs; show progress; surface upgrade prompt |
| Anatomy SVG paths delayed, blocking Phase 3 | Medium | Medium | Placeholder ellipses keep the app functional |
| LLM misclassifies condition to wrong system | Medium | Medium | Clinical inference rules as correction layer |

---

## Phase 0 — Foundation ✓
> Goal: runnable Expo project, all dependencies installed, SQLite schema defined.

- [x] **Task 0.1** — Expo scaffold: NativeWind, Expo Router, Zustand, expo-sqlite, openai, expo-pdf-text-extract, expo-ocr, react-native-svg
- [x] **Task 0.2** — SQLite schema: `health_records`, `conditions`, `measurements`, `medications`, `providers`, `facilities`, `settings` tables + typed query helpers
- [x] **Task 0.3** — OpenRouter client: `callLLMWithFallback<T>`, `DEFAULT_MODELS` fallback chain, `getModelChain` / `updateModelChain` persisted in SQLite
- [x] **Task 0.4** — Core TypeScript types: `OrgSystem` (11 systems), `Condition`, `ConditionStatus`, `HealthRecord` in `src/model/health.ts`
- [x] **Task 0.5** — Model chain auto-refresh: `refreshModelChain` in `src/lib/llm/refresh.ts` — composite score from OpenRouter + arena leaderboard, refreshed every 30 days on launch

---

## Phase 1 — Data Pipeline ✓
> Goal: upload a file → conditions stored in SQLite.

- [x] **Task 1.1** — PDF text extraction (`src/lib/pdf/extract.ts`): `expo-pdf-text-extract`, scanned PDF detection (< 50 chars/page → show error, no in-app OCR)
- [x] **Task 1.1b** — Image OCR (`src/lib/ocr/extract.ts`): `expo-text-extractor` for camera/gallery images
- [x] **Task 1.1c** — PII redaction (`src/lib/privacy/redact.ts`): two-pass sweep before any LLM call; redacts name, DOB, MRN, phone, email, SSN, Taiwan NID, Japan My Number; multilingual label prefixes; medical values preserved
- [x] **Task 1.2** — LLM enrichment (`src/lib/llm/enrich.ts`): plain text → `conditions[]` + `measurements[]` JSON via `callLLMWithFallback`; robust parser strips markdown fences, falls back to `[]` on failure
- [x] **Task 1.3** — Clinical inference rules (`src/lib/inference/rules.ts`): HbA1c, fasting glucose, BP, LDL, cholesterol, Hgb, eGFR thresholds → inferred `Condition[]` with `status: 'inferred'`; deduplicates against LLM conditions
- [x] **Task 1.4** — Pipeline orchestration (`src/lib/pipeline.ts`): `processHealthRecord(uri)` — extract → redact → enrich → infer → save to SQLite → return `HealthRecord`

---

## Phase 2 — UI Shell ✓ (screens built; pipeline not yet wired)
> Goal: navigable 3-screen UI with demo data visible. No live PDF upload yet.
> Architecture: index → analyzing → bodymap (condition detail + settings as bottom sheets).

- [x] **Task 2.0** — SQLiteProvider + demo data seeding
  - `SQLiteProvider` wrapping the Stack in `_layout.tsx`; `onInit` calls `initDatabase` then `seedDemoData`
  - `src/lib/db/seed.ts`: `seedDemoData` (idempotent, guarded by `demo_seeded` settings key), `clearDemoData`, `isDemoDataPresent`
  - 22 demo conditions seeded under a fixed `DEMO_RECORD_ID` health record
  - Files: `src/lib/db/seed.ts`, `src/app/_layout.tsx`

- [x] **Task 2.1** — Upload screen (`src/app/index.tsx`)
  - Dark background; logo (Barlow Condensed "m/" + Bourbon Grotesque "Genki"); tagline
  - 3-column upload zone (tap-to-upload, single interaction)
  - "Explore demo data" CTA → navigates to `bodymap`
  - ⚠️ Pipeline not yet wired — upload tap not yet connected to `processHealthRecord`

- [x] **Task 2.2** — Analyzing screen (`src/app/analyzing.tsx`)
  - 4 phases with animated progress bar and aqua (#1FC3A4) scan line
  - Phases: Reading records → Extracting diagnoses → Mapping anatomy → Building story
  - ⚠️ Phases are timed animations only — not yet driven by real pipeline progress

- [x] **Task 2.3** — Body map screen (`src/app/bodymap.tsx`)
  - NavBar (back | "Health Story" | settings gear)
  - LegendPanel: 11 colored system chips, toggleable, each with an ONLY solo button (layer order per SPEC.md system table)
  - BodySvg: SVG placeholder (viewBox `0 0 260 460`), organ highlight ellipses + condition dots per system
  - Time rail: vertical right side, log-scale K=2.5, 14px inactive / 36px active ticks
  - Tab switcher: Body Map | Timeline (`bodyMapMode` state)
  - UploadPanel FAB (bottom-right)
  - ⚠️ Reads from demo `CONDITIONS` constant — not yet reading from SQLite

- [x] **Task 2.4** — Condition sheet (bottom sheet within bodymap)
  - Animated slide-up on condition dot tap
  - Condition name (localized), date, status badge, ICD code, evidence excerpt
  - CONDITION_RECORDS: 2–3 records per condition (TREND, ECG, IMAGING, LABS, SPIRO, SCAN)
  - Record tap → full-screen lightbox at z-index 100
  - Chat section: educational disclaimer on first message per session; session-only (never persisted)
  - Condition-scoped system prompt only — full record never injected

- [x] **Task 2.5** — Settings sheet (bottom sheet within bodymap)
  - Language selector: en | zh-TW | ja | es
  - DOB picker (for future age-contextualized display)
  - OpenRouter API key input

- [ ] **Task 2.6** — Wire upload → pipeline → bodymap data flow *(next)*
  - `index.tsx`: connect upload zone tap to `processHealthRecord(uri)` → navigate to `analyzing`
  - `analyzing.tsx`: drive progress bar from actual pipeline phase callbacks instead of timers
  - `bodymap.tsx`: read conditions from SQLite via `useSQLiteContext` + `getAllConditions` instead of demo `CONDITIONS`
  - On first real upload: prompt user to keep or delete demo data (`clearDemoData`)
  - Zustand store updated with real `ConditionRow[]` after pipeline completes
  - Files: `src/app/index.tsx`, `src/app/analyzing.tsx`, `src/app/bodymap.tsx`, `src/store/useAppStore.ts`

---

## Phase 3 — Integration & Polish
> Goal: real anatomy SVG paths, body type inference, end-to-end device test.
> Depends on: Phase 2 fully wired + Track C anatomy paths.

- [ ] **Task 3.1** — Replace placeholder SVG ellipses with accurate organ paths
  - Each of the 11 systems gets traced SVG `<Path>` elements in the 260×460 coordinate space
  - Male + female variants (reproductive system differs)
  - Body type inferred from conditions; user prompted only if indeterminate
  - Files: `src/components/anatomy/BodyCanvas.tsx`, organ path constants

- [ ] **Task 3.2** — Body type inference (`src/lib/inference/bodyType.ts`)
  - Scan conditions + evidence text for gender indicators
  - Returns `'male' | 'female' | 'unknown'`; `'unknown'` triggers a one-time user prompt
  - Files: `src/lib/inference/bodyType.ts`

- [ ] **Task 3.3** — Performance validation
  - Profile SVG layer toggling on a mid-range Android device; target 60fps
  - Optimize if needed (fewer paths, memoized SVG, reduced complexity)

- [ ] **Task 3.4** — End-to-end flow test
  - Upload 3 real PDFs: text-based, scanned (expect error), multi-condition history
  - Verify all SPEC.md success criteria met on device

---

## Track C — Anatomy Asset Production (parallel, design task)
> SVG paths in viewBox `0 0 260 460` coordinate space. Must complete before Task 3.1.
> Note: Current implementation uses placeholder ellipses. Final artwork will be traced SVG paths
> (or high-res transparent PNGs composited via react-native-svg `<Image>` — TBD based on art style).

- [ ] **C.1** — Trace or render male anterior body silhouette (integumentary layer)
- [ ] **C.2** — Trace or render male organ paths for 10 internal systems
- [ ] **C.3** — Female variant: reproductive system + any silhouette differences
- [ ] **C.4** — Verify all paths share identical 260×460 coordinate space
- [ ] **C.5** — Export to `src/components/anatomy/paths/` (SVG path strings) or `assets/anatomy/` (PNGs)

---

## Implementation Order

```
Phase 0 ✓ → Phase 1 ✓ → Phase 2 (Task 2.6 remaining)
                                          │
                                          ▼
                              Phase 3 (after 2.6 + Track C)
Track C ────────────────────────────────────────────────►┘
```

**Next up:** Task 2.6 — wire upload → pipeline → body map data flow.
