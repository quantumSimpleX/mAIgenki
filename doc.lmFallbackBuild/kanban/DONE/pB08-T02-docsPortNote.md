# pB08-T02 — docsPortNote

**Part:** B, **Phase:** 8. **Implements:** lmfPlan.md Phase 8 (~line 298: docs).

## Description
Documentation updates:
- **CLAUDE.md** (and AGENTS.md if it mirrors): add a pointer to `doc.lmFallbackBuild/lmfPlan.md` describing the LMF/BYOK layer and where provider settings live.
- **`.env.example`**: document that the env key (`EXPO_PUBLIC_MAIGENKI_OPENROUTER_API_KEY` / `EXPO_PUBLIC_OPENROUTER_API_KEY`) is **tier-0-only** (shared free pool) and that user keys are stored in the KeyStore, not env.
- **`src/lib/lmf/index.ts`**: ensure the "porting LMF" note is complete (created in pA02-T03 — extend if needed).

## Dependencies
pA02-T03, pB02-T01.

## Acceptance criteria
- CLAUDE.md points to lmfPlan.md; `.env.example` documents env-key tier-0-only scope.
- Porting note present in `lmf/index.ts`.
- No hard-constraint text weakened.

## Implementation Notes

- **CLAUDE.md** — added one paragraph after the existing "OpenRouter" architecture paragraph: points to `doc.lmFallbackBuild/lmfPlan.md` for the LMF/BYOK design, summarizes the fallback-route + BYOK behavior, and names `src/components/ProviderSettings.tsx` (mounted in bodymap.tsx's SettingsSheet) as where provider connection UI lives. No existing text changed; Hard Constraints section untouched.
- **AGENTS.md** — confirmed it mirrors CLAUDE.md 1:1 (only "Claude"→"Codex" naming differs). Added the identical paragraph in the identical location to keep the mirror in sync.
- **.env.example** — added a 4-line comment above `EXPO_PUBLIC_MAIGENKI_OPENROUTER_API_KEY=` stating it's the tier-0-only shared/anonymous free-tier key baked into the build, and that user-connected provider keys/tokens live in the on-device KeyStore (`src/lib/llm/keystore.ts`, SecureStore/localStorage), never in env or SQLite. The key line itself (and its value) is unchanged.
- **src/lib/lmf/index.ts** — reviewed the existing "Porting LMF" header comment (from pA02-T03). It already fully covers: dependency-free (no expo-*/RN/SQLite/Zustand imports, only fetch/AbortController/Headers), and how storage (KeyStore/ConfigStore) and Telemetry are injected via interfaces for porting. No gaps found — left as-is per the task's "extend only if genuinely incomplete" instruction.

## Test Plan

Docs-only change; no runtime behavior to test. Verification is by inspection:
1. Grep CLAUDE.md and AGENTS.md for `lmfPlan.md` and `ProviderSettings.tsx` → both present, added paragraph identical in both files, in the same location.
2. Diff CLAUDE.md's existing "Hard Constraints" section pre/post-change → unchanged (confirmed no lines touched there).
3. Read `.env.example` → new comment block present above the key, existing key line unmodified.
4. Read `src/lib/lmf/index.ts` header comment → confirms it already documents dependency-free porting and interface-injected storage/telemetry (from pA02-T03); no edit needed.

## Test Results

Verified by inspection (see Test Plan) — all four files match expected state. No test suite applicable (documentation-only change, no `.ts`/`.tsx` logic touched).

### QA independent verification

1. **CLAUDE.md** — `git diff CLAUDE.md` shows exactly two hunks: (a) the "Docs in this repo" sentence updated to point to `doc.lmFallbackBuild/lmfPlan.md` as the current-phase plan, and (b) one new paragraph after the OpenRouter paragraph describing the LMF layer (dependency-free `src/lib/lmf/`, fallback route, BYOK) naming `src/components/ProviderSettings.tsx` as the provider connection UI. Confirmed `src/components/ProviderSettings.tsx` exists and is mounted in `src/app/bodymap.tsx` (`import { ProviderSettings } from '@/components/ProviderSettings'` at line 31, `<ProviderSettings />` at line 1758, inside SettingsSheet) — the claim is accurate, not aspirational. Grepped the "Hard Constraints" section: all bullets present verbatim before/after, and the diff touches only the two locations above. Hard Constraints untouched. PASS.
2. **AGENTS.md** — diff is line-for-line parallel to CLAUDE.md's (same two edits, same location), with the pre-existing "Claude-design" → "Codex-design" naming divergence preserved and nothing else. Mirror integrity maintained. PASS.
3. **.env.example** — diff adds a 4-line comment block above `EXPO_PUBLIC_MAIGENKI_OPENROUTER_API_KEY=`; the key line itself has no `-`/`+`, confirmed unchanged. Cross-checked comment content against code: `src/lib/llm/keystore.ts` exists and is where user provider keys live; `src/lib/llm/client.ts` (lines 22-23) reads both `EXPO_PUBLIC_MAIGENKI_OPENROUTER_API_KEY` and `EXPO_PUBLIC_OPENROUTER_API_KEY` as fallback env vars, matching the comment's naming. "Tier-0-only" / "never env/SQLite" framing is accurate. PASS.
4. **src/lib/lmf/index.ts** — read the full porting-note header (lines 1-22). It correctly states the module is dependency-free (no expo-*/react-native/SQLite/Zustand imports) and enumerates exactly what a porting target must inject: `fetch`/`fetchImpl`, `KeyStore`, `ConfigStore`, `Telemetry` (explicitly noting telemetry callbacks never receive raw keys and failure messages are pre-redacted), and OAuth browser-launch glue. This is a complete, accurate porting note — agree with the dev's "no changes needed" call. PASS.
5. **Scope** — `git diff --stat` against the working tree shows many other modified/untracked files, but all of them (`doc.lmFallbackBuild/`, `src/components/ProviderSettings.tsx`, `src/lib/lmf/`, various test files, etc.) are pre-existing files from other in-flight phase-8 kanban tasks, not touched by this task. Isolated diffs on the four target files confirm the change is exactly as narrow as claimed; `src/lib/lmf/index.ts` has zero diff (unmodified). PASS.

## Issues Found

None.

**QA Verdict: PASS**

Summary: Verified all four claims independently via git diff and code cross-checks. CLAUDE.md/AGENTS.md additions are accurate, correctly placed, and leave Hard Constraints byte-for-byte untouched. AGENTS.md mirrors CLAUDE.md's edit exactly (Claude→Codex naming preserved). .env.example's new comment is factually correct against `keystore.ts` and the env-var names actually read in `client.ts`; the key line is unmodified. `ProviderSettings.tsx` is confirmed to exist and be mounted in bodymap.tsx's SettingsSheet. The `lmf/index.ts` porting-note header is genuinely complete — leaving it unchanged was the right call. Diff scope is narrow as claimed; other dirty-tree files belong to unrelated in-flight phase-8 tasks. No issues found.
