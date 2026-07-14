# pB03-T03 — profileMigration

**Part:** B, **Phase:** 3. **Implements:** lmfPlan.md Part B intro (`profile.ts`), Phase 3 (~line 263).

## Description
Create **`src/lib/llm/profile.ts`**:
- Persist `LMFProfile` as `lmf_profile` JSON in SQLite settings KV — **non-secret fields only** (tier, activeProviderId, model, customBaseURL, fallbackToFree, keySource). Never write keys here.
- `loadProfile(db)` / `saveProfile(db, profile)` with sane tier-0 default when absent.
- **Migration** (idempotent, runs once): if an existing `openrouter_api_key` setting row exists → move its value into the `KeyStore` (provider `openrouter`), delete the SQLite row, and set profile to tier 2 / `keySource:'manual'` (if no profile yet). Safe to call repeatedly (no-op after first run).

**Test file:** `tests/lib/profile.test.ts` — load/save round-trip (no secrets in JSON); migration moves key to keystore + deletes row + sets tier 2; migration idempotency (second run no-op, doesn't clobber a since-changed profile).

## Dependencies
pB03-T02.

## Acceptance criteria
- Typecheck clean; `npx jest tests/lib/profile.test.ts` passes.
- `lmf_profile` JSON contains no secret fields.
- Migration is idempotent and moves the legacy key into KeyStore (not SQLite).

## Implementation Notes

- `src/lib/llm/profile.ts` created: `loadProfile(db)` / `saveProfile(db, profile)` persist `LMFProfile` as a single `lmf_profile` JSON blob via `getSetting`/`upsertSetting` from `src/lib/db/queries.ts`. `loadProfile` returns a tier-0 default (`{ tier: 0, activeProviderId: null, model: null, customBaseURL: null, fallbackToFree: true, keySource: null }`) when the row is absent or unparseable, merging any parsed fields over the default so a partial/older JSON blob still yields a valid `LMFProfile`.
- `migrateLegacyOpenRouterKey(db, keyStore)`: reads `openrouter_api_key` from settings; if present, writes it to `keyStore.set('openrouter', ...)`, deletes the SQLite row via the new `deleteSetting`, and — only if no `lmf_profile` row exists yet — writes a profile with `tier: 2`, `activeProviderId: 'openrouter'`, `keySource: 'manual'`. If the legacy row is absent (already migrated, or never existed), the function returns immediately without touching the KeyStore or the profile — this is what makes repeated calls idempotent and non-clobbering.
- Added `deleteSetting(db, key)` to `src/lib/db/queries.ts` (didn't exist; `settings` table only had `upsertSetting`/`getSetting`) — plain `DELETE FROM settings WHERE key = ?`, following the existing settings KV pattern.
- Caller wiring (app-startup call site invoking `migrateLegacyOpenRouterKey` with a real `makeKeyStore()` instance) is out of scope for this card — not wired into any screen/init path yet.

## Test Plan

`tests/lib/profile.test.ts` (mocks `expo-sqlite` as an in-memory `Map`-backed settings KV, and a mock `KeyStore`):
- `loadProfile`/`saveProfile`: default returned when no row exists; default returned when the stored row is unparseable JSON; round-trip of a full profile confirms the persisted JSON string contains no secret-shaped substrings (`sk-`, `api_key`, `secret`, `token`) and that `loadProfile` reconstructs the exact saved object.
- `migrateLegacyOpenRouterKey`: (1) legacy row present → key lands in the mock `KeyStore` under `openrouter`, SQLite row is deleted, resulting profile is tier 2 / `activeProviderId: 'openrouter'` / `keySource: 'manual'`, and the persisted profile JSON never contains the secret value; (2) no legacy row → no-op, `keyStore.set` never called, no `lmf_profile` row written; (3) idempotency — after a first migration, the profile is changed via `saveProfile` (simulating later user settings changes), then migration is called again → `keyStore.set` is not called again and the changed profile is preserved unmodified.

## Test Results

QA-verified independently (not just re-running dev's claims).

- `npx tsc --noEmit -p .` — clean, only the 3 pre-existing `tests/lib/lmf/oauthPkce.test.ts` `crypto`/`Buffer` errors (unrelated, pre-existing on main). PASS.
- `npx jest tests/lib/profile.test.ts tests/lib/db.test.ts` — 21/21 passing (6 profile + 15 db, no regressions from `deleteSetting`). PASS.
- `npx eslint src/lib/llm/profile.ts src/lib/db/queries.ts tests/lib/profile.test.ts` — clean, no output. PASS.
- `git diff --stat -- src/lib/llm/profile.ts src/lib/db/queries.ts tests/lib/profile.test.ts` — `profile.ts`/`profile.test.ts` are new untracked files; `queries.ts` diff is exactly the 7-line `deleteSetting` addition. Scope confirmed clean; other unstaged/untracked files in the repo belong to concurrent kanban tasks (T02 keystore, T04 backup redaction, service/lmf layer).
- Read `src/lib/llm/profile.ts` in full: `lmf_profile` JSON blob (`saveProfile` → `JSON.stringify(profile)`) contains only `LMFProfile` fields (`tier`, `activeProviderId`, `model`, `customBaseURL`, `fallbackToFree`, `keySource`) — no API key ever enters that object. Confirmed by code inspection and by the test's regex assertion (`raw).not.toMatch(/sk-|api[_-]?key|secret|token/i)`).
- Traced `migrateLegacyOpenRouterKey` idempotency by hand: it reads the legacy row first and returns immediately if absent (so a second call after the first migration, when the row is already deleted, is a true no-op — never touches KeyStore or the profile). It only writes a fresh tier-2 profile if `getSetting(db, PROFILE_KEY)` is falsy, i.e. only on a first-ever run with no profile yet — so a user who has since changed their profile via ProviderSettings UI (setting `activeProviderId`, etc.) is never clobbered on re-invocation. Confirmed genuinely idempotent, not just "doesn't throw twice."
- Confirmed `migrateLegacyOpenRouterKey` calls `keyStore.set('openrouter', legacyKey)` against the injected `KeyStore` interface from `src/lib/lmf/types.ts`. Note: it does **not** import `makeKeyStore()` from `src/lib/llm/keystore.ts` directly — it takes `keyStore: KeyStore` as a parameter and lets the (currently nonexistent) caller inject a concrete instance. This is consistent with "caller wiring is out of scope for this card" and is arguably the correct DI shape for testability; not a defect.
- `src/lib/db/queries.ts`'s `deleteSetting(db, key)` is a minimal, single-statement addition (`DELETE FROM settings WHERE key = ?`) directly mirroring the existing `getSetting`/`upsertSetting` pattern in the same file section. No unrelated changes.
- Read `tests/lib/profile.test.ts` in full (6 tests): all are meaningful, not vacuous.
  - "no secrets in persisted JSON" test actually inspects the raw JSON string via regex (`not.toMatch(/sk-|api[_-]?key|secret|token/i)`) against a profile containing realistic-shaped field values — a real assertion, not a shallow `ok: true` check.
  - Idempotency test actually asserts full equality (`toEqual(changedProfile)`) on the profile after a second migration call, and separately asserts `keyStore.set` was not called on the second invocation (via `jest.clearAllMocks()` before the second call) — genuinely verifies no-clobber behavior, not just "doesn't throw."
  - Migration happy-path test asserts `keyStore.store.get('openrouter')` equals the legacy value, the SQLite row is gone (`db.settings.has(...)` false), resulting profile fields (tier/activeProviderId/keySource), and that the secret string itself never appears in the persisted profile JSON.
  - No-legacy-key test asserts `keyStore.set` was never called and no `lmf_profile` row was written — correctly verifies the no-op path rather than just resolving without error.
- Confirmed `src/lib/llm/profile.ts` imports `deleteSetting`/`getSetting`/`upsertSetting` from `@/lib/db/queries` and `KeyStore`/`LMFProfile` types from `@/lib/lmf/types` — correct, minimal imports.
- Grepped the repo for other reads of the `openrouter_api_key` setting row: `src/app/bodymap.tsx:1081` still reads it directly for the condition-chat LLM call (`const apiKey = db ? (await getSetting(db, 'openrouter_api_key')) ?? '' : ''`), same as flagged out-of-scope in the already-DONE `pB02-T05-pipelineUseService.md` card. `analyzing.tsx` no longer reads it directly (per T05). See Issues Found below — informational, not blocking this card.

**Verdict: PASS.** All acceptance criteria met: typecheck clean, `profile.test.ts` passes, `lmf_profile` JSON contains no secret fields, migration is genuinely idempotent and non-clobbering.

## Issues Found

No blocking defects. One informational gap worth tracking for whoever picks up startup-wiring integration (correctly out of scope for this card):

- **Severity:** Low (informational, not a regression today — only becomes live once `migrateLegacyOpenRouterKey` is actually wired into an app-startup call site, which is explicitly out of scope here).
  **Impact:** `src/app/bodymap.tsx:1081`'s condition-chat feature reads `openrouter_api_key` directly from SQLite settings (`getSetting(db, 'openrouter_api_key')`), the same pattern `analyzing.tsx` used before pB02-T05 moved it off direct reads. Once this migration is wired up at startup, that row gets deleted on first run and the key moves into KeyStore — `bodymap.tsx`'s direct read would then silently resolve to `''` for any user with a pre-existing legacy key, breaking chat's OpenRouter path (chat would fall back to the "Unable to connect" error message; no crash, no data loss).
  **Likelihood:** Certain to trigger for every user who has a legacy `openrouter_api_key` row, the moment startup-wiring lands, unless `bodymap.tsx` is updated in the same change to resolve the key via `service.ts`/KeyStore instead (mirroring what T05 already did for `analyzing.tsx`).
  **Recommendation:** When scoping the startup-wiring task (invoking `migrateLegacyOpenRouterKey` with a real `makeKeyStore()`), bundle in updating `bodymap.tsx:1081` to stop reading `openrouter_api_key` from SQLite directly, matching the `analyzing.tsx`/T05 fix. Flagging now so it isn't missed when that follow-up card is written.
