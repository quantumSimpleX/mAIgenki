# lmfTask.md — LMF/BYOK build task index

Authoritative task breakdown of **both Part A and Part B** of `lmfPlan.md`.

- **Part A** (`pA##`) — the generic, reusable LMF design (sections A1–A9): the dependency-free
  `src/lib/lmf/` module itself (types, errors, registry, adapters, engine, routing, model
  selection, key handling, OAuth PKCE logic).
- **Part B** (`pB##`) — the mAIgenki app integration (Phase 1–8 as literally labeled in
  lmfPlan.md): wiring the Part A module into the app's call sites, storage, UI, and nudges.
  (Part B's own "Phase 1" — LMF core + adapters + tests — is the phase that builds Part A; its
  distinct scope beyond building `src/lib/lmf/` itself is folded into each `pA##` task's own
  test-plan/QA cycle, so there is no separate `pB01`.)

## Conventions

- **ID format**: `pX##-T##` — `X` = `A` or `B` (which Part of lmfPlan.md), `##` = the section/phase
  number within that Part (`pA02`..`pA09` = lmfPlan.md sections A2–A9; `pB02`..`pB08` = lmfPlan.md
  Part B Phase 2–8), `T##` = sequential task within that section/phase. All numbers zero-padded.
  (A1, the user-journey spec, is narrative with no dedicated file to create, so it has no `pA01`
  task — its content is referenced by other tasks, e.g. degradation-ladder fields in `pB04-T01`.)
- **Status source of truth**: the kanban folders at `doc.lmFallbackBuild/kanban/{TODO,CODE,TEST,DONE}/`.
  A task's status = the folder its `.md` card currently lives in. This table is a **synced index**,
  updated as cards move. If they ever drift, the kanban folder wins.
- Status values: `TODO` (in TODO/), `CODE` (in CODE/, being implemented), `TEST` (in TEST/, QA running),
  `DONE` (in DONE/).
- **Deviations from lmfPlan.md test file naming**: the plan names one `tests/lib/lmf/adapters.test.ts`.
  To let the three adapter tasks run in parallel without write-conflicting on one file, each adapter task
  owns its own test file (`openaiCompat.test.ts`, `anthropic.test.ts`, `gemini.test.ts`). Same intent,
  better parallelism.
- **Post-audit follow-up tasks** (Step 7): if the UI/UX audit surfaces new work, tasks are appended to the
  Part/section they belong to, or to a new `pB09` "UX follow-ups" phase if they fit no existing phase.
  Documented here when added.

## Task table

### Part A — generic LMF module (`src/lib/lmf/`)

| ID | Title | Section | Depends-On | Status | Description |
|---|---|---|---|---|---|
| pA02-T01 | adapterIface | A2 | pA03-T01 | DONE | Create `lmf/adapters/types.ts` — Adapter interface (buildRequest/parseResponse/classifyError). |
| pA02-T02 | providerRegistry | A2 | pA03-T01 | DONE | Create `lmf/registry.ts` — ProviderSpec + BUILT_IN_PROVIDERS (11 providers). |
| pA02-T03 | lmfIndexBarrel | A2 | pA02-T01, pA02-T02, pA03-T01, pA04-T01, pA05-T01..T03, pA06-T01, pA07-T01, pA09-T01 | DONE | Create `lmf/index.ts` public surface + "porting LMF" header comment. |
| pA03-T01 | mkCoreTypesErrs | A3 | — | DONE | Create `lmf/types.ts` + `lmf/errors.ts` (ChatMessage/Request/Result, Candidate/Route, LMFProfile, injected ifaces; LMFErrorKind, classifyHttp, redactSecrets). |
| pA04-T01 | fallbackEngine | A4 | pA02-T01, pA02-T02, pA05-T01 | DONE | Create `lmf/engine.ts` + test (callWithFallback, cooldown ledger, retry/jitter, timeout, abort, redaction). |
| pA05-T01 | openaiCompatAdapter | A5 | pA02-T01, pA02-T02 | DONE | Create `lmf/adapters/openaiCompat.ts` + test (wire shape, response_format degrade, token-param swap). |
| pA05-T02 | anthropicAdapter | A5 | pA02-T01, pA02-T02 | DONE | Create `lmf/adapters/anthropic.ts` + test (Messages API, browser CORS header). |
| pA05-T03 | geminiAdapter | A5 | pA02-T01, pA02-T02 | DONE | Create `lmf/adapters/gemini.ts` + test (generateContent, x-goog-api-key). |
| pA06-T01 | buildRoute | A6 | pA03-T01 | DONE | Create `lmf/route.ts` + test (tier routing, fallbackToFree dedupe, cooldown fall-through). |
| pA07-T01 | modelsValidateKey | A7/A8 | pA02-T02, pA05-T01 | DONE | Create `lmf/models.ts` (listModels + CURATED_MODELS) + `lmf/validateKey.ts` + test. |
| pA09-T01 | openrouterPkce | A9 | pA03-T01 | DONE | Create `lmf/oauth/openrouterPkce.ts` + test (pure PKCE-S256, crypto/fetch injected). |

**Part A total: 11 tasks.**

### Part B — mAIgenki integration (Phase 2–8)

| ID | Title | Phase | Depends-On | Status | Description |
|---|---|---|---|---|---|
| pB02-T01 | lmfService | 2 | pA04-T01, pA06-T01, pA02-T03 | DONE | Create `src/lib/llm/service.ts` composition root (tier-0 route + free chain, telemetry, lmfChat/lmfEnrich). |
| pB02-T02 | clientShim | 2 | pB02-T01 | DONE | Reshape `client.ts` over service; flip env-vs-user key precedence; update `tests/lib/llm.test.ts`. |
| pB02-T03 | enrichThrows | 2 | pB02-T01 | DONE | `enrich.ts` throws `EnrichmentFailedError`; `analyzing.tsx` catches → error (not empty bodymap); update enrich test. |
| pB02-T04 | chatUseLmf | 2 | pB02-T01 | DONE | `bodymap.tsx sendMessage()` routes via `lmfChat` (uses profile/keystore chain). |
| pB02-T05 | pipelineUseService | 2 | pB02-T01 | DONE | `pipeline.ts`/`analyzing.tsx` route from service; apiKey optional; stop reading `openrouter_api_key` directly. |
| pB03-T01 | installNativeDeps | 3 | — | DONE | `npx expo install expo-secure-store expo-crypto`; add secure-store plugin to app.json. |
| pB03-T02 | keyStoreImpl | 3 | pB03-T01, pA03-T01 | DONE | Create `src/lib/llm/keystore.ts` (SecureStore native / localStorage web / in-memory fallback) + test. |
| pB03-T03 | profileMigration | 3 | pB03-T02 | DONE | Create `src/lib/llm/profile.ts` (`lmf_profile` JSON KV + idempotent `openrouter_api_key` migration) + test. |
| pB03-T04 | backupSecretExclude | 3 | — | DONE | `src/lib/db/backup.ts` SECRET_SETTING_KEYS denylist on export + restore + test both directions. |
| pB04-T01 | storeLlmFields | 4 | — | DONE | Add `llmTier`/`llmStatus`/`lastLlmFailureKind` + setters to `useAppStore`. |
| pB04-T02 | providerSettingsUi | 4 | pB03-T02, pB03-T03, pA07-T01, pB04-T01 | DONE | Create `src/components/ProviderSettings.tsx` (status, connect CTA, picker, key entry, validate, model picker, baseURL, fallback toggle, disconnect). |
| pB04-T03 | mountSettingsSection | 4 | pB04-T02 | DONE | Mount ProviderSettings as "AI Provider" section in SettingsSheet (`bodymap.tsx`). |
| pB04-T04 | telemetryToStore | 4 | pB04-T01, pB02-T01 | DONE | Wire service Telemetry callbacks → store llmStatus/failureKind setters. |
| pB05-T01 | oauthConnect | 5 | pA09-T01, pB03-T02, pB03-T03 | DONE | Create `src/lib/llm/oauth.ts` `connectOpenRouter()` (expo-web-browser + expo-crypto + expo-linking) + test. |
| pB05-T02 | oauthRoute | 5 | pB05-T01 | DONE | Create `src/app/oauth/openrouter.tsx` completion route (web + native cold-launch). |
| pB05-T03 | connectWiring | 5 | pB05-T01, pB04-T02 | DONE | Wire Connect OpenRouter button in ProviderSettings → connectOpenRouter → tier 1 + model prompt. |
| pB06-T01 | analyzingNudges | 6 | pB04-T01, pB04-T03, pB02-T05 | DONE | `analyzing.tsx` degraded banner + exhausted CTA → `openSettingsSection:'provider'` flag. |
| pB06-T02 | chatErrorNudge | 6 | pB04-T01, pB02-T04 | DONE | `bodymap.tsx` chat error becomes kind-aware; rate/quota → inline "Connect your account" chip. |
| pB06-T03 | firstChatCard | 6 | pB02-T04 | DONE | First-chat one-time card (tier 0 + `lmf_first_chat_nudge_seen`); dismissal persists; never replaces disclaimer. |
| pB07-T01 | refreshSimplify | 7 | — | DONE | `refresh.ts`: delete arena.ai scrape; score from OpenRouter `/models?max_price=0` only; update `llm-refresh.test.ts`. |
| pB07-T02 | refreshWire | 7 | pB07-T01, pB02-T01 | DONE | Wire `shouldRefresh` 30-day gate into service init; fire-and-forget `refreshModelChain`. |
| pB08-T01 | coverageGaps | 8 | pB02, pB03, pB04, pB05, pB06, pB07 done | DONE | Coverage ≥80% on `src/lib/lmf`, `src/lib/llm`, `src/store`; fill gaps. |
| pB08-T02 | docsPortNote | 8 | pA02-T03, pB02-T01 | DONE | Docs: CLAUDE.md pointer to lmfPlan.md, `.env.example` env-key tier-0 note, porting note in `lmf/index.ts`. |
| pB08-T03 | removeOpenaiDep | 8 | pB02-T02 | DONE | Remove unused `openai` npm dependency (verify no `src/` usage first). |
| pB08-T04 | hardConstraintAudit | 8 | all pA (pA02–pA09) and pB02–pB07 done | DONE | Audit hard constraints: redacted text only, key header only to own baseURL, key never logged, chat session-only, disclaimer ordering, no treatment claims. |
| pB09-T01 | wireByokIntoCallSites | 9 | pB02-T01, pB03-T02, pB03-T03, pB04-T02, pB05-T01 done | TODO | Follow-up filed by pB08-T04's audit: chat/pipeline never pass `profile`/`keys` into `lmfChat`/`lmfEnrich`, so a connected BYOK provider is never actually used at runtime — wire it in. |

**Part B total: 26 tasks** — pB02:5, pB03:4, pB04:4, pB05:3, pB06:3, pB07:2, pB08:4, pB09:1.

**Grand total: 37 tasks** (Part A: 11, Part B: 26).
