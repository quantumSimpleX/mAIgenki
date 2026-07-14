# pB06-T02 — chatErrorNudge

**Part:** B, **Phase:** 6. **Implements:** lmfPlan.md Phase 6 (~line 284: chat error at bodymap.tsx:1082 becomes kind-aware).

## Description
Make the condition-chat error handling in **`src/app/bodymap.tsx`** (~line 1082) kind-aware:
- rate_limit / quota_billing failure → show a message + an inline **"Connect your account"** chip (opens provider settings via `openSettingsSection:'provider'`).
- network failure → keep the current copy.
- Other kinds → sensible default copy.
- Must not weaken hard constraints: disclaimer still shows before first message; chat stays session-only + single-condition.

**Test file:** where chat error mapping is extractable into a helper, unit-test the kind→copy mapping.

## Dependencies
pB04-T01 (status/failure kind), pB02-T04 (chat via lmfChat).

## Acceptance criteria
- Typecheck clean.
- rate/quota chat error → connect-account chip; network → existing copy.
- Constraints preserved (disclaimer/session-only/single-condition).

## Implementation Notes

- `LmfChatOutcome` (`src/lib/llm/service.ts`) only carries `{ ok:false; message }` — no
  failure kind. The kind signal comes from the shared telemetry: `createStoreTelemetry()`'s
  `onExhausted` already writes the last failure's `kind` to `useAppStore`'s
  `lastLlmFailureKind` before `lmfChat` resolves, so `sendMessage()`'s failure branch reads
  `useAppStore.getState().lastLlmFailureKind` right after `outcome.ok === false` and it
  reflects *this* call's outcome.
- Extracted the kind→copy mapping into a new pure helper,
  `src/lib/llm/chatErrorCopy.ts` (`chatErrorCopyForKind(kind: LMFErrorKind | null)`),
  returning `{ message, showConnectChip }`:
  - `rate_limit` / `quota_billing` → "Free AI access is limited right now." + chip.
  - `network` → unchanged copy ("Unable to connect. Check network and LLM access.").
  - everything else (`auth`, `invalid_request`, `content_filter`, `timeout`, `server`,
    `validation`, `null`) → generic default ("Something went wrong. Please try again."),
    no chip.
- Only the `outcome.ok === false` branch in `sendMessage()` (bodymap.tsx) was made
  kind-aware. The surrounding `catch` block (unexpected JS exceptions, e.g. a failed
  dynamic import) was left untouched — `lastLlmFailureKind` may be stale there (it's
  telemetry from a *previous* call, not necessarily this one), so attaching a kind to it
  would be a guess rather than a fact.
- `ChatMessage` (`src/model/conditions.ts`) gained one optional field,
  `showConnectChip?: boolean`, so the chip renders per-message in the existing
  `chatMessages.map(...)` loop in bodymap.tsx — no new state, no persistence (chat
  messages already only live in the Zustand store for the session, per the hard
  constraint).
- The chip's `onPress` calls `setOpenSettingsSection('provider')` — the same store
  action pB06-T01 added — and relies on `SettingsSheet`'s existing
  `openSettingsSection`-reaction `useEffect` (bodymap.tsx, already present) to open the
  provider section. No new effect, no navigation call needed (unlike
  `analyzing.tsx`'s `ConnectProviderCta`, which is on a different screen and does
  `router.replace('/bodymap')` first).
- Constraints preserved: disclaimer-before-first-message logic
  (`disclaimerShown` ref + effect) untouched; chat messages still only live in the
  Zustand store, never written to SQLite; the system prompt still scopes to one
  condition/record selection, never the full health record; no treatment/medication
  recommendation copy was added.
- Did not touch `analyzing.tsx` or the `SettingsSheet` `openSettingsSection`-reaction
  effect / `ProviderSettings` mount added by pB06-T01 — confirmed via `git diff` that
  those blocks are unchanged by this task's edits (they pre-existed in the working tree).

## Test Plan

- `tests/lib/llm/chatErrorCopy.test.ts` (new): unit tests for
  `chatErrorCopyForKind` — `rate_limit`/`quota_billing` → chip + limited-access copy;
  `network` → existing copy, no chip; all other kinds (`auth`, `invalid_request`,
  `content_filter`, `timeout`, `server`, `validation`) and `null` → generic default
  copy, no chip.
- Existing suites re-run for regressions: `__tests__/screens/bodymap.test.tsx`,
  `tests/lib/llm/service.test.ts`, `__tests__/store/useAppStore.test.ts` — all pass
  unchanged (this task didn't touch store shape beyond what pB06-T01 already added).
- No new component-level render test: `__tests__/screens/bodymap.test.tsx` documents
  that rendering the full bodymap screen exhausts the jest heap (4GB), so per that
  file's existing convention, coverage for this task is via the pure-function unit
  test above rather than a render + press-chip test.

## Test Results

**Verdict: PASS**

- `chatErrorCopyForKind` (src/lib/llm/chatErrorCopy.ts) mapping verified by inspection
  against spec: `rate_limit`/`quota_billing` → chip + "Free AI access is limited right
  now."; `network` → `'Unable to connect. Check network and LLM access.'` (byte-identical
  to the `catch` block's pre-existing generic-exception copy in bodymap.tsx, so the
  visible network-failure message is unchanged for users); all other kinds + `null` →
  generic default, no chip.
- `sendMessage()` (bodymap.tsx:1064-1097): `lastLlmFailureKind` is read immediately after
  `outcome.ok === false` on the *same* awaited `lmfChat` call — not stale, no race. The
  `catch` block (unexpected exceptions, not `ok:false`) was correctly left with its old
  generic copy: an exception path means `lmfChat`/telemetry may not have run to
  completion (or failed before `onExhausted` set a kind for *this* call), so attaching a
  kind there would be a guess, not a fact. Agree with the dev's reasoning — no real gap.
- Chat bubble render (bodymap.tsx ~1259-1266): chip renders only when
  `msg.showConnectChip` is true, `onPress` calls `setOpenSettingsSection('provider')`.
  `addChatMessage` (useAppStore.ts:234) is a pure `set()` — no SQLite call — confirming
  chat history stays session-only.
- Hard constraints preserved: disclaimer-before-first-message (`disclaimerShown` ref +
  effect, bodymap.tsx:1034-1054) untouched; system prompt (`sys`, bodymap.tsx:1074-1082)
  scopes to `selectedCondition` + `selectedRecords` only, never the full health record;
  no treatment/medication-recommendation copy introduced; `apiKey`
  (bodymap.tsx:1083-1084) is read from SQLite and passed to `lmfChat` but never logged
  (grepped for `console.*` near `apiKey`/`key` — none found). The direct
  `getSetting(db, 'openrouter_api_key')` read is confirmed unchanged from the
  pre-existing pB02-T04 pattern — not this card's scope, not worsened by it.
- `tests/lib/llm/chatErrorCopy.test.ts`: 5 tests, non-vacuous — covers both chip kinds,
  network's exact copy, all 6 remaining kinds via loop, and `null`. Good branch coverage
  of the pure helper.
- `npx tsc --noEmit -p .`: clean except the 3 known pre-existing `oauthPkce.test.ts`
  `crypto`/`Buffer` errors (unrelated to this card).
- `npx jest tests/lib/llm/chatErrorCopy.test.ts __tests__/screens/bodymap.test.tsx
  tests/lib/llm/service.test.ts __tests__/store/useAppStore.test.ts`: 75/75 passing.
- Full suite (`npx jest --silent`): 481 passed, 1 failed (49 suites, 1 suite failed) —
  the failure is the known pre-existing `__tests__/db/provider-recovery.test.ts`
  `cx_percent` issue, unrelated to this card's diff. No new regressions.
- `npx eslint` on changed files (`chatErrorCopy.ts`, `bodymap.tsx`, `conditions.ts`,
  `chatErrorCopy.test.ts`): 2 errors (`react-hooks/set-state-in-effect` at bodymap.tsx
  lines 1568 and 1575) + 2 warnings (unused `G` import, `addChatMessage` missing dep at
  line 1054). All four are in code this card didn't touch: lines 1568/1575 are
  `SettingsSheet`'s `openSettingsSection`-reaction effect (pB06-T01), and the
  missing-dep warning at 1054 is the pre-existing disclaimer effect. None trace to
  `sendMessage()`, the chat bubble render, or `chatErrorCopy.ts`.
- Scope: since this repo's working tree currently has all of Phase 6 uncommitted
  together, a clean `git diff --stat` isolating just this card wasn't possible — verified
  scope by direct code reading instead. `chatErrorCopy.ts` is new and self-contained;
  `bodymap.tsx` changes are confined to the `sendMessage()` failure branch and the chat
  bubble's chip render; `conditions.ts` gained only the one optional `showConnectChip`
  field. `SettingsSheet`/`ProviderSettings`/`openSettingsSection` code is pB06-T01's, not
  this card's — confirmed not to overlap with the diff areas above.

## Issues Found

None (P0/P1/P2). No defects blocking this card.
