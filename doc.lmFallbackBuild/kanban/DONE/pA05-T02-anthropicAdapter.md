# pA05-T02 — anthropicAdapter

**Part:** A. **Implements:** lmfPlan.md A5 anthropic section (~183+), risk row "Anthropic browser CORS".

## Description
Create **`src/lib/lmf/adapters/anthropic.ts`** implementing `Adapter` for the Anthropic Messages API:
- `POST {baseURL}/v1/messages`; header `x-api-key: <key>`, `anthropic-version` header, and `anthropic-dangerous-direct-browser-access: true` (needed for web build CORS).
- Map `ChatRequest` → Messages body: split out any `system` message into top-level `system`, remaining messages → `messages[]`; `max_tokens` (Anthropic requires it) from maxTokens (default a sane value if unset); temperature passthrough.
- Parse response: `content[0].text`, `stop_reason`→finishReason, `usage` (input_tokens/output_tokens).
- classifyError: map Anthropic error types (`overloaded_error`→server, `rate_limit_error`→rate_limit, `authentication_error`→auth, `invalid_request_error`→invalid_request) plus `classifyHttp` fallback.

**Test file:** `tests/lib/lmf/anthropic.test.ts` (mock fetch): system-message hoisting, x-api-key + browser-access header present, content parse, stop_reason mapping, error-type classification.

## Dependencies
pA02-T01, pA02-T02.

## Acceptance criteria
- Implements `Adapter`; typecheck clean; no `any`.
- `npx jest tests/lib/lmf/anthropic.test.ts` passes.
- `anthropic-dangerous-direct-browser-access: true` header emitted.

## Implementation Notes
Created `src/lib/lmf/adapters/anthropic.ts`. System messages are collected and joined into the
top-level `system` field; `max_tokens` defaults to 4096 when `req.maxTokens` is unset (Anthropic
requires the field). `classifyError` switches on Anthropic's `error.type` string first, falling back
to `classifyHttp` for unrecognized types.

## Test Plan
`tests/lib/lmf/anthropic.test.ts`: system-message hoisting, x-api-key + anthropic-version +
browser-access headers present, default max_tokens, POST to `/v1/messages`, content-block parse +
stop_reason mapping, classifyError for all four named types plus unknown-type fallback.

## Test Results
`npx jest tests/lib/lmf/anthropic.test.ts` — 9 tests passed. `npx tsc --noEmit` — no errors.

## Issues Found
None.
