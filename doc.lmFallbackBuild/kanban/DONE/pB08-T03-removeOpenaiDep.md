# pB08-T03 — removeOpenaiDep

**Part:** B, **Phase:** 8. **Implements:** lmfPlan.md §0 (~line 16: `openai` npm package unused in src/ — remove in cleanup), Phase 8.

## Description
Remove the now-unused `openai` npm dependency:
- First **verify** no `src/` (or tests) still import `openai` (`grep -rn "from 'openai'" src __tests__ tests`). The LMF adapters use plain `fetch`, so it should be dead.
- Remove `openai` from `package.json` dependencies; run install to update the lockfile.
- Confirm `npm run typecheck` + `npm test` still pass.

## Dependencies
pB02-T02 (client no longer uses the openai package).

## Acceptance criteria
- No import of `openai` anywhere in the repo.
- `openai` removed from package.json; typecheck + tests pass.

## Implementation Notes
- Verified `openai` is genuinely unused: `grep -rn "from 'openai'" src __tests__ tests` and `grep -rn "require('openai')"` (both quote styles) returned no matches.
- Removed the `"openai": "^6.44.0"` line from `package.json` `dependencies` (only change to that file).
- Ran `npm install` to update `package-lock.json` — 1 package removed, lockfile updated accordingly. No other dependency changes.

## Test Plan
- `grep -rn "from 'openai'" src __tests__ tests` (and `require('openai')` in both quote styles) → expect no results.
- `npx tsc --noEmit` → expect no new errors vs. pre-change baseline.
- `npm test` → expect same pass/fail counts as pre-change baseline (no openai-related regressions).

## Test Results

Independently re-verified by qaAgent (fresh grep/tsc/test runs, not just reading the devAgent's claims):

1. **Grep for openai imports** — re-ran `from 'openai'`, `require('openai')` (both quote styles), `import openai`, and dynamic `import('openai')` across `src`, `__tests__`, `tests` → zero hits, confirmed.
2. **`package.json` diff** (`git diff package.json`) — the only change attributable to this card is the removal of the `"openai": "^6.44.0"` line. Note: the diff against HEAD also shows `expo-crypto` and `expo-secure-store` additions, but these are pre-existing uncommitted changes from other in-flight cards (this repo processes multiple kanban cards without intermediate commits), not something this card touched. Confirmed no other dependency versions or scripts changed.
3. **`package-lock.json`** (`git diff --stat`: 20 insertions / 19 deletions) — the `node_modules/openai` block (version, resolved URL, integrity, peerDeps `ws`/`zod`) is cleanly removed with no orphaned sub-dependency entries (openai had no non-peer deps of its own, so nothing else needed pruning). The remaining lockfile diff is the same pre-existing `expo-crypto`/`expo-secure-store` additions noted above — unrelated to this card. Confirmed `node_modules/openai` directory does not exist on disk.
4. **`npx tsc --noEmit`** — re-ran independently: exactly 3 errors, all in `tests/lib/lmf/oauthPkce.test.ts` (TS2591, missing `@types/node` for `crypto`/`Buffer`), same file/lines as claimed. No new errors.
5. **`npm test`** — re-ran independently: **488 total, 487 passed, 1 failed, 50 suites (49 passed, 1 failed)** — matches claim exactly. The single failure is in `__tests__/db/provider-recovery.test.ts` ("live DB has no user records + snapshot does → restores the snapshot"): `TypeError: Cannot read properties of undefined (reading 'cx_percent')` at line 152, asserting `conds.find(c => c.id === 'htn')!.cx_percent`. This is a DB restore/condition-persistence assertion with no connection to the LLM client or `openai` package — confirmed unrelated.
6. **No indirect OpenAI SDK surface remains** — grepped `src` for `OpenAI`, `new OpenAI(`, `OpenAI.Chat`: the only hits are comments/labels in `src/lib/lmf/adapters/openaiCompat.ts` and `src/lib/lmf/registry.ts` referring to the "OpenAI-compatible" wire format and a UI label `'OpenAI'` — not the SDK. `src/lib/llm/client.ts` (the legacy fallback wrapper) delegates to `src/lib/lmf/service.ts`, which routes through `src/lib/lmf/adapters/openaiCompat.ts` — confirmed plain `fetch`-based (imports only `ChatRequest`/`ChatResult`/`ProviderSpec` types, `classifyHttp`, and local adapter types; no SDK import).

## Issues Found
- None caused by this change. Two pre-existing issues confirmed independently (not touched, per task scope): (1) missing `@types/node` causing 3 TS errors in `tests/lib/lmf/oauthPkce.test.ts`; (2) a failing assertion in `__tests__/db/provider-recovery.test.ts` around `cx_percent`, unrelated to LLM/openai code. Both exist independently of the `openai` removal and predate this card.
- Minor observation (not a defect): `git diff package.json`/`package-lock.json` against HEAD includes unrelated pre-existing additions (`expo-crypto`, `expo-secure-store`) from other in-flight work in this uncommitted working tree. This is expected given the multi-card workflow but is worth knowing if a future reviewer diffs package.json expecting to see *only* the openai line change — they'll see 3 changed lines total, only 1 of which belongs to this card.

## QA Verdict: PASS

Independently verified all claims in the Test Plan: grep for openai imports is clean, package.json/package-lock.json changes are scoped correctly to the openai removal (plus unrelated pre-existing lockfile churn from other cards), typecheck shows the same 3 pre-existing unrelated errors, and `npm test` reproduces the exact same 487/488 pass count with the same single pre-existing failure (`cx_percent` in provider-recovery.test.ts, a DB/percent-calculation issue unconnected to the LLM client). Confirmed no remaining OpenAI SDK usage anywhere in `src` — the LMF adapters are plain-fetch-based per lmfPlan.md, matching `openaiCompat.ts` naming being purely about wire-format compatibility, not the npm package. No regressions introduced by this change.
