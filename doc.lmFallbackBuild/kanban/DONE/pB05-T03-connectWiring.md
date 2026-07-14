# pB05-T03 — connectWiring

**Part:** B, **Phase:** 5. **Implements:** lmfPlan.md A9 step 7 + Phase 4/5 (Connect OpenRouter CTA behavior).

## Description
Wire the **Connect OpenRouter** button in `ProviderSettings.tsx` to the real flow:
- On press → call `connectOpenRouter()` from `oauth.ts`.
- On success → profile becomes tier 1 (`keySource:'oauth'`); prompt/allow the user to pick a default model (curated list) if none set.
- On cancel/failure → leave tier 0 intact; show a non-blocking error message (403 → "try again").
- Reflect new tier/status in the settings status line (store already updated by oauth.ts).

## Dependencies
pB05-T01, pB04-T02.

## Acceptance criteria
- Typecheck clean; Connect button triggers `connectOpenRouter`.
- Successful connect → tier 1 + model-pick affordance; cancel → tier 0 unchanged.

## Implementation Notes

- Wired the "Connect OpenRouter" button's `onPress` (previously a no-op `() => {}`) to a new `handleConnect` in `ProviderSettings.tsx` that calls `connectOpenRouter(db)` from `oauth.ts`. Per `oauth.ts`'s own contract (confirmed via its QA-passed tests in `tests/lib/oauth.test.ts`), `connectOpenRouter` already performs the KeyStore write and the tier-1/`keySource:'oauth'` profile write on success — this card only reacts to the `OAuthConnectResult`, it never calls `saveProfile` itself.
- `OAuthConnectResult` branches handled:
  - `{ status: 'success' }` → re-reads the profile via `loadProfile(db)` (the on-disk copy oauth.ts just wrote) and applies it to local component state + the store, then sets an inline status message: "Connected via OpenRouter." if a model is already set, or "Connected via OpenRouter — pick a model below." if not (reuses the existing curated/all-models picker UI from pB04-T02 as-is — no new picker built).
  - `{ status: 'cancelled' }` → no-op; tier 0 stays untouched, no message shown (this is a normal user action, not an error).
  - `{ status: 'locked' | 'error', message }` → the `message` string from `oauth.ts` is shown verbatim in an inline error `Text` under the Connect button (reusing the existing `styles.errorText`). `oauth.ts` already distinguishes a 403 ("Authorization expired or invalid — try again.") from a 400/other exchange failure and from an `?error=` redirect param, so this card does not re-derive that distinction — it just surfaces whatever message `oauth.ts` returns.
- Button shows an `ActivityIndicator` (matching the existing Validate-button pattern) while `connecting` is true, and is disabled while connecting or when there's no `db`.
- Found and fixed a related gap while wiring this: nothing in the app ever called `useAppStore`'s `setLlmTier` (grepped the whole `src` tree — only the store's own definition referenced it), so the "Tier {llmTier}" status line would never have reflected a successful connect. Extracted the existing profile-load `useEffect` body into a shared `applyProfile(p)` callback (wrapped in `useCallback` so the effect's dependency array stays stable) that now also calls `setLlmTier(p.tier)`, and reused it for both the mount-time load and the post-connect reload. This keeps the fix scoped to the connect flow's own acceptance criteria ("successful connect → tier 1" reflected in the status line) without touching `handleSave`/`handleDisconnect`, which have the same pre-existing gap but are out of scope for this card — flagging for a future card rather than fixing here.
- No changes to `oauth.ts`, `bodymap.tsx`, or any other kanban card's files.

## Test Plan

New file `tests/components/ProviderSettings.test.tsx` (no prior render tests existed for this component, and no new pure logic was extracted into `providerSettingsLogic.ts` — the new code is tightly coupled to component state, so it's covered via full RNTL render rather than a pure-function unit test). Mocks `@/lib/llm/oauth` (`connectOpenRouter`), `@/lib/llm/profile` (`loadProfile`/`saveProfile`), `@/lib/llm/keystore`, and `@/lib/db/provider` (`useOptionalDatabase`); uses the real Zustand store per the existing `bodymap.test.tsx` pattern.

- Successful connect: `connectOpenRouter` resolves `{ status: 'success' }`; asserts `connectOpenRouter` was called with the db, the store's `llmTier` becomes `1`, the "Tier 1" status line renders, the "pick a model below" affordance message shows when the reloaded profile has no model, and `saveProfile` is never called directly by the component (oauth.ts already owns that write).
- Cancel: `connectOpenRouter` resolves `{ status: 'cancelled' }`; asserts tier stays `0` (`llmTier` in store and "Tier 0" in the UI), no error text appears, `saveProfile` is never called, and `loadProfile` is not re-fetched (only the initial mount load ran).
- 403-style failure: `connectOpenRouter` resolves `{ status: 'error', message: 'Authorization expired or invalid — try again.' }` (the exact message `oauth.ts`/`openrouterPkce.ts` produce for a 403); asserts that message renders verbatim inline and tier stays `0`.

Verification run: `npx tsc --noEmit -p .` (no new errors beyond the pre-existing 3 in `oauthPkce.test.ts`), `npx jest tests/components/ProviderSettings.test.tsx tests/lib/providerSettingsLogic.test.ts tests/lib/oauth.test.ts` (26/26 passing), `npx eslint src/components/ProviderSettings.tsx tests/components/ProviderSettings.test.tsx` (0 errors; 2 warnings are the same `import/first` style already present in `tests/lib/oauth.test.ts` from mocking-before-importing, and a hooks `exhaustive-deps` warning was resolved by wrapping `applyProfile` in `useCallback`). Note: running the full `tests/components/ProviderSettings.test.tsx` alongside `__tests__/app/oauthRoute.test.tsx` in the same Jest invocation occasionally reproduces the RNTL v14/React 19 cross-suite render flakiness already called out in this repo's `upload.test.tsx`/`bodymap.test.tsx` comments (not reproducible when either file runs alone) — pre-existing test-infra quirk, not a product bug.

## Test Results

**Verdict: PASS.** All claims independently verified.

- `OAuthConnectResult` exhaustiveness — confirmed. `oauth.ts`'s actual type (`src/lib/llm/oauth.ts:20-24`) has exactly 4 variants: `success | cancelled | locked | error`. `handleConnect` (`ProviderSettings.tsx:162-177`) checks `success`, then `cancelled` (no-op, comment-only), then a bare `else` — since `locked` and `error` both carry a `message` field and are the only remaining members of the union, the `else` branch is a genuine exhaustive catch-all (TS narrows correctly, no `as any`/unsafe cast used). No missing branch.
- Cancel path — confirmed no partial writes. `connectOpenRouter` awaits fully before returning `{status:'cancelled'}`; `oauth.ts` itself only clears the pending-verifier setting on cancel (`oauth.ts:90-95`), never touches KeyStore or the profile. `handleConnect`'s cancel branch is a no-op. Test asserts `llmTier` stays 0, `saveProfile` never called, `loadProfile` called exactly once (mount only) — verified this is real behavior, not just an assertion that happens to pass.
- 403 "try again" messaging — confirmed `ProviderSettings.tsx` does not re-derive any classification; `result.message` is passed through verbatim to `styles.errorText` (line 175). The distinct 403 message text originates entirely in `oauth.ts`/`openrouterPkce.ts`, matching the claim.
- Model-pick affordance — confirmed conditional on `p.model` being falsy after the post-connect `loadProfile` re-read (line 171), and the curated-model chip row / "All models" search UI at lines 291-338 is the pre-existing pB04-T02 UI, unchanged and not duplicated.
- `setLlmTier` gap-and-fix claim — independently verified. Grepped `src/store/useAppStore.ts`: `setLlmTier` (line 304) was previously called nowhere outside its own definition; `llmTier` defaults to `0` (line 165). The new `applyProfile` (`useCallback`, lines 87-94) is called from both the mount-time effect (line 98) and post-connect success (line 170), and correctly closes over the stable `setLlmTier` store setter (dependency array `[setLlmTier]` is valid since Zustand setters are referentially stable) — no stale-closure bug.
- Typecheck: `npx tsc --noEmit -p .` → exactly the 3 pre-existing `oauthPkce.test.ts` Node-types errors (`crypto`/`Buffer` not found), nothing new. Matches claim.
- Tests: `npx jest tests/components/ProviderSettings.test.tsx tests/lib/providerSettingsLogic.test.ts tests/lib/oauth.test.ts` → 3 suites / 26 tests, all passing. Read `tests/components/ProviderSettings.test.tsx` in full — the 3 new cases are meaningful, not vacuous: they assert on both the store's `llmTier` value and the rendered "Tier N" text, assert `saveProfile` is never called by the component (guards against the component re-deriving oauth.ts's write), and assert `loadProfile` call counts (guards against an extra unwanted re-fetch on cancel/error).
- Lint: `npx eslint src/components/ProviderSettings.tsx tests/components/ProviderSettings.test.tsx` → 0 errors, 2 `import/first` warnings in the test file (pre-existing mock-before-import pattern, matches claim).
- Scope: `git diff --stat` shows both target files as untracked (new files), consistent with them being newly added by this card. `git status` shows `src/lib/db/queries.ts` modified, but that is pre-existing concurrent sibling work (per task brief) — not touched by this card's diff. No `oauth.ts`, `bodymap.tsx`, or other kanban-card files were modified by this card.

## Issues Found

**Medium (non-blocking for this card) — Disconnect leaves a stale "Tier N" status line.**
- **Impact:** After a successful OAuth connect (tier 1) followed by pressing "Disconnect," `handleDisconnect` (`ProviderSettings.tsx:179-196`) builds a `tier: 0` profile and persists it via `saveProfile`, but never calls `setLlmTier(0)`. The status line reads `llmTier` from the Zustand store (line 204), not from local `profile` state, so it continues showing "Tier 1" until the component remounts (app reload / re-navigating into settings), even though the user is actually disconnected and the on-disk profile/KeyStore are correctly cleared.
- **Likelihood:** High — this is the normal Connect → Disconnect sequence within a single session, not an edge case.
- **Repro:** Connect via OpenRouter (tier flips to 1) → press Disconnect → status line still reads "Tier 1 · ok" until the screen/component remounts.
- **Data integrity:** Not affected — DB profile and KeyStore are correctly reset to tier 0; this is a UI-only staleness bug, self-heals on remount.
- **Why non-blocking for this card:** This card's acceptance criteria only cover the Connect path ("successful connect → tier 1 + model-pick affordance; cancel → tier 0 unchanged"), both of which work correctly. The dev's implementation notes explicitly scoped out `handleSave`/`handleDisconnect` as a known pre-existing gap for a future card. However, note this gap was *not reachable before this card* — previously nothing could ever push `llmTier` away from its `0` default, so Disconnect's missing `setLlmTier(0)` call was inert. This card's Connect wiring is what first makes the gap user-visible. Recommend the next follow-up card add `setLlmTier(p.tier)` (or explicit `setLlmTier(0)`) to `handleDisconnect` and `handleSave` before this ships to users, even though it doesn't block marking this specific card DONE.
