# pA02-T02 — providerRegistry

**Part:** A. **Implements:** lmfPlan.md A3 (`ProviderSpec` type, lines ~129–141), A2 (`registry.ts`), A9 (OpenRouter oauth spec fields), A7 (keyURL/modelListPath).

## Description
Create **`src/lib/lmf/registry.ts`**:
- `ProviderSpec` type: `id`, `label`, `kind` ('openai-compat'|'anthropic'|'gemini'), `baseURL` (overridable for custom/ollama), `authStyle` (AuthStyle from types), `defaultHeaders?` (e.g. OpenRouter HTTP-Referer / X-Title), `tokenParam` ('max_tokens'|'max_completion_tokens'), `supportsJsonResponseFormat`, `modelListPath` (string|null), `oauth?` ({ authorizeURL, exchangeURL, method:'pkce-s256' }), `keyURL?` ("get an API key here" link).
- `BUILT_IN_PROVIDERS`: openrouter, openai, groq, mistral, deepseek, xai, together, ollama, anthropic, gemini, custom. Set correct baseURL, authStyle, tokenParam (openai uses `max_completion_tokens`), supportsJsonResponseFormat, modelListPath (openrouter `/models`, openai `/v1/models`, anthropic `/v1/models`, gemini `/v1beta/models`, ollama `/api/tags`, others compat `/models`), and openrouter.oauth authorize/exchange URLs.
- Ollama: authStyle 'none'. OpenRouter defaultHeaders: HTTP-Referer + X-Title. anthropic authStyle 'x-api-key'; gemini 'x-goog-api-key'.
- Helper `getProviderSpec(id)` returning spec or undefined; `custom` spec allows baseURL override at call time.

Consult lmfPlan.md A5/A9 for exact endpoint paths. No `any`.

## Dependencies
pA03-T01 (AuthStyle type).

## Acceptance criteria
- Typecheck passes; all 11 providers present with plausible, correct fields.
- OpenRouter has oauth + defaultHeaders; Ollama authStyle 'none'; openai tokenParam 'max_completion_tokens'.
- Named exports: `ProviderSpec`, `BUILT_IN_PROVIDERS`, `getProviderSpec`.

## Implementation Notes
Created `src/lib/lmf/registry.ts` with `BUILT_IN_PROVIDERS` (all 11: openrouter, openai, groq,
mistral, deepseek, xai, together, ollama, anthropic, gemini, custom) and `getProviderSpec(id)`.
`ProviderSpec` itself lives in `../types` (not redeclared here) since `Candidate` in `types.ts`
already needed to reference it — avoids a circular type import between `types.ts` and `registry.ts`.
Ollama: authStyle 'none', modelListPath `/api/tags`. OpenRouter: oauth block (authorize/exchange
URLs) + HTTP-Referer/X-Title defaultHeaders. OpenAI: tokenParam `max_completion_tokens` (all others
`max_tokens`). Anthropic: `x-api-key` + anthropic-version + browser-access header; Gemini:
`x-goog-api-key`. Custom: empty baseURL (caller overrides per A8/UI), `authStyle` defaults to
bearer with `supportsJsonResponseFormat:false` (unknown behind an arbitrary compat endpoint).

## Test Plan
No dedicated test file — static data structure. Correctness verified by manual review against
lmfPlan.md A5/A9 and by typecheck. Will be exercised transitively by route.test.ts, adapters.test.ts,
oauthPkce.test.ts in later tasks.

## Test Results
`npx tsc --noEmit` — no errors. Manual check: all 11 provider ids present; openrouter has `oauth` +
`defaultHeaders`; ollama `authStyle:'none'`; openai `tokenParam:'max_completion_tokens'`.

## Issues Found
None.
