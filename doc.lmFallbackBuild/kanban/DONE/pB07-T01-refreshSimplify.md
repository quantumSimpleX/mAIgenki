# pB07-T01 — refreshSimplify

**Part:** B, **Phase:** 7 (refresh.ts: keep, simplify, wire in). **Implements:** lmfPlan.md observation (~line 30: refresh.ts dead code w/ arena.ai HTML-scrape), Phase 7 (~lines 290–293).

## Description
Simplify **`src/lib/llm/refresh.ts`**:
- **Delete** `fetchArenaScores` (the arena.ai HTML-scrape-via-LLM step) — it burns free quota, is fragile, and is injection-shaped input.
- Score free models from **OpenRouter `/models?max_price=0` metadata only**. `compositeScore` already handles the arena-missing branch (redistributes arena weight onto OR weights) — reuse it with `arena = null`.
- Keep `normaliseElo`, `compositeScore`, `shouldRefresh`, `refreshModelChain`, weights, TOP_N, 30-day interval.
- Remove now-orphaned imports/types created by deleting the scrape path.

**Update tests:** `tests/lib/llm-refresh.test.ts` — drop arena-scrape assertions; assert scoring from OpenRouter metadata only; compositeScore arena-null path.

## Dependencies
None.

## Acceptance criteria
- Typecheck clean; `npx jest tests/lib/llm-refresh.test.ts` passes.
- No arena.ai scrape / no LLM-on-HTML step remains.
- Scoring uses only OpenRouter `/models?max_price=0` metadata.

## Implementation Notes
- Deleted `fetchArenaScores` (arena.ai HTML scrape + LLM-parse-of-HTML step) from `src/lib/llm/refresh.ts` entirely, along with its `callLLMWithFallback` import (no longer used in this file).
- `scoreModel` no longer takes an `arena` argument — it builds `OrScores` from OpenRouter `artificial_analysis` benchmarks only and always calls `compositeScore(or, null)`, which already redistributes the arena weight onto the OR weights when arena is absent. `compositeScore`, `normaliseElo`, `SCORE_WEIGHTS`, `TOP_N`, `REFRESH_INTERVAL_MS`, `shouldRefresh` untouched.
- `refreshModelChain` simplified from 5 steps to 3: fetch free models from OpenRouter → score/sort via `scoreModel` (no arena fetch/normalisation step) → persist chain + timestamp. `apiKey` param kept on the signature (unused for now) since pB07-T02 (refreshWire, still TODO) is expected to call `refreshModelChain(db, apiKey)`.
- `ArenaScores` type kept (still used by `compositeScore`'s signature, which the card says to keep intact).

## Test Plan
- `tests/lib/llm-refresh.test.ts`: removed the "scores higher when arena ELO data is also provided" case (arena arg no longer exists on `scoreModel`) and all `arenaPageResponse`/`llmArenaResponse` mock fetch legs + the "still produces a valid chain if arena.ai fetch fails" case (no longer a distinct code path — OpenRouter fetch is now the only network call in `refreshModelChain`).
- Remaining/updated cases confirm the arena-null path end-to-end: `scoreModel` ranks purely on OR benchmark indices (Hermes > Nemotron), `compositeScore(or, null)` redistribution case, and all `refreshModelChain` cases now mock only the single OpenRouter `/models?max_price=0` fetch.
- `npx tsc --noEmit -p .` — clean except the 3 pre-existing `oauthPkce.test.ts` node-types errors (unrelated).
- `npx jest tests/lib/llm-refresh.test.ts` — 16/16 passed.
- `npx eslint src/lib/llm/refresh.ts tests/lib/llm-refresh.test.ts` — clean.
- Repo-wide grep for `fetchArenaScores` / `arena.ai` — no remaining code references (only the task's own kanban/plan docs and one explanatory comment in `refresh.ts` noting the removal).

## Test Results
PASS — verified independently, matches dev agent's report.

- Read `src/lib/llm/refresh.ts` in full: `fetchArenaScores` and the `callLLMWithFallback` import are genuinely gone. `scoreModel` builds `OrScores` from `model.benchmarks?.artificial_analysis` only and always calls `compositeScore(or, null)`. `refreshModelChain` is now fetch → score/sort → persist (3 steps, single network call). `normaliseElo`, `shouldRefresh`, `SCORE_WEIGHTS`, `TOP_N`, `REFRESH_INTERVAL_MS` are unchanged.
- No orphaned imports/types: `ArenaScores` type is still legitimately used by `compositeScore`'s signature (kept per card instructions for the arena-null redistribution branch), not a leftover.
- Read `tests/lib/llm-refresh.test.ts` in full: no references to the deleted arena-scrape mocks remain. Tests are meaningful — `scoreModel`/`refreshModelChain` cases assert real weighted-score computation and ordering (Hermes > Nemotron from actual OR benchmark indices), not vacuous "doesn't throw" checks.
- Repo-wide grep for `fetchArenaScores` / `arena.ai`: no remaining code references — only `lmfPlan.md`, this kanban card, and the explanatory comment in `refresh.ts`. Grep for `callLLMWithFallback` shows only unrelated legitimate uses in `client.ts`/`enrich.ts` and their tests — none in `refresh.ts`.
- `npx tsc --noEmit -p .` — clean except the same 3 pre-existing `tests/lib/lmf/oauthPkce.test.ts` node-types errors (unrelated, confirmed).
- `npx jest tests/lib/llm-refresh.test.ts` — 16/16 passed.
- `npx eslint src/lib/llm/refresh.ts tests/lib/llm-refresh.test.ts` — clean, no output.
- `git diff --stat -- src/lib/llm/refresh.ts tests/lib/llm-refresh.test.ts` — 2 files changed, 17 insertions(+), 144 deletions(-). Scope confirmed: all other modified/untracked files in `git status` belong to concurrent kanban tasks under `doc.lmFallbackBuild/`, not this card.

## Issues Found
None.
