# P08: OpenRouter OAuth Onboarding, Free-Model Selection & Gated Document Intake

## Scope

Tasks 8.1–8.13 in `doc.userDataFlow/userDataTask.md`, implementing `userDataReq.md` §5.0. This phase changes the landing-page flow to establish a verified OpenRouter connection before rendering PDF/photo intake, while keeping the explore demo always available and reusing the existing LMF/BYOK/OAuth/pipeline code.

The initial user path is OpenRouter single-click PKCE authorization. The onboarding path never asks a non-technical user to create, copy, paste, or type an API key. After OAuth, the model picker exposes only OpenRouter `:free` models; the selected free model is attempted first and the existing free fallback chain is automatically used on rate-limit/failure.

## Out Scope

- Replacing the dependency-free LMF engine, adapters, cooldown ledger, route builder, or existing OpenRouter PKCE implementation.
- Adding an app account, remote profile, cloud sync, server-side credential storage, or any remote health-data store.
- Sending raw PDFs, images, or unredacted text to any service.
- Native-only QR or Expo dev-client work; this project remains a browser-only responsive web app.
- Redesigning the bodymap, condition chat, extraction, inference, or IndexedDB health-record schema beyond the connection/profile metadata needed for this gate.

## Dependencies

- Phases 0–7 in `kb4-DONE` remain the data-flow baseline.
- Existing LMF/BYOK cards pA02–pA09 and pB02–pB08 are the implementation foundation.
- `doc.lmFallbackBuild/kanban/TODO/pB09-T01-wireByokIntoCallSites.md` is a blocking dependency or must be completed as Task 8.1/8.9: a connected profile must actually reach upload and chat routes.
- Existing `src/lib/llm/oauth.ts`, `src/app/oauth/openrouter.tsx`, `src/components/ProviderSettings.tsx`, `src/lib/llm/profile.ts`, `src/lib/llm/keystore.ts`, `src/lib/llm/refresh.ts`, `src/lib/lmf/route.ts`, and `src/lib/lmf/engine.ts` are to be reused, not forked.

## Assigned Agents

- ArchAgent: /root (coordination)
- DevAgent: /root/dev_phase08
- QAAgent: pending independent QA pass

## Allowed Files/Directories

`src/app/index.tsx`, `src/app/oauth/openrouter.tsx` only for narrow redirect compatibility changes, `src/components/ProviderSettings.tsx`, new onboarding/presentation component(s), `src/hooks/useLlmConnection.ts` if used, `src/lib/llm/connection.ts`, `src/lib/llm/connectionBundle.ts`, `src/lib/llm/oauth.ts` only for narrow result/cleanup changes, `src/lib/llm/profile.ts`, `src/lib/llm/keystore.ts`, `src/lib/llm/service.ts`, `src/lib/llm/client.ts`, `src/lib/llm/refresh.ts`, `src/lib/lmf/types.ts`, `src/lib/lmf/models.ts`, `src/lib/lmf/route.ts`, `src/lib/lmf/validateKey.ts`, `src/lib/lmf/engine.ts`, `src/lib/pipeline.ts`, `src/app/analyzing.tsx`, `src/app/bodymap.tsx`, `src/lib/db/indexedDbProvider.tsx`, `src/store/useAppStore.ts` only for existing LLM synchronization, `package.json`/`package-lock.json` only for a verified web-compatible QR dependency, and corresponding tests/docs.

## Product/implementation invariants

- Upload controls render only in the canonical `ready` state; loading, missing, invalid, offline, and unverified states remain gated.
- The demo CTA is always rendered at the bottom and never calls OAuth or connection validation.
- OAuth credentials live only in the existing `KeyStore`; profile metadata/verification state lives in IndexedDB settings. No credential is logged.
- OpenRouter onboarding and OpenRouter Settings show free models only; no paid model or free-text escape hatch.
- Onboarding profiles persist `fallbackToFree: true`; route/chain reads sanitize all fallback candidates to OpenRouter free IDs.
- JSON/QR recovery is device-to-device, versioned, explicitly warns that it contains a credential, validates before commit, and never contains health data.

## Implementation Checklist

- [ ] **P08-01 — Task 8.1: Connection contract and pB09 call-site dependency** — define readiness states/verification metadata; ensure upload/chat use the persisted profile and real `KeyStore`; remove stale legacy-key reads from the user path.
- [ ] **P08-02 — Task 8.2: Shared connection state/controller** — reuse `loadProfile`, `makeKeyStore`, `validateKey`, `connectOpenRouter`; handle IndexedDB loading/unavailable, live validation, retries, and serialized actions.
- [ ] **P08-03 — Task 8.3: Reusable ProviderSettings/onboarding controller** — refactor existing ProviderSettings logic into shared handlers; onboarding mode is OpenRouter-only and contains no API-key field.
- [ ] **P08-04 — Task 8.4: Free-model catalog and chain hardening** — centralize the existing `:free` predicate, use `/models?max_price=0` refresh/defaults, filter picker and persisted chain, dedupe selected primary.
- [ ] **P08-05 — Task 8.5: Landing OpenRouter PKCE action** — connect from a direct user gesture; reuse existing pending-verifier/redirect/cancel/error behavior; keep intake gated after OAuth until model validation.
- [ ] **P08-06 — Task 8.6: Free-model selection and verification** — select a free default/model, validate without health data, persist tier 1/profile/key-source/verification metadata/fallback-on, unlock only after success.
- [ ] **P08-07 — Task 8.7: Local JSON/QR connection recovery** — versioned provider-only bundle, KeyStore/profile atomic import/export, credential warning, web-compatible QR encode/decode spike, camera/image fallback, no remote service.
- [ ] **P08-08 — Task 8.8: Landing gate and demo/offline behavior** — hide/guard PDF/photo handlers until ready; preserve demo at bottom, local-data/offline behavior, responsive/accessibility requirements, and no first-paint upload flash.
- [ ] **P08-09 — Task 8.9: Real pipeline route and automatic free fallback** — complete/consume pB09; selected free model first, existing free chain after rate-limit/cooldown, no paid/non-OpenRouter request, existing progress/errors preserved.
- [ ] **P08-10 — Task 8.10: Restore/disconnect/legacy/Settings interoperability** — auto-restore/recheck, disconnect clears credential/profile gate without health-data deletion, migration remains idempotent, Settings and landing stay synchronized.
- [ ] **P08-11 — Task 8.11: Automated coverage** — state/controller, OAuth, free models/refresh/route/engine, bundle/QR, ProviderSettings, upload screen, pipeline/profile routing, and regression tests.
- [ ] **P08-12 — Task 8.12: Browser end-to-end/manual acceptance** — fresh setup, OAuth cancel/success, free picker, validation gate, 429 fallback, returning restore, JSON/QR recovery, disconnect, offline/demo, mobile/desktop accessibility.
- [ ] **P08-13 — Task 8.13: Final acceptance/security/documentation handoff** — walk §5.0/§10, audit secret/data boundaries, record QR support/limitations, and move only with honest evidence.

## Acceptance Criteria

From `userDataReq.md` §5.0 and §10:

- A fresh landing page shows the OpenRouter connection card and Explore demo, but no PDF/photo intake or API-key input.
- OpenRouter OAuth PKCE completes from a direct user gesture; cancel, dismiss, expired verifier, exchange failure, and network failure leave intake gated and recoverable.
- After successful OAuth and model validation, only free OpenRouter model IDs are selectable; the chosen free model and verified profile restore from local storage on a later visit.
- The chosen model is attempted first and an existing free fallback model succeeds automatically after a mocked/observed rate limit; no paid model or non-OpenRouter endpoint is called.
- JSON/QR provider recovery works in a fresh browser profile, warns before importing a credential, writes only profile/key state, and leaves health stores unchanged.
- Disconnect immediately gates intake again while demo and existing local data remain usable.
- Offline/IndexedDB-unavailable states never expose upload as if ready; demo/local records remain available with truthful messaging.
- Automated tests, typecheck, lint, and browser acceptance are recorded with pre-existing failures separated from Phase 08 findings.

## Required Validation

- `npm run typecheck`
- `npx expo lint`
- Targeted Jest suites for OAuth, ProviderSettings, connection state/bundle, models/refresh/route/engine, upload screen, and pipeline/profile routing.
- `npm test` with coverage; record any pre-existing failures separately.
- Browser verification with `npx expo start --web` and available browser automation/manual tooling at desktop and narrow mobile widths. Use a test/mocked OpenRouter account only; no real credential in logs, screenshots, fixtures, or commits.
- Manual network inspection confirms only OpenRouter receives the OpenRouter credential and only redacted extracted text is sent during analysis.

## Implementation Record

Implementation started by `/root/dev_phase08` on 2026-08-03.

- Added connection readiness/controller (`src/lib/llm/connection.ts`, `src/hooks/useLlmConnection.ts`) with IndexedDB/KeyStore migration and unavailable-storage handling.
- Added `LlmOnboarding` with direct OpenRouter PKCE sign-in, free-only model discovery/selection, validation, and local profile persistence.
- Gated landing PDF/photo controls while keeping demo CTA visible.
- Restricted OpenRouter ProviderSettings catalog and saves to `:free` models.
- Added provider-only JSON bundle validation/import primitives (`connectionBundle.ts`) and browser file-based recovery UI (`ConnectionRecovery.tsx`) with explicit credential warning/confirmation. Added local QR generation/decoding primitives with `qrcode`/`jsqr`; recovery UI now displays a QR image. `npm install qrcode jsqr @types/qrcode` succeeded.
- Added `verifiedAt` metadata so a restored/legacy profile does not unlock intake until model validation succeeds.
- Fixed bodymap condition chat to load persisted `LMFProfile` and `KeyStore` instead of the removed legacy settings API-key row.
- Hardened bundle import: validate OpenRouter key/model before writes, persist `verifiedAt`, and best-effort rollback prior key/profile if either write fails.
- Added connection and bundle unit tests.

Validation: targeted connection/bundle Jest suites PASS (QR suite 3 tests); `npx tsc --noEmit --pretty false` and `npx expo lint` pass. Full `npm test -- --runInBand` has 2 ProviderSettings test failures (`screen.getAllByText` unsupported by installed testing-library renderer); all other suites pass. Browser OAuth/manual acceptance remains unrun because it requires a mocked account/browser session.

Follow-up validation: replaced the two unsupported `screen.getAllByText('Connect')[0]` matchers with `screen.getByText('Connect')`; `tests/components/ProviderSettings.test.tsx` now passes all 3 tests. Coordinator Playwright verification at localhost:8088 confirmed desktop and 390px mobile landing gates, PKCE popup/cancel messaging, demo CTA availability, and no console errors. Full OAuth success and QR decode remain dependent on mocked credentials/device image input.

## QA Record

Audit run 2026-08-03 (independent of DevAgent claims).

### Commands/results

- `npx jest --runInBand tests/lib/llm/connection.test.ts tests/lib/llm/connectionBundle.test.ts --coverage=false` — PASS (2 suites, 4 tests).
- `npm test -- --runInBand tests/lib/llm/connection.test.ts tests/lib/llm/connectionBundle.test.ts` — assertions PASS, command FAIL because selecting two suites cannot meet the repository-wide 80% coverage threshold (3.93% lines).
- `npm run typecheck` — PASS.
- `npx expo lint` — PASS, no lint errors.
- Browser/OAuth manual acceptance — BLOCKED; no mocked OpenRouter account/browser session available.

### §5.0 acceptance audit

- Fresh landing gate/demo visibility: **PASS by code inspection** (`src/app/index.tsx`).
- PKCE success/cancel/error semantics: **PARTIAL/BLOCKED**; wrapper maps outcomes, browser flow not exercised.
- Free-only model selection: **PASS by code inspection and unit coverage**.
- Selected-model-first/free fallback: **FAIL** for condition chat. `src/app/bodymap.tsx` still reads legacy `openrouter_api_key` and calls `lmfChat` without persisted profile/KeyStore; OAuth credentials and selected profile are not routed to chat.
- JSON/QR recovery: **FAIL**. `importConnectionBundle` writes KeyStore before profile (non-atomic), and imported profile omits `verifiedAt`; `isVerifiedLlmProfile` therefore keeps intake gated after import. No regression tests cover either case.
- Disconnect/restore/offline/demo/accessibility: **BLOCKED** for browser/manual verification; no disconnect path was found in the new recovery component.

### Reproducible defects

1. **Chat ignores OAuth profile/KeyStore (blocking).** `src/app/bodymap.tsx` around `sendMessage` (1264–1265) passes only legacy `apiKey`/`db` to `lmfChat`. Expected: pass verified profile and `makeKeyStore()` (or shared controller), using selected free model and fallback chain. Actual: OAuth-connected chat can use empty legacy key/tier-0 routing.
2. **Connection bundle import is not atomic (blocking).** `src/lib/llm/connectionBundle.ts:22–27` sets credential before profile persistence; profile-write failure leaves partial credential state.
3. **Imported profile cannot unlock intake (blocking).** Import creates no `verifiedAt`, but readiness requires it. UI reports “Connection restored” while landing remains gated indefinitely.

**QA disposition: FAIL / return to DevAgent.** Do not move to `kb4-DONE` until defects 1–3 are fixed and regression-tested. Browser PKCE and responsive/accessibility acceptance remains blocked pending a runnable mocked-account/manual session.

### Retest 2026-08-03

- Inspected fixes: `bodymap.tsx` now loads `loadProfile` and `makeKeyStore` and passes both to `lmfChat`; no legacy `openrouter_api_key` read remains in the chat path. `connectionBundle.ts` now validates the key/model before writes, sets `verifiedAt`, and restores prior key/profile on write failure (best effort).
- Targeted suites (`connection`, `connectionBundle`, OAuth, provider settings, refresh, route, engine, pipeline): **PASS** — 8 suites, 94 tests.
- `npm run typecheck`: **PASS**.
- `npx expo lint`: **PASS** (0 errors, 3 warnings in `connectionBundle.ts`: duplicate profile import and no-unused-expression warning; warnings should be cleaned before final polish).
- `npm test`: **PASS** — full suite and coverage passed (83.42% statements, 85.62% lines).
- Browser OAuth/manual, responsive, QR camera/import, network inspection: **BLOCKED**; no mocked OpenRouter account/browser session available.

Retest disposition: implementation blockers 1–3 are **RESOLVED by inspection**. Phase remains **BLOCKED for manual/browser acceptance**; do not move this card to `kb4-DONE` until that acceptance is exercised or explicitly waived by the phase owner.

### Browser retry 2026-08-03

- Read and followed the in-app browser skill.
- Started `npx expo start --web --non-interactive`/background launch and attempted `http://localhost:8081` in the browser runtime. No listening Expo web port was available; the tab remained `about:blank` and the DOM snapshot was empty. No landing page, OAuth button, QR recovery, responsive layout, or network requests could be exercised.
- This is an environment/dev-server availability blocker, not a product acceptance result. Browser acceptance remains **BLOCKED**; no claim of browser PASS is made.

## Defects / Blockers

- The existing pB09 call-site wiring card is a dependency until verified complete; do not claim onboarding works if OAuth/profile state is ignored by the upload route.
- QR camera support is browser-dependent. The phase must provide a tested image-file/JSON import fallback and document any unsupported browsers rather than treating QR generation alone as recovery.
- No blocker may be hidden by marking a manual browser test as passed based only on unit tests or a compiled bundle.

## History

- 2026-08-02: Phase 08 card created from `userDataReq.md` §5.0 follow-up requirements: OpenRouter PKCE first-run authorization, free-only model selection, existing free fallback chain, local recovery, and connection-gated landing intake.
