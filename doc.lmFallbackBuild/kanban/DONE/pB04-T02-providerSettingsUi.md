# pB04-T02 — providerSettingsUi

**Part:** B, **Phase:** 4. **Implements:** lmfPlan.md A7 (model selection UX), A8 (validation ping), Phase 4 (~lines 268–279).

## Description
Create **`src/components/ProviderSettings.tsx`** — the "AI Provider" settings section (standalone component so `bodymap.tsx` doesn't grow):
- **Tier status line** (reads `llmTier`/`llmStatus` from store).
- **Connect OpenRouter** CTA button (wired to OAuth in pB05-T03; render the button + placeholder handler now).
- **Provider picker** (registry-driven from `BUILT_IN_PROVIDERS`).
- **Key entry** field → **Validate** button using `validateKey` (distinguish auth vs network in the message).
- **Model picker**: curated (`CURATED_MODELS`) → "All models" (searchable, fetched via `listModels`) → free-text model-id field always available (required path for tier 3).
- **Custom baseURL** field (tier 3): enforce `https://` except localhost/LAN (for Ollama).
- **`fallbackToFree` toggle** with privacy copy from A6: "If your provider fails, retry on free models via OpenRouter. Turn off to keep requests only on chosen provider."
- **Disconnect**: delete key from KeyStore, revert profile to tier 0.
- On save, persist via `profile.ts` (non-secret) + `keystore.ts` (key). Reuse existing settings styling patterns from bodymap's SettingsSheet.

Keep hard constraints: key never logged, key only ever sent to the chosen provider's baseURL, key never to SQLite.

**Test file:** where logic is extractable (validation state machine, https enforcement, model-picker fallthrough), add `tests/lib/*` or component-logic tests. Pure helpers should be unit-tested; full RN render is covered in the UI/UX audit (Step 6).

## Dependencies
pB03-T02 (keystore), pB03-T03 (profile), pA07-T01 (models/validateKey), pB04-T01 (store fields).

## Acceptance criteria
- Typecheck clean; component compiles.
- Validate distinguishes wrong-key (auth) from offline (network).
- https enforced on custom baseURL except localhost/private-range.
- Disconnect deletes key + reverts to tier 0.
- No key logged / no key to SQLite.

## Implementation Notes

- `src/components/ProviderSettings.tsx` (new) — standalone "AI Provider" section, not yet mounted into `bodymap.tsx` (mounting is pB04-T03). Styled to match bodymap's `SettingsSheet` (same dark palette hex values, `BarlowCondensed` labels, `surfaceHigh` fields, `sc`/`fs` scale helpers) — the palette is duplicated locally as a small `C` const, following the existing pattern of standalone components (e.g. `QSWordmark.tsx`) not sharing a theme module.
  - Tier status line reads `llmTier`/`llmStatus` from `useAppStore`.
  - "Connect OpenRouter" button is wired to a no-op `onPress={() => {}}` placeholder — real OAuth wiring is pB05-T03 and out of scope here.
  - Provider picker renders `Object.values(BUILT_IN_PROVIDERS)` as chips.
  - Key field (`secureTextEntry`) + Validate button calls `validateKey(spec, key, { model })`; result message is produced by the new `validationMessage()` helper, which explicitly distinguishes `kind: 'auth'` ("Key rejected — check that you copied it correctly.") from `kind: 'network'` ("Could not reach the provider — check your connection and try again.").
  - Model picker: curated chips (`CURATED_MODELS[providerId]`) → "All models" expandable section that lazy-fetches via `listModels()` on first open and is filterable via `filterModels()` → an always-visible free-text model-id field. `resolveSelectedModel(picked, freeText)` makes free-text win when non-empty, otherwise falls back to the picked model — this is the value saved.
  - Custom baseURL field only rendered when `providerId === 'custom'` (tier 3). Enforced via `isAllowedBaseURL()`: requires `https://`, except `http://` is allowed for `localhost`, `127.0.0.1`, `::1`, and RFC1918 private ranges (`10.x`, `172.16–31.x`, `192.168.x`) to support local Ollama. Invalid input blocks both Validate and Save with an inline error, never a silent failure.
  - When `providerId === 'custom'`, `effectiveSpec()` overlays the user's `customBaseURL` onto the registry's `custom` `ProviderSpec` (which ships with `baseURL: ''`) before calling `validateKey`/`listModels` — no bespoke fetch path is introduced, so the "key only ever sent to the provider's own baseURL" constraint holds by construction.
  - `fallbackToFree` toggle uses the exact copy from the card via a plain RN `Switch` (no custom toggle component exists elsewhere in the codebase to reuse).
  - Save: builds an `LMFProfile` (`tier: isCustom ? 3 : 2`, `keySource: 'manual'`) and calls `saveProfile(db, profile)` (non-secret fields) + `keyStore.set(providerId, keyInput)` (secret, only if a new key was typed).
  - Disconnect: `keyStore.delete(activeProviderId)` then `saveProfile` with a reverted tier-0 profile (`activeProviderId`/`model`/`customBaseURL`/`keySource` all null); `fallbackToFree` preference is preserved rather than reset, since it isn't provider-specific.
  - No `console.*` calls anywhere in the component or the extracted helpers — nothing derived from the key value is ever logged, matching `validateKey`'s own contract of returning only `{ok, kind}`.
- `src/lib/llm/providerSettingsLogic.ts` (new) — pure helpers extracted for unit testing, no React/RN imports: `validationStateFromResult`/`validationMessage` (auth-vs-network state machine + copy), `isAllowedBaseURL` (https enforcement), `filterModels`/`resolveSelectedModel` (model-picker fallthrough). Lives under `src/lib/llm/` (app-wiring layer) rather than `src/lib/lmf/` since `lmf/` is documented as a dependency-free, framework-agnostic core the plan says should stay portable, and this is UI-facing copy/logic specific to this app's settings screen.

## Test Plan

- `tests/lib/providerSettingsLogic.test.ts` (new, 15 tests) covers the three extracted helper groups called out in the card:
  - `validationStateFromResult`/`validationMessage`: ok → "Key verified.", `auth` kind → rejected-key copy, `network` kind → distinct offline copy (asserted not equal to the auth message), an unlisted kind (e.g. `server`) → generic fallback, plus `idle`/`validating` states.
  - `isAllowedBaseURL`: accepts `https://`; rejects `http://` for a public host; accepts `http://` for `localhost`, `127.0.0.1`, and one address in each private range (`192.168.x`, `10.x`, `172.16.x`); rejects malformed/empty input.
  - `filterModels`: empty/whitespace query returns the full list; case-insensitive substring match; no-match returns `[]`.
  - `resolveSelectedModel`: free-text wins over a picked model; free-text is trimmed before the emptiness check; falls back to the picked model when free-text is empty; returns `null` when neither is set.
- Full RN rendering of `ProviderSettings.tsx` is intentionally not unit-tested per the card (covered later by the UI/UX audit step, and only after pB04-T03 mounts it somewhere reachable).

## Test Results

**Verdict: PASS.** All five acceptance criteria verified independently.

- `npx tsc --noEmit -p .` — exactly 3 pre-existing errors, all in `tests/lib/lmf/oauthPkce.test.ts` (missing `@types/node` for `crypto`/`Buffer`), unrelated to this card. No errors in `oauth.ts` (the sibling pB05-T01 task appears to have resolved its typecheck issue since the dev report was written) and none in `ProviderSettings.tsx` / `providerSettingsLogic.ts`.
- `npx jest tests/lib/providerSettingsLogic.test.ts` — 15/15 passing.
- `npx eslint src/components/ProviderSettings.tsx src/lib/llm/providerSettingsLogic.ts tests/lib/providerSettingsLogic.test.ts` — clean, no output.
- `git diff --stat -- src/app/bodymap.tsx` shows a real diff (chat now calls `lmfChat`/`service.ts` instead of `getChatCompletion`), but this belongs to the already-completed `pB02-T04-chatUseLmf` card (confirmed via `doc.lmFallbackBuild/kanban/DONE/pB02-T04-chatUseLmf.md`), not pB04-T02 — `ProviderSettings.tsx` is never imported there. No files outside `src/components/ProviderSettings.tsx`, `src/lib/llm/providerSettingsLogic.ts`, `tests/lib/providerSettingsLogic.test.ts` are touched by this card.
- **Auth vs. network distinction**: traced `handleValidate` → `validateKey(activeSpec, keyInput, {model})` → `validationStateFromResult` → `validationMessage`. `validateKey.ts` classifies HTTP 401/403 as `kind: 'auth'` and any thrown/network failure as `kind: 'network'` (both `validateViaModelsList` and `validateViaCompletion` catch blocks). `validationMessage` produces distinct, non-overlapping copy for each (asserted in test line 18: `authState message !== networkState message`), plus a generic fallback for other `LMFErrorKind`s (e.g. `server`) and a `'validation'` kind for the local baseURL-format check — genuine, not vacuous.
- **https enforcement**: `isAllowedBaseURL` requires `https:` unless `protocol === 'http:'` AND hostname matches `PRIVATE_HOSTNAME_RE` (`localhost`, `127.x.x.x`, `::1`, `10.x`, `172.16–31.x`, `192.168.x`). Verified the regex correctly bounds the 172 range (`1[6-9]|2\d|3[01]` = 16–31). Tests cover accept (https, localhost, 127.0.0.1, 192.168.x, 10.x, 172.16.x) and reject (public http, malformed, empty) — real assertions, not tautologies. Component blocks both Validate (via `baseURLValid`, disables neither button but sets `status: 'invalid', kind: 'validation'`) and Save (explicit early-return with inline `saveStatus` error) on invalid custom URLs — never a silent failure.
- **Disconnect**: `handleDisconnect` calls `keyStore.delete(target)` (removes the secret from SecureStore/localStorage/in-memory) *and* `saveProfile(db, {tier: 0, activeProviderId: null, model: null, customBaseURL: null, keySource: null, ...})` (reverts the profile) — both steps genuinely present, not just one. `fallbackToFree` is intentionally preserved (documented rationale: not provider-specific) — reasonable, matches Implementation Notes.
- **No secrets logged / no key to SQLite**: `grep -n "console\."` over all three files returns nothing. `ProviderSettings.tsx` only persists via `saveProfile` (non-secret `LMFProfile` fields, `src/lib/llm/profile.ts` → `upsertSetting(db, 'lmf_profile', ...)`, no key field in that shape) and `keyStore.set/delete` (SecureStore/localStorage per `keystore.ts`, never SQLite). Confirmed no `upsertSetting`/raw SQLite call anywhere in the component touches `keyInput`.
- **Registry/curated-data reuse**: `PROVIDER_LIST = Object.values(BUILT_IN_PROVIDERS)` (registry-driven, 10 built-in providers + `custom`, not hardcoded) and `CURATED_MODELS[providerId]` / `listModels()` used for the model picker (no reinvented model data).
- `providerSettingsLogic.ts` confirmed free of React/RN/Expo imports (only imports `LMFErrorKind`/`ValidateKeyResult` types) — genuinely pure and unit-testable in isolation, matching the extraction rationale in the Implementation Notes.
- Test quality check: the 15 tests are all meaningful — each asserts a distinct branch (ok/auth/network/other-kind/idle/validating for the state machine; https/http-public-reject/http-private-accept-per-range/malformed for baseURL; empty/whitespace/case-insensitive/no-match for filtering; free-text-wins/trim/fallback/null for model resolution). None are trivially-true or duplicate assertions.

## Issues Found

None (Low/Medium/High/Critical). No defects identified against the stated acceptance criteria.

Two non-blocking observations (not filed as defects — informational only, no action required for this card):
1. `isAllowedBaseURL`'s private-range regex doesn't reject a bare empty-string hostname or IPv6 forms beyond `::1` (e.g. `fd00::/8` ULA), but Ollama/local-dev is exclusively IPv4/`localhost` in practice — out of scope for this card's stated test plan.
2. The "All models" search box and the free-text model field are both visible simultaneously with no inline hint that free-text always wins when non-empty (the precedence is real and correct per `resolveSelectedModel`, just not surfaced in the UI copy). Since full RN rendering/UX is explicitly deferred to the later UI/UX audit step per this card's Test Plan, not raised as a defect here — flagging for that audit's attention.
