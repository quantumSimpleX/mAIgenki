# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

mAIgenki is a mobile-first health visualization app. Users upload medical PDFs; the app extracts conditions via LLM, maps them to organ systems, and renders them as toggleable transparent anatomical layers on a human body with a scrollable time axis. All health data stays on-device. No accounts required.

Full spec: `SPEC.md`. Implementation plan: `PLAN.md`. Research log: `SPEC-research.md`.

## Commands

```bash
npx expo start            # dev server (interactive platform picker)
npx expo start --ios      # iOS simulator
npx expo start --android  # Android emulator
npx expo start --web      # browser

npm run typecheck         # tsc --noEmit
npx expo lint             # ESLint
npm test                  # jest --coverage (80% target on src/lib/)
npx eas build             # production build
```

Both `expo-pdf-text-extract` and `expo-ocr` require an **Expo dev build** — Expo Go will not work. Set up the dev build in Phase 0 before testing PDF extraction.

## Architecture

The app has one core data flow:

```
PDF upload
  → src/lib/pdf/extract.ts        (text extraction; OCR fallback for scanned PDFs)
  → src/lib/llm/enrich.ts         (LLM extracts Condition[] from plain text)
  → src/lib/inference/rules.ts    (clinical threshold rules add inferred conditions)
  → src/lib/db/queries.ts         (persist to SQLite via expo-sqlite)
  → Zustand store                 (app/visualize.tsx reads and renders)
```

The UI is three screens deep: upload → anatomy viewer → condition drill-down → condition chat.

**BodyCanvas** (`src/components/anatomy/BodyCanvas.tsx`) is the visual core: it stacks 10 absolute-positioned `Image` components (pre-rendered PNG layers, one per organ system) with transparency. During development, placeholder `View` components stand in until Blender-rendered PNGs are ready in `assets/anatomy/`.

**OpenRouter** is the only network call. The `openai` npm package is used with `baseURL: 'https://openrouter.ai/api/v1'`. No API key is required for free-tier models; the user's key (if set) is read from the Zustand settings store and stored in SQLite.

## Key Types

```typescript
// src/model/health.ts
type OrgSystem = 'cardiovascular' | 'respiratory' | 'digestive' | 'musculoskeletal'
  | 'nervous' | 'endocrine' | 'urinary' | 'reproductive' | 'immune' | 'integumentary'

type ConditionStatus = 'documented' | 'resolved' | 'inferred'

type Condition = {
  id: string; name: string; organ: string; system: OrgSystem
  date: string; status: ConditionStatus; evidence: string; sourceFile: string
}
```

`status: 'inferred'` means the condition was derived from a clinical threshold rule (e.g., persistent BP ≥ 140/90 → hypertension), not explicitly stated in a record. Inferred conditions must be visually distinguished from documented ones everywhere they appear.

## Anatomy Asset Naming

PNG files in `assets/anatomy/` follow: `{system}_{male|female}.png`
All 20 files (10 systems × 2 body types) must share **identical canvas dimensions** (1080×1920px) so they align when stacked. Body type is inferred from records; user is prompted only if indeterminate.

## Code Style

- 2-space indent, single quotes, no semicolons
- Named exports everywhere except Expo Router screens (which must default-export)
- No `any` — use `unknown` and narrow with type guards
- Functions: verb phrases with explicit return types (`async function extractConditionsFromText(text: string): Promise<Condition[]>`)
- Co-locate types with the module that owns them; re-export shared types from `src/model/`

## Hard Constraints

These are non-negotiable — ask before changing any of them:

- **No remote storage of health data.** SQLite on-device only. Raw PDFs never leave the device; only extracted plain text is sent to OpenRouter.
- **No cloud storage, no auth** until explicitly scoped for a later phase.
- **Condition chat is session-only** — never persist chat history to SQLite.
- **Chat context is scoped to one condition** — never inject the full health record into the LLM prompt.
- **The educational disclaimer must appear** before the first chat message in every session. It cannot be permanently dismissed.
- **Never let the LLM recommend treatments or medications.** Never claim clinical accuracy.
- **The OpenRouter API key is never logged** and only transmitted to `openrouter.ai`.
