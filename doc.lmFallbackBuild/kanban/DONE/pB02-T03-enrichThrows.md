# pB02-T03 — enrichThrows

**Part:** B, **Phase:** 2. **Implements:** lmfPlan.md observation (~line 27: enrichFromText never throws → silent empty bodymap), Phase 2 verify step.

## Description
Make total LLM failure during enrichment surface as an error instead of a silent empty bodymap:
- In **`src/lib/llm/enrich.ts`**: when the underlying LLM call fully fails (engine `ok:false`), throw an `EnrichmentFailedError` (new named error class) rather than returning `EMPTY`. Distinguish "LLM produced nothing / all candidates failed" from "LLM ran but genuinely found no conditions" (the latter still returns empty legitimately).
- In **`src/app/analyzing.tsx`**: catch `EnrichmentFailedError` and route to the pipeline error surface (e.g. airplane-mode upload shows an error, not an empty bodymap).
- Keep only-extracted-text-sent constraint intact.

**Update tests:** `tests/lib/enrich.test.ts` (and `__tests__/lib/pipeline-process.test.ts` if it asserts silent-empty behavior).

## Dependencies
pB02-T01.

## Acceptance criteria
- Typecheck clean; enrich + pipeline tests pass.
- Total LLM failure throws `EnrichmentFailedError`; genuine empty extraction still returns empty without throwing.
- Airplane-mode / all-fail upload reaches an error state in `analyzing.tsx`, not an empty bodymap.

## Implementation Notes

- **Distinguishing "legitimate empty" from "total failure":** `enrichFromText` now checks `result.ok` from `callLLMWithFallback` (unchanged shape after pB02-T02) *before* looking at `result.value`. `result.ok === false` means every model in the fallback chain either errored or failed validation — that's a total failure, so it throws. `result.ok === true` with `value.conditions`/`value.measurements` as empty arrays means a model actually returned valid, well-formed JSON that just had nothing to report — that's returned as `EMPTY` exactly as before, no throw. This also changes behavior for the two "bad JSON" / "missing keys" validate-callback cases in the test suite: those set `ok: false` (validation failure means no model produced a usable candidate), so they now throw too — previously they silently produced `EMPTY`, which was itself part of the bug this task fixes.
- **`EnrichmentFailedError` shape** (`src/lib/llm/enrich.ts`, new named export): `extends Error`, `name = 'EnrichmentFailedError'`, carries `failures: string[]` (the same array `LLMResult.failures` already collects — one entry per candidate model with its failure reason). Message is `LLM enrichment failed: <joined failures>` for logs/debugging; the UI never shows this raw message directly.
- **Pipeline (`src/lib/pipeline.ts`):** no changes needed. `processHealthRecord` already has no try/catch around `enrichFromText`, so the thrown error propagates up to the caller unchanged — identical to how `OcrRequiredError` already bubbles from the extraction step.
- **`analyzing.tsx` routing:** added an `instanceof EnrichmentFailedError` branch inside the existing upload-path `catch (e)` block (the same catch that already handles `OcrRequiredError` generically via `e.message`). On `EnrichmentFailedError` it `console.warn`s the underlying `failures` (for debugging, never surfaced to the user or sent anywhere) and sets a fixed user-facing message: "Could not analyze this record — check your connection or try again." This reuses the pre-existing `errorMsg` state / error-screen UI — no new UI was built. Total-failure and OCR-required both land on the same "Couldn't analyze" screen with a Back button.

## Test Plan

- `tests/lib/enrich.test.ts`: total failure (`ok:false`) throws `EnrichmentFailedError`; the error carries `failures`; a successful call with genuinely empty `conditions`/`measurements` still resolves to `EMPTY` without throwing; the two previously-silent "bad JSON" / "missing required keys" validate-callback cases now assert a throw instead of an empty return; all pre-existing non-empty-extraction and prompt-structure tests still pass unmodified.
- `__tests__/lib/pipeline-process.test.ts`: added one new case asserting `EnrichmentFailedError` thrown by the mocked `enrichFromText` propagates unmodified out of `processHealthRecord` and that zero rows are persisted (mirrors the existing `OcrRequiredError` propagation test). Had to change the module mock from a plain `{ enrichFromText: jest.fn() }` factory to `{ ...jest.requireActual(...), enrichFromText: jest.fn() }` so the real `EnrichmentFailedError` class stays importable in the test alongside the mocked function.
- `npx tsc --noEmit -p .`: clean except the 3 pre-existing `crypto`/`Buffer` errors in `tests/lib/lmf/oauthPkce.test.ts`.
- `npx jest`: full suite passes except the pre-existing, untouched `__tests__/db/provider-recovery.test.ts` failure (confirmed via `git status` — not modified by this task).

## Test Results

QA-verified independently (not just trusting dev report). Read in full: `src/lib/llm/enrich.ts`, `src/app/analyzing.tsx`, `src/lib/pipeline.ts`, `src/lib/llm/client.ts`, `tests/lib/enrich.test.ts`, `__tests__/lib/pipeline-process.test.ts`, `__tests__/screens/analyzing.test.tsx`.

- `npx tsc --noEmit -p .`: clean except the 3 pre-existing `crypto`/`Buffer` errors in `tests/lib/lmf/oauthPkce.test.ts` (unrelated to this task).
- `npx jest tests/lib/enrich.test.ts __tests__/lib/pipeline-process.test.ts __tests__/screens/analyzing.test.tsx --verbose`: 26/26 passed (13 enrich, 8 pipeline-process, 5 analyzing).
- `npx jest` (full suite): 399/400 passed, 1 suite failed (`__tests__/db/provider-recovery.test.ts`) — confirmed pre-existing/unrelated via `git status` (file not modified in this task's diff; failure is an OPFS-recovery mock issue, `cx_percent` TypeError, unrelated to enrichment).

Acceptance criteria — all met:
- (a) Typecheck clean, enrich + pipeline tests pass — confirmed above.
- (b) Total LLM failure throws `EnrichmentFailedError`; genuine empty extraction still returns `EMPTY` without throwing — confirmed by reading `enrich.ts:131-133` (`if (!result.ok) throw new EnrichmentFailedError(result.failures); return result.value ?? EMPTY`) and by `tests/lib/enrich.test.ts` covering both branches explicitly (`'throws EnrichmentFailedError when all models fail'` vs `'returns empty arrays without throwing when the LLM genuinely finds nothing'`).
- (c) Airplane-mode / all-fail upload reaches an error state in `analyzing.tsx`, not an empty bodymap — confirmed by code path: `analyzing.tsx`'s upload-path catch block (lines 478-490) has a dedicated `instanceof EnrichmentFailedError` branch that sets a fixed user-facing `errorMsg`, which renders the "Couldn't analyze" error screen (lines 502-517) instead of proceeding to `setScreen('bodymap')`/`replaceBodymap`. Also confirmed end-to-end at the pipeline layer via `__tests__/lib/pipeline-process.test.ts`'s `'propagates EnrichmentFailedError from a total LLM failure (no rows persisted)'` test, which shows 0 rows land in `health_records` on total failure.

Empty-vs-failure distinction (the crux of the task) — reasoned through independently and confirmed correct:
- `callLLMWithFallback` (`src/lib/llm/client.ts`) only sets `ok: true` when the `validate` callback returns a non-null value for some candidate (via `lmfEnrich`'s outcome). If `validate` (i.e. `parseEnrichment` in `enrich.ts`) returns `null` for every candidate — malformed JSON, or valid JSON missing the `conditions`/`measurements` array keys — every candidate is recorded as a validation failure and `result.ok` ends up `false`. This is correctly classified as "nothing usable was ever produced," which should throw, not silently return `EMPTY`. This is a genuine bug fix, not an over-broad change: a `result.ok === true` with `value = { conditions: [], measurements: [] }` (a model produced valid, well-formed JSON that legitimately found nothing) is structurally distinguishable from `result.ok === false` (no model ever produced valid, well-formed JSON) — the two paths cannot be confused because `parseEnrichment` requires the correct object shape to succeed. Verified via `tests/lib/enrich.test.ts`'s two dedicated "bad JSON" / "missing required keys" tests, both asserting `.rejects.toThrow(EnrichmentFailedError)`.
- No case exists where a genuinely-empty-but-valid extraction is misclassified as a failure, and no case exists where a validation failure is misclassified as a legitimate empty result.

`analyzing.tsx` catch-block routing — checked for misrouting of unrelated errors:
- The `instanceof EnrichmentFailedError` branch is exclusive (if/else) from the generic `else` branch that still handles `OcrRequiredError` and all other errors via `e.message` — unchanged from prior behavior for non-enrichment errors. No broadening of what gets caught; `EnrichmentFailedError` is pulled out into its own branch only to substitute a fixed, non-raw message and add a `console.warn`, not to change which errors reach the error screen.
- `console.warn('[analyzing] enrichment failed —', e.failures.join('; '))` (line 483) does not violate the "API key never logged" hard constraint: traced `failures` back through `enrich.ts` → `client.ts`'s `lmfEnrich`/`lmfChat` → `src/lib/lmf/engine.ts`. Every failure message is built via `makeFailure(..., apiKey)` (engine.ts:255, 275) which passes through `redactSecrets(message, apiKey)` (engine.ts:74) — the API key is scrubbed from failure messages at the engine layer before ever reaching `enrich.ts`'s `EnrichmentFailedError.failures`. The `console.warn` is also dev-only diagnostic output, never rendered to any user-visible surface (`errorMsg` state gets only the fixed string, not `e.failures`).

Minor coverage gap (not a defect, noted for visibility): `__tests__/screens/analyzing.test.tsx` deliberately avoids rendering the full `AnalyzingScreen` component (pre-existing project convention, documented in the file's header comment: "Avoid rendering full component (OOM risk SVG + Animated)"), so there is no component-level test that exercises the `instanceof EnrichmentFailedError` catch branch directly inside `analyzing.tsx`. The behavior is verified instead via unit tests at the `enrich.ts` and `pipeline.ts` layers plus manual code-path reading. This is consistent with the existing testing strategy for this file and not something this task introduced — flagging only so it's visible, not blocking.

## Issues Found

None. Implementation matches the acceptance criteria and the dev agent's own report was accurate on independent verification.
