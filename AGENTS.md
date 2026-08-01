# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## What This Is

mAIgenki is a health visualization web app, fully responsive across desktop and mobile browsers. Users upload medical PDFs; the app extracts conditions via LLM, maps them to organ systems, and renders them as toggleable transparent anatomical layers on a human body with a scrollable time axis. All health data stays on-device, in the browser. No accounts required.

## Platform

mAIgenki is a **browser-only web application**. There is no native iOS/Android build, no Expo dev-client, and no app-store distribution — the project dropped native mobile builds early on because of their toolchain cost, and now ships as a single responsive web app.

It is built with **Expo Router and React Native Web** (Expo SDK 56, React Native 0.85, React 19) as the UI framework — this is a build-tooling choice, not a native-mobile one. Expo Router + RN Web already render responsively across desktop and mobile browser widths, so there is no separate "mobile app" to build. Do not request a dev-client build, reference iOS/Android simulators/emulators, or add native-only Expo modules (anything requiring `expo-dev-client` or an EAS native build) — none of that applies here. `npm run android`/`npm run ios` still exist in `package.json` as leftover scripts from before this pivot; they are not part of this project's workflow.

Consult versioned Expo docs at https://docs.expo.dev/versions/v56.0.0/ for the web-relevant APIs still in use (Expo Router, `expo-image`, `expo-document-picker`, etc.) — don't assume older/generic examples apply.

**Docs in this repo:** `doc.InitialCoreBuild/SPEC.md` (full spec), `doc.InitialCoreBuild/PLAN.md` (implementation plan), `doc.InitialCoreBuild/SPEC-research.md` (research log) — written during the original native-mobile phase; treat their platform/toolchain details as historical, their product/data-model content as still current. `doc.InitialCoreBuild/task.md` and `test.md` are historical dev/QA logs. `mAIGenki-handoff/` is the original design handoff, background reference only. `doc.lmFallbackBuild/lmfPlan.md` is the LLM provider fallback/BYOK design; its kanban board lives in `doc.lmFallbackBuild/kanban/`. `doc.userDataFlow/userDataReq.md` (PRD) and `userDataTask.md` (task breakdown) are the current-phase plan — the PDF-upload-to-bodymap pipeline rebuild, including the SQLite→IndexedDB storage migration; `doc.userDataFlow/prompt.userData.md` is the multi-agent build prompt for that phase's kanban board (`doc.userDataFlow/kb1-TODO/` … `kb4-DONE/`).

## Commands

```bash
npx expo start --web      # dev server (opens in the browser)
npm run vercel-build      # production web build (npx expo export -p web)

npm run typecheck         # tsc --noEmit
npx expo lint             # ESLint
npm test                  # jest --coverage (80% lines target on src/lib, src/model, src/store)
npx jest __tests__/lib/inference.test.ts   # run one test file
npx jest -t 'hypertension'                 # run tests matching a name
```

Tests live in **two** roots — `__tests__/` and `tests/` — and `jest.config.js` matches both. The `@/` import alias maps to `src/`.

PDF text and image extraction run entirely in the browser via `pdfjs-dist` — no dev-client or native build is required for any part of the upload pipeline. OCR for image-based (scanned) records is an open gap: the project's original OCR path (`src/lib/ocr/extract.ts`) used a native-only library and has no web replacement wired in yet — don't assume it works until that's resolved.

## Architecture

The app has one core data flow, orchestrated end-to-end by `src/lib/pipeline.ts` (`processHealthRecord`):

```
PDF/image upload
  → src/lib/pdf/extract.ts        (text + image extraction, via pdfjs-dist)
  → src/lib/ocr/extract.ts        (OCR path for image-based input — web replacement pending, see Commands)
  → src/lib/privacy/redact.ts     (strip PII before any network call)
  → src/lib/llm/enrich.ts         (LLM extracts conditions + measurements from plain text)
  → src/lib/inference/rules.ts    (clinical threshold rules add inferred conditions)
  → src/lib/db/                   (persist record, conditions, measurements to IndexedDB)
  → src/store/useAppStore.ts      (Zustand store; src/app/bodymap.tsx reads and renders)
```

**Storage is IndexedDB** (browser-native), via `src/lib/db/indexedDb.ts` and `indexedDbBackup.ts` — the sole persistence layer. The project's original design used `expo-sqlite` for health records, and later kept it around only for the LLM provider profile/model-chain/OAuth-verifier settings; both have since been fully migrated onto IndexedDB's `settings` object store (`getIndexedSetting`/`putIndexedSetting`/`deleteIndexedSetting`), the `expo-sqlite` dependency has been removed, and the legacy `schema.ts`/`queries.ts`/`backup.ts`/`snapshot.ts`/`seed.ts`/`provider.tsx` files have been deleted. mAIgenki never launched before this cutover, so there was no user data to migrate.

Screens are Expo Router route files in `src/app/`, wrapped in a tab bar (`src/components/app-tabs`): `index.tsx` (upload/home), `analyzing.tsx` (pipeline progress), `bodymap.tsx` (the anatomy viewer — also hosts the condition drill-down and the session-only condition chat + disclaimer), and `explore.tsx` (secondary info tab).

Two condition shapes coexist: the snake_case LLM/DB extraction shape (`name_medical`, `name_common`, `severity`, `certainty`, `date_onset`, …) defined in `src/lib/llm/enrich.ts` and persisted via `src/lib/db/`, and the simpler canonical display `Condition` in `src/model/health.ts` (below). Separately, `src/model/conditions.ts` holds a hardcoded demo dataset (`CONDITIONS: DesignCondition[]`) used for design/preview rendering.

**Demo data is a stereotypical result of the extraction/enrichment stage, not a separate feature.** Treat `CONDITIONS`/`CONDITION_RECORDS` as the hand-authored output that `src/lib/llm/enrich.ts` would have produced for a fictional patient — extraction/OCR/LLM calls are correctly skipped (there's no real document), but everything downstream of that point (clinical inference rules, persistence via the same repository/query functions `processHealthRecord` uses, and rendering via the same UI components) must be the identical code path real uploaded data goes through. There must be no demo-only storage branch, demo-only query function, or demo-only rendering component — if a change touches how real data is persisted or displayed, verify the demo path still goes through it too.

**Body canvas** (in `src/app/bodymap.tsx`: `BodyLayers` + `BodySvg`) is the visual core: it stacks 11 absolute-positioned `Image` components (transparent PNG layers, one per organ system) toggled by `activeSystems`, with the condition hotspot dots drawn on top in SVG. The current layers are interim 2D art (`assets/maigenki-systems-2colorized/`), pending Blender-rendered PNGs.

**OpenRouter** is the only network call. The `openai` npm package is used with `baseURL: 'https://openrouter.ai/api/v1'`. No API key is required for free-tier models; the user's key (if set) is read from the Zustand settings store and stored in IndexedDB.

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

- **No app-managed remote storage of health data.** The on-device IndexedDB database is the complete, portable source of truth. Store every structured record and binary asset required to reconstruct the body-map explorer — including embedded X-rays and other report images — in IndexedDB, as Blob values in object stores; do not rely on server storage or any remote database. Users may explicitly export the complete database to their computer or a chosen cloud drive and later import it. Raw PDF/image bytes are never sent to an LLM; only extracted plain text is sent to OpenRouter.
- **No cloud storage, no auth** until explicitly scoped for a later phase.
- **Condition chat is session-only** — never persist chat history to IndexedDB.
- **Chat context is scoped to one condition** — never inject the full health record into the LLM prompt.
- **The educational disclaimer must appear** before the first chat message in every session. It cannot be permanently dismissed.
- **Never let the LLM recommend treatments or medications.** Never claim clinical accuracy.
- **The OpenRouter API key is never logged** and only transmitted to `openrouter.ai`.
- **Portable backups (`indexedDbBackup.ts`) intentionally include the `settings` store as-is, API key included.** This is a deliberate product decision, not an oversight: the backup/restore feature exists so a user can fully restore their working setup (including their own provider key) on another device or after clearing storage, without re-entering it. The file is the user's own export, written to a destination they choose (local disk or their own cloud drive) — same trust boundary as any other file they create. If they choose to share that file elsewhere, that's their call, not the app's; don't add a secret-stripping filter to the backup path.
