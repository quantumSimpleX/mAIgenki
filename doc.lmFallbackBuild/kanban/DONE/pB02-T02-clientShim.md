# pB02-T02 — clientShim

**Part:** B, **Phase:** 2. **Implements:** lmfPlan.md Phase 2 (client.ts over engine tier-0 route; env-vs-user key precedence flip — lines ~24–26, ~254–256), risk row "Env-key precedence flip".

## Description
Reshape **`src/lib/llm/client.ts`** to delegate to `service.ts` (engine tier-0 route) rather than its own fetch loop:
- Keep public exports still used elsewhere (`DEFAULT_MODELS`, `getModelChain`, `updateModelChain`, `getChatCompletion`, `callLLMWithFallback` signature) working, but route them through the service/engine.
- **Flip key precedence**: currently `resolveOpenRouterApiKey` = env key beats user key. For BYOK, a user key must win when present; env key is the tier-0 fallback only. Update `resolveOpenRouterApiKey` accordingly and note the release-behavior change.
- `getChatCompletion` stays a thin wrapper (bodymap migrates to lmfChat in pB02-T04, but keep it functioning meanwhile).

**Update tests:** `tests/lib/llm.test.ts` — adjust for new precedence + service delegation (mock fetch as before).

## Dependencies
pB02-T01.

## Acceptance criteria
- Typecheck clean; `npx jest tests/lib/llm.test.ts` passes.
- User key beats env key when both present; env key still used when no user key (tier 0).
- No behavior regression for existing callers.

## Implementation Notes

`client.ts` no longer performs its own fetch loop. `callLLMWithFallback` now: splits the legacy `LLMMessage[]` into a single `systemPrompt` + `userMessage` pair (`splitMessages`), then calls `lmfEnrich`/`lmfChat` from `service.ts` depending on whether a `validate` callback was supplied. Since `lmfChat`/`lmfEnrich`'s return shapes don't expose the winning `model`/`content` or per-candidate failure reasons that `LLMResult<T>` needs, `callLLMWithFallback` builds a local `Telemetry` object (`onSuccess`/`onFailure`) and passes it through `service.ts`'s `opts.telemetry` seam (already wired to `EngineOptions` in pB02-T01) to recover that data from the engine as it walks the route, without touching `lmfChat`/`lmfEnrich`'s public contracts. `DEFAULT_MODELS`, `getModelChain`, `updateModelChain`, and `getChatCompletion` are otherwise unchanged (same signatures; `getChatCompletion` still a thin wrapper over `callLLMWithFallback`, per the card).

**Precedence flip**: `resolveOpenRouterApiKey(userApiKey = '')` is now `userApiKey.trim() || localOpenRouterApiKey()` (previously `localOpenRouterApiKey() || userApiKey.trim()`) — a user-supplied key always wins when present; the env/local app key is used only as the tier-0 fallback when the user hasn't configured one. This matches the BYOK design intent in lmfPlan.md.

**Scope expansion beyond client.ts (flagged explicitly)**: delegating through the engine surfaced a real regression, not an artifact of this task's own tests — `tests/lib/llm-refresh.test.ts` (outside this task's edit scope) started failing because the engine's auth gate (`src/lib/lmf/engine.ts`) and `service.ts`'s `envKeyStore` both collapsed a resolved-but-empty API key (`''`, meaning "app requires no key for free-tier models", per CLAUDE.md's "No API key is required for free-tier models") into the same "no key configured, skip this candidate" behavior as a genuinely unset key (`null`). This broke every keyless/free-tier call path app-wide (`refreshModelChain`, and any `getChatCompletion`/`callLLMWithFallback` caller passing `apiKey: ''`), not just this task's new empty-key test.

Fixed with two minimal, targeted edits to already-DONE modules:
- `src/lib/lmf/engine.ts` (`callWithFallback`, pA04-T01): auth gate changed from `!apiKey` to `apiKey === null`, so `null` ("provider has no key at all") skips the candidate but `''` ("key resolved to empty, attempt anonymously") proceeds. Documented inline with the null-vs-empty-string semantic.
- `src/lib/llm/service.ts` (`envKeyStore.get`, pB02-T01): changed from `return key || null` to `return resolveOpenRouterApiKey(userApiKey)`, so it always returns the resolved string (never coerces `''` to `null`) and lets the engine's gate make the right call.

These are deliberate, justified deviations beyond client.ts + tests/lib/llm.test.ts: leaving the regression in place would have broken the card's own "No behavior regression for existing callers" acceptance criterion and the free-tier no-key guarantee in CLAUDE.md's hard constraints. Both edits are additive/narrowing (they don't change behavior for any provider/path that supplies a real non-empty key) and were verified via full `npx tsc --noEmit` + `npx jest` (see Test Plan).

## Test Plan

1. `npx tsc --noEmit -p .` — clean except the 3 known pre-existing `Cannot find name 'crypto'/'Buffer'` errors in `tests/lib/lmf/oauthPkce.test.ts`.
2. `npx jest tests/lib/llm.test.ts` — rewritten to assert: new user-wins-over-env precedence (`resolveOpenRouterApiKey` describe block), that calls still flow through the openai-compat wire shape (mock `globalThis.fetch` unchanged), fallback/retry/validation/all-fail behavior preserved under the engine's HTTP-status-based failure classification and one-shot transient retry, and the empty-key free-tier path sends no `Authorization` header.
3. Full `npx jest` — confirms no regression in any other suite, in particular `tests/lib/llm-refresh.test.ts` (the file that surfaced the auth-gate regression), `tests/lib/llm/service.test.ts`, and `tests/lib/lmf/*` (engine/route/adapter tests, to confirm the auth-gate change doesn't affect `authStyle: 'none'` or non-openrouter paths). Only acceptable failure: `__tests__/db/provider-recovery.test.ts` (pre-existing, unrelated — confirmed already failing before this task in pB02-T01's own Test Results).

## Test Results

**Independently verified, not just re-run from the dev agent's report.**

1. `npx tsc --noEmit -p .` — clean except the 3 known pre-existing `Cannot find name 'crypto'/'Buffer'` errors in `tests/lib/lmf/oauthPkce.test.ts`. Confirmed those 3 are pre-existing (unrelated file, not touched by this task).

2. `npx jest tests/lib/llm.test.ts` — 21/21 pass. Confirmed the rewritten precedence tests actually exercise the flip (not just assert the new behavior in isolation):
   - `resolveOpenRouterApiKey` describe block: user-key-wins-when-both-set, env-fallback-when-no-user-key, generic `EXPO_PUBLIC_OPENROUTER_API_KEY` fallback, user-key-with-no-env-key — all 4 cases pass.
   - `callLLMWithFallback` describe block additionally proves the precedence flip end-to-end at the wire level (not just at the resolver function): `'sends the user key over the local app key when both are configured'` sets `EXPO_PUBLIC_MAIGENKI_OPENROUTER_API_KEY=sk-local`, calls with `apiKey: 'sk-user'`, and asserts the outgoing `Authorization` header is `Bearer sk-user` — this is the strongest test in the file since it round-trips through `service.ts` → `engine.ts` → the openai-compat adapter, not just the resolver in isolation.
   - Empty-key free-tier path (`apiKey: ''`, no env key) asserts no `Authorization` header is sent — correctly covers the null-vs-empty-string fix's effect at the call site.

3. Full `npx jest` — 399/400 pass, 1 pre-existing failure (`__tests__/db/provider-recovery.test.ts`, `cx_percent` assertion), confirmed via `git log -1` on that file (last touched at `69f2fba`, well before this task) and via `git status`/`git diff` — this task's changes don't touch that file or `src/lib/db/`. Confirmed `tests/lib/llm-refresh.test.ts`, `tests/lib/llm/service.test.ts`, and `tests/lib/lmf/*` all pass, including the auth-gate-sensitive suites.
   - Note: an initial `npx jest` run (before `--clearCache`) showed 3 spurious failures in `tests/lib/enrich.test.ts` with test titles that don't match the current file's actual test names (e.g. "falls back to empty arrays when..." vs. the real "throws EnrichmentFailedError when..."). This was a **stale Jest cache artifact**, not a real regression — confirmed via `grep` (no file in the repo contains that stale title text) and by rerunning `tests/lib/enrich.test.ts` alone (13/13 pass) and together with `tests/lib/llm.test.ts` (34/34 pass) before the full-suite rerun with a cleared cache came back clean. Worth flagging for whoever runs CI: if a full-suite run ever shows failures with test titles that don't match the source file, clear the Jest cache before assuming it's a real regression. Also noted in passing: `src/lib/llm/enrich.ts`, `src/app/analyzing.tsx`, and `__tests__/lib/pipeline-process.test.ts` currently carry **uncommitted WIP changes unrelated to this task** (not pB02-T02's scope, not touched by the dev agent's diff) — flagging in case that WIP is accidentally swept into a future commit for this task.

4. Call-site audit (grep across the repo): `src/lib/llm/enrich.ts`, `src/lib/llm/refresh.ts`, `src/lib/llm/service.ts` (internal), `tests/lib/enrich.test.ts`, `tests/lib/pipeline.test.ts` all import from `client.ts` using only the unchanged exports (`DEFAULT_MODELS`, `getModelChain`, `updateModelChain`, `callLLMWithFallback`). `src/app/bodymap.tsx:1068,1080` dynamically imports and calls `getChatCompletion(userMsg, sys)` with no `apiKey` argument (uses the `apiKey = ''` default) — confirmed this still resolves correctly through the new precedence chain (falls back to the env key, matching pre-existing behavior; user's BYOK key isn't wired into chat yet, which is explicitly deferred to pB02-T04 per the card, not a regression here). `src/app/analyzing.tsx:454-458` reads the user's key from settings and passes it through `processHealthRecord` → `enrichFromText` → `callLLMWithFallback`, exercising the new user-wins-over-env precedence on the real enrichment path.

5. Auth-gate null-vs-empty-string fix (`src/lib/lmf/engine.ts:208-215`) — verified logically and via existing test:
   - `tests/lib/lmf/engine.test.ts:98` (`'records an auth failure and skips the provider when no key is configured'`) already covers the exact case called out in the task: a provider with `authStyle !== 'none'` (`openrouterSpec`, `authStyle: 'bearer'`) whose `KeyStore.get()` resolves `null` — asserts `fetchImpl` is never called and the failure is classified `kind: 'auth'`. This is a real regression guard, not just incidental coverage.
   - Traced the `''` (empty-but-configured) path separately: `service.ts`'s `envKeyStore.get()` only ever returns `null` for a non-`'openrouter'` `providerId`, or `resolveOpenRouterApiKey(userApiKey)` (always a string, never `null`) for `'openrouter'` — so on the current tier-0-only route, the auth gate's `null` branch never fires for OpenRouter itself, only for a hypothetical unconfigured non-OpenRouter provider (not yet reachable via this task's TIER_0_PROFILE-only routing). This matches the intent: OpenRouter's free tier is anonymous-capable so it must never be gated on key presence, while a provider that genuinely requires a key and has none must still short-circuit before hitting the network — both are correctly distinguished.
   - Did not need to add a new engine test — coverage was already adequate (see below) and the existing test exercises exactly the regression scenario named in the task.

6. Coverage: `client.ts`/`engine.ts`/`service.ts` combined line coverage from the llm/lmf-focused test files is ~90–92%; full-suite coverage is 90.22% lines overall (gate is 80% global, `jest.config.js:9`), so no threshold risk. One real gap found — see Issues Found #1.

7. Edge-case reasoning (apiKey `undefined` vs `''` vs whitespace-only vs real key), traced through both `getChatCompletion` and `callLLMWithFallback`:
   - `undefined` and `''` behave identically end-to-end: `CallOptions.apiKey` is optional, `service.ts`'s `envKeyStore(opts.apiKey ?? '')` normalizes both to `''`, and `resolveOpenRouterApiKey('')` falls through to the env key (or `''` if no env key either) — this is the anonymous free-tier path, and the adapter correctly omits the `Authorization` header for a falsy key.
   - A whitespace-only user key (e.g. `'   '`) is treated as "no user key" by `resolveOpenRouterApiKey`'s `.trim() || ...`, correctly falling back to the env key rather than sending a blank/whitespace `Bearer` token. Not explicitly covered by a dedicated test, but the existing tests already exercise `.trim()` behavior with padded values (`' sk-local '`, `' sk-user '`), so this is a logical extension of tested behavior, not an untested code path in the risk sense.
   - A real key at any layer (`getChatCompletion` → `callLLMWithFallback` → `lmfChat`/`lmfEnrich` → `envKeyStore` → `resolveOpenRouterApiKey`) is passed through unchanged and always wins over the env key — verified by the `'sends the user key over the local app key when both are configured'` test.

## Issues Found

No functional regressions or incorrect behavior found. The precedence flip and the null-vs-empty-string auth-gate fix are both correct and adequately tested; no code changes were made by this QA pass.

One minor coverage gap (Low severity, not a functional defect):

1. **`src/lib/llm/client.ts:159-177` (`getChatCompletion`) has zero direct test coverage** (confirmed via `--collectCoverageFrom`: lines 164-176 uncovered when running only `tests/lib/llm.test.ts` + `tests/lib/lmf/engine.test.ts`). It's exercised only indirectly, and only insofar as it calls the well-tested `callLLMWithFallback`.
   - **Impact**: Low — the function is a thin pass-through with unchanged logic (same as before this task), and it's slated to be replaced by a direct `lmfChat` call in pB02-T04, so this gap is short-lived.
   - **Likelihood**: N/A for user-facing risk — this is a coverage gap, not an observed bug. `getChatCompletion` is the live code path bodymap.tsx's chat feature uses today, so a future edit to its error-handling/throw logic (e.g. the `!result.ok || !result.content` check at line 173) would currently go unverified by `tests/lib/llm.test.ts`.
   - **Recommendation**: Add two cheap tests to `tests/lib/llm.test.ts` before or alongside pB02-T04: (a) success path returns `result.content`, (b) failure path (`ok: false` or empty `content`) throws with `result.failures.join('; ')` or the `'No response from LLM'` fallback message. Not blocking this card's acceptance criteria (which only requires `tests/lib/llm.test.ts` to pass, and it does), but worth picking up given it's a real code path.
