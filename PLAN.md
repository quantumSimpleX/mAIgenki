# Implementation Plan: mAIgenki

Reference: SPEC.md for requirements, SPEC-research.md for all technology decisions.

---

## Architecture Overview

Three independent tracks that converge in Phase 3:

```
Track A — Pipeline (data)        Track B — UI Shell               Track C — 3D Assets (design)
─────────────────────────         ─────────────────────────         ─────────────────────────
Phase 0: Project setup     ──┐
Phase 1: PDF → SQLite      ──┤    Phase 2: UI with placeholders    Phase D: Blender renders
                              └──► Phase 3: Integration + polish ◄── (unblocks Phase 3)
```

Track C (3D asset production) is a design task that runs in parallel with all coding.
It does not block Phases 0–2, but must be done before Phase 3 polish.

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `expo-pdf-text-extract` + `expo-ocr` require dev build — breaks Expo Go workflow | High | Medium | Set up dev build in Phase 0; don't rely on Expo Go |
| LLM returns malformed JSON for condition extraction | High | High | Strict output schema in prompt + robust parser with fallback |
| Stacking 10 high-res PNGs causes frame drops on older devices | Medium | High | Test with placeholder layers in Phase 2; optimize in Phase 3 |
| OpenRouter free tier rate limits hit on large PDFs | Medium | Medium | Chunk large PDFs; show progress; surface upgrade prompt |
| Anatomy 3D art task delayed, blocking Phase 3 | Medium | Medium | Placeholder layers keep app functional; art is non-blocking |
| Female reproductive system gap in Z-Anatomy base model | Known | Low | MPFB 2 handles female body; already in plan |
| LLM misclassifies condition to wrong organ system | Medium | Medium | Clinical inference rules as a correction layer; user can report |

---

## Phase 0 — Foundation
> Goal: runnable Expo project with all dependencies installed and SQLite schema defined.
> Everything else is blocked on this.

- [x] **Task 0.1 — Expo project scaffold**
  - `npx create-expo-app mAIgenki --template expo-template-blank-typescript`
  - Install: `nativewind`, `expo-router`, `zustand`, `expo-sqlite`, `openai`, `expo-pdf-text-extract`, `expo-ocr`, `react-native-svg`
  - Configure NativeWind + Tailwind
  - Configure Expo Router (file-based navigation)
  - Verify: `npx expo start --web` shows blank screen with no errors
  - Files: `app.json`, `babel.config.js`, `tailwind.config.js`, `package.json`

- [x] **Task 0.2 — SQLite schema**
  - Define tables: `health_records`, `conditions`, `settings`
  - Write typed query helpers in `src/lib/db/`
  - Verify: unit tests for insert + query on each table
  - Files: `src/lib/db/schema.ts`, `src/lib/db/queries.ts`, `tests/lib/db.test.ts`

- [x] **Task 0.3 — OpenRouter client + dynamic model chain**
  - Raw fetch against `openrouter.ai/api/v1` (no openai package)
  - `callLLMWithFallback<T>` — walks model chain, never throws on model error, accepts `validate()` callback
  - `DEFAULT_MODELS` — 5 free models ordered by medical extraction quality (Hermes 3 405B → Llama 3.2 3B)
  - `getModelChain(db)` / `updateModelChain(db, models)` — chain persisted in SQLite settings as JSON
  - Files: `src/lib/llm/client.ts`, `tests/lib/llm.test.ts`

- [x] **Task 0.5 — Model chain auto-refresh**
  - `refreshModelChain(db, apiKey)` in `src/lib/llm/refresh.ts`
  - Step 1: `GET openrouter.ai/api/v1/models?max_price=0` → free model list + `benchmarks.artificial_analysis` scores
  - Step 2: fetch `arena.ai/leaderboard`, use LLM chain to extract Document ELO + Instruction Following ELO for the free models
  - Step 3: composite score = `intelligence_index×0.35 + agentic_index×0.25 + document_elo×0.25 + instruction_elo×0.15` (normalised; missing data redistributes weights)
  - Step 4: sort descending, take top 5, call `updateModelChain`; persist `llm_chain_last_checked` timestamp
  - Triggered on app launch if `llm_chain_last_checked` is absent or >30 days old; runs silently in background
  - Verify: unit tests for scoring logic, weight redistribution when arena data is missing, 30-day trigger gate
  - Files: `src/lib/llm/refresh.ts`, `tests/lib/llm-refresh.test.ts`

- [x] **Task 0.4 — Core TypeScript types**
  - Define `OrgSystem`, `Condition`, `ConditionStatus`, `HealthRecord` in `src/model/health.ts`
  - Files: `src/model/health.ts`

---

## Phase 1 — Data Pipeline
> Goal: upload a PDF → conditions stored in SQLite.
> Depends on: Phase 0.

- [ ] **Task 1.1 — PDF text extraction**
  - Implement `src/lib/pdf/extract.ts`
  - Text-based PDFs: `expo-pdf-text-extract`
  - Scanned PDFs: detect empty text → fall back to `expo-ocr` (render pages as images → OCR)
  - Returns: `{ text: string; pageCount: number; method: 'text' | 'ocr' }`
  - Verify: test with a real text-based PDF and a scanned PDF; both return non-empty text
  - Files: `src/lib/pdf/extract.ts`, `tests/lib/pdf.test.ts`

- [ ] **Task 1.2 — Clinical inference rules**
  - Implement `src/lib/inference/rules.ts`
  - Rules: persistent BP ≥ 140/90 → hypertension, fasting glucose ≥ 126 mg/dL → diabetes, etc.
  - Input: raw extracted text; output: `Condition[]` with `status: 'inferred'`
  - Verify: unit tests for each rule with sample text inputs
  - Files: `src/lib/inference/rules.ts`, `tests/lib/inference.test.ts`

- [ ] **Task 1.3 — LLM condition enrichment**
  - Implement `src/lib/llm/enrich.ts`
  - Prompt: extract all medical conditions from text, return structured JSON array with `name`, `organ`, `system`, `date`, `status`, `evidence`
  - Merge with inference rule output (deduplicate; prefer documented over inferred)
  - Robust parser: validate JSON schema, fallback to empty array on parse failure
  - Verify: integration test with sample medical text → returns valid `Condition[]`
  - Files: `src/lib/llm/enrich.ts`, `tests/lib/enrich.test.ts`

- [ ] **Task 1.4 — Pipeline orchestration**
  - Implement end-to-end flow: file picked → extract text → enrich → save to SQLite
  - Expose as `processHealthRecord(uri: string): Promise<HealthRecord>`
  - Verify: pick a real PDF → query SQLite → conditions present
  - Files: `src/lib/pipeline.ts`

---

## Phase 2 — UI Shell (placeholder anatomy)
> Goal: complete navigable UI with placeholder anatomy layers. No real PNG assets yet.
> Depends on: Phase 0. Can run in parallel with Phase 1.

- [ ] **Task 2.1 — BodyCanvas with placeholder layers**
  - `src/components/anatomy/BodyCanvas.tsx` — stacks absolute-positioned `View` components
  - Each of 10 systems = a colored semi-transparent rounded rect at approximate anatomical position
  - Props: `activeSystems: OrgSystem[]`, `conditions: Condition[]`, `bodyType: 'male' | 'female'`
  - Tapping a layer calls `onSystemPress(system: OrgSystem)`
  - Verify: all 10 layers render; toggling shows/hides correctly; tap fires callback
  - Files: `src/components/anatomy/BodyCanvas.tsx`

- [ ] **Task 2.2 — Layer toggle controls**
  - `src/components/anatomy/LayerControls.tsx` — horizontal scrollable list of system toggles
  - Each toggle shows system name, color dot, active state
  - Verify: toggling a system updates `activeSystems` in Zustand store
  - Files: `src/components/anatomy/LayerControls.tsx`, `src/store/health.ts`

- [ ] **Task 2.3 — Timeline scrubber**
  - `src/components/timeline/TimeScrubber.tsx`
  - Horizontal slider spanning earliest → latest condition date in the record
  - Dragging filters `conditions` to those with `date ≤ selectedDate`
  - Verify: dragging scrubber to an earlier date removes future conditions from BodyCanvas
  - Files: `src/components/timeline/TimeScrubber.tsx`

- [ ] **Task 2.4 — Upload screen**
  - `app/index.tsx` — file picker (expo-document-picker), triggers pipeline, shows progress
  - On completion: navigates to `/visualize`
  - Shows disclaimer: app is not a medical device
  - Verify: pick a PDF → spinner → navigate to visualize screen
  - Files: `app/index.tsx`

- [ ] **Task 2.5 — Visualize screen**
  - `app/visualize.tsx` — composes BodyCanvas + LayerControls + TimeScrubber
  - Reads conditions from SQLite via Zustand
  - Verify: conditions from uploaded PDF appear as highlighted placeholder regions
  - Files: `app/visualize.tsx`

- [ ] **Task 2.6 — Condition drill-down screen**
  - `app/condition/[id].tsx` — shows condition name, date, status badge (documented/inferred), evidence text excerpt
  - "Ask about this" button → navigates to chat screen
  - Verify: tapping a highlighted layer opens correct condition detail
  - Files: `app/condition/[id].tsx`

- [ ] **Task 2.7 — Condition chat screen**
  - `app/condition/[id]/chat.tsx` — simple FlatList-based chat UI
  - Shows disclaimer banner before first message (every session)
  - `src/lib/llm/chat.ts` — injects condition context into system prompt, streams response
  - Session-only: chat state cleared on unmount
  - Verify: ask a question → LLM responds with condition-aware answer; disclaimer shown
  - Files: `app/condition/[id]/chat.tsx`, `src/lib/llm/chat.ts`

- [ ] **Task 2.8 — Settings screen**
  - `app/settings.tsx` — OpenRouter API key input (masked), model selector dropdown, body type selector
  - Key stored in SQLite settings table; body type inferred from records by default
  - Verify: enter key → subsequent LLM calls use it; model selection persists across restarts
  - Files: `app/settings.tsx`

---

## Phase 3 — Integration & Polish
> Goal: real anatomy PNG assets, performance validation, end-to-end flow working on device.
> Depends on: Phase 1 + Phase 2 + Track C (3D assets).

- [ ] **Task 3.1 — Integrate real anatomy PNGs**
  - Replace placeholder `View` components in `BodyCanvas` with `Image` components loading system PNGs
  - All PNGs: 1080×1920px, transparent background, same coordinate space
  - Male + female variants loaded based on inferred body type
  - Verify: all 10 layers render correctly; conditions highlight correct anatomical regions
  - Files: `src/components/anatomy/BodyCanvas.tsx`, `assets/anatomy/`

- [ ] **Task 3.2 — Body type inference**
  - `src/lib/inference/bodyType.ts` — scan conditions + evidence text for gender indicators
  - Falls back to asking user if confidence < threshold
  - Verify: record with clear gender indicators → correct body type selected automatically
  - Files: `src/lib/inference/bodyType.ts`

- [ ] **Task 3.3 — Performance validation**
  - Profile BodyCanvas on an older mid-range Android device (target: 60fps layer toggle)
  - If frame drops: implement image caching, reduce PNG resolution, or use `react-native-fast-image`
  - Verify: toggling all 10 layers simultaneously stays above 50fps
  - Files: vary based on findings

- [ ] **Task 3.4 — End-to-end flow test**
  - Upload 3 real PDFs (text-based, scanned, cumulative history)
  - Verify all success criteria in SPEC.md are met
  - Fix any gaps found

---

## Track C — 3D Asset Production (parallel, design task)
> Independent of all coding phases. Must complete before Task 3.1.

- [ ] **C.1** — Install Blender + Z-Anatomy template + MPFB 2 plugin
- [ ] **C.2** — Set up toon/NPR shader (Eevee, illustrated style)
- [ ] **C.3** — Configure render: 1080×1920px, transparent background, anterior view
- [ ] **C.4** — Render male base silhouette (integumentary/skin layer)
- [ ] **C.5** — Render male organ system layers (9 systems × 1 PNG each)
- [ ] **C.6** — Render female body variant (silhouette + reproductive system differences)
- [ ] **C.7** — Export all PNGs to `assets/anatomy/` with consistent naming: `{system}_{male|female}.png`
- [ ] **C.8** — Verify all PNGs share identical canvas dimensions and coordinate space

---

## Implementation Order Summary

```
Phase 0 (foundation)
    ├── Phase 1 (pipeline)    ─┐
    └── Phase 2 (UI shell)   ─┴─► Phase 3 (integration)
Track C (3D assets) ───────────────────────────────────►┘
```

Start Phase 0 immediately. Phase 1 and Phase 2 can proceed in parallel once Phase 0 is complete. Phase 3 waits for Phase 1 + Phase 2 + Track C.

Total coding estimate: ~4–5 weeks solo. Track C (3D art) is the longest-pole dependency if not started in parallel.
