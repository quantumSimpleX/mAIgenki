# pA05-T03 — geminiAdapter

**Part:** A. **Implements:** lmfPlan.md A5 gemini section, A2 (`adapters/gemini.ts`).

## Description
Create **`src/lib/lmf/adapters/gemini.ts`** implementing `Adapter` for the Google Gemini `generateContent` API:
- `POST {baseURL}/v1beta/models/{model}:generateContent`; auth via `x-goog-api-key: <key>` header (authStyle 'x-goog-api-key').
- Map `ChatRequest` → `{ contents: [{ role, parts:[{text}] }], generationConfig:{ temperature?, maxOutputTokens? } , systemInstruction? }`. Roles: user→'user', assistant→'model'; system message → `systemInstruction`.
- Parse response: `candidates[0].content.parts[0].text`, `finishReason`, `usageMetadata` → usage.
- classifyError: map Gemini error `status`/`code` (RESOURCE_EXHAUSTED→rate_limit, PERMISSION_DENIED/UNAUTHENTICATED→auth, INVALID_ARGUMENT→invalid_request) + `classifyHttp` fallback.

**Test file:** `tests/lib/lmf/gemini.test.ts` (mock fetch): role mapping (assistant→model), systemInstruction hoist, maxOutputTokens mapping, x-goog-api-key header, response parse, error classification.

## Dependencies
pA02-T01, pA02-T02.

## Acceptance criteria
- Implements `Adapter`; typecheck clean; no `any`.
- `npx jest tests/lib/lmf/gemini.test.ts` passes.

## Implementation Notes
Created `src/lib/lmf/adapters/gemini.ts`. `assistant` role mapped to Gemini's `'model'` role; system
messages hoisted to `systemInstruction`. `responseMimeType:'application/json'` set only when
`responseFormat==='json'` and `spec.supportsJsonResponseFormat` (real JSON mode, not a prompt hint).
`classifyError` switches on `error.status` (Gemini's string status code), falling back to
`classifyHttp`.

## Test Plan
`tests/lib/lmf/gemini.test.ts`: role mapping + systemInstruction hoist, maxOutputTokens mapping,
x-goog-api-key header + URL shape, response parse (candidates/finishReason/usageMetadata),
classifyError for RESOURCE_EXHAUSTED/PERMISSION_DENIED/UNAUTHENTICATED/INVALID_ARGUMENT + fallback.

## Test Results
`npx jest tests/lib/lmf/gemini.test.ts` — 8 tests passed. `npx tsc --noEmit` — no errors.

## Issues Found
None.
