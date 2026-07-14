# pB09-T01 — wireByokIntoCallSites

**Part:** B, **Phase:** 9 (follow-up, filed by QA during pB08-T04's audit). **Reopens:** the intent of pB02-T04/pB02-T05.

## Description

The pB08-T04 hard-constraint audit (2026-07-13) found that `pB02-T04-chatUseLmf` and
`pB02-T05-pipelineUseService` are marked DONE but a connected user's own provider is
never actually used at runtime:

- `src/app/bodymap.tsx:1111` calls `lmfChat(sys, userMsg, { apiKey, db })` — no `profile`/`keys`
  passed, so it always defaults to `TIER_0_PROFILE` + the free OpenRouter chain
  (`src/lib/llm/service.ts:168,172`).
- `src/lib/pipeline.ts:92` → `enrich.ts:119` → `client.ts:94-105` → `lmfEnrich` — same gap,
  defaults to `TIER_0_PROFILE` + an `openrouter`-only `envKeyStore()` (`service.ts:200,204`).
- `bodymap.tsx:1110` also still reads the legacy `openrouter_api_key` SQLite setting directly,
  which `profile.ts`'s `migrateLegacyOpenRouterKey` deletes post-migration — so that read is
  stale/dead and returns empty for any user who already migrated.

This is **not** a hard-constraint violation (no key leak, no cross-provider send) — it's a
functional bug: OAuth connect (pB05) and manual key entry (pB04's ProviderSettings) succeed
and persist a profile/key, but chat and the pipeline silently ignore it and stay on the free
tier. Users who "connect their own account" via the UI see no behavior change.

## Fix

- Load the persisted `LMFProfile` (`src/lib/llm/profile.ts`) and construct the app's `KeyStore`
  (`src/lib/llm/keystore.ts`) at both call sites, passing `{ profile, keys }` into `lmfChat`
  (bodymap.tsx) and into the pipeline's `lmfEnrich` call (via `enrich.ts`/`client.ts`).
- Remove the now-genuinely-dead direct read of `openrouter_api_key` in `bodymap.tsx:1110`.
- Repo style: 2-space, single quotes, no semicolons, named exports, no `any`.

## Dependencies

pB02-T01 (lmfService), pB03-T02/T03 (keystore/profile), pB04-T02 (ProviderSettings), pB05-T01 (oauth) — all DONE.

## Acceptance criteria

- With a connected provider (manual key or OAuth), a chat message and a pipeline enrich call
  are verifiably routed to that provider's model first (fallback to free chain still applies
  per `fallbackToFree`).
- `bodymap.tsx` no longer reads `openrouter_api_key` from SQLite directly.
- Existing tests updated/passing; typecheck clean.

## Implementation Notes

## Test Plan

## Test Results

## Issues Found
