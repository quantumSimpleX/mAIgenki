# pB07-T02 — refreshWire

**Part:** B, **Phase:** 7. **Implements:** lmfPlan.md Phase 7 (~line 292: wire shouldRefresh into service init).

## Description
Wire the (now-simplified) model-chain refresh into service initialization:
- In **`src/lib/llm/service.ts`** init (after DB ready), call `shouldRefresh` (30-day gate); if due, fire-and-forget `refreshModelChain` — must not block startup or the first request.
- On refresh failure: leave the existing chain untouched (self-healing when free models get delisted, but never worse than current).
- Ensure no unhandled promise rejection (swallow/log-without-secrets on failure).

**Test file:** `tests/lib/service.test.ts` or `tests/lib/llm-refresh.test.ts` — shouldRefresh gate respected (skips when recent); failure leaves chain intact; fire-and-forget doesn't block init.

## Dependencies
pB07-T01, pB02-T01.

## Acceptance criteria
- Typecheck clean; tests pass.
- Refresh is fire-and-forget, gated at 30 days, failure-safe.

## Implementation Notes

Wired in `src/lib/llm/service.ts` only — `src/lib/llm/refresh.ts` untouched.

- Added `maybeRefreshModelChain(db, apiKey)`: reads `llm_chain_last_checked` via
  `getSetting` (`src/lib/db/queries.ts`), checks `shouldRefresh`, and if due calls
  `refreshModelChain(db, apiKey)` — all inside a `.then/.catch(() => {})` chain that
  is never awaited by the caller and never throws.
- Guarded by a module-level `refreshTriggered` flag so the setting lookup + gate
  check happens at most once per process lifetime, since `lmfChat`/`lmfEnrich` fire
  per message, not per app launch. No-ops entirely when `db` is undefined (matches
  existing `resolveFreeChain` behavior for callers without a DB, e.g. some tests).
- Called (not awaited) at the top of both `lmfChat` and `lmfEnrich`, using
  `resolveOpenRouterApiKey(opts.apiKey ?? '')` — the same BYOK/env key-resolution
  precedence `envKeyStore` already uses, so no new key-resolution path was invented.
- `refreshModelChain` already swallows its own fetch/parse errors and returns
  `DEFAULT_MODELS` without calling `updateModelChain` on failure, so a failed
  refresh leaves the persisted `llm_model_chain` setting (and therefore the active
  chain) untouched — confirmed via test, not just re-asserted from the pB07-T01 code.
- Kept the diff scoped to the refresh-wiring concern: did not touch the
  Telemetry-callback logic in `lmfChat`/`lmfEnrich` (owned by the concurrent
  pB04-T04 task) or `src/store/useAppStore.ts`.

## Test Plan

Added a `service.ts refresh wiring` describe block to `tests/lib/llm-refresh.test.ts`
(kept in this file per the card's suggestion, rather than the telemetry-focused
`tests/lib/llm/service.test.ts`). Because `refreshTriggered` is a module-level flag,
each test calls `jest.resetModules()` in `beforeEach` and re-imports `lmfChat` via
`await import('@/lib/llm/service')` for isolation. Mocks `global.fetch`, branching by
URL (`/chat/completions` vs `/models?max_price=0`) to separate the chat call from the
refresh call, and a fake `SQLiteDatabase` (`getFirstAsync`/`runAsync`) standing in for
settings storage.

- **shouldRefresh gate respected**: DB seeded with a `llm_chain_last_checked`
  timestamp 5 days old; asserts the models-list endpoint is never fetched.
- **fire-and-forget doesn't block**: DB has no timestamp (refresh due); the
  models-list fetch mock never resolves; asserts `lmfChat` still resolves with the
  chat result, proving the caller isn't waiting on the refresh network call.
- **refresh failure leaves chain intact**: models-list fetch rejects; asserts
  `lmfChat` still resolves `ok: true` and that `db.runAsync` was never called with
  the `llm_model_chain` settings key (i.e. `updateModelChain` never ran).
- **triggers at most once per process**: two sequential `lmfChat` calls against the
  same (freshly imported) service module; asserts the models-list endpoint was
  fetched exactly once.

## Test Results

**Verdict: PASS**

- `npx tsc --noEmit -p .` — clean except the 3 pre-existing `tests/lib/lmf/oauthPkce.test.ts` errors (missing `@types/node` for `crypto`/`Buffer`), unrelated to this card.
- `npx jest tests/lib/llm-refresh.test.ts` — 20/20 passing, including the new "service.ts refresh wiring" describe block (4 tests).
- `npx eslint src/lib/llm/service.ts tests/lib/llm-refresh.test.ts` — clean, no output.
- `npx jest tests/lib/llm` (full llm suite incl. `tests/lib/llm/service.test.ts`) — **9/9 passing**, all suites green. At the time of this QA pass, `tests/lib/llm/service.test.ts` shows none of the ~5 failures the dev agent reported as pre-existing from pB04-T04; that sibling task has apparently progressed since the report was written. This is informational, not a pB07-T02 defect either way — see independent tracing below.

**Code review of `src/lib/llm/service.ts`:**
- `maybeRefreshModelChain` is genuinely fire-and-forget: called (not awaited) at the top of both `lmfChat` (line 169) and `lmfEnrich` (line 201); the function itself is `void`-returning and synchronous at the call boundary (the async work is a detached `.then/.catch` chain).
- Gated correctly: `if (!db || refreshTriggered) return` followed by `refreshTriggered = true` before any await, so concurrent/rapid calls within the same process can only trigger the check once (no race where two calls both pass the flag check before either sets it, since the check-and-set happens synchronously).
- No unhandled rejection risk: `getSetting(...).then(...).catch(() => {})` covers both the setting lookup and (since `refreshModelChain` is invoked inside the `.then`) implicitly covers a rejection from `refreshModelChain` too — but `refreshModelChain` (`src/lib/llm/refresh.ts` lines 93-124) already wraps its body in try/catch and never rejects, so this is defense in depth, not load-bearing.
- No synchronous throw before the `lmfChat`/`lmfEnrich` call proceeds: `resolveOpenRouterApiKey` (`src/lib/llm/client.ts:30-32`) is a synchronous string op (`trim() || fallback`) that cannot throw for any input, including `opts.apiKey` being undefined (defaults to `''` via `opts.apiKey ?? ''`).
- Key resolution reuses the existing precedence: `resolveOpenRouterApiKey(opts.apiKey ?? '')`, the same call `envKeyStore` (line 134) already uses — no new/parallel key-resolution path was invented. No key material is logged anywhere in the new code (`maybeRefreshModelChain`, the `.then/.catch` chain, or `refreshModelChain`/`shouldRefresh` in `refresh.ts`).
- `src/lib/llm/refresh.ts` — confirmed NOT touched by pB07-T02. `git diff HEAD -- src/lib/llm/refresh.ts` does show a working-tree diff (103 lines changed), but this is pB07-T01's own uncommitted simplification (scoreModel/SCORE_WEIGHTS rework — matches the "(now-simplified)" language in this card's own description and in the `service.ts` file-header comment), predating pB07-T02 and nothing in it references `maybeRefreshModelChain` or anything service.ts-specific. Since nothing in this phase is committed yet there's no clean before/after diff to isolate pB07-T02's non-contribution mechanically, but reading the full file confirms it's a coherent, self-contained scoring module with no seams suggesting a second author touched it for this card.

**New test block review (`tests/lib/llm-refresh.test.ts`, "service.ts refresh wiring", lines 219-324):** all 4 tests are meaningful, not vacuous.
- *Gate test* (255-273): seeds `llm_chain_last_checked` 5 days old, asserts the `/models?max_price=0` endpoint is never called — genuinely exercises `shouldRefresh` returning false and short-circuiting before any fetch.
- *Fire-and-forget test* (275-286): no timestamp (refresh due), models-list mock is `new Promise(() => {})` (never resolves) — if the refresh were awaited, `lmfChat` would hang and the test would time out; instead it asserts `lmfChat` resolves promptly with the chat result, which is a real proof of non-blocking behavior, not just an assertion of the outcome.
- *Failure test* (288-306): models-list fetch rejects, asserts `lmfChat` still resolves ok and that `db.runAsync` was never called with `llm_model_chain` as the key — correctly verifies `updateModelChain` never ran, i.e. the chain is genuinely untouched, not just that no error propagated.
- *Once-per-process test* (308-323): two sequential `lmfChat` calls against the same freshly-`jest.resetModules()`-imported service module, asserts the models-list endpoint fetched exactly once — correctly exercises the module-level `refreshTriggered` flag via a fresh module instance per test (isolating cross-test bleed) while proving persistence *within* a test.

**Independent tracing of service.test.ts interaction (item 5 of the QA brief):** Read `tests/lib/llm/service.test.ts` in full. Every single call to `lmfChat`/`lmfEnrich` in that file omits `opts.db` (calls pass only `apiKey`, `models`, `profile`/`keys`, or `telemetry` — never `db`). Since `maybeRefreshModelChain` starts with `if (!db || refreshTriggered) return`, the new code path is a complete no-op for every test in that suite — it never calls `getSetting`, never touches `mockFetch`, and cannot consume a `mockFetch.mockResolvedValueOnce(...)` slot meant for the actual chat/enrich call. **Finding: pB07-T02's diff is confirmed inert with respect to `tests/lib/llm/service.test.ts`; it is not a contributing factor to the failures the dev agent described.** (Separately, as noted above, that suite is fully green at the time of this QA pass regardless.)

**Scope confirmation:** `src/lib/llm/service.ts` changes are confined to the refresh-wiring concern (the `maybeRefreshModelChain` function, its two call sites, and the associated imports/comment). No changes to the Telemetry-callback logic (`createStoreTelemetry`, `composeTelemetry`) or `src/store/useAppStore.ts`, consistent with the Implementation Notes' claim of staying out of pB04-T04's territory.

## Issues Found

None. No defects attributable to pB07-T02.

Informational only: `tests/lib/llm/service.test.ts`'s previously-reported ~5 failures (attributed to concurrent, in-progress pB04-T04 work) were not observed during this QA pass — the suite is 9/9 green. This is not a pB07-T02 regression or fix; pB07-T02's refresh-wiring code is provably inert in that suite (no test passes `db`, so `maybeRefreshModelChain` never fires). Whatever state pB04-T04 is in should be independently verified by whoever QAs that card.
