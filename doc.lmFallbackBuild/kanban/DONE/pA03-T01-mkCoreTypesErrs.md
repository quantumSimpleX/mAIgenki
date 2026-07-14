# pA03-T01 — mkCoreTypesErrs

**Part:** A. **Implements:** lmfPlan.md A2 (module layout), A3 (core interfaces, lines ~74–150), A4 (error semantics), A8 redaction.

## Description
Create the two foundational, dependency-free files of `src/lib/lmf/`:

**`src/lib/lmf/types.ts`** — all shared types from A3:
- `ChatMessage`, `ChatRequest` (messages, temperature?, maxTokens?, responseFormat?, signal?), `ChatResult` (content, providerId, model, finishReason, usage).
- `Candidate` (providerId + model + resolved spec), `Route` (ordered Candidate[]).
- `LMFProfile` (tier 0|1|2|3, activeProviderId, model, customBaseURL, fallbackToFree default true, keySource 'oauth'|'manual'|null).
- Injected interfaces: `KeyStore` (get/set/delete), `ConfigStore` (get/set), `Telemetry` (onAttempt/onFailure/onSuccess/onExhausted — never receives message content or keys).
- `AuthStyle` = 'bearer' | 'x-api-key' | 'x-goog-api-key' | 'none'.
- `EngineOptions` (timeoutMs default 45_000, retryTransient default true, cooldown, telemetry, fetchImpl).

**`src/lib/lmf/errors.ts`**:
- `LMFErrorKind` union: `auth | rate_limit | quota_billing | invalid_request | content_filter | timeout | network | server | validation`.
- `LMFFailure` type (providerId, model, kind, message, retryAfterMs?).
- `classifyHttp(status, body?)` → LMFErrorKind (401/403→auth, 429→rate_limit, 402→quota_billing, 400→invalid_request, 5xx→server, etc.).
- `redactSecrets(msg, loadedKey?)` → strips `Bearer \S+`, `sk-…`, `sk-or-…`, `AIza…`, and any passed currently-loaded key value.

No imports from app code, expo-*, RN, SQLite, or Zustand. No `any`.

## Dependencies
None.

## Acceptance criteria
- Both files compile under `npm run typecheck`.
- All types/functions are named exports.
- `redactSecrets` removes each documented secret pattern + a supplied literal key.
- `classifyHttp` maps the status codes above correctly.
- No forbidden imports (grep clean of expo/react-native/zustand/sqlite in these files).

## Implementation Notes
Created `src/lib/lmf/types.ts` (ChatMessage/ChatRequest/ChatResult, Candidate/Route, LMFProfile,
KeyStore/ConfigStore/Telemetry, AuthStyle, ProviderSpec, EngineOptions, LMFResult<T>) and
`src/lib/lmf/errors.ts` (LMFErrorKind, LMFFailure, classifyHttp, redactSecrets). All named exports,
no `any`. `Telemetry`/`LMFResult` reference `LMFFailure` via `import('./errors')` type-only import to
avoid a circular value import while keeping both files independently self-contained.

## Test Plan
No dedicated unit test file (pure type + two small pure functions) — covered by:
1. `npm run typecheck` passes with these files included.
2. Manual grep for forbidden imports (expo-, react-native, zustand, sqlite) — clean.
3. `classifyHttp` and `redactSecrets` are exercised indirectly by consumers (engine.test.ts,
   adapters.test.ts) in later tasks; will add a focused `errors.test.ts` in pA04-T01 if gaps found.

## Test Results
- `npx tsc --noEmit` — no errors in `src/lib/lmf/types.ts` or `src/lib/lmf/errors.ts`.
- `grep -inE "expo-|react-native|zustand|sqlite" src/lib/lmf/types.ts src/lib/lmf/errors.ts` — only
  match is the descriptive comment itself, not an actual import.

## Issues Found
None.
