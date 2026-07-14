# pB06-T03 — firstChatCard

**Part:** B, **Phase:** 6. **Implements:** lmfPlan.md A1 (trigger 3: first chat use), Phase 6 (~lines 285–286).

## Description
Add the one-time first-chat-use upgrade card in **`src/app/bodymap.tsx`** chat UI:
- Show an inline card **above the input** on first chat use when tier 0 and `lmf_first_chat_nudge_seen` is unset. Dismiss persists the flag (ConfigStore/settings KV).
- **Must NOT delay or replace the medical/educational disclaimer** — the disclaimer still appears before the first chat message (hard constraint). The nudge card is additive.
- Dismissal memory: set `lmf_first_chat_nudge_seen`; also honor `lmf_nudge_dismissed_at` (7-day passive cooldown shared with other nudges). All nudges non-blocking.

**Test file:** dismissal persistence + "shown only once / only tier 0" logic where extractable into a helper (unit test the gate function); persistence-across-restart is a manual/QA check.

## Dependencies
pB02-T04 (chat via lmfChat).

## Acceptance criteria
- Typecheck clean.
- Card shows once (tier 0, flag unset); dismissal persists across restart.
- Educational disclaimer ordering unchanged; card never replaces it.

## Implementation Notes

- Added a pure gate function `shouldShowFirstChatNudge(tier, seenFlag, dismissedAt, now)` in
  `src/lib/llm/firstChatNudge.ts`: `true` only when `tier === 0`, `seenFlag == null` (unset),
  and either `dismissedAt` is unset/unparseable or ≥7 days have elapsed since it. The 7-day
  window is shared cooldown state (`lmf_nudge_dismissed_at`), not exclusive to this card.
- `src/app/bodymap.tsx` `ConditionSheet`: added `firstChatNudgeVisible` state plus a
  `firstChatNudgeChecked` ref-guarded `useEffect` (keyed on `[chatOpen, db, llmTier]`) that
  reads `lmf_first_chat_nudge_seen` and `lmf_nudge_dismissed_at` via `getSetting` once per
  sheet mount and calls the gate function with `new Date()`. This effect is separate from the
  existing disclaimer effect — it never reorders or gates the disclaimer message, only adds a
  card conditionally rendered above the chat input row (after the message `ScrollView`, before
  `chatInputRow`).
- Card is a dismissible, non-blocking `View` (`firstChatNudgeCard` style) with a "Connect"
  action (dismisses + opens Settings via `setOpenSettingsSection('provider')`, same pattern as
  the existing `chatConnectChip`) and a plain "✕" dismiss. `dismissFirstChatNudge()` persists
  both `lmf_first_chat_nudge_seen = 'true'` and `lmf_nudge_dismissed_at = <ISO now>` via
  `upsertSetting`, matching the existing `getSetting`/`upsertSetting` KV pattern used elsewhere
  (e.g. `openrouter_api_key`, `lmf_oauth_pending`).
- **Observation for the record**: `analyzing.tsx`'s `DegradedBanner` (pB06-T01, already DONE)
  dismisses via local `useState(false)` only (`analyzing.tsx:264-265`) — it does not read or
  write `lmf_nudge_dismissed_at` to SQLite at all. So today the "shared 7-day cooldown" is only
  actually populated/consumed by this card; the degraded banner's dismissal is not persisted
  and does not currently feed into or honor the shared cooldown. This card's own gate/persistence
  is implemented correctly per spec; the gap is scoped to pB06-T01 and was not touched here per
  the task instructions.

## Test Plan

- `tests/lib/llm/firstChatNudge.test.ts` (new) unit-tests the pure gate function:
  shows on tier 0 with no prior flags; never shows above tier 0 (1/2/3); does not show once
  `lmf_first_chat_nudge_seen` is set; does not show within the 7-day cooldown after
  `lmf_nudge_dismissed_at`; shows again once the cooldown elapses; an unparseable
  `dismissedAt` does not block the nudge.
- Manual/QA (not automated, per card scope): open condition chat on a fresh tier-0 install →
  card appears above the input, disclaimer still appears first; dismiss → card disappears,
  restart app → card stays dismissed; set tier to 1+ (connect a provider) → card never shows;
  simulate `lmf_nudge_dismissed_at` set <7 days ago (e.g. via degraded-banner dismissal, once
  that persists) → confirm this card also stays suppressed.

## Test Results

Independently re-verified (not just re-reading the dev's claims):

- `npx tsc --noEmit -p .` — 3 pre-existing errors only, all in `tests/lib/lmf/oauthPkce.test.ts`
  (missing Node `crypto`/`Buffer` types). Confirmed unrelated to this card's files. Matches dev claim.
- `npx jest tests/lib/llm/firstChatNudge.test.ts __tests__/screens/bodymap.test.tsx` — 2 suites,
  23/23 passing. Matches dev claim, but see Issue #1 below re: what those 23 actually cover.
- Full `npx jest` — 487/488 passing, 1 failure in `__tests__/db/provider-recovery.test.ts`
  ("live DB has no user records + snapshot does → restores the snapshot", `cx_percent` undefined).
  Confirmed this test file and the DB restore/snapshot code path it exercises are untouched by
  this card (only `firstChatNudge.ts`, `bodymap.tsx` nudge additions, and the kanban doc are
  in scope here). Pre-existing failure unrelated to pB06-T03 — flagging as informational, not
  a blocker for this card.
- `npx eslint src/app/bodymap.tsx src/lib/llm/firstChatNudge.ts tests/lib/llm/firstChatNudge.test.ts`
  — 2 warnings + 2 errors, all pre-existing and unrelated to the nudge code: unused `G` import
  (line 11), missing `addChatMessage` dep on the pre-existing disclaimer effect (line 1057),
  and two `set-state-in-effect` errors in the unrelated settings-dropdown effects (lines 1614,
  1621). The new nudge effect (lines 1062–1074) calls `setFirstChatNudgeVisible` inside a nested
  async IIFE, not synchronously in the effect body, so it correctly does not trip that rule.
  Matches dev claim.
- Read `src/lib/llm/firstChatNudge.ts` and its test file directly — gate logic is correct:
  `tier !== 0` short-circuits false; `seenFlag != null` short-circuits false; `dismissedAt`
  is parsed with `Date.parse` and only blocks if finite and `< 7 days` elapsed (NaN from a
  malformed string correctly falls through to "show"); boundary at exactly 7 days is untested
  but the `<` comparison means exactly-7-days-elapsed correctly returns `true` (not blocked) —
  test suite only covers 2 days (blocked) and 8 days (shown), missing the exact-boundary case
  (see Issue #2).
- Read `src/app/bodymap.tsx` lines 1019–1344 directly, side by side:
  - Disclaimer effect (`disclaimerShown` ref, lines 1052–1057) and nudge effect
    (`firstChatNudgeChecked` ref, lines 1062–1074) are fully independent — separate refs,
    separate `useEffect` calls, neither reads the other's state. The nudge effect does not
    delay, gate, replace, or reorder the disclaimer `addChatMessage` call. Confirmed no
    regression to the hard constraint.
  - `dismissFirstChatNudge()` (lines 1076–1081) correctly calls `upsertSetting` for both
    `lmf_first_chat_nudge_seen` and `lmf_nudge_dismissed_at` with an ISO timestamp, and also
    optimistically sets local `firstChatNudgeVisible` state to false first (good UX — no flash).
  - Ref-guard logic (`firstChatNudgeChecked.current`) correctly prevents re-querying settings
    on every re-render; since `ConditionSheet` is mounted once for the lifetime of the
    `bodymap.tsx` screen (rendered unconditionally at line 2198, never conditionally
    unmounted), this ref persists for the whole "session" the same way the pre-existing
    `disclaimerShown` ref does — consistent, no stale-closure or re-trigger-loop bug found.
  - Chat remains session-only: confirmed the only SQLite writes introduced by this card are
    the two settings keys above; `chatMessages` (including the disclaimer and nudge-adjacent
    messages) are never written to `upsertSetting`/DB anywhere in this diff.
  - Confirmed `msg.showConnectChip` / `chatErrorCopyForKind` (pB06-T02) rendering path
    (lines 1286–1293) is untouched by this card's changes.
- Confirmed the dev's "Observation record" claim: `src/app/analyzing.tsx` has zero references
  to `getSetting`/`upsertSetting` for `lmf_nudge_dismissed_at` or `lmf_first_chat_nudge_seen`
  (grepped the whole file — only `condition_source` keys are touched). `DegradedBanner`
  (lines 262–268) dismisses via local `useState(false)` only, confirmed at the claimed location.
  My own judgment: this is correctly scoped as informational, not a defect in this card. The
  card's acceptance criteria only require *this* card's own dismissal to persist correctly,
  which it does; the "shared" cooldown being one-directional today (this card writes/reads it,
  the degraded banner does neither) is a forward-looking gap in pB06-T01, not a regression or
  missing requirement here.
- `git diff --stat` for `src/app/bodymap.tsx` shows 134 changed lines, but this repo's working
  tree currently bundles multiple uncommitted Phase B cards together (pB06-T01 provider
  deep-link wiring, pB06-T02 chat error chip, this card's nudge, etc.) — diff-based isolation
  of "only this card's lines" isn't possible from git alone. Verified isolation by direct code
  read instead (above): the nudge-specific lines are self-contained (new imports, 2 new refs/1
  new state, 2 new effects, 1 new function, ~35 lines of new JSX/styles) and do not modify the
  disclaimer effect, `sendMessage`, the connect-chip rendering, or any pre-existing styles.

## Issues Found

**Issue #1 — Low severity / informational.** The card's Test Plan and the dev's summary imply
`__tests__/screens/bodymap.test.tsx` contributes to verifying this feature ("23/23 passing"
combines both files), but that suite contains zero test cases exercising the nudge card's
render/dismiss/gating behavior in `bodymap.tsx` itself (grepped for "Nudge" — no matches). All
real coverage of this card's logic lives in the 6 pure-function unit tests in
`firstChatNudge.test.ts`; the "shown only once" / "only tier 0" / persistence-across-restart
behavior in the actual component is exercised only by the manual QA checklist, which is
consistent with the card's own stated scope ("Manual/QA... persistence-across-restart is
manual/QA check") — so this is not a missed acceptance criterion, just a note that the "23/23"
figure shouldn't be read as component-level coverage of the nudge UI.
Recommendation: none required to pass this card; optional follow-up would be one integration
test asserting the nudge card renders when `llmTier === 0` and settings are unset, and disappears
after dismiss — low priority since the gate function itself is fully unit-tested.

**Issue #2 — Low severity.** `firstChatNudge.test.ts` does not test the exact 7-day boundary
(`now - dismissedAt === NUDGE_COOLDOWN_MS`, where the code's `<` comparison means the nudge
should show again at exactly 7 days elapsed). Current tests only cover 2 days (blocked) and 8
days (shown). Reading the source confirms the boundary behavior is correct, but the test suite
doesn't pin it, so a future refactor (e.g. accidentally changing `<` to `<=`) would not be caught.
Recommendation: add one boundary test:
`shouldShowFirstChatNudge(0, null, new Date(NOW.getTime() - 7*24*60*60*1000).toISOString(), NOW)`
should be `true`.

**Issue #3 — Informational, no action needed for this card.** Full `npx jest` run surfaced 1
pre-existing failure in `__tests__/db/provider-recovery.test.ts` (`cx_percent` undefined),
confirmed unrelated to any file this card touches. Flagging so it isn't mistakenly attributed
to pB06-T03 in a later regression triage, but it does not block this card.

No Critical, High, or Medium severity issues found. All acceptance criteria met:
typecheck clean (modulo pre-existing unrelated errors), card shows once on tier 0 with unset
flag, dismissal persists via `upsertSetting` for both keys, disclaimer ordering and hard
constraint (never replaced/delayed) confirmed intact, chat remains session-only.
