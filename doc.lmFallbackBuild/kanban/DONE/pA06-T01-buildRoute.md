# pA06-T01 — buildRoute

**Part:** A. **Implements:** lmfPlan.md A6 (routing policy, lines ~199–204), A2 (`route.ts`).

## Description
Create **`src/lib/lmf/route.ts`** — `buildRoute(profile, freeChain)` → `Route`:
- Tier 0: free chain on openrouter (each free model id → Candidate on openrouter spec).
- Tier 1–3: `[{ activeProviderId, model }]` first; then, iff `profile.fallbackToFree`, append the free chain (deduped against the primary candidate).
- Cooldowns apply across the whole route: an on-cooldown user candidate falls through to the free net within the same request (engine handles the skip; route just supplies ordering).
- Tier 3 (custom): use `profile.customBaseURL` on the custom spec.

Pure function, no I/O. No `any`.

**Test file:** `tests/lib/lmf/route.test.ts`: tier-0 = free chain only; tier-1 primary-then-free; `fallbackToFree:false` → primary only (no free net); dedupe when primary model also in free chain; tier-3 custom baseURL propagated.

## Dependencies
pA03-T01.

## Acceptance criteria
- Typecheck clean; `npx jest tests/lib/lmf/route.test.ts` passes.
- `fallbackToFree:false` yields a single-candidate route (privacy guarantee).

## Implementation Notes
Created `src/lib/lmf/route.ts`. Tier 0 (or missing activeProviderId/model) returns the free chain
as openrouter candidates. Tier 1+ builds a primary candidate from `getProviderSpec`; tier 3 clones
the spec with `baseURL` overridden to `profile.customBaseURL`. `fallbackToFree:false` returns just
`[primary]`. Otherwise the free chain is appended with the primary's own `(providerId, model)` pair
filtered out to avoid a duplicate attempt.

## Test Plan
`tests/lib/lmf/route.test.ts`: tier-0 free-chain-only, tier-1 primary-then-free ordering,
`fallbackToFree:false` single-candidate, dedupe when primary model equals a free-chain entry, tier-3
custom baseURL propagation onto the primary candidate's spec.

## Test Results
`npx jest tests/lib/lmf/route.test.ts` — 5 tests passed. `npx tsc --noEmit` — no errors.

## Issues Found
None.
