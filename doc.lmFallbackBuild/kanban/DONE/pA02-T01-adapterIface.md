# pA02-T01 — adapterIface

**Part:** A. **Implements:** lmfPlan.md A2 (`adapters/types.ts`), A5 (adapter responsibilities).

## Description
Create **`src/lib/lmf/adapters/types.ts`** — the `Adapter` interface all three concrete adapters implement:
- `buildRequest(spec, candidate, req, key)` → `{ url, method, headers, body }` (a fetch-ready descriptor).
- `parseResponse(spec, res, rawText/json)` → `ChatResult` (content, finishReason, usage).
- `classifyError(spec, status, body)` → `LMFFailure` (adapter-specific mapping on top of `classifyHttp`).

Import types from `../types` and `../errors`. Keep the interface pure (no fetch call inside — the engine performs the fetch; the adapter only builds/parses/classifies). No `any`.

## Dependencies
pA03-T01.

## Acceptance criteria
- File compiles under typecheck.
- Interface uses only types from `../types`/`../errors`; no I/O.
- Named export `Adapter`.

## Implementation Notes
Created `src/lib/lmf/adapters/types.ts` with `Adapter` interface: `buildRequest(spec, model, apiKey,
req) -> WireRequest`, `parseResponse(spec, model, json) -> ChatResult`, `classifyError(spec, status,
json, headers) -> ClassifiedError`. Signature uses `model: string` + `apiKey: string | null` rather
than a combined `candidate` object, matching how the engine resolves the key separately before
calling the adapter (A4 step 2: key resolution happens in the engine, not the adapter). Pure
interface, no I/O; imports only from `../types` and `../errors`.

## Test Plan
No dedicated test file — pure interface with no runtime logic. Exercised transitively by the three
concrete adapter test files (pA05-T01/02/03) which implement and use it.

## Test Results
`npx tsc --noEmit` — no errors.

## Issues Found
None.
