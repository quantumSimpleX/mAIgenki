# pB04-T03 — mountSettingsSection

**Part:** B, **Phase:** 4. **Implements:** lmfPlan.md Phase 4 (mount into SettingsSheet, bodymap.tsx ~1479–1670; reuse `SettingsDropdownId` dropdown pattern).

## Description
Mount `ProviderSettings.tsx` as the "AI Provider" section inside the existing SettingsSheet in **`src/app/bodymap.tsx`** (~lines 1479–1670):
- Reuse the existing `SettingsDropdownId` / dropdown/section pattern already used there for other settings groups.
- Add an `openSettingsSection` awareness hook so Phase 6 nudges can deep-link to this section (if store flag exists; otherwise just render the section — the flag is added in pB06-T01).
- Keep the change surgical: add the section, don't refactor unrelated settings code.

## Dependencies
pB04-T02.

## Acceptance criteria
- Typecheck clean; SettingsSheet renders the AI Provider section.
- Follows existing SettingsSheet section pattern; no unrelated refactors.

## Implementation Notes

- `src/app/bodymap.tsx`: extended `SettingsDropdownId` (line ~1332) from `'language' | 'month' | null` to `'language' | 'month' | 'provider' | null` — `'provider'` is the stable id that Phase 6's future `openSettingsSection:'provider'` store flag (lmfPlan.md Phase 6) will target. Reused the sheet's single-`openDropdown`-state accordion pattern already used for the language/month pickers: only one section can be open at a time, and closing the sheet (`settingsOpen` → false) resets `openDropdown` to `null` via the existing effect, so the section auto-collapses like the others.
- Added a toggle row (label + ▲/▼ chevron, reusing `styles.settingsSectionLabel` and `styles.langDdChevron`) after the Backup section, and — when `openDropdown === 'provider'` — render `<ProviderSettings />` inside a new bordered `providerSectionBox` (`maxHeight: sc(420)`).
- `db` is not prop-drilled: `ProviderSettings` already calls `useOptionalDatabase()` itself (same hook `SettingsSheet` and other bodymap.tsx sections use), so no new prop-passing pattern was needed.
- One deliberate touch to `ProviderSettings.tsx` (outside bodymap.tsx): changed its root `wrap` style from `{ width: '100%' }` to `{ width: '100%', flex: 1 }`. Reason: `SettingsSheet`'s content area is a plain (non-scrolling) `Pressable`, not a `ScrollView`, so the new `providerSectionBox` constrains height via `maxHeight` and expects its child to fill and scroll within that bound. `ProviderSettings`'s root is itself a `ScrollView`; without `flex: 1` a nested `ScrollView` ignores the parent's `maxHeight` and just expands to its content size (pushing the rest of the sheet off-screen instead of scrolling internally). This was the only change made to `ProviderSettings.tsx` — no logic, styling, or prop-shape changes.
- No unrelated refactors; no store flag added (`openSettingsSection` is explicitly out of scope per this card, deferred to pB06-T01).

## Test Plan

- Typecheck (`npx tsc --noEmit -p .`): confirm no new errors beyond the pre-existing baseline (3 errors in `tests/lib/lmf/oauthPkce.test.ts`, unrelated to this card).
- `npx eslint src/app/bodymap.tsx src/components/ProviderSettings.tsx`: confirm no new warnings/errors beyond the pre-existing ones already present in `bodymap.tsx` before this change (1 unused-import warning, 1 exhaustive-deps warning, 1 set-state-in-effect error — all pre-existing, verified via `git stash` diff-before/after).
- `npx jest __tests__/screens/bodymap.test.tsx`: existing bodymap tests still pass (this card is UI-mounting only; no new tests written per card scope).
- Manual/visual (not run in this pass, recommend for QA): open Settings sheet → tap "AI Provider" row → chevron flips to ▲ and the `ProviderSettings` form renders and scrolls within its bounded box; tap again (or close the sheet) → collapses; confirm opening "AI Provider" doesn't visually break the Language/Backup sections above it.

## Test Results

- **Typecheck** (`npx tsc --noEmit -p .`): PASS. Only the 3 known pre-existing `tests/lib/lmf/oauthPkce.test.ts` errors (`Cannot find name 'crypto'/'Buffer'`), unrelated to this card. No new errors.
- **Lint** (`npx eslint src/app/bodymap.tsx src/components/ProviderSettings.tsx`): PASS. Exactly 3 pre-existing findings, all in code untouched by this card: unused `G` import (line 11), missing `addChatMessage` exhaustive-deps warning (line 1053, inside `ConditionSheet`'s chat effect), and a `set-state-in-effect` error (line 1556, the pre-existing `if (!settingsOpen) setOpenDropdown(null)` effect that this card's accordion pattern *reuses* rather than introduces). No new warnings/errors from the added code.
- **Unit tests** (`npx jest __tests__/screens/bodymap.test.tsx`): PASS, 17/17.
- **Diff scope**: `git diff --stat -- src/app/bodymap.tsx` shows 44 lines changed (39 insertions, 5 deletions), all attributable to: (1) `SettingsDropdownId` extended with `'provider'`, (2) new `ProviderSettings` import, (3) the new toggle row + conditional `<ProviderSettings />` render block after the Backup section, (4) two new style entries (`providerToggleRow`, `providerSectionBox`). The diff also contains pre-existing uncommitted `ConditionSheet` chat-wiring changes (`lmfChat`/`getSetting`, `useOptionalDatabase()` call at line ~1029) from a different in-flight card — confirmed these are not part of this card's intended change per the Implementation Notes, and they don't overlap with the SettingsSheet edit region.
- **Accordion-reuse verification**: Confirmed by reading the code directly (not just trusting the report). `openDropdown` is a single `useState<SettingsDropdownId>(null)` (line 1497) shared across `'language'` (line 1578), `'month'` (line 1603), and the new `'provider'` (lines 1682/1687/1689) sections — setting it to `'provider'` necessarily un-matches `'language'`/`'month'` conditionals and vice versa, so only one section can be open at a time, exactly like the existing pattern. The existing `useEffect` at line 1556 (`if (!settingsOpen) setOpenDropdown(null)`) auto-collapses the provider section too when the sheet closes, with no new/parallel state introduced.
- **`db` wiring verification**: Confirmed by reading `src/components/ProviderSettings.tsx` directly — it imports and calls `useOptionalDatabase()` itself (line 18 import, used at line ~79 `if (!db) return` inside a `useEffect`, and disables Save/Disconnect buttons via `disabled={!db}`). No `db` prop is declared or passed from `bodymap.tsx`, matching the report.
- **Style definitions verified**: `providerSectionBox` (`maxHeight: sc(420)`, border/radius/padding all via `sc()`) and `providerToggleRow` are both defined in the `styles` `StyleSheet.create` block (no dangling reference); `settingsSectionLabel` and `langDdChevron`, which the new toggle row reuses, are pre-existing style keys confirmed present.
- **`ProviderSettings.tsx` change verification**: The only change is the `wrap` style, from `{ width: '100%' }` to `{ width: '100%', flex: 1 }`, with an inline comment explaining why (lets the `ScrollView` clip/scroll within the new bounded parent's `maxHeight`). No logic, prop signature, or other styling changes found in the file — the component's behavior (provider selection, key validation, model picking, save/disconnect) is untouched from its pB04-T02 QA-passed state.
- **Sibling-task isolation confirmed**: `src/app/oauth/openrouter.tsx` does not exist yet (pB05-T02 not yet created it) and `src/lib/llm/oauth.ts` is untracked but untouched by this card's diff — neither file appears in `src/app/bodymap.tsx` or `src/components/ProviderSettings.tsx`'s changes.

**Verdict: PASS.** The change is surgical, correctly reuses the existing single-`openDropdown` accordion mechanism, correctly delegates DB access to `ProviderSettings` via `useOptionalDatabase()`, and does not regress any existing SettingsSheet section or bodymap test. Manual/visual verification (chevron flip, internal scroll behavior, closing "provider" doesn't visually disturb Language/Backup) was not re-run in this pass (no running app/simulator in this environment) — recommend a quick manual pass before merge to confirm the `maxHeight: sc(420)` box actually scrolls smoothly on-device given `ProviderSettings`'s fairly tall content (provider chips, key input, curated + "All models" expandable list, fallback switch, actions row).

## Issues Found

None (P0/P1/P2). No regressions, no new lint/typecheck findings, no scope creep detected.
