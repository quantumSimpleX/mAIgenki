# pA07-T01 — modelsValidateKey

**Part:** A. **Implements:** lmfPlan.md A7 (model selection), A8 (validation ping), A2 (`models.ts`, `validateKey.ts`).

## Description
Create two files:

**`src/lib/lmf/models.ts`**:
- `listModels(spec, key, fetchImpl?)` → `Promise<string[]>` using `spec.modelListPath` where it exists (openrouter `/models`, openai `/v1/models`, anthropic `/v1/models`, gemini `/v1beta/models`, ollama `/api/tags`, compat `/models`). Parse each provider's list shape into model-id strings. Auth header per `spec.authStyle`.
- `CURATED_MODELS: Record<providerId, string[]>` — 3–5 sensible defaults per provider (curate at implementation time; pick current, generally-available model ids).

**`src/lib/lmf/validateKey.ts`**:
- `validateKey(spec, key, fetchImpl?)` → `{ ok:true } | { ok:false, kind:LMFErrorKind }`. Prefer a models-list call when available; else a 1-token completion. Distinguish "wrong key" (`auth`) from "offline" (`network`).

**Test file:** `tests/lib/lmf/models.test.ts` (mock fetch): listModels parses each shape; auth header applied per authStyle; validateKey ok on 200, `auth` on 401, `network` on fetch throw.

## Dependencies
pA02-T02, pA05-T01.

## Acceptance criteria
- Typecheck clean; no `any`.
- `npx jest tests/lib/lmf/models.test.ts` passes.
- validateKey returns discriminated result distinguishing auth vs network.

## Implementation Notes

**`src/lib/lmf/models.ts`**:
- `listModels(spec, key, fetchImpl?)`: GETs `${spec.baseURL}${spec.modelListPath}` with per-`authStyle` headers (bearer/x-api-key/x-goog-api-key/none), returns `[]` immediately (no fetch) when `spec.modelListPath` is `null`, and returns `[]` on a non-`ok` response rather than throwing.
- Response-shape dispatch: `spec.modelListPath === '/api/tags'` → Ollama's `{models:[{name}]}`; `spec.kind === 'gemini'` → `{models:[{name:'models/x'}]}` with the `models/` prefix stripped (the bare id is what `:generateContent` expects); everything else (openrouter/openai/groq/mistral/deepseek/xai/together/anthropic/custom) → the shared `{data:[{id}]}` shape (Anthropic's `/v1/models` uses the same envelope as the OpenAI-family list endpoints).
- `CURATED_MODELS`: one entry per built-in provider (3–4 ids each), current-as-of-implementation-date model ids. **Deviation note**: these are a point-in-time curation, not sourced from a live catalog — expected to go stale and need periodic refresh; not a defect in this task.

**`src/lib/lmf/validateKey.ts`**:
- `validateKey(spec, key, opts?)` → `{ok:true} | {ok:false, kind:LMFErrorKind}`. When `spec.modelListPath` exists, validates via that GET (200→ok, 401/403→`auth`, other non-ok→`classifyHttp(status)`, thrown fetch→`network`). When it doesn't, falls back to a 1-token completion probe (`adapter.buildRequest`/`classifyError` from the matching kind's adapter) — this path needs a `model` id, so it's opt-in via `opts.model` (the UI already has one selected by the time key entry happens in tier 2/3); with neither a `modelListPath` nor a supplied `model` there is nothing to probe against, so it returns `{ok:true}` rather than fabricating a model id.
- **Deviation note**: none of the 11 built-in `ProviderSpec`s actually lack a `modelListPath`, so the completion-probe branch is exercised only via a synthetic spec in tests (`{...custom, modelListPath: null}`) — kept for genericity per A8/A2, e.g. a future custom endpoint with no list route.

## Test Plan

`tests/lib/lmf/models.test.ts` (mocked `fetch`): `listModels` parses the OpenAI-shaped list, the Ollama `{models:[{name}]}` list with no auth header, the Gemini list with `models/` prefix stripping, applies `x-api-key` (+ `anthropic-version`) for Anthropic, returns `[]` on non-ok and on a null `modelListPath` (asserting zero fetch calls), and every built-in provider has a `CURATED_MODELS` entry. `validateKey`: `ok:true` on 200, `{ok:false,kind:'auth'}` on 401, `{ok:false,kind:'network'}` on a thrown fetch, the completion-probe fallback (asserts the request URL/body/model), `ok:true` with neither `modelListPath` nor `model` (zero fetch calls), and the completion-probe path classifying a 401 as `auth` via the adapter.

## Test Results

`npx jest tests/lib/lmf/models.test.ts` — 13/13 passed. `npx jest tests/lib/lmf` (full module, all 7 suites) — 65/65 passed. `npx tsc --noEmit -p .` — no new errors (the 3 pre-existing `Buffer`/`crypto` errors in `oauthPkce.test.ts` from pA09-T01 remain, unrelated).

## Issues Found

None.
