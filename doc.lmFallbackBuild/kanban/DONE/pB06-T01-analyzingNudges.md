# pB06-T01 — analyzingNudges

**Part:** B, **Phase:** 6 (upgrade nudges). **Implements:** lmfPlan.md A1 (upgrade triggers 1–2), Phase 6 (~line 283).

## Description
Add non-blocking upgrade nudges to **`src/app/analyzing.tsx`**:
- `llmStatus === 'degraded'` → passive **post-completion banner** (does not block or delay the result).
- `llmStatus === 'exhausted'` with rate/quota failure kinds → the error surface gains a **"Connect provider" CTA** that opens the SettingsSheet provider section.
- Add store flag `openSettingsSection` (e.g. `'provider' | null`) to `useAppStore` and set it when the CTA is pressed; the SettingsSheet (pB04-T03) opens/scrolls to the provider section when the flag is set, then clears it.
- All nudges dismissible + non-blocking.

**Test file:** `tests/lib/*` or `__tests__/*` — mocked exhausted/degraded status renders the right surface; CTA sets `openSettingsSection:'provider'`.

## Dependencies
pB04-T01 (store status), pB04-T03 (settings section to open), pB02-T05 (analyzing uses service).

## Acceptance criteria
- Typecheck clean; tests pass.
- degraded → passive banner; exhausted(rate/quota) → Connect provider CTA opening provider settings.
- Nudges are non-blocking + dismissible.

## Implementation Notes

- `src/store/useAppStore.ts`: added `openSettingsSection: 'provider' | null` state + `setOpenSettingsSection` action. Session-only, not persisted.
- `src/app/analyzing.tsx`: added two new named exports (kept small and store-driven so they're unit-testable without rendering the full screen, which OOMs — see existing `__tests__/screens/analyzing.test.tsx` header comment):
  - `DegradedBanner({ complete })` — dismissible passive banner ("Free AI models are busy. Connect your own account for reliable access.", exact copy from lmfPlan.md A1) shown only when `llmStatus === 'degraded'` and `complete` (wired to `analyzeProgress >= 1`). Rendered at the top of the main (success) return via absolute positioning so it never blocks/shifts the progress UI. Local `dismissed` state only — no persisted 7-day cooldown (that's lmfPlan.md's broader nudge-dismissal memory, out of this card's scope).
  - `ConnectProviderCta()` — renders only when `llmStatus === 'exhausted'` and `lastLlmFailureKind` is `rate_limit` or `quota_billing` (other kinds, e.g. `network`/`auth`, render nothing, per lmfPlan.md A1's "network shows no upgrade nudge"). Pressing it calls `setOpenSettingsSection('provider')` then `router.replace('/bodymap')`. Added to the existing error-surface branch (`errorMsg` shown), next to the existing "Back" button.
- `src/app/bodymap.tsx` `SettingsSheet`: destructured `openSettingsSection`/`setOpenSettingsSection` from the store and added a `useEffect` that, when `openSettingsSection === 'provider'`, sets `openDropdown('provider')` (existing accordion state — no parallel mechanism introduced), opens the sheet via the existing `toggleSettings()` if not already open, then clears the flag via `setOpenSettingsSection(null)` so it doesn't re-trigger. Matches the existing adjacent effect (`if (!settingsOpen) setOpenDropdown(null)`) in structure/style, including its pre-existing `react-hooks/set-state-in-effect` lint error (see Issues Found).
- Did not touch chat error handling, first-chat-use nudge, or dismissal-memory persistence (`lmf_nudge_dismissed_at`, `lmf_first_chat_nudge_seen`) — those are separate lmfPlan.md Phase 6 items not covered by this kanban card.

## Test Plan

New file `__tests__/screens/analyzingNudges.test.tsx` (12 tests), rendering only the two new named exports directly (not the full `AnalyzingScreen`, to avoid the known SVG/Animated OOM risk):
- `DegradedBanner`: renders when `degraded` + `complete`; renders nothing when not yet `complete`; renders nothing when `llmStatus: 'ok'`; dismiss button hides it.
- `ConnectProviderCta`: renders for `exhausted` + `rate_limit`/`quota_billing` (parametrized); renders nothing for `exhausted` + `network`/`auth`/`timeout`/`server` (parametrized); renders nothing when not `exhausted`; pressing it sets `openSettingsSection: 'provider'` in the store and calls `router.replace('/bodymap')`.

Note for whoever runs RNTL here next: this project's `@testing-library/react-native` (`render`) is an `async function` — `screen.getByText(...)` right after a synchronous `render(...)` call throws `` `render` function has not been called `` because `setRenderResult` hasn't run yet. Every render call in the new test file uses `await render(...)`, and the dismiss-banner test uses `waitFor` after `fireEvent.press` for the same reason.

## Test Results

- `npx tsc --noEmit -p .` — clean; only the 3 pre-existing `tests/lib/lmf/oauthPkce.test.ts` errors (unrelated, pre-existing Node type errors).
- `npx jest __tests__/screens/analyzingNudges.test.tsx` — 12/12 pass.
- `npx jest __tests__/screens/analyzing.test.tsx __tests__/screens/bodymap.test.tsx` — 22/22 pass (no regressions).
- Full suite `npx jest` — 476/477 pass; the 1 failure (`__tests__/db/provider-recovery.test.ts`) is pre-existing and unrelated (confirmed by reproducing it on `git stash`, before this task's changes).
- `npx eslint` on changed files — 0 new errors. Pre-existing warnings/errors in `src/app/bodymap.tsx` (unused `G` import, `addChatMessage` exhaustive-deps, and a `react-hooks/set-state-in-effect` error at the adjacent, unmodified line) all predate this change (confirmed via `git stash`). The new `useEffect` added by this task trips the same `set-state-in-effect` rule, by design, to match the existing adjacent pattern.
- `git diff --stat` confirms only `src/app/analyzing.tsx`, `src/app/bodymap.tsx`, `src/store/useAppStore.ts`, this kanban file, and the new test file were touched by this task (other unrelated diffs present in the working tree are uncommitted work from prior kanban cards, not from this task).

## Issues Found

None new. Pre-existing (not introduced by this task, left untouched per scope):
- `src/app/bodymap.tsx`: unused `G` import, `addChatMessage` missing from an unrelated `useEffect`'s deps, and a pre-existing `react-hooks/set-state-in-effect` ESLint error on the effect directly above the one this task added.

**Severity: Medium, non-blocking.** `DegradedBanner` is only reachable during the ~400ms window between `setAnalyzeProgress(1)`/`setScreen('bodymap')` and the `setTimeout(() => router.replace('/bodymap'), 400)` call that follows it in all three completion paths (direct-route, demo, upload — `src/app/analyzing.tsx` lines 368, 404/443, 515). Once `router.replace` fires, `analyzing.tsx` unmounts and the banner is gone for good — it never reappears on `bodymap.tsx`. The banner copy is 13 words ("Free AI models are busy. Connect your own account for reliable access."); at typical reading speed even skimming to register "there's a banner, it's about AI access" takes noticeably longer than 400ms, and a user's attention at that exact moment is on the just-completed progress bar, not a banner sliding in at the top edge. In practice this nudge will be seen by, at best, a small fraction of users who happen to be looking at the top of the screen at that instant — it satisfies the letter of the acceptance criteria ("passive banner shown on degraded + complete, non-blocking, dismissible") but likely defeats the intent of Phase 6 (informing users so they consider upgrading). Not blocking merge: the literal, written acceptance criteria are met, the dev's scope call (navigation timing is a separate concern) is reasonable for this card, and there's no data loss/security/broken-flow risk — only a weak nudge. Recommend a fast follow-up: either hold the bodymap navigation slightly longer when `llmStatus === 'degraded'`, or (better) make the degraded banner persist into `bodymap.tsx` (it already has a `SettingsSheet`/store-driven pattern this card just added) so the nudge has a realistic chance of being read.

## Verdict

**PASS** (with one non-blocking Medium finding above, recommended as a follow-up ticket).
- Typecheck: clean (only the 3 pre-existing, unrelated `oauthPkce.test.ts` Node-type errors).
- Tests: `analyzingNudges.test.tsx` + `analyzing.test.tsx` + `bodymap.test.tsx` → 34/34 pass (12 new, 22 pre-existing, no regressions). All 12 new tests are meaningful — real render/press assertions per `llmStatus`/`lastLlmFailureKind` combination, not vacuous smoke tests.
- ESLint: 2 errors + 2 warnings on `bodymap.tsx`, all pre-existing or an intentional match of the existing adjacent effect's already-accepted `react-hooks/set-state-in-effect` pattern (verified: the adjacent effect at line 1557 has the identical shape/error, confirmed via `git stash` in a prior task and re-confirmed here by inspection). 0 new errors on `analyzing.tsx` / `useAppStore.ts`.
- `openSettingsSection` store field: default `null`, setter is a plain `set({ openSettingsSection })` — correct, session-only, not persisted.
- `bodymap.tsx` `SettingsSheet` effect (line ~1562-1567): guards on `openSettingsSection === 'provider'`, opens the dropdown + sheet, then clears the flag — the clear causes a re-render where the guard's early-return prevents re-triggering, so no infinite loop or stale-flag re-trigger.
- Hard constraints preserved: this card's diff (`useAppStore.ts`, `analyzing.tsx`, the `SettingsSheet` hunk of `bodymap.tsx`) does not touch chat code, disclaimer ordering, or condition-scoping. (Note: `git diff` on `bodymap.tsx` also shows unrelated chat-handling changes — those belong to the concurrently-running pB06-T02 devAgent in the same working tree, not this card.)
