# pA02-T03 — lmfIndexBarrel

**Part:** A. **Implements:** lmfPlan.md A2 (`index.ts` public surface + "porting LMF" header comment).

## Description
Create **`src/lib/lmf/index.ts`** — the public surface of the LMF module:
- Re-export the intended public API: core types (from `types.ts`), `LMFErrorKind`/`LMFFailure`/`redactSecrets` (errors), `BUILT_IN_PROVIDERS`/`ProviderSpec`/`getProviderSpec` (registry), `callWithFallback`/`CooldownLedger` (engine), `buildRoute` (route), `listModels`/`CURATED_MODELS` (models), `validateKey`, PKCE helpers (oauth).
- Header comment "**Porting LMF**": document that this module is dependency-free (no app/expo/RN/SQLite/Zustand imports) and that all platform specifics (SecureStore, SQLite, expo-web-browser, expo-crypto, Zustand) are injected via `KeyStore`/`ConfigStore`/`Telemetry`/`fetchImpl` or provided by the app wiring layer. List what a consumer must supply to port it.
- Do not export internal-only helpers.

## Dependencies
pA03-T01 through pA09-T01 (barrel over all core files).

## Acceptance criteria
- Typecheck clean; `import { ... } from '@/lib/lmf'` resolves the public API.
- Header porting comment present and accurate.
- No app/expo/RN imports anywhere in `src/lib/lmf/`.

## Implementation Notes
Created `src/lib/lmf/index.ts` as a pure re-export barrel — no new logic, only `export`/`export type` statements plus the header comment. Re-exports: all core types from `types.ts` (`ChatRole` through `LMFResult`); `LMFErrorKind`/`LMFFailure` (type) and `classifyHttp`/`redactSecrets` (value) from `errors.ts`; `BUILT_IN_PROVIDERS`/`getProviderSpec` from `registry.ts` (`ProviderSpec` itself already re-exported via the `types.ts` type block, since it's declared there); `callWithFallback`/`createCooldownLedger` from `engine.ts`; `buildRoute` from `route.ts`; `listModels`/`CURATED_MODELS` from `models.ts`; `validateKey` (value) + `ValidateKeyResult` (type) from `validateKey.ts`; `createPkcePair`/`buildAuthorizeURL`/`exchangeCode` (value) + `PkcePair`/`ExchangeResult` (type) from `oauth/openrouterPkce.ts`. No internal-only helpers (e.g. `adapterFor`, `authHeaders`, `doFetch`, `jitterDelay`) are exported. The "Porting LMF" header comment documents the dependency-free nature of `src/lib/lmf/` and enumerates exactly what a consuming app must inject: `fetchImpl` (via `EngineOptions`), `KeyStore`, `ConfigStore`, `Telemetry`, and OAuth browser-launch glue (kept outside `lmf/` since it needs `expo-web-browser`/similar).

## Test Plan
1. `npx tsc --noEmit -p .` — confirm the barrel introduces no new type errors project-wide.
2. Grep `src/lib/lmf/` for `expo-`, `react-native`, `@/store`, `@/lib/db`, `zustand` import specifiers — confirm none exist (only a descriptive comment mentioning these names, not an actual import).
3. New smoke test `tests/lib/lmf/index.test.ts`: imports the full intended public surface from `@/lib/lmf` and asserts each value export is the expected type (function) and each registry/model constant is defined — this is what actually proves `import { ... } from '@/lib/lmf'` resolves correctly end-to-end, not just that the individual source files typecheck in isolation.
4. Run the full `tests/lib/lmf` suite to confirm no regressions from adding the barrel.

## Test Results
- `npx tsc --noEmit -p .`: only the 3 known pre-existing `tests/lib/lmf/oauthPkce.test.ts` errors (`Cannot find name 'crypto'/'Buffer'` — missing `@types/node` in the bare `tsc -p .` CLI invocation's `types` field; jest's own transform resolves these fine, all jest runs pass). No errors from `index.ts` or any file it touches.
- Grep confirmed zero actual `expo-*`/`react-native`/`@/store`/`@/lib/db`/`zustand` imports anywhere under `src/lib/lmf/`; the one grep hit (`types.ts` line 3) is the descriptive "No imports from..." comment itself, not an import statement.
- `npx jest tests/lib/lmf`: 8 suites, 66/66 tests passed (65 pre-existing + 1 new barrel smoke test).

## Issues Found
The barrel initially omitted `export type { PkcePair, ExchangeResult }` from `oauth/openrouterPkce.ts` — caught by re-reading that file's exact exports before finalizing, and added before verification. No other issues.
