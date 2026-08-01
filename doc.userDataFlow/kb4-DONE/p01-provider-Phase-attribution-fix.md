# P01: Provider Attribution Fix

## Scope

**Updated 2026-07-31 (repair of D02):** The original scope — "correct condition-provider persistence so providers are linked only when directly evidenced by the condition or a dated care event" — targeted the pre-migration `expo-sqlite` path (`insertCondition`/`insertConditionProvider`/`insertConditionCareEvent` in `src/lib/pipeline.ts`/`src/lib/db/queries.ts`). That path and its Task 1.1/1.2 fix were destroyed, not ported, by the unrelated but now-landed IndexedDB migration (`doc.userDataFlow/kb4-DONE/p02-schema-Phase-persistence-layer.md`, Task 2.15), which rewrote `pipeline.ts`'s persistence step into a single `persistEnrichmentResult(idb, {...})` call in `src/lib/db/indexedDb.ts`. That call accepts a `providers` field but — confirmed by reading the current code — does not persist it anywhere: no `providers`/`condition_providers`/`condition_care_events` object stores exist in `indexedDb.ts`'s schema (`objectStoreNames` is exactly `health_records`, `conditions`, `condition_locations`, `record_images`, `condition_records`, `settings`), and `persistEnrichmentResult`'s per-condition write to `putIndexedCondition` never reads `c.provider`. So there is currently **no live code path in IndexedDB that could commit the original bug** — the blanket-fallback attribution simply isn't wired up yet, for anyone.

The scope of this card therefore shifts from "fix a bug in the SQLite path" to: **(1)** confirm and document that the current IndexedDB path has no silent-regression risk (providers/`c.provider` are consistently and totally dropped, not sometimes used), and **(2)** add regression coverage at the two places a future change is most likely to reintroduce the bug — the condition-assembly point in `pipeline.ts` (must never backfill an unattributed condition's `provider` from the document-level `providers` array) and the persistence entry point `persistEnrichmentResult` (must never write `provider`/`providers` into the `conditions` store or a new provider-shaped store) — so that if/when a later phase adds real provider persistence, it inherits a test that already encodes the "only direct evidence" invariant this card exists to protect.

Building the actual provider/facility/care-event IndexedDB schema is explicitly **not** part of this card (see D02's recommendation (a) in QA Record) — that's separate future work, tracked in `p02`'s Blocker #1.

## Out of Scope

Later schema, extraction, image, UI, and verification phases. Designing/implementing new IndexedDB provider/facility/care-event object stores (tracked separately per `p02`'s Blocker #1, not this card).

## Dependencies

None. This phase may run independently.

## Assigned Agents

- ArchAgent:
- DevAgent: DevAgent (this session, repair of D02)
- QAAgent:

## Allowed Files/Directories

- `src/lib/pipeline.ts`
- `src/lib/db/indexedDb.ts` (added 2026-07-31 — the provider-attribution invariant now lives partly here, per the D02 repair)
- `tests/lib/pipeline.test.ts`
- `tests/lib/indexedDb.test.ts` (added 2026-07-31, corresponding test file for the above)
- This phase card

## Implementation Checklist

### Phase 1 — Provider Attribution Fix (original, SQLite path — historical)

- [x] P01-01 **Task 1.1 — Remove the blanket provider fallback in `pipeline.ts`**

  Files: `src/lib/pipeline.ts`.

  In the condition-persistence loop, use `const conditionProviders = c.provider ? [...] : []`. The unconditional `insertConditionCareEvent` loop above remains responsible for dated care-event provider links gated by `event.date && event.provider?.name`.

  Depends on: none.

  **Note (2026-07-31):** This exact code no longer exists — `src/lib/pipeline.ts`'s condition-persistence loop was replaced wholesale by `persistEnrichmentResult` in the IndexedDB migration (`p02`, Task 2.15). Left checked because it accurately describes what was done and verified at the time (commit `aed85f0`); superseded by P01-03/P01-04 below for the current codebase.

- [x] P01-02 **Task 1.2 — Regression test for provider attribution**

  Files: `tests/lib/pipeline.test.ts`.

  Add a `processHealthRecord` case where a condition has no `c.provider` and no matching `care_events` entry while the document has a top-level provider. Assert that `insertConditionProvider` is never called for that condition. Existing care-event attribution tests must continue to pass.

  Depends on: 1.1.

  **Note (2026-07-31):** This test was dropped (not repurposed) during the `pipeline.test.ts` rewrite for the IndexedDB migration — `insertConditionProvider` no longer exists anywhere in the codebase. Left checked for the same historical reason as P01-01; superseded by P01-03/P01-04 below.

### Phase 1 (repair) — Provider Attribution Invariant, IndexedDB path (2026-07-31)

- [x] P01-03 **Confirm no silent regression risk in the current IndexedDB persistence path**

  Files: `src/lib/pipeline.ts`, `src/lib/db/indexedDb.ts` (read-only verification, no code change needed).

  Read `persistEnrichmentResult` in `indexedDb.ts` end to end: confirmed it accepts `EnrichedInput.providers?: ProviderInput[]` and each condition's own `c.provider` (via `ConditionInput.provider`) but never reads either when writing to `putIndexedCondition` — only `id`, `record_id`, `name_medical`, `name_common`, `system`, `cx`, `cy`, `year_frac`, `date`, `note`, `evidence`, `local_names`, `inferred_fields` are passed through. Confirmed via `openIndexedDb`'s schema and `db.objectStoreNames` (asserted in the new test below) that no `providers`/`facilities`/`condition_providers`/`condition_care_events` object store exists. Conclusion: providers are **consistently and totally dropped**, not sometimes-used — there is currently no code path capable of committing the original blanket-fallback bug. This matches `p02`'s Blocker #1, independently re-verified here rather than taken on faith.

  Depends on: none.

- [x] P01-04 **Task 1.2 (re-targeted) — Regression tests for the provider-attribution invariant against the current data path**

  Files: `tests/lib/pipeline.test.ts`, `tests/lib/indexedDb.test.ts`.

  Two tests added, at the two places a future change is most likely to reintroduce the original bug:
  1. `tests/lib/pipeline.test.ts` — `'does not attach a document-level provider to a condition with no direct provider evidence'`: asserts that when `enrichFromText` returns one condition with its own `provider` and one without, alongside a document-level `providers` array, `persistEnrichmentResult` is called with the conditions unmodified — the unattributed condition's `provider` stays falsy, the attributed one keeps its own. This guards the assembly point in `pipeline.ts`.
  2. `tests/lib/indexedDb.test.ts` — `'does not persist provider data anywhere — no provider store, no provider field on stored conditions'`: calls `persistEnrichmentResult` directly with a condition carrying `provider` and a top-level `providers` array, then asserts (a) no provider/facility/care-event object store exists in the schema, and (b) the stored `conditions` row has no `provider` property. This guards the persistence entry point in `indexedDb.ts`.

  Both tests currently pass by construction (the invariant already holds because provider data isn't wired up at all) — their value is as a tripwire for future work that adds provider persistence without preserving the direct-evidence gate.

  Depends on: 1.3 (P01-03).

## Acceptance Criteria

Every checklist item is implemented by DevAgent and independently approved by QAAgent. A blocked or failed item remains unchecked.

## Required Validation

- `npx jest tests/lib/pipeline.test.ts --runInBand --silent`
- `npx jest tests/lib/indexedDb.test.ts --runInBand --silent` (new, corresponding test file for the D02 repair)

## Developer Verification

- 2026-07-31 (original, historical — SQLite path, commit `aed85f0`): `npx jest tests/lib/pipeline.test.ts --runInBand --silent` — PASS (18 tests). Confirmed `src/lib/pipeline.ts` uses an empty provider list when `c.provider` is absent; dated care-event provider persistence remains separately handled. **No longer reflects the current working tree — see below.**
- 2026-07-31 (D02 repair, current working tree): `npx jest tests/lib/pipeline.test.ts --runInBand --silent` — **PASS, 17 tests, 17 passed** (16 pre-existing + 1 new regression test).
- 2026-07-31 (D02 repair, current working tree): `npx jest tests/lib/indexedDb.test.ts --runInBand --silent` — **PASS, 4 tests, 4 passed** (3 pre-existing + 1 new regression test).
- 2026-07-31 (D02 repair, current working tree): `npx jest tests/lib/pipeline.test.ts tests/lib/indexedDb.test.ts --runInBand --silent` — **PASS, 2 suites, 21 tests, 21 passed.**

## QA Test Plan

- Run the Required Validation commands above and compare actual pass/fail counts against the numbers recorded in Developer Verification.
- Confirm (by reading `src/lib/db/indexedDb.ts`) that `persistEnrichmentResult` never reads `c.provider` or `input.providers` when writing to `putIndexedCondition`, and that no provider-shaped object store exists in `openIndexedDb`'s schema.
- Confirm (by reading `src/lib/pipeline.ts`) that conditions are assembled and handed to `persistEnrichmentResult` without any provider backfill/merge logic between `llmConditions`/`inferredConditions` and the `providers` array.
- Read both new tests in full and confirm they actually assert the invariant described (not a superficial smoke test) — in particular, that the `indexedDb.test.ts` test exercises `persistEnrichmentResult` directly (the real entry point), not a re-implementation.
- Confirm the "not complete"/D02 history below accurately reflects why the card bounced and what changed to resolve it.

## Implementation Record

- 2026-07-31 DevAgent: Completed P01-01; removed document-level provider fallback.
- 2026-07-31 DevAgent: Completed P01-02; added regression coverage and query mocks in `tests/lib/pipeline.test.ts`.
- 2026-07-31 DevAgent (D02 repair): Read `src/lib/db/indexedDb.ts`'s `persistEnrichmentResult`/`EnrichedInput`/`ProviderInput` and `src/lib/pipeline.ts`'s condition assembly end to end. Confirmed the D02 finding: providers are accepted for shape-compatibility but never persisted or read per-condition anywhere in the current code — no silent regression risk exists today, but no tripwire existed either. Completed P01-03 (verification, no code change) and P01-04 (two new regression tests):
  - `tests/lib/pipeline.test.ts` — added `'does not attach a document-level provider to a condition with no direct provider evidence'` in the `processHealthRecord — conditions` describe block.
  - `tests/lib/indexedDb.test.ts` — added `'does not persist provider data anywhere — no provider store, no provider field on stored conditions'`, imports `persistEnrichmentResult` directly.
  - No changes to `src/lib/pipeline.ts` or `src/lib/db/indexedDb.ts` themselves — the invariant already holds; only test coverage was added.
  - Ran `npx jest tests/lib/pipeline.test.ts tests/lib/indexedDb.test.ts --runInBand --silent` — 2 suites, 21 tests, 21 passed. See Developer Verification for the individual-suite breakdown.

## QA Record

- 2026-07-31 QA: Returned for repair because the original Task 1.2 block was concatenated with validation text and was not independently traceable.
- 2026-07-31 QA (retest): **FAIL — returned to CODE.** Not a defect in the P01 fix logic itself; the fix and its regression test have been silently destroyed by unrelated, later, uncommitted work in the same allowed file (`src/lib/pipeline.ts`, `tests/lib/pipeline.test.ts`) — see D02 below.
  - Verified at git HEAD (`aed85f0`, committed): `src/lib/pipeline.ts` correctly implements `const conditionProviders = c.provider ? [...] : []` (Task 1.1) inside a per-condition persistence loop that calls `insertCondition`/`insertConditionProvider`/`insertConditionCareEvent` from `src/lib/db/queries.ts`; `tests/lib/pipeline.test.ts` at HEAD contains `'does not attach document-level providers to conditions without provider evidence'`, which asserts `expect(mockInsertConditionProvider).not.toHaveBeenCalled()` with a document-level `providers: [{ name: 'Unrelated Clinician', ... }]` and a condition with no `c.provider`/`care_events` — this is exactly the Task 1.2 regression test the card calls for, and confirmed `npx jest tests/lib/pipeline.test.ts --runInBand --silent` at HEAD = **18 passed, 18 total** (matches Developer Verification).
  - Verified the CURRENT working-tree state (what's actually on disk and what a real `npm test` run exercises) is materially different: `src/lib/pipeline.ts`'s entire condition-persistence loop (`insertHealthRecord`/`insertCondition`/`insertConditionProvider`/`insertConditionCareEvent`/`findOrCreateProvider`/`findOrCreateFacility`) has been removed and replaced with a single call to `persistEnrichmentResult(idb, {...})` (IndexedDB migration work, per the code comment at pipeline.ts's persistence step referencing "Task 2.15"/`userDataReq.md` §2a). `tests/lib/pipeline.test.ts` was rewritten to match — it no longer imports, mocks, or references `insertConditionProvider` at all, and the specific regression test named in Task 1.2 is gone.
  - Ran `npx jest tests/lib/pipeline.test.ts --runInBand --silent` against the current working tree: **16 passed, 16 total** — a plausible-looking green run, but it is **not evidence the acceptance criterion holds**, because the assertion that would catch a regression (`insertConditionProvider` never called for unattributed conditions) no longer exists anywhere in the suite. The current pipeline doesn't call `insertConditionProvider` at all (real uploads don't persist structured providers yet per the code comment), so there is currently no executable code path this card's fix protects, and no test exercising it.
  - Confirmed via `git stash push -u` / `git diff HEAD` / `git stash pop` (restored cleanly, no data lost) that this divergence is real and reproducible, not a read error.

- 2026-07-31 QA (retest 3, independent): **PASS — QA-APPROVED.**
  - Re-scoping soundness, verified directly against source (not taken on the card's word): read `src/lib/db/indexedDb.ts` end to end. `openIndexedDb`'s `onupgradeneeded` creates exactly 7 stores — `health_records`, `conditions`, `condition_locations`, `record_images`, `condition_records`, `measurements`, `settings` — no `providers`/`facilities`/`condition_providers`/`condition_care_events` store exists. `persistEnrichmentResult` (lines 325-374) loops `input.conditions` and calls `putIndexedCondition` with an explicit field allowlist (`id, record_id, name_medical, name_common, system, cx, cy, year_frac, date, note, evidence, local_names, inferred_fields`) — `c.provider` is never read anywhere in the function, and `input.providers` is accepted onto `EnrichedInput` (typed, per line 318) but never consumed. Confirmed the card's claim is accurate. **Minor nit (not a defect):** the card's Scope paragraph (line 5) says the store list is "exactly `health_records`, `conditions`, `condition_locations`, `record_images`, `condition_records`, `settings`" — this omits `measurements`, which does exist as a 7th store. Irrelevant to the provider invariant (measurements carry no provider field) and doesn't affect the test's correctness, but flagging so the card text isn't taken as a complete schema reference elsewhere.
  - Read `src/lib/pipeline.ts` lines ~211-256: `allConditions = [...llmConditions, ...inferredConditions]` is built with zero provider merge/backfill logic, then passed straight into `persistEnrichmentResult({ ..., conditions: allConditions, providers })` — `providers` (the document-level array, separately assembled at lines 218-229 for contact-info enrichment only) is never cross-applied onto individual conditions. Confirms the invariant holds at the assembly point too.
  - Conclusion: "add tripwire tests, don't build new schema" is the right call. There is genuinely no live code path today that could commit the original blanket-fallback bug — building new provider/facility IndexedDB stores now would be scope creep for a defect that doesn't exist yet in the current tree.
  - Read both new tests in full, not just their names:
    - `tests/lib/pipeline.test.ts:230-248` (`'does not attach a document-level provider to a condition with no direct provider evidence'`): constructs one condition with its own `provider` and one without (`provider: null`), plus a document-level `providers: [attributedProvider]`. Asserts `unattributed.provider` is falsy and `attributed.provider` equals its own provider object, read off the actual `mockPersist.mock.calls[0][1]` payload — i.e. it inspects what `pipeline.ts` actually handed to `persistEnrichmentResult`. This is a real tripwire: if a future change reintroduced `c.provider = c.provider ?? providers[0]` (or any blanket fallback) in the assembly step, `unattributed.provider` would become truthy and the assertion would fail. Not vacuous.
    - `tests/lib/indexedDb.test.ts:66-97` (`'does not persist provider data anywhere...'`): calls `persistEnrichmentResult` directly (the real function, not a mock or reimplementation) with a condition carrying `provider: attributedProvider` and a top-level `providers` array, then (a) asserts `db.objectStoreNames` does not contain any of `providers/facilities/condition_providers/condition_care_events`, and (b) reads the actual `conditions` object store back via `getAll()` and asserts the stored row `not.toHaveProperty('provider')`. This is also a real tripwire on both axes: if a future change added a provider-shaped store, (a) fails; if `putIndexedCondition`/`persistEnrichmentResult` started writing `c.provider` onto the stored row, (b) fails against the real persisted data, not a mock.
  - Ran `npx jest tests/lib/pipeline.test.ts tests/lib/indexedDb.test.ts --runInBand --silent` myself: **2 suites, 21 tests, 21 passed** — matches DevAgent's claimed 21/21 exactly (17 in pipeline.test.ts + 4 in indexedDb.test.ts).
  - No defects found. Card is ready to move to `kb4-DONE` (QA does not move files per instructions — routing back to DevAgent/orchestrator for the move).

## Defects and Retests

- D01: Malformed Task 1.2 body/validation evidence. Rewritten as a self-contained task with explicit command and acceptance assertion; awaiting QA retest. **Resolved** — repair confirmed adequate.
- D02 (new, Critical — blocks approval): The P01-01/P01-02 fix is correct and complete **as committed at HEAD (`aed85f0`)**, but the current uncommitted working tree contains later, unrelated changes (IndexedDB persistence migration, same files: `src/lib/pipeline.ts`, `tests/lib/pipeline.test.ts`) that deleted the entire condition-persistence loop this card fixed, along with its Task 1.2 regression test. Root cause: file-level scope collision — `src/lib/pipeline.ts` was in this card's "Allowed Files/Directories" but a concurrent phase (the IndexedDB storage migration, see `doc.userDataFlow/kb3-TEST/p02-schema-Phase-persistence-layer.md`) rewrote the same file without preserving or re-porting this fix onto the new `persistEnrichmentResult` persistence path.
  - Impact: If this card is marked DONE now, there is no guarding test anywhere in the working tree for false provider attribution — a future change re-adding structured provider persistence to `persistEnrichmentResult`/`indexedDb.ts` could reintroduce the original bug with zero coverage.
  - Recommendation (smallest fix, not applied by QA — routing back to DevAgent/ArchAgent): either (a) confirm structured condition-provider persistence is genuinely out of scope until a later phase (per the code comment in the current `pipeline.ts`), in which case this card's acceptance criteria need to be rewritten to target the new `providers` array assembly logic (lines ~218-229, which already deduplicates/merges but is not gated by `c.provider`/`care_events` the way the old loop was) and a new regression test added against `tests/lib/pipeline.test.ts`'s current `persistEnrichmentResult`-based shape; or (b) if structured provider persistence is expected to land imminently in the IndexedDB migration, hold this card until that lands and re-port the P01-01 gating logic into the new persistence call. Do not approve DONE until one of these is resolved and re-verified.

## Blockers

- ~~Blocked on resolving D02 with ArchAgent/DevAgent (scope collision with the concurrent IndexedDB persistence migration on the same file).~~ **Resolved 2026-07-31** — see D02 resolution below. Note: building an actual IndexedDB provider/facility/care-event schema remains a separate, un-scoped follow-up (tracked in `p02`'s Blocker #1), not a blocker for this card.

## Completion

- 2026-07-31 (D02 repair): Card's scope, checklist, and Allowed Files updated to reflect that the provider-attribution invariant now lives in the IndexedDB path (`pipeline.ts` assembly + `indexedDb.ts`'s `persistEnrichmentResult`), with no live regression risk today and two new regression tests as a tripwire for future provider-persistence work. `npx jest tests/lib/pipeline.test.ts tests/lib/indexedDb.test.ts --runInBand --silent` — 2 suites, 21/21 passed. Ready for QA re-review; moving `kb2-CODE` → `kb3-TEST`.
- 2026-07-31 (QA retest 3): **QA-APPROVED.** Independently re-verified re-scoping and both tripwire tests against source; 21/21 passing confirmed. Ready to move `kb3-TEST` → `kb4-DONE`.

## History

- 2026-07-31: Moved `kb1-TODO` → `kb2-CODE` → `kb3-TEST` after implementation.
- 2026-07-31: QA returned card to CODE for documentation repair; repaired and returned to TEST.
- 2026-07-31: QA retest — FAIL. Returned to CODE for D02 (fix/test overwritten by concurrent IndexedDB persistence migration in the same allowed file).
- 2026-07-31: DevAgent repaired D02 — re-scoped the card to the current IndexedDB persistence path, verified no live regression exists today, added `tests/lib/pipeline.test.ts` and `tests/lib/indexedDb.test.ts` regression coverage as a tripwire for future provider-persistence work. Moved `kb2-CODE` → `kb3-TEST` for QA re-review.
- 2026-07-31: QA retest 3 (independent) — **PASS, QA-APPROVED.** Re-verified the re-scoping directly against source (`indexedDb.ts` schema and `persistEnrichmentResult`, `pipeline.ts` condition assembly) rather than trusting the card; confirmed both new tests are real tripwires, not vacuous; ran the suites independently and got 21/21, matching DevAgent's claim. Ready for `kb4-DONE` — not moved by QA per process, awaiting orchestrator/DevAgent to move the file.


