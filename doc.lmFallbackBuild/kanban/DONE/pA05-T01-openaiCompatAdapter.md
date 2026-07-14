# pA05-T01 — openaiCompatAdapter

**Part:** A. **Implements:** lmfPlan.md A5 openaiCompat section (lines ~176–181).

## Description
Create **`src/lib/lmf/adapters/openaiCompat.ts`** implementing `Adapter` for all OpenAI-shaped providers (openrouter, openai, groq, mistral, deepseek, xai, together, ollama /v1, custom):
- `POST {baseURL}/chat/completions`; `Authorization: Bearer <key>` (skipped when `authStyle:'none'`, e.g. local Ollama); merge `spec.defaultHeaders`.
- Body: `{ model, messages, temperature?, [spec.tokenParam]: maxTokens?, response_format:{type:'json_object'} }` — response_format only when `responseFormat==='json'` && `spec.supportsJsonResponseFormat`.
- Divergence guards (expose so engine can retry): `invalid_request` while `response_format` present → one-shot retry without it; `max_tokens` rejected mentioning `max_completion_tokens` → swap param, retry once.
- Parse `choices[0].message.content` / `finish_reason` / `usage`.
- classifyError: `insufficient_quota`→quota_billing, `context_length_exceeded`→invalid_request, moderation→content_filter, else via `classifyHttp`.

**Test file:** `tests/lib/lmf/openaiCompat.test.ts` (mock `fetch`): wire shape (URL, bearer header, tokenParam, defaultHeaders merged), response_format included only when supported+requested, response_format degrade retry, token-param swap retry, ollama no-auth-header, quota/context/moderation classification.

## Dependencies
pA02-T01, pA02-T02.

## Acceptance criteria
- Implements `Adapter`; typecheck clean; no `any`.
- `npx jest tests/lib/lmf/openaiCompat.test.ts` passes.
- Ollama path emits no Authorization header.

## Implementation Notes
Created `src/lib/lmf/adapters/openaiCompat.ts`. Exports `openaiCompatAdapter: Adapter` plus four
divergence-guard helpers (`shouldRetryWithoutResponseFormat`, `shouldRetryWithSwappedTokenParam`,
`withoutResponseFormat`, `withSwappedTokenParam`) — the engine (pA04-T01) calls these to decide
whether to do the one-shot retry described in A5, keeping the adapter itself pure/stateless.
Bearer header skipped when `authStyle !== 'bearer'` (covers ollama's `'none'`).

## Test Plan
`tests/lib/lmf/openaiCompat.test.ts`: wire shape (URL/bearer/tokenParam/defaultHeaders), openai
max_completion_tokens, ollama no-auth-header, response_format gated on json+supported, parse
content/finish_reason/usage, classifyError (quota/context/moderation/fallback), divergence-guard
detection + transform helpers.

## Test Results
`npx jest tests/lib/lmf/openaiCompat.test.ts` — 12 tests passed. `npx tsc --noEmit` — no errors.

## Issues Found
None.
