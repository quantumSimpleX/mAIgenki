# pB03-T01 — installNativeDeps

**Part:** B, **Phase:** 3 (key storage, profile, backup exclusion). **Implements:** lmfPlan.md §0 (deps to install), Phase 3 (~line 261).

## Description
- Run `npx expo install expo-secure-store expo-crypto` (Expo SDK 56-pinned versions; do NOT hand-edit package.json versions).
- Add the `expo-secure-store` config plugin to `app.json` (Android backup exclusion). Note in Implementation Notes that this requires a dev-client rebuild to take full effect — Expo Go still works for basic use.
- Verify against Expo SDK 56 docs (https://docs.expo.dev/versions/v56.0.0/ or context7) that the plugin config shape is correct for SDK 56.

## Dependencies
None.

## Acceptance criteria
- `expo-secure-store` and `expo-crypto` present in package.json at SDK-56-compatible versions.
- Plugin registered in app.json.
- `npm run typecheck` still clean.

## Implementation Notes
- Installed via `npx expo install`: `expo-secure-store@~56.0.4`, `expo-crypto@~56.0.4` (SDK-56-pinned, resolved automatically — package.json/package-lock.json not hand-edited).
- Registered the `expo-secure-store` config plugin in `app.json`'s `plugins` array as an object entry (not a bare string): `["expo-secure-store", { "configureAndroidBackup": true }]`. Verified against the SDK 56 docs (docs.expo.dev/versions/v56.0.0/sdk/securestore) that `configureAndroidBackup` defaults to `true` already — a bare string would have gotten the same runtime behavior — but the object form was chosen to make the Android-backup-exclusion intent explicit and self-documenting per this card's stated purpose, rather than relying on an implicit default. `faceIDPermission` was not set since the app has no `LocalAuthentication`/biometric usage (confirmed via grep) to justify a custom Face ID prompt string.
- **Caveat:** this plugin change only affects the native Android manifest (`data-extraction-rules`/`full-backup-content`) — it requires a dev-client rebuild (`npx eas build` / `npx expo prebuild`) to take effect. Expo Go continues to work for basic `expo-secure-store` API usage (get/set/delete) without a rebuild; only the backup-exclusion native config needs the rebuild.
- Incidental: `app.json`'s `platforms` array was reformatted from single-line to multi-line by the JSON writer that added the plugin entry — a formatting side effect, not a semantic change.

## Test Plan
- `npx tsc --noEmit -p .` — confirm no new errors beyond the pre-existing 3 baseline errors in `tests/lib/lmf/oauthPkce.test.ts` (unrelated `crypto`/`Buffer` Node-type errors).
- `grep -n "expo-secure-store\|expo-crypto" package.json` — confirm both deps present at `~56.0.4`.
- Manual read of `app.json` `plugins` array — confirm `expo-secure-store` entry is a `[name, config]` tuple with `configureAndroidBackup: true`, matching the SDK 56 doc-verified shape.
- `git diff --stat` / `git status --short` — confirm only `package.json`, `package-lock.json`, `app.json` changed for this task (other untracked/modified files in the tree belong to concurrent kanban cards).
- Not covered here (needs a real dev-client build, out of scope for this task): confirming the Android backup-exclusion manifest entries actually land in a built APK.

## Test Results

- **PASS** — `expo-secure-store@~56.0.4` and `expo-crypto@~56.0.4` present in `package.json` `dependencies` (lines 13, 24) and mirrored in `package-lock.json` (lines 18, 29).
- **PASS** — `app.json` `plugins` array contains `["expo-secure-store", { "configureAndroidBackup": true }]` as a `[name, config]` tuple (lines 53-58), alongside the pre-existing `expo-sqlite` string entry, exactly as claimed.
- **PASS (doc-verified)** — Cross-checked `configureAndroidBackup` against SDK 56 docs via two independent sources: context7 MCP (`/websites/expo_dev`, source `docs.expo.dev/llms-sdk-v56.0.0.txt`) and WebFetch of `docs.expo.dev/versions/v56.0.0/sdk/securestore/`. Both confirm `configureAndroidBackup` is a real, correctly-named boolean option, default `true`, exactly matching the implemented shape. The dev agent's claim that the object form is redundant with the default is accurate — not a hallucinated option.
- **PASS** — `expo-crypto` docs (`docs.expo.dev/versions/v56.0.0/sdk/crypto/`, via WebFetch) confirm no config plugin is documented or required; correctly omitted from `app.json`.
- **PASS** — `npx tsc --noEmit -p .` reproduced independently: only the 3 pre-existing `tests/lib/lmf/oauthPkce.test.ts` errors (`crypto`/`Buffer` Node-type errors, TS2591), no new errors introduced.
- **PASS** — `npx expo config --json` (side-effect-free structural validation, not just manual JSON review) ran successfully (exit 0) and resolved config includes `"pluginHistory":{...,"expo-secure-store":{"name":"expo-secure-store","version":"56.0.4"}}` — confirms Expo's config loader parses `app.json` and applies the plugin without error.
- **PASS** — `git diff --stat -- package.json package-lock.json app.json` shows exactly those 3 files changed (package.json +2, package-lock.json +20, app.json +14/-2). `git status --short` shows numerous other modified/untracked files, but per task scope those belong to concurrent kanban cards (pB03 chat/LLM-fallback work) and are out of scope for this card.
- Noted per Implementation Notes: the `platforms` array reformat (single-line → multi-line) in `app.json` is a harmless JSON-writer side effect, confirmed cosmetic-only (no semantic change to `["android","ios","web"]`).

## Issues Found

None.
