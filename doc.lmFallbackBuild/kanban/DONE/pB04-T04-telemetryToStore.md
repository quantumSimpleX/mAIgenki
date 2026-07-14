# pB04-T04 — telemetryToStore

**Part:** B, **Phase:** 4. **Implements:** lmfPlan.md A1 (degradation ladder: ok→degraded→exhausted), Phase 4/6 (telemetry drives status).

## Description
Wire the service's injected `Telemetry` object to the store setters from pB04-T01:
- In **`src/lib/llm/service.ts`**, provide a real `Telemetry` implementation that maps LMF signals to store status:
  - Any `rate_limit` (429) or `quota_billing` (402) failure seen during a call (even one that ultimately succeeds) → set `llmStatus:'degraded'` and record `lastLlmFailureKind`.
  - `onExhausted` (all candidates failed) → `llmStatus:'exhausted'`.
  - `onSuccess` with no degradation → keep/restore `'ok'`.
- Telemetry must receive **no message content and no keys** (by construction — only Candidate/failure metadata). Do not log keys.

**Test file:** `tests/lib/service.test.ts` (or extend) — simulate engine outcomes (mock fetch: 429-then-success → degraded; all-fail → exhausted; clean success → ok).

## Dependencies
pB04-T01, pB02-T01.

## Acceptance criteria
- Typecheck clean; service telemetry test passes.
- Store status transitions match the degradation ladder.
- Telemetry never carries keys or message content.

## Implementation Notes

- `src/lib/llm/service.ts`: added `createStoreTelemetry()`, a factory returning a fresh `Telemetry`
  object per call. It closes over a call-scoped `degradingKind` variable (not module state), set by
  `onFailure` when a failure's `kind` is `'rate_limit'` or `'quota_billing'`. `onSuccess` restores
  `llmStatus:'ok'` unless a degrading failure was seen this call, in which case it sets
  `llmStatus:'degraded'` + `lastLlmFailureKind`. `onExhausted` sets `llmStatus:'exhausted'` and records
  the final failure's `kind` (not required by the acceptance criteria, but cheap and matches the
  field's evident purpose — no consumer reads it yet). Store writes go through
  `useAppStore.getState().setLlmStatus(...)` / `setLastLlmFailureKind(...)` since `service.ts` is not a
  React component.
- Added `composeTelemetry(store, caller)` so a caller-supplied `opts.telemetry` (tests, future
  callers) still fires alongside the store-updating telemetry instead of replacing it. Both
  `lmfChat` and `lmfEnrich` now pass `composeTelemetry(createStoreTelemetry(), opts.telemetry)` to
  `callWithFallback` instead of the bare `opts.telemetry` passthrough.
- Telemetry callbacks only ever touch `Candidate`/`LMFFailure`/`ChatResult` metadata (`kind`,
  `providerId`, `model`, `status`) — no `message`/`content` field is read or logged anywhere in the
  new code, satisfying the "no keys, no message content" constraint by construction.
- Merge note: this file was concurrently edited by pB07-T02 (refresh-chain wiring —
  `maybeRefreshModelChain`, the `refresh.ts`/`getSetting` imports). The Telemetry edit was kept
  additive: new imports appended to the existing `@/lib/lmf` import, the two new
  functions inserted above `TIER_0_PROFILE`, and only the `telemetry:` line of each
  `callWithFallback` options object changed. The refresh-chain code was left untouched.
- Added `export function __resetCooldownLedgerForTests()` (clears the module-level
  `cooldownLedger`). Needed because the ledger is a real-time, module-scoped `Map` shared across
  every test in the file; a rate-limit test that sets a provider-wide cooldown would otherwise leak
  into later tests in the same run. Not used by app code.

## Test Plan

Extended `tests/lib/llm/service.test.ts` with a `describe('telemetry -> store status', ...)` block:
- **Degraded + kind recorded**: a two-provider profile/keys fixture (`groq` primary, `openrouter`
  fallback) where the primary returns 429 and the fallback succeeds → asserts
  `llmStatus:'degraded'` and `lastLlmFailureKind:'rate_limit'` after an overall `ok:true` result.
  (A single-provider 429-then-retry setup was tried first but doesn't exercise this path: OpenRouter
  cooldowns are provider-wide, so a same-provider retry after 429 is skipped as "on cooldown" before
  ever calling `fetch` again — two providers were needed to reach a real post-degradation success.)
- **Exhausted**: two free-chain models (same provider) both return 400 (`invalid_request` — chosen
  over 500 to avoid the engine's one-shot transient retry on `server`/`network`/`timeout` kinds,
  which would otherwise make the mock-fetch call count ambiguous) → asserts `llmStatus:'exhausted'`.
- **Clean success**: single mocked 200 response → asserts `llmStatus:'ok'`.
- **Caller override preserved**: passes `opts.telemetry = { onSuccess: jest.fn() }` alongside a
  clean success → asserts the caller's `onSuccess` still fires (composition didn't drop it).
- **No cross-call leak**: runs the degrading two-provider call first (asserts `'degraded'`), then a
  second, unrelated clean-success call → asserts `llmStatus` returns to `'ok'`, proving
  `degradingKind` is call-scoped and not a module-level leak.
- Store is reset via `useAppStore.setState({ ...initialStoreState }, true)` in `beforeEach`,
  mirroring the pattern in `__tests__/store/useAppStore.test.ts`. `__resetCooldownLedgerForTests()`
  is also called in `beforeEach` for the reason noted above.

## Test Results

QA-verified independently (re-ran everything below rather than trusting the dev report).

- `npx tsc --noEmit -p .` — reproduced clean except the same 3 pre-existing
  `tests/lib/lmf/oauthPkce.test.ts` `TS2591` (missing `@types/node`) errors.
- `npx jest tests/lib/llm/service.test.ts __tests__/store/useAppStore.test.ts tests/lib/llm-refresh.test.ts`
  — 73/73 passed (73, not 53 — dev's count only covered 2 of the 3 files sharing this module;
  ran `llm-refresh.test.ts` too, since it also imports `service.ts` and exercises the concurrent
  pB07-T02 refresh wiring living in the same file. All pass, no interaction regressions).
- Full `npx jest` run — 433/434 passed, 42/43 suites passed. The one failure
  (`__tests__/db/provider-recovery.test.ts`, `TypeError: Cannot read properties of undefined
  (reading 'cx_percent')`) is confirmed pre-existing/unrelated DB-recovery code this task never
  touched.
- `npx eslint src/lib/llm/service.ts tests/lib/llm/service.test.ts` — clean, no output.

**Code review findings (all PASS):**
- `createStoreTelemetry()` / `composeTelemetry()` coexist cleanly with pB07-T02's
  `maybeRefreshModelChain` wiring in `service.ts` — both `lmfChat` and `lmfEnrich` call
  `maybeRefreshModelChain(...)` (fire-and-forget, unrelated code path) and then pass
  `composeTelemetry(createStoreTelemetry(), opts.telemetry)` into `callWithFallback`'s options.
  No logical conflict; the two features don't share state.
- **Call-scoping confirmed**: `createStoreTelemetry()` is called fresh inside `lmfChat` (line 184)
  and `lmfEnrich` (line 216), i.e. inside the function body per invocation — not module-level. Its
  `degradingKind` variable is a `let` closed over by the returned object, created anew on each
  call. Traced the module for any stray module-level "degrading" flag — none exists (only
  `cooldownLedger` and `refreshTriggered` are module state, both unrelated to telemetry).
- **`composeTelemetry()` confirmed**: calls `store.on*` then `caller.on*` (with `?.` guards) for
  all four hooks (`onAttempt`, `onFailure`, `onSuccess`, `onExhausted`) when `caller` is present;
  returns `store` bare when no caller telemetry is supplied. No hook is dropped.
- **No-secrets claim confirmed**: `onFailure`/`onSuccess`/`onExhausted` in `createStoreTelemetry`
  only read `f.kind` and `failures[...].kind` — no `message`, `content`, or key material is read,
  logged, or stored anywhere in the new code.
- **Test block reviewed line-by-line** (`tests/lib/llm/service.test.ts:84-147`): all 5 tests are
  real, not tautological.
  - Degraded test: mocks a real 429-then-200 fetch sequence via a two-provider fixture, asserts
    both `llmStatus:'degraded'` and `lastLlmFailureKind:'rate_limit'` after an `ok:true` result —
    genuinely exercises the fallback path.
  - Exhausted test: two 400 responses, asserts `llmStatus:'exhausted'`.
  - Clean-ok test: single 200, asserts `llmStatus:'ok'`.
  - Caller-override test: asserts `onSuccess` jest.fn() was actually called
    (`toHaveBeenCalledTimes(1)`), not just that the outer call succeeded — correctly guards against
    composeTelemetry silently dropping the caller hook.
  - No-cross-call-leak test: runs the degrading two-provider call first, asserts `'degraded'`,
    then issues a second unrelated clean call and asserts `llmStatus` is back to `'ok'` — a real
    regression test for the exact bug class (module-level leak) that closure-scoping guards
    against.
- **`__resetCooldownLedgerForTests()` verified real and necessary**: `cooldownLedger` is declared
  `const cooldownLedger: CooldownLedger = createCooldownLedger()` at module scope (service.ts:31)
  — a genuine shared singleton across all tests in a file that doesn't reset modules between
  tests. `tests/lib/llm/service.test.ts` calls it in `beforeEach` (line 31) alongside
  `useAppStore.setState(...)`. `tests/lib/llm-refresh.test.ts` also imports `service.ts`
  (dynamically, via `await import('@/lib/llm/service')` at 4 call sites) but does not call
  `__resetCooldownLedgerForTests()` — however this is safe, not a gap: its `beforeEach` calls
  `jest.resetModules()` (line 249), which forces a fresh module instance (and thus a fresh
  `cooldownLedger`) on every `await import` in that file, making the reset hook redundant there.
  None of its fixtures ever mock a 429 response, so there was never a leak risk in that file to
  begin with.

## Issues Found

None. Verdict: PASS.
