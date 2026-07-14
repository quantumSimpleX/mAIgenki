# pA09-T01 — openrouterPkce

**Part:** A. **Implements:** lmfPlan.md A9 (OpenRouter OAuth PKCE, lines ~217–228), A2 (`oauth/openrouterPkce.ts`).

## Description
Create **`src/lib/lmf/oauth/openrouterPkce.ts`** — pure PKCE logic with crypto + fetch injected (no expo-* imports here):
- `createPkcePair(randomBytes, sha256)` → `{ codeVerifier, codeChallenge }` (S256: challenge = base64url(sha256(verifier))). Crypto primitives passed in as functions so the module stays dependency-free.
- `buildAuthorizeURL(spec, { codeChallenge, redirectUri, state? })` → OpenRouter authorize URL with `code_challenge`, `code_challenge_method=S256`, `callback_url`/`redirect_uri` per OpenRouter's PKCE contract.
- `exchangeCode(spec, { code, codeVerifier }, fetchImpl)` → `{ key }` via POST to exchange URL; classify errors: 403 → "verifier invalid — try again"; 400 → internal bug.

Verify OpenRouter's exact PKCE param names/endpoints (see lmfPlan.md A9 and registry oauth fields). No `any`.

**Test file:** `tests/lib/lmf/oauthPkce.test.ts`: challenge = base64url(sha256(verifier)) with injected fakes; authorize URL contains code_challenge + S256; exchangeCode posts code+verifier and returns key on 200; 403/400 error classification.

## Dependencies
pA03-T01.

## Acceptance criteria
- Typecheck clean; no `any`; no expo-* / RN imports.
- `npx jest tests/lib/lmf/oauthPkce.test.ts` passes.
- S256 challenge derivation verified against a known vector.

## Implementation Notes
Created `src/lib/lmf/oauth/openrouterPkce.ts`. `createPkcePair(randomBytes, sha256Base64)` takes
both crypto primitives as injected async functions (the app layer wires `expo-crypto`'s
`getRandomBytesAsync`/`digestStringAsync`); a hand-rolled base64/base64url encoder is used internally
instead of `btoa`/`Buffer` so the module has zero runtime dependencies and stays typecheck-clean in
a React Native target (no Node `Buffer` global). `buildAuthorizeURL` sets `callback_url`,
`code_challenge`, `code_challenge_method=S256`. `exchangeCode` POSTs to `spec.oauth.exchangeURL` and
classifies 403 as `verifier_invalid`, 400 as `internal`, per A9.

## Test Plan
`tests/lib/lmf/oauthPkce.test.ts`: `createPkcePair` challenge verified as base64url(sha256(verifier))
by independently recomputing both sides with Node's `crypto` module in the test (test file only,
not the source module); `buildAuthorizeURL` param presence; `exchangeCode` success/403/400 paths.

## Test Results
`npx jest tests/lib/lmf/oauthPkce.test.ts` — 5 tests passed. `npx tsc --noEmit` — no errors, no
expo-*/react-native imports in the source file (manual review).

## Issues Found
None.
