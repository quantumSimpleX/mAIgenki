# pB02-T04 — chatUseLmf

**Part:** B, **Phase:** 2. **Implements:** lmfPlan.md observation (~line 26: chat calls getChatCompletion with no apiKey, never reads the model chain), Phase 2.

## Description
Migrate the condition chat in **`src/app/bodymap.tsx`** (`sendMessage()`, ~line 1061) to route through the LMF service so it honors the user's profile/key chain like the pipeline does:
- Replace the `getChatCompletion(userMessage, systemPrompt)` (no apiKey) call with `lmfChat(...)` from `service.ts`, which resolves the active profile + key chain.
- Preserve hard constraints exactly: chat stays **session-only** (never persisted), context scoped to **one condition only** (never inject full record), educational **disclaimer must still appear before first message**, and no treatment/medication recommendations in the prompt.
- Keep existing UI behavior; only the call path changes.

## Dependencies
pB02-T01.

## Acceptance criteria
- Typecheck clean; app compiles.
- Chat now uses the profile/key chain (verifiable: with a user key set, chat would use it; tier 0 unchanged).
- No change to session-only / single-condition / disclaimer behavior (constraints preserved).

## Implementation Notes

Changed only `src/app/bodymap.tsx` (`ConditionSheet`'s `sendMessage()`):
- Replaced the dynamic `import('@/lib/llm/client')` → `getChatCompletion(userMsg, sys)` call (no apiKey, no model chain) with a dynamic `import('@/lib/llm/service')` → `lmfChat(sys, userMsg, { apiKey, db })` call, matching the composition-root path the pipeline/enrich already use.
- Added `const db = useOptionalDatabase()` to `ConditionSheet` (mirrors the pattern already used elsewhere in this file, e.g. the settings and backup components) so the chat call can resolve the same SQLite handle the pipeline uses.
- Before calling `lmfChat`, read the user's BYOK key via `getSetting(db, 'openrouter_api_key')` (added to the existing `@/lib/db/queries` import) — the same settings key `analyzing.tsx` reads for the pipeline. Passed as `opts.apiKey`; `lmfChat`'s internal `envKeyStore` still applies the existing BYOK-then-local/env-fallback precedence via `resolveOpenRouterApiKey`.
- Passed `db` straight through in `opts.db` rather than pre-resolving a model chain — `lmfChat`'s `resolveFreeChain` already calls `getModelChain(db)` when `opts.models` is omitted, so this automatically follows any runtime model-chain override the same way the pipeline does.
- `lmfChat` returns `{ok, ...}` instead of throwing, so the failure branch (previously a caught exception from `getChatCompletion`) is now an explicit `if (!outcome.ok)` branch with the same user-facing message ("Unable to connect. Check network and LLM access."); the outer `try/catch` is kept as a safety net for import/db-read failures.

Hard constraints preserved (unchanged code paths, verified by re-reading after edit):
- **Session-only chat**: `addChatMessage` still only writes to the in-memory Zustand store (`useAppStore`); no SQLite write was added for chat history.
- **Single-condition scope**: the system prompt (`sys`) construction is untouched — still only references `selectedCondition` (one condition) and `selectedRecords` (the records the user explicitly selected for the chat), never the full health record.
- **Disclaimer ordering**: the `useEffect` that injects `DISCLAIMER` as the first assistant message before any chat interaction is untouched; `sendMessage()` doesn't affect disclaimer gating.
- **No treatment/medication recommendations**: the system prompt text is unchanged ("Answer in 1–3 short sentences. Always recommend consulting a healthcare provider.").
- **API key never logged**: `apiKey` is read from SQLite and passed straight to `lmfChat`; not logged or included in any message content.

## Test Plan

No existing test exercises `ConditionSheet.sendMessage()` directly — `__tests__/screens/bodymap.test.tsx` explicitly avoids full-rendering `bodymap.tsx` (comment at top of that file: rendering the ~1242-line component with SVG/Animated exhausts the 4GB jest heap) and instead tests module shape/store state/data contracts only. No mock of `getChatCompletion` or `lmfChat` existed before this change, so there was no test call site to migrate. Verification for this change relies on:
- `npx tsc --noEmit -p .` — confirms the new `lmfChat`/`getSetting`/`useOptionalDatabase` call sites type-check against `service.ts`'s `LmfServiceOptions`/`LmfChatOutcome` and `queries.ts`'s `getSetting` signature.
- `npx jest` — full suite green modulo the two pre-existing, unrelated failures noted below; in particular `__tests__/screens/bodymap.test.tsx` and `__tests__/integration/flow.test.tsx` (which cover chat-adjacent store state like `openHealthChat`/`selectedRecords`) still pass.
- Manual/QA follow-up (flagged for the separate QA pass on this card): drive the condition chat in a dev build with a BYOK OpenRouter key set in Settings, confirm the reply comes back and no key is logged; then clear the key and confirm chat still works via the free tier-0 chain, matching pre-existing behavior.

## Test Results

Verified independently (not just trusting the dev report):

- **Wiring correctness** — read `ConditionSheet` and `sendMessage()` in `src/app/bodymap.tsx` (lines 1016–1093) in full, plus `lmfChat`'s signature in `src/lib/llm/service.ts`. `db` is read via `useOptionalDatabase()` (line 1028); `sendMessage()` reads `getSetting(db, 'openrouter_api_key')` only when `db` is truthy (line 1081), else defaults `apiKey` to `''`; both `apiKey` and `db: db ?? undefined` are passed to `lmfChat(sys, userMsg, {...})` (line 1082), matching `LmfServiceOptions`. Typechecks clean against `service.ts`.
- **Session-only chat** — `addChatMessage` (`src/store/useAppStore.ts:218`) is a pure Zustand `set` — appends to in-memory `chatMessages` array only. No SQLite write was introduced anywhere in the changed `sendMessage()`/`ConditionSheet` code. Confirmed constraint holds.
- **Single-condition scope** — the `sys` prompt (bodymap.tsx:1072–1080) only references `selectedCondition` (one condition, via `cond.label`/`cond.medName`) and `selectedRecords` (the user-selected records the chat already scoped to pre-change), never the full health record or `CONDITIONS`/`useConditions()` output. Constraint holds, unchanged from prior implementation.
- **Disclaimer ordering** — the `useEffect` at bodymap.tsx:1047–1052 (gated on `chatOpen && sheetOpen && !disclaimerShown.current`) is untouched by this change and still injects `DISCLAIMER` before any user message can be sent; `disclaimerShown` is a `useRef` that resets on remount (new session), so it cannot be permanently dismissed. Confirmed unchanged.
- **No key logging** — grepped `src/lib/llm/client.ts`, `src/lib/llm/service.ts`, `src/lib/lmf/**` for `console.*` calls. Only one exists (`client.ts:119`, `[${label}] all models failed —`, joined failure *messages*, not the key). `apiKey` itself is never passed to any logging call anywhere in the changed path or its callees.
- **`db` null handling** — `useOptionalDatabase()` (`src/lib/db/provider.tsx:19`) returns `useContext(DbContext)`, whose default is `null`, so `db` legitimately can be null/undefined before DB init or in contexts without the provider. `sendMessage()` handles this gracefully: `apiKey` falls back to `''` and `db: undefined` is passed to `lmfChat`, whose `resolveFreeChain()` (`service.ts:54–58`) falls back to `DEFAULT_MODELS` when `db` is undefined, and whose `envKeyStore('')` (`service.ts:40–52`) resolves to `resolveOpenRouterApiKey('')`, i.e. the free tier-0 chain — no crash, matches pre-existing behavior.
- **Test-gap claim verified true** — read `__tests__/screens/bodymap.test.tsx` in full. It genuinely never renders `ConditionSheet`/the full `bodymap.tsx` default export (top-of-file comment explains the 4GB jest heap constraint from SVG/Animated); it only exercises `useAppStore` state transitions and static data contracts (`CONDITIONS`, `CONDITION_RECORDS`, language list). There is no mock of `getChatCompletion` or `lmfChat` and no call site that exercises `sendMessage()`. The dev agent's claim holds — this is a genuine, pre-existing structural test gap (not something introduced by this task), and adding a full-render test to cover it would risk reintroducing the heap-exhaustion failure the existing test file was deliberately designed to avoid. No test coverage added; documenting as an accepted gap rather than a task-introduced regression.
- `npx tsc --noEmit -p .` — 3 errors, all in `tests/lib/lmf/oauthPkce.test.ts` (missing Node `crypto`/`Buffer` types), pre-existing and unrelated (confirmed via `git status`: file not touched by this task).
- `npx jest` — full suite run. 1 failing test: `__tests__/db/provider-recovery.test.ts` ("restore-on-boot guard (B-P8-3) › live DB has no user records + snapshot does → restores snapshot", `TypeError: Cannot read properties undefined (reading 'cx_percent')`) — pre-existing and unrelated (confirmed via `git status`: file not touched by this task, not on the DB/settings/chat path this change touches). All other suites pass, including `__tests__/screens/bodymap.test.tsx` and `__tests__/integration/flow.test.tsx` (chat-adjacent store state: `openHealthChat`, `selectedRecords`).
- Manual end-to-end reasoning (no dev-build/simulator run, per task instructions given jest heap constraints on this component): with a BYOK key set, `getSetting` returns it, `lmfChat` resolves `envKeyStore(apiKey)` → `resolveOpenRouterApiKey(apiKey)` → trims and uses the user key; the model chain resolves via `getModelChain(db)` (any runtime override applies). With no key/no db, both fall back to `DEFAULT_MODELS` and an empty-string key, i.e. the anonymous free-tier chain — matches pre-LMF behavior. On total fallback failure, `outcome.ok === false` and the UI shows the same "Unable to connect..." message as before (now via the explicit branch rather than a caught throw); the outer `try/catch` still guards import/db-read failures. Flow is coherent end to end.

**Summary: PASS.** All acceptance criteria met; all four hard constraints (session-only chat, single-condition scope, disclaimer-before-first-message, no key logging) verified intact.

## Issues Found

None. No defects found; no fixes required. The pre-existing lack of a `sendMessage()`-covering test was verified as a genuine structural limitation of `bodymap.test.tsx` (not a task-introduced gap) and is noted above rather than patched, to avoid reintroducing the jest heap-exhaustion issue that file was written to avoid.
