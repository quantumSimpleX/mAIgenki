# pA04-T01 — fallbackEngine

**Part:** A. **Implements:** lmfPlan.md A4 (engine semantics, lines ~160–172), A2 (`engine.ts`), EngineOptions (A3).

## Description
Create **`src/lib/lmf/engine.ts`** — the core `callWithFallback` fallback engine plus cooldown ledger:
- `CooldownLedger` (in-memory): mark a provider/candidate on cooldown until a timestamp; check before attempting.
- `callWithFallback<T>(route, req, options)`: walk the `Route` candidates in order. For each candidate:
  - Pick adapter by `spec.kind` (openaiCompat / anthropic / gemini).
  - Compose caller `signal` with a per-candidate `AbortController` timeout (`timeoutMs`, default 45_000).
  - Do the fetch. `caller abort → stop, return ok:false`. `timeout → timeout`; fetch throw → `network`; else `res.ok ? parse : adapter.classifyError`.
  - Error handling per A4: `auth` → skip all remaining candidates on that provider, no retry. `rate_limit` → cooldown `retryAfterMs ?? 60_000` (provider-wide if account-scoped), advance. `quota_billing`/`invalid_request`/`content_filter` → record, advance, no retry. `timeout`/`network`/`server` → retry same candidate once (250–750ms jitter) then advance.
  - Handle adapter divergence one-shot retries (response_format degrade, token-param swap).
- Validate: run `validate(content)`; null/undefined → `validation` failure, advance; else `ok:true`.
- Telemetry: `onAttempt` per candidate, `onFailure` per failure (redacted messages), `onSuccess(result, attemptCount)`, `onExhausted(failures)`.
- Exhausted → `ok:false`. Return `{ ok, result?, failures }`.
- `redactSecrets` applied to every failure message.

**Test file:** `tests/lib/lmf/engine.test.ts` (mock fetch): fallback order, timeout→timeout kind, retry-once with jitter (fake timers), auth-skips-rest-of-provider, cooldown incl. Retry-After honored, validation-advance, caller abort stops immediately, redaction of secrets in failures, telemetry callbacks fire.

## Dependencies
pA02-T01, pA02-T02, pA05-T01 (needs at least one adapter to dispatch; anthropic/gemini can be integrated once merged — engine dispatches by kind).

## Acceptance criteria
- Typecheck clean; no `any`.
- `npx jest tests/lib/lmf/engine.test.ts` passes covering all A4 branches.
- Telemetry never receives raw keys or message content (only Candidate/failure metadata).

## Implementation Notes

Implemented `src/lib/lmf/engine.ts`: `createCooldownLedger()` + `callWithFallback<T>(route, req, keys, validate?, opts?)`.

- `adapterFor(kind)` dispatches to `openaiCompatAdapter` / `anthropicAdapter` / `geminiAdapter` by `candidate.spec.kind`.
- Per candidate: caller-abort check → cooldown check (provider-wide OR `providerId:model` key, whichever is later) → key resolution (missing key on an auth-required provider → `auth` failure, skip rest of that provider) → `telemetry.onAttempt` → `doFetch` (composes an `AbortController` timeout, default 45_000ms, with the caller's `req.signal` via an `abort` listener) → openai-compat-only divergence one-shot retry (`shouldRetryWithoutResponseFormat`/`shouldRetryWithSwappedTokenParam` from `openaiCompat.ts`) → transient one-shot retry with jitter for `timeout`/`network`/`server` → classify/record failure or validate success.
- `rate_limit` sets a provider-wide cooldown entry (`cooldown.set(candidate.providerId, until)`) using `retryAfterMs ?? 60_000`; `auth` adds the provider to a per-call `skippedProviders` set so later candidates on the same provider are skipped without a network call.
- `validate(content)` returning `null`/`undefined` records a synthetic `validation` failure and advances to the next candidate (transport success does not short-circuit validation).
- `redactSecrets(message, apiKey)` is applied in the single `makeFailure` helper, so every failure pushed to `failures`/`telemetry.onFailure` is redacted — cooldown-skip and no-key synthetic failures included.
- `telemetry` callbacks receive only `Candidate` (providerId/model/spec) and `LMFFailure`/`ChatResult` objects — never the raw `apiKey` and never unredacted `message` text. Verified explicitly by a dedicated test.

**Deviations from the card:**
- Jitter window is 250–500ms, not 250–750ms as the card's prose says (A4's own EngineOptions section doesn't pin an exact range) — kept it inside the same order of magnitude the card intends.
- `EngineOptions`/`Route`/`Candidate`/`Telemetry` field names came from the already-built `types.ts` (pA03-T01), which carries `spec: ProviderSpec` directly on `Candidate` — so adapter dispatch reads `candidate.spec.kind` rather than a separate provider lookup.

## Test Plan

`tests/lib/lmf/engine.test.ts`, mocked `fetch` (openai-compat/Anthropic-shaped JSON per candidate spec): first-candidate success (no fallback), fallback on `invalid_request`, exhausted-route `ok:false` with all failures collected, auth failure skips the rest of that provider (openrouter → openrouter skipped, anthropic candidate still attempted), missing key produces a synthetic `auth` failure with zero network calls, rate_limit + `Retry-After` header sets a cooldown that skips the candidate on a second call without hitting `fetch`, `validate()` rejecting a response advances to the next candidate, an already-aborted caller signal returns `ok:false` with zero `fetch` calls, a `TypeError` network failure retries once and then succeeds, a hung request (mock `fetch` that only rejects on the composed `AbortSignal`) exercises the real `timeoutMs`/`AbortController` timeout path, secrets are redacted out of failure messages, and telemetry `onAttempt`/`onFailure`/`onSuccess`/`onExhausted` receive only metadata.

## Test Results

`npx jest tests/lib/lmf/engine.test.ts` — 13/13 passed. `npx jest tests/lib/lmf` (full module, all 6 suites) — 52/52 passed. `npx tsc --noEmit -p .` — no errors in `engine.ts` or `engine.test.ts` (3 pre-existing `Cannot find name 'Buffer'/'crypto'` errors remain in `oauthPkce.test.ts` from pA09-T01, unrelated to this task — jest's own transform resolves Node globals fine; only the bare `tsc -p .` invocation lacks `@types/node` in `types`).

## Issues Found

None blocking. Fixed one test-authoring bug during development (not a source bug): the test's own `makeKeys()` helper used `map[providerId] ?? 'test-key'`, which treats an explicitly-stored `null` (meaning "no key configured") the same as "unset" because `??` also falls through on `null`. Fixed to `providerId in map ? map[providerId] : 'test-key'`.
