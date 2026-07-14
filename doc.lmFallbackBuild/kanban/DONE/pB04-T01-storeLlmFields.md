# pB04-T01 — storeLlmFields

**Part:** B, **Phase:** 4 (provider settings UI). **Implements:** lmfPlan.md A1 (degradation ladder), Phase 4 (telemetry-driven status), Phase 6 (status consumed by nudges).

## Description
Add LLM status state to **`src/store/useAppStore.ts`** so telemetry + UI can share degradation state:
- Fields: `llmTier` (0|1|2|3), `llmStatus` ('ok'|'degraded'|'exhausted'), `lastLlmFailureKind` (LMFErrorKind | null).
- Setters: `setLlmTier`, `setLlmStatus`, `setLastLlmFailureKind` (or a single `applyLlmTelemetry` reducer).
- Keep these ephemeral/session (do not persist to SQLite unless already the store's pattern; status is transient).

**Test file:** extend the store test (or `tests/lib/*store*` / `__tests__`) — setters update state; defaults are tier from profile / status 'ok'.

## Dependencies
None.

## Acceptance criteria
- Typecheck clean; store test passes.
- New fields + setters exported via the store hook; no `any`.

## Implementation Notes

Added to `src/store/useAppStore.ts`:
- Fields: `llmTier: 0 | 1 | 2 | 3` (default `0`), `llmStatus: 'ok' | 'degraded' | 'exhausted'` (default `'ok'`), `lastLlmFailureKind: LMFErrorKind | null` (default `null`).
- `LMFErrorKind` imported from `@/lib/lmf` — it's already re-exported from the barrel (`src/lib/lmf/index.ts` line 45), so no need to reach into `errors.ts` directly.
- Setters: `setLlmTier`, `setLlmStatus`, `setLastLlmFailureKind` — individual setters, not a reducer. Every other field in this store (including grouped ones like `birthYear`/`birthMonth`, `editingCondDate`/`editDateInput`) uses its own single-field `set({ field })` setter; only `startAnalyze`/`startDemoAnalyze`/`selectCondition` (full screen-transition actions) bundle multiple fields, and telemetry updates don't fit that "transition" shape. Matching the store's existing 1:1 setter convention.
- Persistence: none. Checked `readInitialConditionSource`/`persistConditionSource` — the only fields with manual persistence (via `localStorage`) are `conditionSource`, because it needs to survive a screen reload. No persist middleware is used anywhere in this store. LLM telemetry is transient per the card and per lmfPlan.md, so it's plain in-memory `create()` state like the rest of the store (e.g. `screen`, `chatMessages`, `pipelineError`).

## Test Plan

Extended `__tests__/store/useAppStore.test.ts` with a new `llm telemetry` describe block:
- Defaults: `llmTier` is `0`, `llmStatus` is `'ok'`, `lastLlmFailureKind` is `null`.
- `setLlmTier` updates `llmTier`.
- `setLlmStatus` updates `llmStatus`.
- `setLastLlmFailureKind` sets a kind (`'rate_limit'`) and clears it back to `null`.

## Test Results

QA-verified independently (not just re-trusting dev report):
- `src/store/useAppStore.ts` read in full: `llmTier: 0|1|2|3` (default `0`), `llmStatus: 'ok'|'degraded'|'exhausted'` (default `'ok'`), `lastLlmFailureKind: LMFErrorKind | null` (default `null`) present exactly as claimed, with matching setters `setLlmTier`/`setLlmStatus`/`setLastLlmFailureKind` — each a plain 1:1 `set({ field })`, consistent with the store's existing convention. No `any`.
- `LMFErrorKind` confirmed genuinely exported from `src/lib/lmf/index.ts` line 45 (`export type { LMFErrorKind, LMFFailure } from './errors'`).
- Persistence confirmed absent for the 3 new fields: the only manual-persistence field in the store is `conditionSource` (via `readInitialConditionSource`/`persistConditionSource` → `localStorage`, key `maigenki_condition_source`); no persist middleware exists anywhere in the store. `llmTier`/`llmStatus`/`lastLlmFailureKind` are plain in-memory `create()` state, matching other ephemeral fields (`screen`, `chatMessages`, `pipelineError`).
- `__tests__/store/useAppStore.test.ts` "llm telemetry" describe block (lines 224-244) read in full: 4 real tests with real assertions against store state via `get()` — defaults, `setLlmTier`, `setLlmStatus`, and `setLastLlmFailureKind` (set then clear back to `null`). Not stub/no-op tests.
- `npx tsc --noEmit -p .` run — output is exactly the 3 pre-existing `tests/lib/lmf/oauthPkce.test.ts` TS2591 errors (`crypto`/`Buffer` Node types), unrelated to this change. No new errors.
- `npx jest __tests__/store/useAppStore.test.ts` run — 44/44 passed, including all 4 new "llm telemetry" tests.
- `git diff --stat -- src/store/useAppStore.ts __tests__/store/useAppStore.test.ts` — 2 files changed, 36 insertions(+), 0 deletions(-). Scope matches exactly what's described in Implementation Notes; no unrelated changes.

**Verdict: PASS.**

## Issues Found

None.
