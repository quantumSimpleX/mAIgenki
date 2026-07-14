# pB03-T02 — keyStoreImpl

**Part:** B, **Phase:** 3. **Implements:** lmfPlan.md A8 (key handling), Phase 3 (~line 262).

## Description
Create **`src/lib/llm/keystore.ts`** implementing the `KeyStore` interface (from `lmf/types.ts`):
- Native: `SecureStoreKeyStore` using expo-secure-store, keys `lmf.key.<providerId>` (`setItemAsync`/`getItemAsync`/`deleteItemAsync`).
- Web: `LocalStorageKeyStore` using `localStorage` (SecureStore has no web support — document the plaintext caveat; matches OpenRouter's browser-key trust model).
- Native-unavailable (`isAvailableAsync()` false) → in-memory session-only store + a visible "key won't persist" notice flag (surface via a returned capability, never fall back to SQLite).
- A `makeKeyStore()` factory selecting the right impl by platform.
- **Never** store keys in SQLite settings. Never log key values.

**Test file:** `tests/lib/keystore.test.ts` — mock expo-secure-store + localStorage: set/get/delete round-trip native; web localStorage path; isAvailableAsync-false → in-memory + notice; SQLite never touched.

## Dependencies
pB03-T01, pA03-T01 (KeyStore interface).

## Acceptance criteria
- Typecheck clean; `npx jest tests/lib/keystore.test.ts` passes.
- Verified SDK-56 expo-secure-store API (setItemAsync/getItemAsync/deleteItemAsync/isAvailableAsync).
- No SQLite write path for keys; no key logging.

## Implementation Notes

Created `src/lib/llm/keystore.ts` implementing `KeyStore` (`get(providerId)`/`set(providerId, key)`/`delete(providerId)`) from `src/lib/lmf/types.ts`:

- `SecureStoreKeyStore` — native, wraps `expo-secure-store`'s `setItemAsync`/`getItemAsync`/`deleteItemAsync` under key pattern `lmf.key.<providerId>`.
- `LocalStorageKeyStore` — web, wraps `localStorage` under the same key pattern; plaintext caveat documented inline (matches OpenRouter's own browser-key trust model, lmfPlan.md A8).
- `InMemoryKeyStore` — session-only `Map`-backed fallback for native when `SecureStore.isAvailableAsync()` resolves `false`; exposes a `readonly persistent = false` field.
- `isPersistentKeyStore(store)` — capability-flag helper callers use to decide whether to show a "key won't persist" notice. Reads an optional `persistent` field (default `true` when absent, so `SecureStoreKeyStore`/`LocalStorageKeyStore` don't need to declare it explicitly).
- `makeKeyStore()` — async factory: `Platform.OS === 'web'` → `LocalStorageKeyStore`; else awaits `SecureStore.isAvailableAsync()` → `SecureStoreKeyStore` if true, `InMemoryKeyStore` if false.

No SQLite import anywhere in the module (test asserts this via source-text check). No key values are ever passed to `console.*`.

API verified against SDK 56 docs (https://docs.expo.dev/versions/v56.0.0/sdk/securestore/) and Context7 `/expo/expo`: `setItemAsync(key, value, options?): Promise<void>`, `getItemAsync(key, options?): Promise<string | null>`, `deleteItemAsync(key, options?): Promise<void>`, `isAvailableAsync(): Promise<boolean>` (resolves `true` on Android/iOS only — no web support, confirming the native/web split above is correct).

## Test Plan

`tests/lib/keystore.test.ts` (mocks `expo-secure-store` via `jest.mock`, stubs `globalThis.localStorage`, toggles `Platform.OS` per the repo's existing `Object.defineProperty(Platform, 'OS', …)` pattern from `__tests__/lib/pdf-extract-web.test.ts`):

- `SecureStoreKeyStore`: set/get/delete round-trip calls the right `expo-secure-store` methods with the `lmf.key.<providerId>` key; missing key returns `null`; reports `isPersistentKeyStore` true.
- `LocalStorageKeyStore`: set/get/delete round-trip against a stubbed `localStorage`; reports persistent true.
- `InMemoryKeyStore`: set/get/delete round-trip in-memory; reports persistent false.
- `makeKeyStore()`: web → `LocalStorageKeyStore` without calling `isAvailableAsync`; native + `isAvailableAsync() → true` → `SecureStoreKeyStore`; native + `isAvailableAsync() → false` → `InMemoryKeyStore` (non-persistent, no `setItemAsync` call).
- SQLite isolation: reads the source file and asserts no `lib/db` or `expo-sqlite` reference.

## Test Results

QA-verified independently (not just re-running dev's claims).

- **Interface conformance**: `SecureStoreKeyStore`, `LocalStorageKeyStore`, `InMemoryKeyStore` all implement `KeyStore` (`get`/`set`/`delete`) from `src/lib/lmf/types.ts` exactly — matched signatures line by line.
- **Key namespacing**: `storageKey(providerId) = 'lmf.key.<providerId>'` applied consistently across all three get/set/delete implementations (native and web).
- **Platform branching**: `makeKeyStore()` branches explicitly on `Platform.OS === 'web'` first (returns `LocalStorageKeyStore` without ever calling `isAvailableAsync()`), not a try/catch-on-SecureStore-failure pattern — confirmed by test `picks LocalStorageKeyStore on web without touching SecureStore.isAvailableAsync`.
- **In-memory fallback path is real**: `makeKeyStore()` calls `SecureStore.isAvailableAsync()` on native and routes to `InMemoryKeyStore` when it resolves `false`; `isPersistentKeyStore()` correctly reads `InMemoryKeyStore.persistent = false` (via `?? true` default for the other two classes) and reflects it for UI consumers. Confirmed via the `falls back to an in-memory session-only store...` test, which also asserts `setItemAsync` was never called in that path.
- **No key logging**: grepped `keystore.ts` and `keystore.test.ts` for `console.` — zero matches in either file.
- **No SQLite path**: `keystore.ts` has no import of `src/lib/db/*` or `expo-sqlite`; the test suite itself also asserts this at runtime by reading the source file and checking it doesn't match `/lib\/db/` or `/expo-sqlite/`.
- **expo-secure-store SDK 56 API verified independently** via WebFetch of https://docs.expo.dev/versions/v56.0.0/sdk/securestore/ (context7 `/expo/expo` only has sdk-54/sdk-55 branches indexed, so used the versioned docs site directly): `setItemAsync(key: string, value: string, options?): Promise<void>`, `getItemAsync(key: string, options?): Promise<string | null>`, `deleteItemAsync(key: string, options?): Promise<void>`, `isAvailableAsync(): Promise<boolean>` (true on Android/iOS only, no web support). Matches implementation's usage exactly.
- **Test quality**: read all 10 tests in `tests/lib/keystore.test.ts` — real, non-vacuous. `expo-secure-store` mocked via `jest.mock` with controllable `jest.fn()`s; `localStorage` stubbed per-`describe` via `globalThis.localStorage` with a real backing `Map` (so round-trip assertions exercise actual get/set/delete logic, not just mock-call assertions); `Platform.OS` toggled via `Object.defineProperty` per existing repo pattern and restored in `afterEach`. Tests assert both the correct backing-store methods were called AND the correct class instance was returned.
- `npx tsc --noEmit -p .` — clean except the 3 pre-existing `tests/lib/lmf/oauthPkce.test.ts` errors (missing `@types/node` for `crypto`/`Buffer`), unrelated to this task and pre-existing per dev's report. Confirmed independently.
- `npx jest tests/lib/keystore.test.ts` — 10/10 passed, confirmed independently (see output: SecureStoreKeyStore x3, LocalStorageKeyStore x2, InMemoryKeyStore x1, makeKeyStore x3, SQLite isolation x1).
- Scope check (`git status --short` / `git diff --stat`): this task's footprint is exactly `src/lib/llm/keystore.ts` (new) + `tests/lib/keystore.test.ts` (new). All other unstaged/untracked changes (client.ts, enrich.ts, pipeline.ts, service.ts, lmf/, tests/lib/llm/, tests/lib/lmf/, doc.lmFallbackBuild/, etc.) belong to concurrent kanban tasks and were not touched by this change.

**Verdict: PASS.**

## Issues Found

None. No blocking or non-blocking issues identified. Implementation matches the `KeyStore` interface, the acceptance criteria are all met, the security-critical constraints (no key logging, no SQLite storage) hold, and the SDK-56 API usage is verified correct against the live versioned docs.
