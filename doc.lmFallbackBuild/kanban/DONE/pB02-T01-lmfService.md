# pB02-T01 — lmfService

**Part:** B, **Phase:** 2 (migrate existing call sites). **Implements:** lmfPlan.md Part B intro (`src/lib/llm/service.ts` composition root), Phase 2 (~lines 250–257).

## Description
Create **`src/lib/llm/service.ts`** — the app composition root that wires the dependency-free `lmf/` module to app platform pieces:
- Build an `LMFProfile` + free chain, construct `Route` via `buildRoute`, and call `callWithFallback`.
- Inject: `fetchImpl` (global fetch), a `Telemetry` object (Phase 4 wires it to the store — leave a seam / no-op default now), `CooldownLedger` (module-singleton, in-memory).
- Free chain comes from `DEFAULT_MODELS`/`getModelChain` (client.ts) for tier 0.
- **This phase**: a minimal composition root sufficient for tier-0 free behavior identical to today. `KeyStore`/`profile.ts` integration (Phase 3) and profile-driven routing (Phase 4) layer in later — keep the profile source pluggable (default tier-0 profile now).
- Expose:
  - `lmfChat({ userMessage, systemPrompt, ... })` → assistant string (replaces `getChatCompletion` internals).
  - `lmfEnrich(text)` / a generic `lmfComplete(req, validate)` → used by enrich.ts.
- Must NOT import Zustand directly inside `lmf/`; service is app-layer so it may read app stores, but keep telemetry injection clean.

Follow repo style (2-space, single quotes, no semicolons, named exports, no `any`).

## Dependencies
pA04-T01 (engine), pA06-T01 (route), pA02-T03 (index).

## Acceptance criteria
- Typecheck clean.
- Tier-0 path produces identical free-model behavior to current `callLLMWithFallback`.
- `lmfChat`/`lmfComplete` exported; telemetry + keystore + profile are injectable seams (no hard Zustand/SecureStore coupling that blocks Phase 1 portability).

## Implementation Notes
Created `src/lib/llm/service.ts`. Module-singleton `cooldownLedger` (via `createCooldownLedger()`) persists across calls within the process, matching A4's in-memory-ledger design. `TIER_0_PROFILE` is a hardcoded default `LMFProfile` (tier 0, no active provider) used whenever the caller doesn't supply one — this is the pluggable seam for Phase 3/4 (`profile.ts` + store-driven profile will be threaded in as `opts.profile`). `envKeyStore(userApiKey)` is a stand-in `KeyStore` that only ever resolves the `openrouter` provider via the existing `resolveOpenRouterApiKey` precedence (env-first, matching current behavior unchanged for this phase); Phase 3's real `KeyStore` replaces this shim and is injected the same way via `opts.keys`. `resolveFreeChain` reuses `DEFAULT_MODELS`/`getModelChain` from `client.ts` unchanged.

Exposed two functions instead of the card's suggested `lmfChat`/`lmfEnrich(text)`/`lmfComplete(req, validate)` trio:
- `lmfChat(systemPrompt, userMessage, opts)` — for condition chat (bodymap.tsx), single system+user message pair (never full record context, per hard constraint).
- `lmfEnrich<T>(systemPrompt, userMessage, validate, opts)` — for structured extraction (enrich.ts), takes the validate callback directly rather than wrapping a separate generic `lmfComplete`.

**Deviation rationale**: `enrich.ts`'s call site needs a system prompt (fixed extraction instructions) + user text (the redacted record) + a validate callback — that's exactly `lmfChat`'s shape plus validation, so a separate `lmfComplete(req, validate)` generic would just be `lmfEnrich` with the message-building step pushed onto the caller for no benefit given the app has exactly two call sites (chat, enrich). Not adding an unused third generic per Simplicity First.

Both functions build the route via `buildRoute(profile, freeChain)` (tier-0 profile → free chain only, unchanged today) and pass `{ cooldown: cooldownLedger, telemetry: opts.telemetry }` as `EngineOptions` — `telemetry` defaults to `undefined` (no-op), to be wired to the store in pB04-T04.

## Test Plan
New `tests/lib/llm/service.test.ts`, mocking `globalThis.fetch` the same way `tests/lib/llm.test.ts` does (OpenAI-shaped response, since tier-0 routes through `openrouter`'s `openai-compat` adapter):
1. `lmfChat` on a successful first response — assert it calls `https://openrouter.ai/api/v1/chat/completions` with `Authorization: Bearer <resolved key>` and returns `{ok:true, content}`.
2. `lmfChat` where every candidate in a 2-model chain fails (500s) — assert `{ok:false, message}` with a non-empty message.
3. `lmfEnrich` with a validate callback that parses JSON successfully — assert `{ok:true, value}`.
4. `lmfEnrich` where validate always returns `null` — assert `{ok:false, failures}` non-empty.

## Test Results
- `npx jest tests/lib/llm/service.test.ts`: 4/4 passed.
- `npx tsc --noEmit -p .`: clean except the 3 known pre-existing `oauthPkce.test.ts` errors.
- Full `npx jest`: 395/396 passed; the 1 failure (`__tests__/db/provider-recovery.test.ts`) is pre-existing and unrelated — confirmed via `git status` that file was not touched this session, and the failure is a snapshot-restore assertion (`cx_percent` on a joined-but-missing condition) with no connection to LMF/service code.

## Issues Found
None in `service.ts` itself. Confirmed (not fixed, out of scope) the pre-existing unrelated `provider-recovery.test.ts` failure noted above.
