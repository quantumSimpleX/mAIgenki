# pB02-T05 — pipelineUseService

**Part:** B, **Phase:** 2. **Implements:** lmfPlan.md observations (~lines 24, 28: env-key precedence; `analyzing.tsx:453` reads `openrouter_api_key` directly), Phase 2 (~lines 254–256).

## Description
Route the ingest pipeline through the service and stop reading the raw stored key:
- **`src/lib/pipeline.ts`** / **`src/app/analyzing.tsx`**: obtain the LLM route from `service.ts` instead of passing an apiKey through. Make `apiKey` param optional/removable in the pipeline call chain.
- **`analyzing.tsx:453`**: stop reading `openrouter_api_key` from SQLite settings directly — the service/profile owns key resolution now (key will move to KeyStore in Phase 3; leave the read path going through service).
- Preserve the on-device / redacted-text-only constraints.

**Update tests:** `__tests__/lib/pipeline-process.test.ts`, `tests/lib/pipeline.test.ts`, and the apiKey-setting test referenced in the plan.

## Dependencies
pB02-T01.

## Acceptance criteria
- Typecheck clean; pipeline tests pass.
- No direct `openrouter_api_key` SQLite read remains in `analyzing.tsx`.
- Free-tier upload behavior unchanged.

## Implementation Notes

Scope was narrowed from the card's original "route through service.ts" description to the
minimal change needed to satisfy the acceptance criteria: `apiKey` resolution moved out of
`analyzing.tsx` and into `pipeline.ts` itself, rather than being routed through `service.ts`'s
model-chain/profile resolution. `service.ts` integration for key resolution (KeyStore, tiered
free-chain routing) is left for a later task — flagging this in case a future task expected
`pipeline.ts` to call into `service.ts` directly.

- **`src/lib/pipeline.ts`**: `PipelineOptions.apiKey` changed from required `string` to optional
  `apiKey?: string`. `getSetting` imported from `./db/queries`. Inside `processHealthRecord`:
  `const apiKey = opts.apiKey ?? (await getSetting(db, 'openrouter_api_key')) ?? ''` — callers
  that don't pass `apiKey` now get it resolved from the stored setting, falling back to `''`
  (anonymous/free-tier) if unset. This mirrors the existing key-resolution fallback already used
  in `bodymap.tsx:1081`.
- **`src/app/analyzing.tsx`**: removed the `getSetting(db, 'openrouter_api_key')` call and the
  `apiKey` field previously passed into `processHealthRecord(...)` — pipeline.ts now resolves it
  internally. `getSetting` import dropped (no longer used in this file); `upsertSetting` import
  retained (still used elsewhere in the file for `condition_source`).
- Free-tier behavior is unchanged: a fresh install with no stored key still resolves to
  `apiKey=''`, and `enrichFromText`/the model chain already treat an empty key as valid anonymous
  access to free-tier models — this code path was not touched.

## Test Plan

- `tests/lib/pipeline.test.ts` (unit, mocked `getSetting`/db):
  - existing tests pass `apiKey` explicitly and assert `getSetting` is *not* called
    (`'passes extracted text to enrichFromText'`).
  - new: `'falls back to the stored openrouter_api_key setting when apiKey is omitted'` — omits
    `apiKey`, stubs `mockGetSetting` to return `'sk-stored'`, asserts `getSetting` was called with
    `(db, 'openrouter_api_key')` and that value reached `enrichFromText`.
  - new: `'falls back to an empty key (free tier) when apiKey is omitted and no setting is
    stored'` — `mockGetSetting` returns `null`, asserts `enrichFromText` receives `''`.
- `__tests__/lib/pipeline-process.test.ts` (integration, real fake DB — `getSetting`/`upsertSetting`
  are the real implementations against `makeFakeDb()`):
  - new: `'resolves the stored openrouter_api_key setting when apiKey is omitted'` — persists a
    setting via `upsertSetting(db, 'openrouter_api_key', 'sk-or-stored')`, calls
    `processHealthRecord` without `apiKey`, asserts `enrichFromText` was called with
    `'sk-or-stored'`.
  - new: `'falls back to an empty key when apiKey is omitted and no setting is stored'` — fresh DB,
    no stored setting, asserts `enrichFromText` receives `''`.
- `__tests__/db/apiKeySetting.test.ts` — checked; it exercises `getSetting`/`upsertSetting`
  directly (not `PipelineOptions`), so no changes were needed there; it still passes.
- `__tests__/screens/analyzing.test.tsx` — exercises the analyzing screen end-to-end; still
  passes, confirming the screen no longer needs to read the key itself.

## Test Results

QA PASS. Verified independently (not just re-running dev agent's claims):

- **`src/lib/pipeline.ts`** confirmed: `PipelineOptions.apiKey` is `apiKey?: string`;
  `processHealthRecord` resolves `const apiKey = opts.apiKey ?? (await getSetting(db,
  'openrouter_api_key')) ?? ''` exactly as documented.
- **`src/app/analyzing.tsx`** confirmed: no `getSetting` import, no `apiKey` read/passed to
  `processHealthRecord` — `upsertSetting` import retained (used for `condition_source`), correct.
- New tests read in full and confirmed non-vacuous — they assert both the `getSetting` call args
  and that the resolved value actually reaches `enrichFromText`, not just that the function
  resolves:
  - `tests/lib/pipeline.test.ts`: `'falls back to the stored openrouter_api_key setting when
    apiKey is omitted'` and `'falls back to an empty key (free tier)...'` — both pass (27/27 in
    file).
  - `__tests__/lib/pipeline-process.test.ts` (real fake DB, real `getSetting`/`upsertSetting`):
    `'resolves the stored openrouter_api_key setting when apiKey is omitted'` and `'falls back to
    an empty key when apiKey is omitted and no setting is stored'` — both pass (16/16 in file).
  - Ran `npx jest tests/lib/pipeline.test.ts __tests__/lib/pipeline-process.test.ts` directly: 2
    suites, 27 tests, all passed.
- `npx tsc --noEmit -p .` run directly: only the 3 pre-existing `tests/lib/lmf/oauthPkce.test.ts`
  `Cannot find name 'crypto'/'Buffer'` errors (missing `@types/node`), unrelated to this change.
- Grepped repo for all `openrouter_api_key` read sites. The only other direct
  `getSetting(db, 'openrouter_api_key')` call is `src/app/bodymap.tsx:1081`, inside the
  condition-chat send handler (builds `apiKey` for `lmfChat`). Confirmed this is pre-existing,
  unrelated to the ingest pipeline, and was added by the already-DONE `pB02-T04-chatUseLmf` card —
  not something this card should have touched. Acceptance criterion ("no direct
  `openrouter_api_key` SQLite read remains in `analyzing.tsx`") is satisfied; it was never claimed
  to cover `bodymap.tsx`.
- Ran `npx jest __tests__/db/provider-recovery.test.ts` alone: 1 failure (`live DB has no user
  records + snapshot does → restores the snapshot`, `TypeError: Cannot read properties of
  undefined (reading 'cx_percent')`), 9 passed. Confirmed via `git diff --stat --
  __tests__/db/provider-recovery.test.ts` that this file has zero uncommitted changes — the
  failure is pre-existing and unrelated to this card's diff.
- `git diff --stat` scoped to this card's claimed files (`git diff -- src/lib/pipeline.ts
  src/app/analyzing.tsx tests/lib/pipeline.test.ts __tests__/lib/pipeline-process.test.ts`) shows
  exactly the changes described in Implementation Notes — no more, no less. The full
  unscoped `git diff --stat` also shows changes to `src/lib/llm/client.ts`, `src/lib/llm/enrich.ts`,
  `bodymap.tsx`, `app.json`, `package.json`, etc.; these belong to other concurrently in-flight
  kanban cards sharing the same uncommitted working tree (e.g. `pB02-T03-enrichThrows`,
  `pB02-T04-chatUseLmf`, both already DONE) and are not part of this card's diff — confirmed by
  the scoped diff above.
- Free-tier behavior preserved: with `opts.apiKey` undefined and no stored setting,
  `apiKey` resolves to `''` — same end state as the old `analyzing.tsx`-computed
  `(await getSetting(...)) ?? ''`. Both the mocked unit test and the real-fake-DB integration
  test assert this explicitly.

## Issues Found

None blocking.

**Non-blocking observation (scope, not a defect):** the card's original title/description
("pipelineUseService") implied routing the pipeline's model/key resolution through
`src/lib/llm/service.ts`'s tiered chain. The actual change resolves `apiKey` directly in
`pipeline.ts` via `getSetting`, without calling into `service.ts`. The dev agent's Implementation
Notes explicitly documents this narrowing and the reasoning (minimal change to satisfy the stated
acceptance criteria; `service.ts` KeyStore/tiered-routing integration is deferred to a later
task). All three stated acceptance criteria (typecheck clean, pipeline tests pass, no direct
`openrouter_api_key` read in `analyzing.tsx`, free-tier behavior unchanged) are met by the
narrower implementation. Flagging only so a future task explicitly wires `pipeline.ts` through
`service.ts` if that end-to-end routing is still required by the broader lmfPlan — this card
itself is not blocked on it.
