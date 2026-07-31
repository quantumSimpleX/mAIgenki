# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## What This Is

mAIgenki is a mobile-first health visualization app. Users upload medical PDFs; the app extracts conditions via LLM, maps them to organ systems, and renders them as toggleable transparent anatomical layers on a human body with a scrollable time axis. All health data stays on-device. No accounts required.

This project is pinned to **Expo SDK 56** (React Native 0.85, React 19). Expo's APIs change between SDKs — consult the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing native/Expo code, not older examples.

**Docs in this repo:** `doc.InitialCoreBuild/SPEC.md` (full spec), `doc.InitialCoreBuild/PLAN.md` (implementation plan), `doc.InitialCoreBuild/SPEC-research.md` (research log). Historical / lower-authority now that core development is done: `doc.InitialCoreBuild/task.md` (dev-subagent task checklist + QA bug log), `doc.InitialCoreBuild/test.md` (QA-subagent test plan + results), and `mAIGenki-handoff/` (the original Codex-design handoff that seeded the build — mostly implemented, so treat as background reference rather than a spec to follow). `doc.lmFallbackBuild/lmfPlan.md` (LLM provider fallback/BYOK design) is the current-phase plan; task/test docs for this phase land in `doc.lmFallbackBuild/` as work proceeds.

## Commands

```bash
npx expo start            # dev server (interactive platform picker)
npx expo start --ios      # iOS simulator
npx expo start --android  # Android emulator
npx expo start --web      # browser

npm run typecheck         # tsc --noEmit
npx expo lint             # ESLint
npm test                  # jest --coverage (80% lines target on src/lib, src/model, src/store)
npx jest __tests__/lib/inference.test.ts   # run one test file
npx jest -t 'hypertension'                 # run tests matching a name
npx eas build             # production build
```

Tests live in **two** roots — `__tests__/` and `tests/` — and `jest.config.js` matches both. The `@/` import alias maps to `src/`.

Both `expo-pdf-text-extract` and `expo-ocr` require an **Expo dev build** — Expo Go will not work. Set up the dev build in Phase 0 before testing PDF extraction.

## Architecture

The app has one core data flow, orchestrated end-to-end by `src/lib/pipeline.ts` (`processHealthRecord`):

```
PDF/image upload
  → src/lib/pdf/extract.ts        (text extraction)
  → src/lib/ocr/extract.ts        (OCR path for image-based input)
  → src/lib/privacy/redact.ts     (strip PII before any network call)
  → src/lib/llm/enrich.ts         (LLM extracts conditions + measurements from plain text)
  → src/lib/inference/rules.ts    (clinical threshold rules add inferred conditions)
  → src/lib/db/queries.ts         (persist record, conditions, measurements to SQLite)
  → src/store/useAppStore.ts      (Zustand store; src/app/bodymap.tsx reads and renders)
```

Screens are Expo Router route files in `src/app/`, wrapped in a tab bar (`src/components/app-tabs`): `index.tsx` (upload/home), `analyzing.tsx` (pipeline progress), `bodymap.tsx` (the anatomy viewer — also hosts the condition drill-down and the session-only condition chat + disclaimer), and `explore.tsx` (secondary info tab).

Two condition shapes coexist: the snake_case LLM/DB extraction shape (`name_medical`, `name_common`, `severity`, `certainty`, `date_onset`, …) defined in `src/lib/llm/enrich.ts` and persisted via `src/lib/db/`, and the simpler canonical display `Condition` in `src/model/health.ts` (below). Separately, `src/model/conditions.ts` holds a hardcoded demo dataset (`CONDITIONS: DesignCondition[]`) used for design/preview rendering.

**Body canvas** (in `src/app/bodymap.tsx`: `BodyLayers` + `BodySvg`) is the visual core: it stacks 11 absolute-positioned `Image` components (transparent PNG layers, one per organ system) toggled by `activeSystems`, with the condition hotspot dots drawn on top in SVG. The current layers are interim 2D art (`assets/maigenki-systems-2colorized/`), pending Blender-rendered PNGs.

**OpenRouter** is the only network call. The `openai` npm package is used with `baseURL: 'https://openrouter.ai/api/v1'`. No API key is required for free-tier models; the user's key (if set) is read from the Zustand settings store and stored in SQLite.

**LMF (LLM fallback → BYOK) layer**, see `doc.lmFallbackBuild/lmfPlan.md` for the full design: a dependency-free `src/lib/lmf/` module tries a route of candidate providers/models in order, falling back on failure, and supports users bringing their own provider key/OAuth connection when the shared tier-0 pool is exhausted. Provider connection UI lives in `src/components/ProviderSettings.tsx`, mounted in `bodymap.tsx`'s SettingsSheet.

## Key Types

```typescript
// src/model/health.ts
// 11 systems, ordered to match the legend (top → bottom) and the NN- asset prefix.
type OrgSystem = 'integumentary' | 'muscular' | 'skeletal' | 'cardiovascular'
  | 'nervous' | 'digestive' | 'respiratory' | 'renal' | 'lymphatic'
  | 'endocrine' | 'reproductive'

type ConditionStatus = 'documented' | 'resolved' | 'inferred'

type Condition = {
  id: string; name: string; organ: string; system: OrgSystem
  date: string; status: ConditionStatus; evidence: string; sourceFile: string
}
```

`status: 'inferred'` means the condition was derived from a clinical threshold rule (e.g., persistent BP ≥ 140/90 → hypertension), not explicitly stated in a record. Inferred conditions must be visually distinguished from documented ones everywhere they appear.

## Anatomy Asset Naming

PNG files follow `NN-{system}.png`, where `NN` is the legend order (`00`–`10`; `00` is the back layer, `10` the front) and `{system}` is the full `OrgSystem` name. Layer stacking order matches the `OrgSystem` union above. A `-m`/`-f` suffix is added only for gender-specific layers (currently just `10-reproductive-m.png`; no `-f` yet). Layers live in three sibling folders by processing stage: `maigenki-systems-0ORIG` (raw), `-1noBG` (background removed), `-2colorized` (display layers used in the build). All files in a folder share **identical canvas dimensions** (1018×2436px) so they align when stacked. Body type is inferred from records; user is prompted only if indeterminate.

## Code Style

- 2-space indent, single quotes, no semicolons
- Named exports everywhere except Expo Router screens (which must default-export)
- No `any` — use `unknown` and narrow with type guards
- Functions: verb phrases with explicit return types (`async function extractConditionsFromText(text: string): Promise<Condition[]>`)
- Co-locate types with the module that owns them; re-export shared types from `src/model/`

## Hard Constraints

These are non-negotiable — ask before changing any of them:

- **No app-managed remote storage of health data.** The on-device SQLite database is the complete, portable source of truth. Store every structured record and binary asset required to reconstruct the body-map explorer—including embedded X-rays and other report images—in SQLite, using BLOB columns where appropriate; do not rely on app-private file paths or the OS photo library. Users may explicitly export the complete database to their computer or chosen cloud drive and later import it. Raw PDF/image bytes are never sent to an LLM; only extracted plain text is sent to OpenRouter.
- **No cloud storage, no auth** until explicitly scoped for a later phase.
- **Condition chat is session-only** — never persist chat history to SQLite.
- **Chat context is scoped to one condition** — never inject the full health record into the LLM prompt.
- **The educational disclaimer must appear** before the first chat message in every session. It cannot be permanently dismissed.
- **Never let the LLM recommend treatments or medications.** Never claim clinical accuracy.
- **The OpenRouter API key is never logged** and only transmitted to `openrouter.ai`.
