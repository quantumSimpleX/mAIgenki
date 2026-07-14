# pB05-T01 — oauthConnect

**Part:** B, **Phase:** 5 (OpenRouter OAuth PKCE). **Implements:** lmfPlan.md A9 (~lines 217–228), Part B intro (`src/lib/llm/oauth.ts`).

## Description
Create **`src/lib/llm/oauth.ts`** — `connectOpenRouter()` app-wiring around the pure `openrouterPkce.ts`:
- Generate PKCE pair using **expo-crypto** (random bytes + SHA-256) passed into `createPkcePair`.
- Build redirect URL with **expo-linking** (app scheme `maigenki`; completion route `oauth/openrouter`).
- Persist the code verifier to `ConfigStore` under `lmf_oauth_pending` **before** launching the browser (native cold-launch survival); delete after exchange.
- Open the authorize URL with **expo-web-browser** `openAuthSessionAsync(url, redirectUrl)`; on `{type:'success', url}` parse `code`, call `exchangeCode`.
- On success: `KeyStore.set('openrouter', key)`, set profile → tier 1 / `keySource:'oauth'`, run a background `validateKey` sanity check.
- Verify expo-web-browser / expo-linking / expo-crypto APIs against **Expo SDK 56** docs (context7 or versioned docs).
- Hard constraint: the OAuth-issued key is stored only in KeyStore, never logged, only ever sent to OpenRouter.

**Test file:** `tests/lib/oauth.test.ts` — mock expo-* modules + fetch: verifier persisted before launch + deleted after; success path stores key + sets tier 1/oauth; 403 exchange → "try again" surfaced; user-cancel leaves tier 0.

## Dependencies
pA09-T01 (pkce), pB03-T02 (keystore), pB03-T03 (profile).

## Acceptance criteria
- Typecheck clean; `npx jest tests/lib/oauth.test.ts` passes.
- Verified against Expo SDK 56 web-browser/linking/crypto APIs.

## Implementation Notes

Created `src/lib/llm/oauth.ts` exporting:
- `connectOpenRouter(db, fetchImpl?)` — the full PKCE flow: generate pair → persist verifier → open browser → handle result → exchange → activate.
- `completeOAuthExchange(db, code, codeVerifier, fetchImpl?)` — the exchange + activation step (exchangeCode → KeyStore.set → saveProfile tier 1/oauth → background validateKey), factored out so the future `pB05-T02` cold-launch completion route can reuse it without duplicating the exchange, per that card's note ("Reuse `connectOpenRouter`/exchange logic from `oauth.ts`").
- `getPendingVerifier(db)` — reads the `lmf_oauth_pending` SQLite settings row, also for `pB05-T02`'s native cold-launch path.

Design decisions:
- No new `ConfigStore` implementation was added — the pending verifier is persisted directly via the existing `getSetting`/`upsertSetting`/`deleteSetting` helpers in `src/lib/db/queries.ts` (same settings-KV table `LMFProfile` already uses), keyed `lmf_oauth_pending`. This matches the "reuse rather than invent" guidance; a `ConfigStore`-typed wrapper wasn't needed since only this module and the future completion route touch the key.
- `connectOpenRouter` takes `db: SQLiteDatabase` directly (not a `ConfigStore`), matching the existing `loadProfile(db)`/`saveProfile(db, ...)` calling convention in `profile.ts`.
- Redirect-URL error handling: `?error=` query param on the success-typed redirect is checked before assuming a `code` is present, and a missing `code` with no `error` is treated as a distinct "unexpected" error case.
- `WebBrowserAuthSessionResult` is narrowed via `result.type === 'success'` first (the only branch with a literal `'success'` type on `WebBrowserRedirectResult`); the remaining `WebBrowserResult.type` field is a `WebBrowserResultType` string enum, and narrowing via enum-typed equality checks first did not eliminate branches correctly under `tsc`, so `'success'` must be checked first.
- Background `validateKey` sanity check is fire-and-forgotten via `.catch(() => {})` (never awaited, never throws unhandled) — same pattern already used for `maybeRefreshModelChain` in `service.ts`.
- The OAuth-issued key is never logged and is only ever read/written through `KeyStore` (`makeKeyStore()` → `SecureStore`/`localStorage`/in-memory per platform) — `exchangeCode` is the only network call carrying it, and it posts only to `spec.oauth.exchangeURL` (`https://openrouter.ai/api/v1/auth/keys`).

Expo SDK 56 docs verified (via `WebFetch` against the exact versioned URLs, since no `v56_0_0` Context7 branch was available):
- `https://docs.expo.dev/versions/v56.0.0/sdk/webbrowser/` — confirmed `openAuthSessionAsync(url, redirectUrl?, options?): Promise<WebBrowserAuthSessionResult>` and the exact result shapes: `{type:'success', url}`, `{type:'cancel'}`, `{type:'dismiss'}`, `{type:'locked'}`; and the user-gesture requirement on web (`ERR_WEB_BROWSER_BLOCKED` if not called directly from an interaction).
- `https://docs.expo.dev/versions/v56.0.0/sdk/linking/` — confirmed `Linking.createURL(path, options?)` signature and that it always returns a scheme-based string built from `expo.scheme` (`maigenki`), varying only by environment (native build vs. web dev/prod vs. Expo Go).
- `https://docs.expo.dev/versions/v56.0.0/sdk/crypto/` — confirmed `Crypto.getRandomBytesAsync(byteCount): Promise<Uint8Array>` and `Crypto.digestStringAsync(algorithm, data, options?): Promise<string>`, plus exact enum names `CryptoDigestAlgorithm.SHA256` (`"SHA-256"`) and `CryptoEncoding.BASE64` (`"base64"`), used here since `createPkcePair`'s injected `sha256Base64` expects base64 (it applies its own base64→base64url conversion internally).

## Test Plan

`tests/lib/oauth.test.ts` (8 tests, all passing), mocking `expo-crypto`, `expo-linking`, `expo-web-browser`, and `@/lib/llm/keystore` (`makeKeyStore`), with `exchangeCode`'s real logic exercised against an injected mock `fetch`:
- Success: verifier is persisted (readable via `getPendingVerifier`) *before* `openAuthSessionAsync` is called; after a successful exchange the key lands in the mocked `KeyStore`, the profile is set to `tier: 1` / `activeProviderId: 'openrouter'` / `keySource: 'oauth'`, and the pending verifier is deleted afterward.
- Success also preserves pre-existing `model`/`customBaseURL`/`fallbackToFree` profile fields instead of clobbering them.
- 403 exchange failure surfaces the exact "Authorization expired or invalid — try again." message, and does **not** store a key or write a profile row; pending verifier is still cleaned up.
- 400 exchange failure surfaces a message distinct from the 403 "try again" message (asserted via a negative regex match), and does not store a key.
- A `?error=` query param on the redirect URL short-circuits before ever calling `exchangeCode` (asserted via `mockFetch` not being called).
- User `cancel` and `dismiss` results both leave tier 0 intact, clean up the pending verifier, and never call `exchangeCode`.
- `locked` result returns a `status: 'locked'` result without calling `exchangeCode`.

## Test Results

Re-verified independently from scratch (a prior QA pass was interrupted mid-way by an infra session limit, not a code defect).

- `npx tsc --noEmit -p .`: clean except the same 3 pre-existing, unrelated `tests/lib/lmf/oauthPkce.test.ts` errors (`TS2591 Cannot find name 'crypto'/'Buffer'` — missing `@types/node`, belongs to the already-DONE pA09-T01 card, not this one).
- `npx jest tests/lib/oauth.test.ts`: 8/8 passing (success, profile-field-preservation, 403, 400, `?error=` redirect, cancel, dismiss, locked).
- `npx eslint src/lib/llm/oauth.ts tests/lib/oauth.test.ts`: 0 errors, 2 warnings (`import/first` on the two imports that must follow the `jest.mock(...)` calls) — confirmed the identical pattern already exists in `tests/lib/keystore.test.ts` (2 pre-existing warnings there too), so this is a repo-wide accepted style, not new debt.
- `git status --short`: only `src/lib/llm/oauth.ts` and `tests/lib/oauth.test.ts` are new from this card; `src/app/oauth/openrouter.tsx` (pB05-T02) and the Connect-button wiring (pB05-T03) do not exist yet — both correctly still in `kanban/TODO/`.
- PKCE reuse confirmed: `oauth.ts` imports `createPkcePair`/`buildAuthorizeURL`/`exchangeCode` from `@/lib/lmf` (→ the pure `src/lib/lmf/oauth/openrouterPkce.ts`, pA09-T01) and does not reimplement any PKCE math itself.
- Verifier lifecycle traced through every branch of `connectOpenRouter`: persisted via `upsertSetting` before `openAuthSessionAsync` is called; deleted via `clearPendingVerifier` on `locked`, `cancel`/`dismiss`, `?error=`, missing-`code`, and after `completeOAuthExchange` regardless of its outcome. No path leaves it lingering. Test confirms verifier is readable mid-flow (before the mocked browser call resolves) and `null` afterward in every branch.
- KeyStore/tier writes: `completeOAuthExchange` (this card) calls `makeKeyStore().set('openrouter', key)` and `saveProfile(db, {...profile, tier: 1, activeProviderId: 'openrouter', keySource: 'oauth'})` directly — **not** deferred to `pB05-T03`. Confirmed against `pB05-T03-connectWiring.md`, which itself says "store already updated by oauth.ts" — the two cards agree on the split. `pB05-T03` only needs to wire the button press and the post-success model-pick affordance.
- Expo SDK 56 doc APIs re-verified via WebFetch against the exact versioned URLs (not training-data assumptions):
  - `webbrowser/`: confirmed `openAuthSessionAsync(url, redirectUrl?, options?): Promise<WebBrowserAuthSessionResult>`, result shapes `{type:'success', url}` / `{type:'cancel'|'dismiss'|'opened'|'locked'}`, and the web user-gesture / secure-context requirements (`ERR_WEB_BROWSER_BLOCKED`, `ERR_WEB_BROWSER_CRYPTO`).
  - `linking/`: confirmed `Linking.createURL(path, options?)` and that on native it returns a scheme-based URL while on web it returns an origin-based URL (`https://host:port/path`) — so the code's single `Linking.createURL(OAUTH_REDIRECT_PATH)` call correctly handles both branches of A9 step 3 without needing an explicit web/native fork in this file.
  - `crypto/`: confirmed `getRandomBytesAsync(byteCount): Promise<Uint8Array>`, `digestStringAsync(algorithm, data, options?): Promise<string>`, and the exact enum values `CryptoDigestAlgorithm.SHA256 = "SHA-256"` / `CryptoEncoding.BASE64 = "base64"` used in the code.
- No `console.*` calls in `oauth.ts`; the exchanged key only ever flows through `KeyStore` and is only ever POSTed to `spec.oauth.exchangeURL` (`https://openrouter.ai/api/v1/auth/keys`), confirmed by reading `exchangeCode` in `openrouterPkce.ts`.

**Verdict: PASS**, with two non-blocking findings below (neither reproduces in the current unit-test suite; both are timing/environment-dependent and worth a manual check during the Phase 5 "manual on native dev build / web" verification step already called for in `lmfPlan.md`).

## Issues Found

- **[Medium] No timeout on the key-exchange POST, despite A9 step 6 explicitly requiring one ("15s timeout").** `exchangeCode` in `src/lib/lmf/oauth/openrouterPkce.ts` (pA09-T01, already DONE) calls `fetchImpl(...)` with no `AbortController`/timeout at all, and `completeOAuthExchange` in this card calls it directly with no wrapper. If OpenRouter's `/api/v1/auth/keys` endpoint hangs or a mobile network stalls mid-request, `connectOpenRouter` never resolves — the Connect flow is stuck indefinitely with no error surfaced and no way out short of an app restart. **Impact:** any user hitting a slow/hung network during the exchange step gets silently stuck. **Likelihood:** low in normal conditions, more likely on flaky mobile networks. **Recommendation:** add an `AbortController`-based ~15s timeout, either inside `exchangeCode` itself (fixing it for both this card and any other future caller) or as a wrapper around the `exchangeCode` call in `completeOAuthExchange`. No test in `oauth.test.ts` or the pA09-T01 pkce tests currently exercises a hung/timed-out fetch, so this gap wasn't caught by either card's suite — worth a follow-up test once the timeout is added.
- **[Low/Medium, web-only, flag for manual QA] Multiple `await`s occur between the user's button press and the `openAuthSessionAsync` call, which is exactly the situation Chrome/Safari's popup-blocker heuristic targets.** `connectOpenRouter` does `await createPkcePair(...)` (crypto digest) and `await upsertSetting(...)` (SQLite write) *before* calling `WebBrowser.openAuthSessionAsync`. Per the SDK 56 docs fetched above: "Mobile web, Chrome and Safari will block any call to window.open() which takes too long to fire after a user interaction," throwing `ERR_WEB_BROWSER_BLOCKED`. The code comment says "that constraint is on the caller, not here," but the awaited work inside this function itself is what sits between the click and the popup call on the web target — it isn't purely the caller's responsibility. In practice these operations are fast (low-millisecond crypto + a single SQLite write) so many browsers will likely tolerate it, but this is exactly the scenario the docs warn about and isn't covered by any test (the test suite mocks `expo-web-browser` directly, so it can't catch real popup-blocking behavior). **Recommendation:** no code change required now, but explicitly exercise the web Connect button manually (per `lmfPlan.md` Phase 5's already-planned "web (popup + `maybeCompleteAuthSession`)" manual verification step) before shipping, to confirm it isn't blocked in Safari/Chrome-mobile-web in practice.
- No other defects found. PKCE reuse, redirect URL handling, authorize-URL construction, result-type narrowing, verifier lifecycle, KeyStore/profile activation, and secret-handling all match the A9 spec and this card's own test plan.
