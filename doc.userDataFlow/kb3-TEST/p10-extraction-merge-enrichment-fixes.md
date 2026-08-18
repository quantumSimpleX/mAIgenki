# P10: Extraction/merge/enrichment data-integrity and coordinate-derivation fixes

## Scope

Phase 09 (`kb4-DONE/p09-llm-extraction-enrichment.md`) shipped the two-step
extraction/enrichment pipeline and the alpha-mask coordinate *repair* step, but
its own QA record left several defects unresolved when the card was moved to
`kb4-DONE` (facility-only attribution, mask-loading end-to-end coverage). A
follow-up audit (2026-08-17) found the underlying gaps are broader than that
QA record captured. This phase closes them:

1. Guarantee condition/date/notes/provider/facility are never silently null
   when the source text supports a value, and define an explicit,
   documented fallback when it genuinely doesn't.
2. Fix cross-occurrence merge so **all** unique providers/facilities survive
   onto the merged condition, not just the first non-null one.
3. Implement the enrichment fields that were speced but never wired up:
   `name_common` and `local_names` are currently hardcoded null/unset for
   every real (non-demo) condition.
4. Replace the deterministic hash-jitter default body-map position with an
   LLM-assisted coordinate derivation that reads the consolidated notes
   first, falls back to the model's general anatomical knowledge of the
   condition, and is *then* constrained by the existing alpha-mask
   nearest-valid-pixel repair (`repairConditionCoordinates`) — which stays
   as the final validation step, unchanged.
5. Surface the provider/facility/care-event data that is already persisted
   to IndexedDB but never read back in the UI.

## Dependencies

- P09 complete in `kb4-DONE` (done, with known carried-forward defects listed
  above — this phase supersedes those specific defects; do not re-litigate
  the rest of P09's scope).
- Existing IndexedDB schema (`conditions`, `condition_locations`, `providers`,
  `facilities`, `condition_care_events`), alpha-mask loader
  (`src/lib/llm/longitudinal.ts`), and `src/lib/pipeline.ts`.

## Assigned Agents

- DevAgent: dev-engineer subagent, session 2026-08-17
- QAAgent: qa-engineer subagent (assigned after DevAgent completion; must be a different agent)

## Implementation Checklist

- [x] P10-01 Non-null extraction guarantees. In `src/lib/llm/enrich.ts`, add an
  explicit, documented fallback for `earliest_date` when no date is found
  anywhere in the document (currently stays `null` indefinitely — see
  `extractConditionSummaries`, enrich.ts:260-315). Extend provider/facility
  inheritance beyond the current single-chunk scope
  (`parseExtractionStepResponse`, enrich.ts:173-186) so a condition with no
  local or report-level attribution in its own chunk can still inherit one
  found elsewhere in the same document when unambiguous (single
  provider/facility mentioned document-wide).
- [x] P10-02 Multi-provider/facility merge. Fix `mergeTwoConditions`
  (enrich.ts:807-830), which currently does `provider: a.provider ?? b.provider`
  (keeps only the first non-null provider) and drops facilities entirely
  except inside concatenated `care_events`. Add deduped `providers: ProviderInput[]`
  and `facilities: FacilityInput[]` arrays to the merged `ConditionInput` (or
  an equivalent structure), populated from every occurrence's provider/facility
  plus every care event's provider/facility, deduped by name+email+phone /
  name+address+city+state+country. Update `ConditionInput`'s type and
  `persistEnrichmentResult` (`src/lib/db/indexedDb.ts`) to persist the full
  set, not just whichever survives today's `a ?? b`.
- [x] P10-03 Derive `name_common` and `local_names`. Extend
  `CONDITION_ENRICHMENT_PROMPT` (`src/lib/llm/prompts.ts:19`) and
  `parseConditionAnatomyBatch`/`ConditionAnatomy` (enrich.ts:411-450) to also
  return a common-language name (and localized names, scoped to whatever
  language set the enrichment call already supports) per condition. Wire the
  result into `buildConditionFromSummary` (enrich.ts:484-508), which currently
  hardcodes `name_common: null` and never sets `local_names` for real
  extraction.
- [x] P10-04 LLM-assisted coordinate derivation. Replace the seed-hash default
  in `putIndexedCondition`'s call to `defaultConditionPosition`
  (`src/lib/db/indexedDb.ts:289`, function in `src/model/conditions.ts:135-141`)
  for real (non-demo) conditions with a model call that reads the condition's
  consolidated `notes`/`anatomical_location`/`laterality` and proposes a
  `cx`/`cy` (or a location descriptor the app maps to `cx`/`cy`), falling back
  to the model's general knowledge of where that condition typically manifests
  when notes don't describe a location. `defaultConditionPosition`'s hash-jitter
  remains only as the last-resort fallback when the model call itself fails or
  returns nothing usable — not the primary path. `repairConditionCoordinates`
  (`src/lib/llm/longitudinal.ts:137-145`) keeps constraining the final point to
  a non-transparent pixel exactly as it does today; do not change that step.
  Demo data (`designConditionToConditionInput`) keeps its hand-authored
  `cx_percent`/`cy_percent` unchanged.
- [x] P10-05 Surface provider/facility/care-event data in the UI. The
  condition detail sheet (`src/app/bodymap.tsx` around line 1413-1428) only
  renders a single `SOURCE` line via `parseEvidence()` (`src/lib/support.ts:26-33`),
  which expects the demo-only `"Dr. X · Institution · City"` string format and
  is always empty for real conditions (`evidence: null` from
  `buildConditionFromSummary`). Wire `getProvidersForRecord`,
  `getFacilitiesForRecord`, and `getConditionCareEvents`
  (`src/lib/db/indexedDb.ts:409,424,512` — currently defined but never called
  from the UI) into a condition-scoped read (new hook alongside
  `useConditionRecords` in `src/hooks/useConditions.ts`), and render all
  attributed providers/facilities/notes/care events, not just one.
- [x] P10-06 Tests. Fixtures for: multi-provider/multi-facility conditions
  merging into deduped lists; `name_common`/`local_names` populated end to
  end; coordinate derivation from a notes-described location, from
  no-notes-fallback-to-general-knowledge, and interaction with alpha-mask
  repair (model-proposed point on a transparent pixel gets repaired, not
  rejected); UI test that a real (non-demo) condition with multiple providers
  renders all of them.
- [ ] P10-07 Run required typecheck, lint, Jest, and browser desktop/mobile
  acceptance comparing dot placement before/after this phase; record exact
  evidence here before QA handoff.

## Acceptance Criteria

- A condition/date/notes/provider/facility is only null when the source
  document genuinely contains no supporting information anywhere, not merely
  because it wasn't restated in the same chunk as the condition.
- Merging repeated mentions of one condition collapses to a single canonical
  medical name and the single earliest supported date (already correct,
  unchanged), consolidates notes (already correct, unchanged), and now
  retains every unique provider/facility encountered, not just the first.
- Every persisted condition has a derived common name; localized names are
  populated wherever the enrichment call's language scope supports it.
- Body-map coordinates are derived from the condition's consolidated notes
  first, the model's general anatomical knowledge second, and are always
  validated onto a non-transparent pixel for the affected system via the
  existing alpha-mask repair — never a random per-system jitter as the
  primary source of position.
- The condition detail UI displays every attributed provider, facility, and
  care event actually persisted for that condition, not a single
  demo-format string.
- Existing IndexedDB records, demo flow, fallback routing, exports, and
  unrelated body-map rendering remain compatible.
- Raw PDF/image bytes remain local; only extracted/redacted text (and the
  already-derived condition name/notes for the coordinate call) reach
  OpenRouter.

## Required Validation

- `npm run typecheck`
- `npx expo lint`
- Targeted Phase 10 Jest suites plus `npm test`
- Browser acceptance at desktop and narrow mobile-browser widths, comparing
  dot placement and condition-card content before/after this phase
- Fixture evidence for multi-provider/multi-facility merge, name_common/local_names
  derivation, notes-described-location coordinates, no-notes fallback
  coordinates, and alpha-mask repair interaction

## Implementation Record

DevAgent (dev-engineer subagent, session 2026-08-17):

**P10-01 — non-null extraction guarantees.** `src/lib/llm/enrich.ts`:
- `ExtractionStepResult` (per-chunk) now also carries `reportProvider`/`reportFacility`
  (the report-level attribution that chunk's own response named), returned from
  `parseExtractionStepResponse`.
- New `backfillDocumentWideAttribution(conditions, chunkResults)`: after all chunks
  settle, collects every provider/facility named anywhere in the document (own-chunk
  resolution already handles the same-chunk case) and, only when the whole document
  names exactly one distinct provider/facility, backfills any condition still missing
  one. More than one distinct provider/facility anywhere leaves it null rather than
  guessing. Exported for direct unit testing.
- New `backfillDocumentWideDate(conditions, carriedChunkDates)`: after per-chunk
  structural-date carry-forward (existing, unchanged) and the dedupe pass, any
  condition still undated inherits the single earliest date known anywhere in the
  document (an explicit condition date or a carried structural date), marked
  `earliest_date_inherited`. When the document genuinely has no date anywhere,
  `earliest_date` stays `null` — documented as the intended terminal case in the
  function's comment, not a bug. Exported for direct unit testing.
- `extractConditionSummaries` now runs: chunk extraction → `backfillDocumentWideAttribution`
  → `dedupeConditionSummaries` (unchanged) → `backfillDocumentWideDate`.

**P10-02 — multi-provider/facility merge.** `ConditionInput` gained `providers?:
ProviderInput[]` / `facilities?: FacilityInput[]` (full attribution lists; the existing
`provider` field is kept unchanged as the single "primary" attribution used elsewhere).
`buildConditionFromSummary` seeds `providers`/`facilities` as single-entry lists from
the summary. `mergeTwoConditions` now dedupes (`dedupeProviders`/`dedupeFacilities`,
by name+email+phone / name+address+city+state+country) every provider/facility from
both occurrences' own lists plus both occurrences' `care_events`, fixing the prior
`a.provider ?? b.provider` (kept only the first) and the facility-only-survives-via-
care_events gap — notably also fixing a real data-loss case: `buildConditionFromSummary`
only creates a care event when a summary has *both* a provider and a date, so a
provider on a date-less occurrence was previously dropped entirely on merge once a
second occurrence's provider won the `??`. `src/lib/db/indexedDb.ts`'s
`persistEnrichmentResult` now also persists `c.providers`/`c.facilities` as
condition-scoped rows (deterministic ids `${conditionId}-provider-extra-{i}` /
`${conditionId}-facility-{i}`), skipping any provider already linked via `c.provider`
or a care event (tracked via the existing `linkedProviderKeys` set) to avoid
duplicate rows.

**P10-03 — `name_common`/`local_names`.** `CONDITION_ENRICHMENT_PROMPT`
(`src/lib/llm/prompts.ts`) extended to also request a common-language display name and
localized variants (a subset of `{zh-TW, ja, es}`, only when the model is confident).
`ConditionAnatomy` gained `name_common`/`local_names`; `parseConditionAnatomyBatch`
validates them (`isValidLocalNames`). `buildConditionFromSummary` now sets
`name_common: anatomy?.name_common ?? null` and `local_names: anatomy?.local_names ?? null`
instead of the prior hardcoded `null`/unset. No new LLM call — folded into the existing
per-condition anatomy batch call (`enrichment-anatomy` label unchanged) to avoid adding
call-count against the free-tier rate limit (existing code already optimizes for call
count over call size — see that function's own comment).

**P10-04 — LLM-assisted coordinate derivation.** Same batched anatomy call extended
further: `CONDITION_ENRICHMENT_PROMPT` now also asks for `cx`/`cy` (0-100 percent),
instructed to prefer a location described in the condition's own
notes/anatomical_location/laterality first, falling back to general anatomical
knowledge of where the named condition typically manifests — calibrated against a
static per-system anchor-point reference embedded in the prompt (duplicated from
`SYSTEM_DEFAULT_POSITIONS` in `src/model/conditions.ts`, not imported, to keep
`prompts.ts` import-free — a deliberate small duplication, flagged for whoever next
edits either the anchors or the prompt to keep them in sync). `sanitizeCoordinate`
independently nulls out an unusable/out-of-range value without invalidating the rest
of that line's anatomy fields. `buildConditionFromSummary` sets `cx`/`cy` from
`anatomy?.cx`/`anatomy?.cy` (null when unusable or the whole anatomy call failed) —
`putIndexedCondition`'s existing `input.cx ?? pos.cx` fallback to
`defaultConditionPosition`'s hash-jitter is **unchanged** and now only fires in that
last-resort case, exactly as the card specifies. `repairConditionCoordinates`
(`src/lib/llm/longitudinal.ts`) is untouched and still runs as the final validation
step in `persistEnrichmentResult`, unconditionally on whatever cx/cy arrives (model
point or hash-jitter fallback) when a coordinate mask is supplied. Demo data
(`designConditionToConditionInput`) is untouched — still sets `cx`/`cy` directly from
`DesignCondition.cx_percent`/`cy_percent`, so this new derivation never runs for demo.

**Open product decision (flag for ArchAgent/QA):** rather than a third LLM call for
coordinates, P10-03 and P10-04 were folded into the existing single per-condition
anatomy batch call. This keeps LLM call count unchanged (still one extraction call
sequence + one anatomy/enrichment call per document, not per condition), consistent
with the codebase's existing free-tier-rate-limit-driven "one call for every
condition, not N calls" pattern. If a reviewer wants coordinate derivation kept as an
architecturally separate step (e.g. to allow independently retrying/disabling it), it
can be split out of `enrichConditionAnatomyBatch` later without touching the
persistence/repair layers — nothing downstream depends on it being combined.

**P10-05 — surface provider/facility/care-event data in the UI.** New
`useConditionAttribution(conditionId, recordId)` in `src/hooks/useConditions.ts`,
built from the three functions the card names verbatim
(`getProvidersForRecord`/`getFacilitiesForRecord`/`getConditionCareEvents`, all
pre-existing and previously unused from the UI): fetches the whole record's
providers/facilities and filters to the given `condition_id` (there's no
`condition_id` index on those stores, and the card scoped this to the three existing
functions rather than a schema change), plus the condition's care events directly.
`DesignCondition` (`src/model/conditions.ts`) gained an optional `record_id` field,
populated by `getIndexedConditions` (`src/lib/db/indexedDb.ts`), so the hook has a
record to scope from. `src/app/bodymap.tsx`'s condition detail sheet now renders every
attributed provider/facility/care event when any exist (`hasAttribution`), falling
back to the original single `parseEvidence()`-based SOURCE block only when the
condition has none (i.e. demo data, whose `designConditionToConditionInput` conversion
still only sets `evidence`, no providers/facilities/care_events) — demo rendering is
therefore unchanged.

**P10-06 — tests.**
- `tests/lib/enrich.test.ts`: name_common/local_names derivation; cx/cy pass-through
  from the anatomy call and the null/unusable fallback case; multi-provider/facility
  merge across two occurrences of the same condition (dedup, not "first wins"); direct
  unit tests for `backfillDocumentWideAttribution` (single unambiguous provider
  backfills; two distinct providers leaves it null) and `backfillDocumentWideDate`
  (backfills from the earliest known document-wide date; stays null when the document
  has none anywhere).
- `tests/lib/indexedDb.test.ts`: `persistEnrichmentResult` persists every unique
  provider/facility on a condition as condition-scoped rows without duplicating the
  one already linked via the primary `provider` field; a model-proposed coordinate
  landing on a transparent pixel is repaired (not rejected) via the unchanged
  `repairConditionCoordinates`, exercised through the real `coordinateMask` write path.
- `__tests__/hooks/useConditionAttribution.test.tsx` (new file): the hook surfaces
  every provider/facility/care-event persisted for a real, non-demo condition (not
  just one) via `fake-indexeddb`, and resolves to empty attribution (no crash) for a
  demo condition with no such rows — this is the "UI test that a real condition with
  multiple providers renders all of them" the card asks for, done at the hook/data
  layer bodymap.tsx's condition sheet consumes, rather than a full `bodymap.tsx`
  render (that render's jest-heap cost is already documented in
  `__tests__/screens/bodymap.test.tsx`'s file header — this phase didn't change that
  constraint).
- Not added as a separate fixture: "coordinate derivation from a notes-described
  location" vs. "no-notes fallback to general knowledge" as two distinct *code* paths
  — both are the same `cx`/`cy` fields on the same LLM call, with the choice between
  them entirely inside the prompt/model's own reasoning, not a local branch. The
  tests above cover the two locally-testable contracts instead: a usable model
  position flows through onto the condition, and an unusable/absent one leaves
  cx/cy null so the hash-jitter fallback applies. Flagging this as a scoping call
  rather than silently narrowing the checklist item.

**Validation run (2026-08-17):**
- `npm run typecheck` — PASS.
- `npx expo lint` — PASS, 0 errors/warnings.
- `npx jest --runInBand --coverage=false tests/lib/enrich.test.ts tests/lib/indexedDb.test.ts tests/lib/llm/longitudinal.test.ts tests/lib/pipeline.test.ts` — PASS, 4 suites, 54 tests (baseline regression check before adding new tests).
- `npx jest --runInBand --coverage=false tests/lib/enrich.test.ts` (with new tests) — PASS, 20 tests.
- `npx jest --runInBand --coverage=false tests/lib/indexedDb.test.ts` (with new tests) — PASS, 13 tests.
- `npx jest --runInBand --coverage=false __tests__/hooks/useConditionAttribution.test.tsx` — PASS, 2 tests (one benign non-`act()`-wrapped-state-update console warning from the real async IndexedDB round trip, not a failure).
- `npm test` (full suite, with coverage) — 53 passed / 2 failed suites, 535 passed / 3 failed tests. The 2 failing suites
  (`tests/lib/llm/connectionBundle.test.ts`, `tests/components/ProviderSettings.test.tsx`) are pre-existing timeout/render-
  order flakiness in LMF connection-bundle/QR and provider-settings-connect tests — neither file was touched by this
  phase, and `connectionBundle.test.ts` passed cleanly when re-run in isolation (`npx jest --runInBand --coverage=false
  tests/lib/llm/connectionBundle.test.ts tests/components/ProviderSettings.test.tsx`), confirming a cross-suite
  timing/global-state interaction under full-suite load rather than a regression from this phase's changes.
  `ProviderSettings.test.tsx` failed differently in isolation ("render function has not been called") — also unrelated
  to any file this phase changed. Flagging both as pre-existing flakiness for QA to independently confirm, not
  something this phase introduced or fixed.

**Not completed / blocked:**
- P10-07's browser desktop/mobile acceptance (comparing dot placement and condition-
  card content before/after this phase) was not run — this session has no live
  OpenRouter/browser environment to drive a real upload through the new coordinate-
  derivation call. Same class of blocker P09's QA record already flagged for its own
  browser acceptance step.
- Coordinate-derivation prompt quality (how well the model actually follows the
  notes-first/general-knowledge-second instruction, and how good its cx/cy percentage
  estimates are in practice) is unverified beyond the mechanical contract tests above
  — real-world calibration can only be judged against actual model output, which needs
  the browser acceptance pass above.

### 2026-08-17 — DevAgent, Defect 1 and Defect 2 fixes (QA retest follow-up)

Fixed both defects filed in QA's retest above (Defect 1 was the P0 blocker; Defect 2
was fixed too since time allowed).

**Defect 1 fix (`src/lib/db/indexedDb.ts`, `persistEnrichmentResult`):** the root
cause was exactly as QA diagnosed — `linkedProviderKeys` was a single record-scope
`Set` used both (a) to gate the "extra providers" condition-scoped write inside the
per-condition loop, and (b) to gate the final record-level `input.providers` loop
after it. Those two uses need different scopes. Split it into two sets:
`linkedProviderKeys` (unchanged name/semantics, still record-scope, still accumulates
across every condition and still gates the final `input.providers ?? []` loop exactly
as before — QA confirmed that loop's semantics were already correct, so it was left
untouched) and a new `conditionLinkedProviderKeys`, declared fresh at the top of each
`for (const rawCondition of input.conditions)` iteration. The condition-scoped writes
for `c.provider` and each care-event provider now add to *both* sets; the "extra
providers" loop's dedup check (`if (linkedProviderKeys.has(...)) continue`) was
changed to check `conditionLinkedProviderKeys` instead, so it only skips a provider
already given a row for *this* condition, not one linked to some earlier condition in
the same document. Added a regression test to `tests/lib/indexedDb.test.ts`
("persists a condition-scoped provider row for every condition that cites that
provider, even when shared across conditions") adapting QA's exact repro (two
conditions, `cond-A` and `cond-B`, both citing `Dr. Kim`) — asserts
`getProvidersForRecord` returns a `Dr. Kim` row with `condition_id: 'cond-A'` **and**
one with `condition_id: 'cond-B'`.

**Defect 2 fix (`src/app/bodymap.tsx`, `ConditionSheet`):** added an
`attributedProviderNames` `Set` (built from `attribution.providers.map(p => p.name)`)
alongside the existing `hasAttribution` derivation. The care-events line's
`.filter(Boolean).join(' · ')` array now omits `e.provider_name` when that name is
already in `attributedProviderNames`, so a provider already listed in the providers
block above no longer repeats inline in every one of their care-event lines; the
event type/date/facility on that line are unaffected. No test added — this is a
presentation-only change with no new branch of persisted data, consistent with how
the rest of P10-05's UI wiring was verified (QA's own note called Defect 2 "cosmetic
only," not a data-correctness gap).

**Validation (ran fresh, this session):**
- `npm run typecheck` — PASS, clean, no output.
- `npx expo lint` — PASS, exit 0, no errors/warnings.
- `npx jest --runInBand --coverage=false tests/lib/enrich.test.ts tests/lib/indexedDb.test.ts __tests__/hooks/useConditionAttribution.test.tsx` — PASS, 3 suites, 36 tests (35 prior + 1 new Defect 1 regression test).
- `npm test` (full suite, with coverage) — PASS, **55 passed / 55 total suites, 539 passed / 539 total tests, 0 failed.** This includes `tests/lib/llm/connectionBundle.test.ts` and `tests/components/ProviderSettings.test.tsx`, both green in this run — consistent with QA's independent conclusion that those are pre-existing cross-suite timing flakiness unrelated to this phase, not a regression from either defect fix.

Scope discipline: touched only `src/lib/db/indexedDb.ts` (Defect 1),
`src/app/bodymap.tsx` (Defect 2), and `tests/lib/indexedDb.test.ts` (new regression
test) — no other files in this phase's diff were changed.

## QA Record

QAAgent (qa-engineer subagent, session 2026-08-17), independent of the DevAgent that
implemented this phase. Verified against the actual working-tree diff
(`git diff` — this phase's work is uncommitted; base is commit `5a52039`), not the
Implementation Record's file list.

**Validation commands run (fresh, this session):**
- `npm run typecheck` — PASS (clean, no output).
- `npx expo lint` — PASS, exit 0, no errors/warnings.
- `npx jest --runInBand --coverage=false tests/lib/enrich.test.ts tests/lib/indexedDb.test.ts __tests__/hooks/useConditionAttribution.test.tsx` — PASS, 3 suites, 35 tests.
- `npm test` (full suite, with coverage) — PASS, **55 passed / 55 total suites, 538 passed / 538 total tests, 0 failed.**
  This includes `tests/lib/llm/connectionBundle.test.ts` and
  `tests/components/ProviderSettings.test.tsx`, the two suites DevAgent reported as
  pre-existing flaky failures under full-suite load. Independently confirmed
  pre-existing/unrelated: (1) neither file appears in `git diff --stat` for this
  phase — the changed-file set is limited to `src/app/bodymap.tsx`,
  `src/hooks/useConditions.ts`, `src/lib/db/indexedDb.ts`, `src/lib/llm/enrich.ts`,
  `src/lib/llm/prompts.ts`, `src/model/conditions.ts`, plus their test files; (2) this
  session's full run passed both suites cleanly with 0 failures, consistent with
  cross-suite timing flakiness rather than a stable regression this phase introduced.
  Not swept under the rug — independently reproduced-clean, not just re-asserted.

**P10-01 (non-null extraction guarantees) — VERIFIED.**
`backfillDocumentWideAttribution` and `backfillDocumentWideDate` in
`src/lib/llm/enrich.ts` are real, document-wide (not single-chunk) passes, wired into
`extractConditionSummaries`'s pipeline after per-chunk resolution and dedupe. Both are
exported and directly unit-tested (`tests/lib/enrich.test.ts`): single-unambiguous-provider
backfill, two-distinct-providers-leaves-null (no guessing), earliest-date-anywhere backfill,
and the documented null-when-genuinely-dateless terminal case. Tests are meaningful, not
tautological — they exercise the ambiguity-resolution branch, not just the happy path.

**P10-02 (multi-provider/facility merge) — DEFECT FOUND, see below.**
`mergeTwoConditions` now correctly dedupes providers/facilities from both occurrences'
lists plus both occurrences' care events (`dedupeProviders`/`dedupeFacilities`), fixing
the `a.provider ?? b.provider` "first wins" bug at the merge-math level — confirmed
correct by reading `enrich.ts` and by the existing `tests/lib/enrich.test.ts` merge
test. However, `persistEnrichmentResult` (`src/lib/db/indexedDb.ts`) does **not**
correctly carry the full set through to storage across multiple conditions in the same
document — see Defect 1.

**P10-03 (`name_common`/`local_names`) — VERIFIED.**
`CONDITION_ENRICHMENT_PROMPT` extended, `ConditionAnatomy`/`isValidIndexedAnatomyLine`
validate the new fields, `buildConditionFromSummary` now sets both from the anatomy
call instead of the prior hardcoded `null`. Confirmed via `tests/lib/enrich.test.ts`'s
new derivation test (real assertion on `result.conditions[0].name_common`/`local_names`,
not a shape-only check).

**P10-04 (LLM-assisted coordinate derivation) — VERIFIED, mechanically.**
`repairConditionCoordinates` (`src/lib/llm/longitudinal.ts`) has a **zero-line diff** —
confirmed unchanged (`git diff src/lib/llm/longitudinal.ts` is empty). Demo data
(`designConditionToConditionInput` in `src/lib/db/indexedDb.ts`) still sets
`cx`/`cy` directly from `DesignCondition.cx_percent`/`cy_percent`, untouched, confirmed
by reading the function. A malformed/out-of-range cx/cy degrades to null via
`sanitizeCoordinate` without invalidating the rest of that anatomy line (verified by
reading `parseConditionAnatomyBatch` — the coordinate sanitization happens inside the
same `isValidIndexedAnatomyLine`-gated branch as the other fields). The alpha-mask
repair interaction is exercised end-to-end by the new `indexedDb.test.ts` test (a
model-proposed point on a transparent pixel gets repaired to the mask's one opaque
pixel via the real `persistEnrichmentResult`/`coordinateMask` path) — ran and passed.
**Not verified, and cannot be from this environment:** actual model output quality
(whether a real LLM call, given real notes, proposes sensible coordinates) — this is
correctly listed as blocked by DevAgent and remains blocked; see Blockers.

**P10-05 (surface provider/facility/care-event data in UI) — VERIFIED, with one
usability note.**
`useConditionAttribution` (`src/hooks/useConditions.ts`) and its wiring into
`ConditionSheet` in `src/app/bodymap.tsx` are real — not a defined-but-uncalled hook.
Confirmed by reading both diffs: the hook is imported and invoked in `ConditionSheet`,
its `hasAttribution` flag gates between the new multi-attribution block and the
original single-`evidence` fallback. Demo conditions correctly fall through to the
original block (`designConditionToConditionInput` sets no `providers`/`facilities`/
`care_events`, so the hook resolves to `EMPTY_ATTRIBUTION` for them) — confirmed by
reading the seed path (`seedIndexedDbDemoData` → `persistEnrichmentResult`, demo
`recordId` is real, but demo conditions never populate the provider/facility rows the
hook queries, so the query legitimately returns empty rather than crashing or
mis-rendering). See Defect 2 for a minor UI redundancy (not a correctness bug).

**P10-06 (tests) — PARTIALLY VERIFIED; test scope narrower than the claimed
coverage for P10-02.**
Ran `tests/lib/enrich.test.ts`, `tests/lib/indexedDb.test.ts`, and
`__tests__/hooks/useConditionAttribution.test.tsx` independently — all pass, and the
assertions are meaningful (real field-value checks, ambiguity-branch coverage, not
just "did not throw"). However, the `persistEnrichmentResult` multi-provider test in
`tests/lib/indexedDb.test.ts` only exercises a **single condition** with two providers
in its `providers` array — it does not cover the case where the *same* provider is
attributed to *two different conditions* in one document, which is the exact scenario
that exposes Defect 1 below. This is a real gap in what P10-06 claims to cover
("deduped lists" — true only within one condition, not proven across conditions),
not a fabricated claim, but the acceptance criterion ("retains every unique
provider/facility encountered, not just the first") is broader than what's tested and
the untested slice is exactly where the bug lives.

## Defects and Retests

**Defect 1 (Critical — data loss, contradicts P10-02's own stated goal) —
`persistEnrichmentResult` drops a provider's attribution to every condition after
the first one it's linked to in the same document.**

- **File / location:** `src/lib/db/indexedDb.ts`, `persistEnrichmentResult`. The
  `linkedProviderKeys` `Set` is declared once at **record scope**
  (`const linkedProviderKeys = new Set<string>()`, before the
  `for (const rawCondition of input.conditions)` loop) but is used inside the
  per-condition "extra providers" loop (`for (const [index, provider] of
  (c.providers ?? []).filter(isValidProviderInput).entries())`) to decide whether to
  write a **condition-scoped** provider row (`condition_id: conditionId`) for the
  *current* condition. Because the set persists across the whole conditions loop,
  once a provider's key is added while processing condition A (via `c.provider`, a
  care event, or a prior extra-provider write), that same provider is silently
  skipped for every subsequent condition B, C, … in the same document — even when
  B's own `providers` array explicitly names them.
- **Expected:** In a document where one clinician is attributed to two different
  conditions (a very common real-world case — e.g. a primary care doctor listed
  against both hypertension and diabetes in the same record), both conditions should
  end up with a provider row linking that clinician (`condition_id: 'cond-A'` and a
  separate row with `condition_id: 'cond-B'`), so `getProvidersForRecord` filtered by
  either condition's id returns that provider, and the UI (P10-05) shows them under
  both conditions' detail sheets.
- **Actual:** Only the first condition processed (insertion order of
  `input.conditions`) gets the provider row. The second condition's attribution to
  that same provider is silently dropped — no row is ever written with
  `condition_id: 'cond-B'` for that provider — even though `cond-B.providers`
  explicitly included them.
- **Repro (independently written and run this session, not supplied by DevAgent):**
  ```ts
  import 'fake-indexeddb/auto'
  import { openIndexedDb, persistEnrichmentResult, getProvidersForRecord } from '@/lib/db/indexedDb'

  const db = await openIndexedDb('repro')
  const drKim = { name: 'Dr. Kim', specialty: 'Cardiology', email: null, phone: null, evidence: null }
  const { recordId } = await persistEnrichmentResult(db, {
    filename: 'report.pdf', pageCount: 1, extractionMethod: 'text',
    conditions: [
      { id: 'cond-A', name_medical: 'Essential hypertension', name_common: null, system: 'cardiovascular',
        organ: null, anatomical_location: null, status: 'documented', severity: null, certainty: null,
        date_onset: null, date_diagnosed: '2022-06-01', evidence: null,
        provider: drKim, providers: [drKim], facilities: [] },
      { id: 'cond-B', name_medical: 'Type 2 diabetes', name_common: null, system: 'endocrine',
        organ: null, anatomical_location: null, status: 'documented', severity: null, certainty: null,
        date_onset: null, date_diagnosed: '2022-07-01', evidence: null,
        provider: null, providers: [drKim], facilities: [] },
    ],
    measurements: [],
  })
  const providers = await getProvidersForRecord(db, recordId)
  console.log(providers.filter(p => p.name === 'Dr. Kim').map(p => p.condition_id))
  // Actual: ['cond-A']   Expected: ['cond-A', 'cond-B']
  ```
  Ran via `npx jest` against a temporary spec file in `tests/lib/` (deleted after
  confirming); result: `Dr. Kim rows: [ { id: 'cond-A-provider', condition_id: 'cond-A' } ]`
  — `cond-B` gets no row at all.
- **Impact:** Any multi-condition document where the same clinician/institution
  treats more than one condition (routine in real health records — e.g. a PCP
  managing several chronic conditions) will silently under-report that provider's
  attribution on all but the first condition they're linked to. This directly
  contradicts the phase's own acceptance criterion ("retains every unique
  provider/facility encountered, not just the first") — it's the same "first wins"
  class of bug P10-02 set out to fix, just moved from the merge step to the
  persistence step, and it's cross-condition instead of cross-occurrence.
- **Recommendation:** Scope the dedup key to `(conditionId, providerKey)` rather than
  a record-wide `linkedProviderKeys` set — e.g. track "already-linked-to-this-specific-
  condition" per condition (a `Map<conditionId, Set<string>>`, or simply a fresh
  per-condition set reset each loop iteration for the condition-scoped writes, while
  keeping the existing record-scoped set only for the separate `input.providers ??
  []` record-level loop that runs after the conditions loop). Add a regression test
  with two conditions sharing one provider in the same `persistEnrichmentResult` call,
  asserting both get a condition-scoped row.
- **Priority:** P0 — blocks approval.

**Defect 2 (Low — UI redundancy, not a correctness bug).**
- **File / location:** `src/app/bodymap.tsx`, `ConditionSheet`'s new attribution
  block (P10-05).
- **Expected/actual:** When a provider is linked to a condition via a care event
  (`care_events` list), their name renders once in the `attribution.providers` list
  (`p.name`) and again inline inside that same care event's line
  (`[e.event_type, e.date, e.provider_name, e.facility_name].filter(Boolean).join(' · ')`).
  For a condition with several care events for the same provider, the name repeats
  once per care event plus once in the providers list — noisy but not wrong (the
  care-event line carries genuinely different information: date and event type).
- **Impact:** Minor readability/clutter in the condition detail sheet for
  conditions with several care events; no data loss or incorrect data.
- **Recommendation:** Cosmetic only — consider omitting `e.provider_name` from the
  care-event line when the same provider is already listed above, or leave as-is if
  the product intent is a self-contained event log. Not a blocker.

**Retest status:** Not yet retested — returning to DevAgent for Defect 1 (P0). Defect
2 does not block approval on its own but should be triaged.

### 2026-08-17 — DevAgent update: both defects fixed, ready for QA retest

**Defect 1 — FIXED.** Split the single record-scope `linkedProviderKeys` set into
two: the original `linkedProviderKeys` (still record-scope, still gates only the
final `input.providers ?? []` loop, unchanged semantics) and a new
`conditionLinkedProviderKeys` (reset per condition in the `for (const rawCondition of
input.conditions)` loop), which now gates the "extra providers" condition-scoped
write. Both `c.provider` and each care-event provider add to both sets; the extra-
providers loop's dedup check now reads `conditionLinkedProviderKeys` instead of the
record-scope set. Added
`tests/lib/indexedDb.test.ts > 'persists a condition-scoped provider row for every
condition that cites that provider, even when shared across conditions'` — adapts
QA's exact repro (two conditions, `cond-A`/`cond-B`, both citing "Dr. Kim") and
asserts `getProvidersForRecord` returns rows for both `condition_id`s. Please retest
against QA's original repro script directly, in addition to the new Jest test, if you
want a from-scratch independent check.

**Defect 2 — FIXED (not skipped).** `src/app/bodymap.tsx`'s `ConditionSheet` now
builds `attributedProviderNames` from `attribution.providers` and omits
`e.provider_name` from a care-event line when that provider is already listed in the
providers block above it. Date/event-type/facility on the care-event line are
unchanged. No new test — this is a presentation-only change (see Implementation
Record entry above for reasoning); please eyeball-check in a browser render if you
want visual confirmation beyond the code read.

Full validation results (typecheck/lint/full test suite) are in the Implementation
Record entry above ("2026-08-17 — DevAgent, Defect 1 and Defect 2 fixes"). Leaving
this card in `kb2-CODE/` per workflow rules — not moving it myself.

## Blockers

- **P10-07 browser desktop/mobile acceptance for coordinate placement: BLOCKED, not
  passed.** No live browser/OpenRouter environment was available to this QA session
  either (same constraint DevAgent flagged). This QAAgent explicitly did **not**
  validate: (1) real end-to-end LLM coordinate proposals against real uploaded
  documents at desktop and narrow mobile widths, (2) visual dot-placement
  correctness/regression before vs. after this phase, (3) the condition detail sheet's
  new attribution block rendering correctly across desktop/mobile breakpoints (layout,
  wrapping, touch targets for a sheet that can now contain many more lines than
  before). What **was** proven instead, mechanically, without a browser: the
  mechanical data contracts (cx/cy pass-through, null-fallback, alpha-mask repair
  interaction, demo-data non-regression) via Jest against `fake-indexeddb` — see QA
  Record above. Per `prompt.userData.md`, this is recorded as an open blocker, not a
  pass. The phase cannot be marked DONE until this is exercised in a real browser.
- **Coordinate-derivation prompt quality** (how well the model follows the
  notes-first/general-knowledge-second instruction, how good real cx/cy estimates
  are) is unverified for the same reason — carried forward from the Implementation
  Record, independently confirmed still blocked.

### 2026-08-17 — QAAgent retest (independent of DevAgent, different session from the
first QA pass): P10-07 status re-confirmed, unchanged

Still **BLOCKED, not passed** — no live browser/OpenRouter environment exists in this
retest session either. Not silently dropped, not falsely marked passed; carried
forward exactly as recorded above. See the retest QA Record entry below for what was
mechanically re-verified in place of it.

## Completion

Not complete pending P10-07 browser acceptance evidence. **Verdict on the code/data-layer
scope re-tested this session: APPROVED — Defect 1 confirmed fixed, Defect 2 confirmed
fixed, no regressions found, full phase re-verified.** Per `prompt.userData.md` §
"Classify an untested browser/viewport combination as a blocker, not a pass," ArchAgent
may move this card to `kb4-DONE` only once P10-07 (and the coordinate-derivation prompt
quality check) has real browser/OpenRouter evidence — that blocker is unrelated to
either defect and was never claimed resolved by any QA pass. If the team's policy is to
accept documented, explicit follow-up blockers rather than gate DONE on them (per
`prompt.userData.md`'s closing line allowing "an explicit, user-acknowledged follow-up"),
that is ArchAgent's/the user's call to make explicitly, not a default this QA pass
grants.

---

### 2026-08-17 — QAAgent retest entry (this session), independent of the DevAgent that
fixed the defects and independent of the QAAgent that filed them

**Scope:** retest Defect 1 (P0) and Defect 2 (Low) per the DevAgent fix notes above,
plus full phase re-verification (P10-01 through P10-06), plus regression check, per
`prompt.userData.md`'s retest workflow. Read the actual working-tree diff
(`git diff --stat`, `git diff src/lib/db/indexedDb.ts`, `git diff src/app/bodymap.tsx`,
`git diff src/lib/llm/enrich.ts`) rather than trusting the Implementation Record's
claims.

**Validation commands run (fresh, this session):**
- `npm run typecheck` — PASS, no output.
- `npx expo lint` — PASS, exit code 0.
- `npx jest --runInBand --coverage=false tests/lib/enrich.test.ts tests/lib/indexedDb.test.ts __tests__/hooks/useConditionAttribution.test.tsx` — PASS, 3 suites, 36 tests (matches DevAgent's reported count exactly).
- `npm test` (full suite, with coverage) — PASS, **55 passed / 55 total suites, 539 passed / 539 total tests, 0 failed.** `tests/lib/llm/connectionBundle.test.ts` and `tests/components/ProviderSettings.test.tsx` both passed cleanly in this full run — third independent confirmation (across two QA sessions plus DevAgent) that these are pre-existing cross-suite timing flakiness, not something this phase or its defect fixes caused. Not re-asserted from memory — actually re-run this session.

**Defect 1 retest — CONFIRMED FIXED.**
Read `git diff src/lib/db/indexedDb.ts` directly (not the fix-report prose). Confirmed:
- `linkedProviderKeys` (record-scope, declared once before the conditions loop) is
  **only** read/written by (a) the `c.provider` and care-event-provider writes inside
  the conditions loop (both now add to it — unchanged from before the fix) and (b) the
  final `for (const p of input.providers ?? [])` loop after the conditions loop, whose
  dedup check (`if (linkedProviderKeys.has(providerKey(p))) continue`) and every line
  around it is byte-for-byte identical to the pre-defect-fix version — confirmed by
  reading that block directly (lines ~698-711): still record-scope, still gates only
  that one loop, exactly as both DevAgent and the prior QA record claimed.
- A new `conditionLinkedProviderKeys` Set is declared fresh at the top of each
  `for (const rawCondition of input.conditions)` iteration. `c.provider` and each
  care-event provider now add to **both** sets. The condition-scoped "extra providers"
  loop (`for (const [index, provider] of (c.providers ?? []).filter(isValidProviderInput).entries())`)
  now checks `conditionLinkedProviderKeys.has(...)`, not the record-scope set — this is
  the exact fix the defect called for, verified in the diff, not asserted secondhand.
- **Independent repro, written from scratch this session (not copy-pasted from either
  QA's original repro or DevAgent's regression test):** three conditions in one
  `persistEnrichmentResult` call — `c1` (unrelated provider), `c2` and `c3` both citing
  a shared provider (`Dr. Lee`) *and* a shared facility (`Clinic A`), with the shared
  provider/facility deliberately **not** on the first condition this time (to rule out
  any first-condition special-casing). Written to a temp test file, run via
  `npx jest --runInBand --coverage=false`, and deleted after confirming — not left in
  the tree. Result: `getProvidersForRecord` returned `Dr. Lee` rows with
  `condition_id` `['c2', 'c3']` exactly, and `getFacilitiesForRecord` returned
  `Clinic A` rows with `condition_id` `['c2', 'c3']` exactly. Both assertions passed.
  This also incidentally confirms facilities never had the analogous bug (the
  condition-scoped facility loop writes with a deterministic
  `${conditionId}-facility-{index}` id and no shared cross-condition dedup Set at all,
  so it was never susceptible to the record-scope-leak class of bug — confirmed by
  reading the loop, not just inferred).
- DevAgent's own added regression test
  (`tests/lib/indexedDb.test.ts > 'persists a condition-scoped provider row for every
  condition that cites that provider, even when shared across conditions'`) is real and
  non-tautological: it asserts `condition_id` equals `['cond-A', 'cond-B']` (both), not
  just "no throw" or "array has length 2" — a weaker assertion could have passed with a
  different bug. Confirmed by reading the test body directly.
- **Verdict: Defect 1 is fixed.** No regression to the previously-correct
  within-condition dedup (`providers.filter(p => p.name === 'Dr. Kim')).toHaveLength(1)`
  in the pre-existing P10-02 test still passes) and no regression to the record-level
  loop's original "skip a provider already linked to any condition" semantics (confirmed
  unchanged in the diff, as above).

**Defect 2 retest — CONFIRMED FIXED (mechanically; visual confirmation still blocked,
same as P10-07).**
Read `git diff src/app/bodymap.tsx` directly. Confirmed `attributedProviderNames` (a
`Set` built from `attribution.providers.map(p => p.name)`) is computed once per render
and the care-event line's array now includes
`attributedProviderNames.has(e.provider_name) ? null : e.provider_name` (filtered out
via the existing `.filter(Boolean)`) in place of the unconditional `e.provider_name`.
Event type, date, and facility name on that same line are untouched — matches the fix
note exactly. No test was added for this (correctly labeled presentation-only,
consistent with how Defect 2 was triaged as cosmetic, not a data-correctness gap); this
QA pass did not add one either, since there's no new data branch to protect — a snapshot
or RTL render test would only be pinning JSX structure, not behavior, for a screen file
whose full-render Jest cost is already documented as prohibitive elsewhere in this repo
(`__tests__/screens/bodymap.test.tsx`'s header, referenced by DevAgent). Actual visual
rendering (line wrapping, spacing, whether the dedup reads correctly at a glance) is
unverified — folded into the same P10-07 browser-acceptance blocker, not a new one.

**Regression check — CONFIRMED CLEAN.**
- `git diff --stat` for this defect-fix pass shows exactly three files touched:
  `src/lib/db/indexedDb.ts`, `src/app/bodymap.tsx`, `tests/lib/indexedDb.test.ts` — no
  other file in the phase's broader diff (`enrich.ts`, `prompts.ts`,
  `useConditions.ts`, `model/conditions.ts`, `tests/lib/enrich.test.ts`,
  `__tests__/hooks/useConditionAttribution.test.tsx`) was modified since the first QA
  pass. Matches DevAgent's "scope discipline" claim exactly, verified rather than
  trusted.
- No existing assertion was weakened to obtain the new pass: the pre-existing
  single-condition multi-provider test's within-condition dedup assertion is untouched
  and still passes; the new test adds a second, independent scenario rather than
  replacing or loosening the first.
- Quick re-confirmation of P10-01/03/04/05/06 (no code near them changed in this
  defect-fix diff, per the file list above, so a full re-derivation was not repeated —
  consistent with `prompt.userData.md`'s "quick confirmation is fine if nothing near
  them changed, but actually check the diff to be sure" instruction, which this pass
  did by reading `git diff --stat` and the two touched files in full, not by assumption):
  still intact.

**P10-07 — reconfirmed still an open blocker**, not silently dropped or re-labeled
passed. See Blockers section above.

**Final verdict this session:** defects found in the prior QA pass are both confirmed
fixed, with independent re-derivation and a from-scratch repro, not a re-assertion of
DevAgent's claims. Full regression suite green (55/55 suites, 539/539 tests, including
the two previously-flaky suites clean in this run). No new defects found. The phase's
code/data-layer/UI-wiring scope is QA-approved. **The only thing preventing `kb4-DONE`
is the pre-existing, already-recorded P10-07 browser/OpenRouter acceptance blocker**,
which no session (DevAgent's or either QA pass) has had an environment to clear — this
is unchanged status, not a new finding, and per workflow rules cannot be waived by QA.

## P10-07 browser acceptance (2026-08-17) — real defect found

ArchAgent ran a live browser acceptance pass this session: started the web dev server,
synthesized a small multi-condition test PDF, drove an upload through the running app
(user-approved use of the existing free-tier OpenRouter connection), and separately
inspected a large real document the user uploaded directly in the same session. The
extraction/merge run took roughly 35-40 minutes end to end on the free-tier model chain
(expected — `CHUNK_POOL_SIZE = 1` plus `waitForCooldown: true` means chunk extraction,
dedupe, and the anatomy/enrichment batch call all serialize behind free-tier cooldowns;
several models in the fallback chain timed out or hit 429 before one succeeded). No
errors, no infinite loop — confirmed via `pipelineDebug` trace events captured directly
from the running page (`llm-attempt`/`llm-failure`/`llm-success`), not by inference from
the progress bar alone.

**Real defect (not covered by P10-01 through P10-06's scope): conditions can render
under the wrong organ system, indistinguishable from a correctly-classified one.**

Root cause, confirmed directly against IndexedDB data from the user's real upload
(record with 85 conditions, verified no duplicate condition names within it — merge/dedupe
is working correctly on real data):

- When the anatomy-enrichment LLM call (`enrichConditionAnatomyBatch`, `src/lib/llm/enrich.ts`)
  fails or returns nothing usable for a condition, `buildConditionFromSummary`
  (`src/lib/llm/enrich.ts:488`) sets `system: 'other'` — confirmed by direct query,
  e.g. a "Type 2 diabetes" and a "depression" condition both stored with
  `system: "other"` in this session's real data before it was cleared.
- `isValidIndexedAnatomyLine` (`src/lib/llm/enrich.ts`, near `parseConditionAnatomyBatch`)
  only checks `typeof value.system === 'string'` — it does not validate that the LLM's
  returned `system` is one of the 11 valid values, so a malformed/hallucinated string
  from a weak free-tier model would also pass through uncaught.
- At render time, `normalizeSystemId()` (`src/model/conditions.ts:123-127`) maps any
  unrecognized system string — including the app's own `'other'` fallback — through a
  final `?? 'integumentary'` default. The result: conditions whose anatomy enrichment
  failed are silently painted as real Integumentary-system conditions, with no visual
  or data distinction from an actual skin diagnosis. This is how the user found it —
  clicking a dot under Integumentary that was actually Type 2 Diabetes.

**Product decision from the user (2026-08-17), locked for the fix:** every condition
must be assigned exactly one of the 11 real `OrgSystem` values. The LLM must make its
best clinical judgment even for indirect cases (e.g. depression → nervous system, as a
disorder of mental/neurological origin) rather than being allowed to abstain. There is
no 12th "unclassified" system and no `'other'`/null system value, ever, in the
persisted/rendered data. This forecloses the "option 3" (add a 12th system) and
"skip rendering a dot" (option 1, since that still allows a systemless/nulled state)
alternatives ArchAgent raised — only the "guarantee a real, valid system every time"
direction is in scope.

## Defects and Retests (new)

**Defect 3 (Critical — clinical-safety-relevant misclassification, not covered by
P10-01 through P10-06).**
- **Files:** `src/lib/llm/prompts.ts` (`CONDITION_ENRICHMENT_PROMPT`), `src/lib/llm/enrich.ts`
  (`isValidIndexedAnatomyLine`/`parseConditionAnatomyBatch`, `enrichConditionAnatomyBatch`,
  `buildConditionFromSummary`), `src/model/conditions.ts` (`normalizeSystemId`).
- **Expected:** every persisted condition has `system` set to one of the 11 valid
  `OrgSystem` values, chosen by the LLM's best clinical judgment; never `'other'`, never
  null, never an unvalidated/unrecognized string silently reinterpreted as a real system.
- **Actual:** `system: 'other'` is a live, reachable fallback whenever the anatomy call
  fails for a condition (common under free-tier rate-limit pressure on a real
  multi-condition document), and `normalizeSystemId` silently converts that (and any
  other unrecognized string) into `'integumentary'` at render time.
- **Fix direction (locked by the user's product decision above — implement all three):**
  1. Strengthen `CONDITION_ENRICHMENT_PROMPT` to explicitly require exactly one of the
     11 systems for every condition, with instruction to use best clinical judgment for
     indirect/non-obvious cases, and never omit or invent a 12th value.
  2. Validate the LLM's returned `system` against the real 11-value `OrgSystem`/`SystemId`
     enum (not just `typeof === 'string'`) in `isValidIndexedAnatomyLine`; treat an
     out-of-enum value as unusable for that field, same as missing.
  3. Remove the `system: 'other'` fallback in `buildConditionFromSummary`. When the
     batched anatomy call fails or returns an invalid system for one or more
     conditions, retry individually for just those conditions (bounded retry count,
     mirroring the model-fallback-chain pattern already used elsewhere) before falling
     back to a last-resort deterministic local classifier that still guarantees one of
     the 11 real systems (never `'other'`/null) — the same "guarantee non-null via a
     documented fallback path" shape P10-01 already established for dates/attribution,
     applied here to system.
- **Priority:** P0 — blocks `kb4-DONE`, same as Defect 1 was.
- **Status: RETESTED — CONFIRMED FIXED (2026-08-18, independent QA session).** See the
  "2026-08-18 — QAAgent retest" entry under QA Record below for the full independent
  verification (diff reading, own repro, own test run). All three fix parts confirmed
  present and correct; no code path found that can still produce `'other'`, null, or an
  out-of-enum value for `system`.

## Blockers (updated 2026-08-17)

- P10-07's browser desktop/mobile acceptance is now partially complete: a live run was
  observed end to end (extraction → merge → enrichment → persistence → bodymap render)
  and did surface a real defect (Defect 3), so the blocker is no longer "no environment
  ever available" — it converts to "Defect 3 must be fixed and then browser-acceptance
  re-run to confirm dot placement/system assignment is correct," not an indefinite
  unknown.
- Coordinate-derivation quality (P10-04) was not independently assessed for accuracy
  this session — the real document's dots were not manually checked against notes-
  described anatomical locations one by one. This remains unverified.

## Completion

NOT COMPLETE. Card moved back to `kb2-CODE` for Defect 3. Do not move to `kb4-DONE`
until Defect 3 is fixed, retested, and a browser-acceptance pass confirms every
condition renders under one of the 11 real systems with no silent `'other'`/misclassified
fallback.

### 2026-08-18 — DevAgent, Defect 3 fix (three-part fix per the locked product decision)

Fixed all three required parts of Defect 3. Files touched: `src/lib/llm/prompts.ts`,
`src/lib/llm/enrich.ts`, `tests/lib/enrich.test.ts`. No other file in this phase's diff
was changed (confirmed via `git diff --stat` — `src/app/bodymap.tsx`, `src/hooks/useConditions.ts`,
`src/lib/db/indexedDb.ts`, `src/model/conditions.ts`, `tests/lib/indexedDb.test.ts` are
untouched by this fix, their diffs are unchanged from the prior QA-approved state).

**1. Strengthened `CONDITION_ENRICHMENT_PROMPT` (`src/lib/llm/prompts.ts`).** Item (1) of
the prompt now states `"system"` is REQUIRED for every condition, lists the exact 11
values verbatim, instructs the model to use best clinical judgment for indirect/non-obvious
cases (kept the existing depression -> nervous example, added a second one for chronic
fatigue), and explicitly forbids omitting it, leaving it null, or inventing a 12th
"unclassified"/"other" value. The NDJSON output-shape line and its trailing "return null
for organ/anatomical_location/laterality/name_common" sentence were both updated to
carve `system` out as never-null, never-omitted, distinct from the other three fields
that may legitimately be null.

**2. Real 11-value enum validation (`src/lib/llm/enrich.ts`).** Added `VALID_SYSTEMS`
(a runtime `Set` built from `ALL_SYSTEMS`, imported from `@/model/conditions` — reusing
the existing single source of truth rather than duplicating the 11-value list a second
time) and `isValidSystem()`. `isValidIndexedAnatomyLine` now calls `isValidSystem(value.system)`
instead of `typeof value.system === 'string'`, so an out-of-enum value (including the
app's own former `'other'` fallback, or any hallucinated string) fails the same line-level
validation a missing/malformed value already failed — the whole NDJSON line for that
condition is dropped by `parseConditionAnatomyBatch`, not silently accepted. `ConditionAnatomy.system`
is now typed `OrgSystem`, not `string`, so this is enforced at the type level too, not just
at runtime.

**3. Removed the `system: 'other'` fallback in `buildConditionFromSummary`; added bounded
individual retry + a last-resort local classifier (`src/lib/llm/enrich.ts`).** New
`resolveConditionAnatomies(summaries, apiKey, models, routing)` wraps the existing
`enrichConditionAnatomyBatch`: after the batch call, any summary index missing from the
returned map (because the whole call failed, or that specific line failed the new
enum validation) gets up to `ANATOMY_RETRY_ATTEMPTS` (2) individual retries — each retry
re-runs `enrichConditionAnatomyBatch` with a single-condition array, so it goes through
the exact same model-fallback-chain (`callLLMWithFallback`) every other LLM call in this
file already uses, just scoped to one condition instead of the whole batch. If every
retry is exhausted, a new exported `classifyConditionSystemLocally(name, notes)` — a
small ordered list of keyword/substring regex patterns (diabetes/thyroid/hormone ->
endocrine, depression/anxiety/seizure/headache/migraine/stroke/dementia -> nervous,
skin/rash/eczema/psoriasis -> integumentary, heart/hypertension/cardiac -> cardiovascular,
lung/asthma/copd -> respiratory, kidney/renal/urinary -> renal, stomach/liver/gastro ->
digestive, lymph/spleen -> lymphatic, muscle/fibromyalgia -> muscular, bone/joint/fracture/spine
-> skeletal, prostate/ovary/reproductive -> reproductive) tested against `"{name} {notes}"`,
falling back to `'skeletal'` when nothing matches — guarantees a real, valid system for that
index. `enrichFromText` now calls `resolveConditionAnatomies` instead of
`enrichConditionAnatomyBatch` directly, so every index reaching `buildConditionFromSummary`
already has a guaranteed-valid anatomy entry; `buildConditionFromSummary`'s own
`anatomy?.system ?? classifyConditionSystemLocally(...)` (replacing the removed
`?? 'other'`) is now defense-in-depth only, not the primary path, mirroring how
`anatomy?.name_common ?? null` already reads. `normalizeSystemId()`'s `?? 'integumentary'`
backstop in `src/model/conditions.ts` was intentionally left unchanged (per the card's
constraints) — it remains reachable only for genuinely corrupt/legacy data, not the normal
enrichment path.

**Product/design judgment call for ArchAgent/QA to review:** the local classifier's
keyword-to-system mapping and its `'skeletal'` no-match default are a pragmatic,
non-exhaustive safety net for total LLM unavailability (both the batch call and every
individual retry failing), not a claim of clinical accuracy — flagged explicitly in the
code comment above `LOCAL_SYSTEM_KEYWORDS`. `'skeletal'` was chosen over an arbitrary
first-list-entry default because musculoskeletal complaints are the broadest, most common
catch-all category in real medical records; this is a judgment call, not something the
card specified numerically.

**Tests added/updated (`tests/lib/enrich.test.ts`):**
- Updated the two existing tests that asserted/used `system: 'other'`
  (now: "falls back to the local classifier (never 'other'/null) when the anatomy call
  fails outright, even after retry" — asserts membership in `ALL_SYSTEMS` and
  `not.toBe('other')`; and the cx/cy-null-fallback test now uses a valid `system: 'nervous'`
  in its mock instead of `'other'`, since that test is about cx/cy, not system validation).
- New `parseConditionAnatomyBatch` describe block: rejects an out-of-enum `system` value
  the same way a missing one is rejected (line dropped, not passed through), and accepts
  every one of the 11 real systems (parameterized over `ALL_SYSTEMS`).
- New `classifyConditionSystemLocally` describe block: asserts membership in `ALL_SYSTEMS`
  across a range of recognized condition names (diabetes, depression, eczema, hypertension,
  asthma, CKD, IBS, lymphadenopathy, rotator cuff tear, osteoarthritis, BPH) plus
  deliberately unrecognized ones (`'Xyzzy syndrome'`, empty string); a second test pins the
  no-match default to `'skeletal'`.
- New "enrichFromText anatomy retry/fallback (P10-08)" describe block: one test where the
  batch call omits a condition but the individual retry succeeds (asserts the retried
  system is used); one test where a two-condition batch has one condition succeed in the
  batch and the other exhaust both individual retries (asserts every condition's system is
  in `ALL_SYSTEMS` and never `'other'`, and asserts the exact call count — 1 batch call +
  2 bounded retries = 3 — to pin the "bounded," not unbounded, retry behavior).

**Validation run (2026-08-18, this session):**
- `npm run typecheck` — PASS, clean, no output.
- `npx expo lint` — PASS, exit 0, no errors/warnings.
- `npx jest --runInBand --coverage=false tests/lib/enrich.test.ts` — PASS, 26 tests (18 prior + 8 new/updated for this defect).
- `npm test` (full suite, with coverage) — PASS, **55 passed / 55 total suites, 545 passed / 545 total tests, 0 failed.**
- Re-ran `npx jest --runInBand --coverage=false tests/lib/llm/connectionBundle.test.ts tests/components/ProviderSettings.test.tsx`
  in isolation afterward (independent double-check, not required by the checklist): this
  time `connectionBundle.test.ts` passed but `ProviderSettings.test.tsx` failed with the
  same two symptoms already on record from two prior QA sessions (a `waitFor`/render-order
  timeout and a `render` function not having been called) — neither file was touched by
  this fix, both failure modes are byte-for-byte the same as the ones DevAgent's and QA's
  prior sessions independently attributed to pre-existing cross-suite timing flakiness, not
  a regression. Flagging for QA to independently confirm again, consistent with how this was
  handled in every prior session on this card.

**Scope discipline:** touched only `src/lib/llm/prompts.ts`, `src/lib/llm/enrich.ts`, and
`tests/lib/enrich.test.ts` — did not touch `src/model/conditions.ts` (`normalizeSystemId`'s
backstop, `ALL_SYSTEMS`, `SYSTEM_META`, `SYSTEM_ALIASES` are all unchanged, still exactly 11
values), demo data (`CONDITIONS`/`designConditionToConditionInput`), or any file from the
P10-01 through P10-06/Defect-1/Defect-2 scope.

**Not verified in this session (unchanged from the existing P10-07 blocker):** real-world
prompt-following quality (whether the model actually assigns clinically sensible systems for
indirect cases in practice) and a live browser re-run confirming no condition renders under
Integumentary/any wrong system anymore — both still require the same live browser/OpenRouter
environment this card's P10-07 blocker has flagged since the first QA pass. The mechanical
guarantee (system is always one of the 11 real values, by construction, regardless of what
the LLM returns) is proven by the tests above; the LLM's clinical judgment quality on real
documents is not something a unit test can prove.

## QA Record

### 2026-08-18 — QAAgent retest (independent of the DevAgent that made the Defect 3 fix,
and independent of the ArchAgent session that discovered it), scope: Defect 3 only, plus
regression confirmation

Read the actual working-tree diff and source files directly — did not rely on the
Implementation Record's prose summary for any pass/fail determination.

**Validation commands run (fresh, this session):**
- `npm run typecheck` — PASS, clean, no output.
- `npx expo lint` — PASS, exit code 0, no errors/warnings.
- `npx jest --runInBand --coverage=false tests/lib/enrich.test.ts` — PASS, 26 tests
  (matches DevAgent's reported count exactly; read every P10-08 test body directly, not
  just the pass/fail summary — see below).
- `npm test` (full suite, with coverage) — PASS, **55 passed / 55 total suites, 545
  passed / 545 total tests, 0 failed.** Matches DevAgent's reported numbers exactly,
  independently reproduced, not re-asserted from memory.
- `npx jest --runInBand --coverage=false tests/lib/llm/connectionBundle.test.ts
  tests/components/ProviderSettings.test.tsx` (isolated re-run of the two suites with a
  history of cross-suite flakiness on this card) — `connectionBundle.test.ts` passed;
  `ProviderSettings.test.tsx` failed with the same two symptoms on record from every
  prior session on this card (`waitFor`/render-order timeout,
  `render` function has not been called). Neither file appears in `git diff --stat` for
  this phase (confirmed below) and both already passed cleanly in the full-suite run
  above — fourth independent session (two prior QA passes, DevAgent, and this one) to
  reproduce the same isolation-only flakiness pattern with zero suite-level impact. Not
  swept under the rug; not this fix's doing.

**Part 1 — prompt strengthened (`src/lib/llm/prompts.ts`) — VERIFIED by reading the
actual string, not the summary.** `CONDITION_ENRICHMENT_PROMPT` states `"system"` is
"REQUIRED for every condition, no exceptions," lists the exact 11 values verbatim twice
(once in the instruction, once in the output-shape line), instructs best clinical
judgment for indirect cases with two worked examples (depression -> nervous, chronic
fatigue -> underlying-cause system), and explicitly states "there is no 12th
'unclassified'/'other' option." The "return null when not inferable" sentence for
organ/anatomical_location/laterality/name_common is now explicitly carved out from
`system`, which the prompt states is "never null and never outside the 11-value list."
Matches the card's fix-direction item 1 exactly.

**Part 2 — real enum validation (`src/lib/llm/enrich.ts`) — VERIFIED, and confirmed it
actually rejects rather than passing through.** `VALID_SYSTEMS` is a `Set` built from
`ALL_SYSTEMS` (imported from `@/model/conditions`, the single source of truth — not a
second hardcoded list that could drift). `isValidSystem()` checks
`typeof value === 'string' && VALID_SYSTEMS.has(value)`. `isValidIndexedAnatomyLine` now
calls `isValidSystem(value.system)` in place of the old `typeof value.system === 'string'`
check. Independently confirmed this actually rejects (not just narrows the type) by
reading `parseConditionAnatomyBatch`'s test
(`tests/lib/enrich.test.ts:400-411`, "rejects an out-of-enum system value, same as a
missing one"): NDJSON lines with `system: 'other'` and `system: 'not-a-real-system'` are
dropped (`result?.has(0)` / `.has(1)` both `false`) while a valid-system line on the same
input (`index: 2, system: 'cardiovascular'`) survives — a same-input, mixed-validity test,
not a single-case check that could pass by accident. `ConditionAnatomy.system` is typed
`OrgSystem`, not `string` (confirmed by reading the type definition at line 483) — a
second, compile-time backstop.

**Part 3 — `'other'` fallback removed, bounded retry + local classifier last resort — VERIFIED, and confirmed the retry path really calls the LLM again.**
Grepped the entire `src/` tree for `system: 'other'` — zero matches. The only remaining
`'other'` string literals in `enrich.ts` are `event_type: 'other'` (a different field, the
care-event type enum, unrelated to this defect — confirmed by reading each match site).
Traced the real call chain: `enrichFromText` (line ~1145) calls `resolveConditionAnatomies`,
not `enrichConditionAnatomyBatch` directly (the pre-fix call site). `resolveConditionAnatomies`
calls the batch function once, then for each unplaced index calls
`enrichConditionAnatomyBatch([summary], ...)` again — up to `ANATOMY_RETRY_ATTEMPTS = 2`
times — confirmed this is a genuine second network-call attempt (not a short-circuit) by
reading that it re-invokes the same `callLLMWithFallback`-backed function with a
single-condition array, and by the test at `tests/lib/enrich.test.ts:481-520` which asserts
the mock's anatomy-labeled call count is exactly `3` (1 batch + 2 retries) for a condition
that never resolves — a call-count assertion is not satisfiable by a short-circuited retry
loop, so this is real evidence the retry actually re-calls, not an assumption from the
function name. When both retries exhaust, `classifyConditionSystemLocally` (a keyword/regex
classifier over 11 pattern groups, defaulting to `'skeletal'` on no match) is used —
confirmed it always returns a member of `ALL_SYSTEMS` for both matched and deliberately
unmatched inputs (`tests/lib/enrich.test.ts:425-451`, including an empty-string name).
`buildConditionFromSummary`'s own `anatomy?.system ?? classifyConditionSystemLocally(...)`
is now defense-in-depth only (every real call path already guarantees a non-null `anatomy`
with a valid `system` via `resolveConditionAnatomies`) — confirmed by reading that
`resolveConditionAnatomies` always calls `anatomyByIndex.set(index, resolved ?? {...
classifyConditionSystemLocally(...) })` for every originally-missing index before returning,
so the map is complete for every summary index by construction.

**Independent repro (written from scratch this session, not copied from either DevAgent's
or ArchAgent's tests, deleted after running — `tests/lib/__qa_defect3_repro.test.ts`, not
left in the tree):** mocked `callLLMWithFallback` so `structure-analysis` and
`enrichment-anatomy` both fail outright (simulating the exact real-world scenario ArchAgent's
live upload hit — free-tier rate-limit exhaustion) for a single condition with no notes.
Asserted: `result.conditions[0].system` is a member of `ALL_SYSTEMS`, is not `'other'`, is
not null, is not `''`; and the mock was called exactly 3 times with `label:
'enrichment-anatomy'` (1 batch + 2 bounded retries — proving the bound is respected, not
unbounded). **Result: PASS** — `system` resolved to `'skeletal'` via the local classifier
(the name had no keyword match), exactly the documented last-resort path, never `'other'`.

**Scope/regression check.** `git diff --stat` for the working tree: `prompts.ts` (+10/-…),
`enrich.ts` (+293 across the full P10 diff, this defect's slice confirmed via the code read
above), `tests/lib/enrich.test.ts` (+315). `src/app/bodymap.tsx`, `src/hooks/useConditions.ts`,
`src/lib/db/indexedDb.ts`, `tests/lib/indexedDb.test.ts` are unchanged since the prior
QA-approved Defect 1/2 retest pass. `src/model/conditions.ts`'s 5-line diff is the
pre-existing P10-05 `record_id` field addition (read directly — a comment and one optional
field, nothing system/anatomy-related), not new churn from this fix. No existing assertion
was weakened — the two pre-existing tests that used to assert `system === 'other'` were
updated to assert the opposite (`not.toBe('other')` plus `ALL_SYSTEMS` membership), which is
a strengthening, not a loosening, of what's being checked.

**Minor, non-blocking observation (not part of Defect 3's fix-direction, not filed as a new
defect):** `ConditionInput.system` (the type consumed by persistence) is still typed as a
loose `string`, not `OrgSystem` — only `ConditionAnatomy.system` (the anatomy-call output
type) was narrowed. In practice this doesn't reopen the defect: every real construction site
of a `ConditionInput` for a non-demo condition goes through `buildConditionFromSummary`,
which now only ever receives a guaranteed-valid `anatomy.system` or the local classifier's
guaranteed-valid output — there is no live code path where an invalid string reaches
`ConditionInput.system` today. Flagging only as a defense-in-depth type-tightening
opportunity for whoever next touches this file, not something that blocks this defect's
resolution.

**Verdict: Defect 3 is fixed.** All three required fix parts (prompt, enum validation,
retry+local-classifier fallback replacing `'other'`) are present, correctly wired, and
independently verified by reading the code and by an independent repro, not by trusting
either agent's summary. No regression to P10-01 through P10-07's previously-approved scope,
Defect 1, or Defect 2. Full suite green (55/55 suites, 545/545 tests).

## Blockers (updated 2026-08-18)

- **P10-07 browser desktop/mobile acceptance: still BLOCKED, not passed — this QA session
  had no live browser/OpenRouter environment either.** Defect 3's fix is mechanically
  verified (see above) but has **not** been confirmed in a real browser run — no fresh
  live upload was performed this session to confirm no condition renders under the wrong
  system anymore in practice. This is the same class of blocker recorded since the first
  QA pass on this card, now narrower in scope: what remains unverified is (1) a live
  re-run of the exact scenario ArchAgent's 2026-08-17 session hit (a real multi-condition
  document under free-tier rate-limit pressure) confirming no condition ends up under an
  incorrect system post-fix, and (2) the condition detail sheet's attribution block and
  overall dot placement rendering correctly at desktop and narrow mobile widths.
- **Coordinate-derivation prompt quality (P10-04) remains unverified point-by-point.**
  Carried forward unchanged from every prior session: no one has manually checked the
  model's real cx/cy proposals against notes-described anatomical locations one by one.
  The mechanical contract (cx/cy pass-through, null-fallback, alpha-mask repair
  interaction) is proven by Jest; clinical/positional accuracy of real model output is
  not, and cannot be, proven by a unit test.

## Completion

**Defect 3: CONFIRMED FIXED, independently.** Defects 1, 2, and 3 are all now
independently retested and confirmed fixed across separate QA sessions. P10-01 through
P10-06's original scope remains QA-approved (unchanged since the prior retest pass, no
code near it touched by this fix). Full validation green: `npm run typecheck` PASS,
`npx expo lint` PASS (exit 0), `npm test` PASS (55/55 suites, 545/545 tests).

## P10-07 live browser acceptance (2026-08-18) — real run, Defect 3 confirmed fixed live

ArchAgent ran a full live end-to-end pass this session: restarted the web dev server
(after killing stale processes from the prior session), the user reconnected the
OpenRouter session directly in Settings (the prior session's `401 User not found`
failures were a stale/invalid locally-cached key, not a code defect — confirmed by the
fact that a fresh Connect resolved it), and the user then dropped a real multi-condition
health PDF through the running app. The run took roughly 35 minutes end to end on the
free-tier model chain (consistent with every prior session's timing estimate — long
individual model timeouts, e.g. one 15-minute timeout on `google/gemma-4-26b-a4b-it:free`
during the extraction step, with the fallback chain moving on to the next candidate
each time, not stalling).

Verified directly against the resulting IndexedDB record (`record_id
40bf81c8-f8f6-4f96-abbe-e09e469bb34a`, 45 conditions), queried live from the running
page, not inferred from the UI:

- **Defect 3 — CONFIRMED FIXED on real data.** 0 of 45 conditions have `system: 'other'`
  or any value outside the 11 real `OrgSystem` values. Distribution:
  integumentary 9, digestive 13, nervous 6, cardiovascular 5, skeletal 3, endocrine 2,
  lymphatic 2, respiratory 2, muscular 1, reproductive 1, renal 1 — spread across real
  systems, not piled into one bucket. The user's own originally-reported repro case is
  now correct on live data: "Major depressive disorder" resolved to
  `system: "nervous"` (matching the locked product decision's own worked example),
  not integumentary/other as before the fix.
- **P10-01 (non-null guarantees) — confirmed on real data.** 45/45 conditions have a
  non-null `date` and a non-null `note`.
- **P10-03 (name_common) — confirmed working, with an expected/acceptable gap.** 41/45
  conditions have a populated `name_common` (e.g. "Coronary arteriosclerosis" →
  "clogged coronary arteries", "external otitis" → "Swimmer's ear"); the remaining 4
  (including the depression condition) are null, which is the prompt's explicitly
  allowed "cannot be inferred confidently" case (`CONDITION_ENRICHMENT_PROMPT`: "Return
  null for ... name_common when they cannot be inferred reliably"), not a defect —
  distinct from the old hard-failure `'other'` system bug, since a null common name
  never causes a mis-render the way a wrong system did.
- **P10-04 (coordinate derivation) — mechanically confirmed working on real data,
  point-by-point clinical accuracy still not exhaustively checked.** 45/45 conditions
  have non-null `cx`/`cy`. Spot-checked several: "external otitis" (an ear condition)
  at (75, 40); "rotator cuff tendonitis" (shoulder) at (65, 35); esophageal conditions
  clustering near (50, 30). These are plausible, differentiated positions, not a single
  per-system anchor point with jitter — a meaningfully different result than the
  pre-P10 hash-jitter default. A full manual audit of every condition's placement
  against its notes was not performed (45 conditions is impractical to hand-verify
  exhaustively in one session) — this spot-check is evidence of working behavior, not
  proof of universal accuracy; treat as substantially de-risked, not fully closed.

**Environment note for future sessions:** the `401 User not found` failure seen in an
earlier attempt this same day was resolved by the user reconnecting via Settings' OAuth
Connect flow — not a code change. If this recurs, check the OpenRouter connection state
in Settings before assuming a pipeline defect.

## Completion

**Defects 1, 2, and 3 are all independently confirmed fixed** across separate QA
sessions, now including live-data confirmation for Defect 3 specifically (not just
unit tests). P10-01 through P10-06's original scope remains QA-approved. Full
validation green: `npm run typecheck` PASS, `npx expo lint` PASS (exit 0), `npm test`
PASS (55/55 suites, 545/545 tests). A live end-to-end browser/OpenRouter run has now
been completed and its IndexedDB output directly inspected, closing the primary
P10-07 blocker (an untested browser/viewport combination) that kept this card out of
`kb4-DONE` in every prior session.

**Remaining open item, not blocking:** exhaustive point-by-point coordinate accuracy
across every condition in a real record was not fully hand-verified (spot-checked only,
per above) — this is a lower-severity, product-quality follow-up rather than a
correctness defect, since it's already constrained by the unchanged alpha-mask repair
step and no longer risks a condition rendering under a clinically wrong organ system.
Desktop-vs-narrow-mobile visual/responsive verification of the condition detail sheet's
new attribution block (P10-05) was also not separately exercised this session.

**Card was about to move to `kb4-DONE` — reverted.** Before that DONE state was
committed, manual spot-checking of the same live run's data surfaced a fourth, distinct
P0 defect (below). The card remains in `kb2-CODE` until it is fixed and retested.

## Defect 4 (Critical — found 2026-08-18, same live run as the P10-07 acceptance pass, before DONE was committed)

**User-reported symptom:** random spot-checking of the live run's rendered body map
showed apparent duplicate conditions — e.g. "common wart" and "hand fissure" each
seemed to appear twice.

**Root cause, confirmed directly against the live run's IndexedDB data (record
`40bf81c8-f8f6-4f96-abbe-e09e469bb34a`), not by inference:**

Any condition whose anatomy-enrichment call (`enrichConditionAnatomyBatch`,
`src/lib/llm/enrich.ts`) returns a non-null `laterality` (bilateral/left/right) ends up
rendered as **two disconnected dots for one condition**, not a true duplicate condition
row (there is exactly one `conditions` row per name, confirmed no name-level duplicates
exist in this record — 45 conditions, 45 unique normalized names). The two dots come
from two different `condition_locations` rows for the same `condition_id`:

- The **secondary** (`is_primary: false`) row carries the real `anatomical_location`/
  `laterality` label (e.g. "hands"/"bilateral" for Verruca Vulgaris — medical name for
  common wart) — but its `cx`/`cy` are **not** the anatomy call's actual derived point.
  `buildConditionFromSummary` (enrich.ts) only ever writes
  `{ anatomical_location, laterality, evidence }` onto a `locations[]` entry when
  `anatomy.laterality` is set — it never carries `anatomy.cx`/`anatomy.cy` (the P10-04
  coordinate the LLM proposed) onto that same entry. Downstream, `persistEnrichmentResult`
  (`src/lib/db/indexedDb.ts`)'s secondary-location loop then falls back to
  `defaultConditionPosition`'s hash-jitter whenever `loc.cx` is undefined — which it
  always is for these entries. The label is real; the position is fake (jittered around
  the condition's system anchor point, which can coincidentally look plausible for
  head/face conditions since those anchors already sit near the head, making the bug
  easy to miss on casual inspection but not on a like-for-like check).
- The **primary** (`is_primary: true`) row gets the condition's own top-level `cx`/`cy`
  (`anatomy.cx`/`anatomy.cy`, correctly plumbed per P10-04) — but for several observed
  conditions, this point has clearly been relocated a large geometric distance from
  where it should be by the alpha-mask repair step. Confirmed example: "Congenital left
  eye cataract" — secondary/labeled dot at (52.51, 12.51), sensibly near the head; but
  the primary dot ends up at (18.98, 21.19), nowhere near an eye. The long, non-round
  decimal values on affected primary points (e.g. `18.977384464110127`) are the
  signature of `repairPixelCoordinate`'s pixel-grid division (`x / (mask.width - 1) *
  100`), confirming mask repair is the mechanism, not the LLM's own proposal.

**Two distinct issues, different scope:**

1. **Confirmed P10-04 regression (required fix).** `buildConditionFromSummary` must
   carry the anatomy call's derived `cx`/`cy` onto the `locations[]` entry it creates
   for a lateral/bilateral condition, so the secondary dot's position matches its own
   label instead of being silently re-derived via hash-jitter. This directly contradicts
   P10-04's acceptance criterion ("coordinates derived from consolidated notes first,
   general knowledge second... never a random per-system jitter as the primary source
   of position") — the jitter is exactly what's happening for every multi-location
   condition today.
2. **Related but separately-scoped concern (flag for Dev/QA judgment, not necessarily
   required for this card).** `repairPixelCoordinate` (`src/lib/llm/longitudinal.ts`,
   confirmed unchanged since P09 by an earlier QA pass's zero-line diff) finds the
   *first* opaque pixel encountered while scanning an expanding square ring outward
   from the origin point, not the *geometrically nearest* one — this can produce a
   large, implausible jump when the immediate area around a proposed point is
   transparent. This behavior predates P10, but P10-04 routes real, differentiated
   per-condition points through it far more often than the old system-anchor-based
   defaults did (those were already constructed to sit near their masks' opaque
   regions), making a pre-existing weakness much more visible/impactful now. Whoever
   picks this up should decide explicitly whether fixing the repair search itself is
   in scope for this card or a separate follow-up — do not silently skip it either way.

**Priority:** P0 — blocks `kb4-DONE`. Directly undermines the just-verified P10-04
acceptance criteria and produces a visibly broken/confusing body-map result (the exact
"duplicate condition" symptom a user would notice immediately).

**Fix direction for issue 1:** in `buildConditionFromSummary`, when constructing the
`locations[]` entry from `anatomy.laterality`, also set `cx: anatomy?.cx ?? null, cy:
anatomy?.cy ?? null` on that entry (mirroring the top-level `cx`/`cy` assignment
immediately below it in the same function). Confirm `persistEnrichmentResult`'s
secondary-location loop (`loc.cx ?? locationPosition.cx`) then correctly prefers this
real value over the hash-jitter fallback, exactly as it already does when locations
come from other sources (e.g. demo data). Add a regression test: a condition with a
laterality-bearing anatomy result produces a secondary `condition_locations` row whose
`cx`/`cy` matches the anatomy call's proposed point, not a hash-jittered default.

## Blockers (updated 2026-08-18)

- Defect 4 blocks `kb4-DONE`. Card returned to `kb2-CODE`.
- Issue 2 above (repair-search quality) is an open scope question for the next
  Dev/QA round to resolve explicitly, not a silent carry-forward.

## Completion

NOT COMPLETE. Card returned to `kb2-CODE` for Defect 4. Do not move to `kb4-DONE`
until Defect 4's required fix (issue 1) is implemented and retested, and issue 2's
scope has been explicitly decided (fixed here, or knowingly deferred) rather than
silently ignored.

## Defect 4 fix (DevAgent, 2026-08-18)

**Issue 1 (required fix) — implemented.** `buildConditionFromSummary` (`src/lib/llm/enrich.ts`)
now sets `cx: anatomy?.cx ?? null, cy: anatomy?.cy ?? null` on the `locations[]` entry it
builds when `anatomy.laterality` is set, mirroring the top-level `cx`/`cy` assignment a few
lines below in the same function. Traced `persistEnrichmentResult`'s secondary-location loop
(`src/lib/db/indexedDb.ts`, `cx: loc.cx ?? locationPosition.cx`) and confirmed by reading the
code — not assumed — that it already prefers a real `loc.cx`/`loc.cy` over
`defaultConditionPosition`'s hash-jitter fallback whenever one is present, the same pattern
already used for other location sources (e.g. demo data); no change was needed there.

**Issue 2 (judgment call) — fixed, scoped as a minimal, low-risk addition to this card.**
Read the actual `repairPixelCoordinate` implementation (`src/lib/llm/longitudinal.ts`). Its
docstring already claimed "Finds the closest opaque pixel," but the body scanned each
expanding square in raster (row-major) order and returned the first opaque pixel hit — not
the nearest one within that same ring, which could put the repaired point on a far corner of
the search area when a much closer opaque pixel existed a few cells away. Decision: this is
small and safe — same overall algorithm shape (expanding-radius search from the origin, same
signature, same call sites), the change is contained entirely inside one function, and it
directly affects this defect's other user-visible symptom (the primary dot's implausible
relocation, e.g. the "Congenital left eye cataract" example in the Defect 4 write-up above).
Fixed it: for each radius, the ring's border cells only are scanned (interior cells were
already checked at a smaller radius — this is also a minor efficiency win), and among opaque
matches within that ring the Euclidean-nearest one is returned, instead of whichever the
row-major scan order hit first. Not treated as a full rewrite to a guaranteed globally-nearest
search — Chebyshev-ring-based expanding search can in rare cases (large radius, diagonal
proximity) still miss a slightly-nearer pixel one ring further out; that residual gap is a
known, accepted limitation of the expanding-square technique itself, not something this fix
introduces, and pursuing exact global nearest-neighbor search was judged disproportionate to
the actual body-map dot-placement use case (small canvases, coarse visual tolerance).

**Tests added:**
- `tests/lib/enrich.test.ts`: two new tests under a new "Defect 4" block — a laterality-bearing
  condition's `locations[]` entry carries the anatomy call's own `cx`/`cy` (not null), and
  leaves them `null` (not a random default) when the anatomy call has no usable position.
- `tests/lib/indexedDb.test.ts`: one new test driving `persistEnrichmentResult` end-to-end with
  a laterality condition whose location entry has explicit `cx`/`cy` — asserts the resulting
  secondary `condition_locations` dot uses that value, not the hash-jitter default.
- `tests/lib/llm/longitudinal.test.ts`: one new test for issue 2, directly comparing a reference
  implementation of the pre-fix raster-order-first-found behavior (returns the far corner pixel
  at `(0,0)`) against the actual `repairPixelCoordinate` output (returns the nearer axis-aligned
  pixel at `(2,4)`) on a small synthetic 5x5 mask with two opaque pixels at the same Chebyshev
  ring but different Euclidean distance.

**Validation run (2026-08-18, this session):**
- `npm run typecheck` — PASS, clean, no output.
- `npx expo lint` — PASS, exit code 0, no errors/warnings.
- `npx jest --runInBand --coverage=false tests/lib/enrich.test.ts tests/lib/indexedDb.test.ts` —
  PASS, 43/43 tests (2 test suites).
- `npx jest --runInBand --coverage=false tests/lib/llm/longitudinal.test.ts` — PASS, 9/9 tests.
- `npm test` (full suite, with coverage) — PASS, **55 passed / 55 total suites, 549 passed /
  549 total tests, 0 failed** (545 prior + 4 new tests from this fix). No flakiness observed
  this run in `connectionBundle.test.ts`/`ProviderSettings.test.tsx` — both passed as part of
  the full-suite run; consistent with this being cross-suite timing flakiness, not a hard
  failure, as documented in every prior session on this card.

**Scope discipline:** touched only `src/lib/llm/enrich.ts` (the `locations[]` cx/cy line),
`src/lib/llm/longitudinal.ts` (`repairPixelCoordinate`'s ring-scan order), and the three test
files above. Did not touch `persistEnrichmentResult`/`indexedDb.ts` (verified by reading, not
assumed, that no change was needed there), demo data (`src/model/conditions.ts`'s `CONDITIONS`/
`designConditionToConditionInput`), or any file from P10-01 through P10-08/Defect 1-3's scope.
Confirmed via `git diff --stat` against the last commit: only `src/lib/llm/enrich.ts`,
`src/lib/llm/longitudinal.ts`, and the three test files carry this session's code changes
(plus pre-existing, not-mine, working-tree edits to `doc.userDataFlow/userDataTask.md` and the
kb1→kb2 card relocation already present before this session started).

**Not verified in this session:** a live browser/OpenRouter re-run confirming the fix on real
data (no such environment was available this session) — same class of gap flagged for every
prior round on this card. The mechanical guarantee (secondary location cx/cy now carries the
anatomy call's real point; primary-point repair now picks a geometrically-nearer pixel within
a ring) is proven by the tests above; whether this fully eliminates visually-implausible dot
placement on a real multi-condition document is something only a live re-run can confirm.

## Completion

NOT YET DONE. Defect 4 issue 1 (required fix) is implemented and unit-tested; issue 2's scope
question is resolved (fixed, not deferred) with reasoning documented above. Full validation
green: `npm run typecheck` PASS, `npx expo lint` PASS (exit 0), `npm test` PASS (55/55 suites,
549/549 tests). This card remains in `kb2-CODE` per the assigned task's instruction — QA
retest and the ArchAgent/QA decision to move it to `kb4-DONE` are out of scope for this
DevAgent session.

## QA Record (Defect 4 retest, independent QAAgent, 2026-08-18)

**Note on prior report reliability:** the DevAgent's own "Defect 4 fix" write-up above was
flagged as garbled/truncated by a tool-output compression issue. This retest did not trust
that prose — every claim below was independently verified by reading the actual diff and
running independently-authored tests, not by re-reading the summary.

**Issue 1 (`buildConditionFromSummary`, `src/lib/llm/enrich.ts`) — VERIFIED FIXED.** Read the
actual diff (`git diff -- src/lib/llm/enrich.ts`). The `locations[]` entry built for a
laterality-bearing condition now reads `cx: anatomy?.cx ?? null, cy: anatomy?.cy ?? null` —
byte-identical expression to the top-level condition's `cx`/`cy` assignment a few lines below
in the same function, confirming both are sourced from the same `anatomy` object, not two
independently-derived values that happen to agree today. Traced `persistEnrichmentResult`'s
secondary-location loop in `src/lib/db/indexedDb.ts` (`cx: loc.cx ?? locationPosition.cx`,
unchanged by this fix) and confirmed it already prefers a real `loc.cx` over
`defaultConditionPosition`'s hash-jitter fallback whenever one is present — the fix in
enrich.ts is sufficient on its own; no indexedDb.ts code change was needed, and none was made.

Independently reproduced the original bug with a fresh test (not copied from DevAgent's),
using the "hand fissure" condition named in the live-run bug report (DevAgent's test used
"common wart"/Verruca vulgaris — different condition, different cx/cy values: 33.7/71.2 vs.
theirs), driven through the full `enrichFromText` entry point with `callLLMWithFallback`
mocked directly:
- Asserted the secondary `locations[0]` entry carries `cx: 33.7, cy: 71.2` — matching the
  mocked anatomy call's point, not a hash-jittered value.
- Asserted a companion case: when the anatomy call has no usable point (`cx`/`cy` null), the
  location entry stays `null`/`null` rather than silently re-jittering.
- Confirmed the test is load-bearing, not trivially true: ran it against the pre-fix code via
  `git stash` on just `enrich.ts`/`longitudinal.ts` — it failed as expected (pre-fix,
  `locations[0]` has no `cx`/`cy` key at all: expected `cx: 33.7` vs. actual object missing
  that field entirely). Restored the fix (`git stash pop`) and reran — passes.

**Issue 2 (`repairPixelCoordinate`, `src/lib/llm/longitudinal.ts`) — VERIFIED FIXED, with the
documented residual gap confirmed accurate.** Read the actual ring-scan rewrite. Per ring
(Chebyshev radius), it now scans every border cell (full row when on the ring's top/bottom
edge, else just the left/right border columns — correctly skips already-checked interior
cells from smaller radii) and keeps the Euclidean-nearest opaque one (`distSq` comparison)
instead of returning the first raster-order hit. Verified with 3 independent synthetic-mask
tests (not copied from DevAgent's 5x5/2-pixel case — used a 7x7 mask with a diagonal-corner
vs. cardinal-direction pixel pair, plus a dedicated off-axis/non-corner ring-cell case and a
dedicated all-transparent-mask termination case):
- (a) every pixel in a ring is considered, including off-axis/non-corner border cells (3rd
  test: only opaque pixel at (1,4) on a ring's bottom row, correctly found) — not skipped.
- (b) termination/null contract for an all-transparent mask is preserved (2nd test).
- (c) real behavioral improvement, not a no-op: 1st test's raster-order-first pixel (0,0,
  Euclidean ≈4.24) differs from the Euclidean-nearest pixel (3,0, Euclidean 3) within the same
  ring; `repairPixelCoordinate` returns the nearer one. Reran the same test against the
  pre-fix code (`git stash`) — failed (returned the farther corner), confirming the test is
  genuinely discriminating, not coincidentally passing either way.
- The write-up's disclosed residual limitation (a ring-based expanding search can, in rare
  cases, return a same-ring diagonal pixel when a slightly-nearer pixel exists one ring
  farther out — e.g. ring-R corner at distance R·√2 vs. ring-(R+1) cardinal pixel at distance
  R+1, which becomes closer once R is roughly above 2.4) is mathematically real and was
  correctly disclosed as an accepted, scoped-out limitation of the expanding-ring technique
  itself, not something this fix introduces or hides. Reasonable scope call for
  coarse-tolerance body-map dot placement; not a defect.

**Regression check.** `git diff --stat HEAD` shows exactly: the card file, `userDataTask.md`
(status-narrative prose only — pre-existing per DevAgent's note, confirmed by reading the
diff: adds "Status: IN PROGRESS" and the Defect 3/4 narrative, changes the kanban-path
pointer; no code), `src/lib/llm/enrich.ts`, `src/lib/llm/longitudinal.ts`, and the three test
files (`tests/lib/enrich.test.ts`, `tests/lib/indexedDb.test.ts`,
`tests/lib/llm/longitudinal.test.ts`). Nothing from P10-01 through P10-08 or Defects 1-3's
scope was touched. One pre-existing minor doc staleness (not a new issue, not blocking):
`userDataTask.md`'s "Detailed kanban card" link still points at `kb2-CODE/...` even though
the file has since moved through `kb3-TEST` — worth a one-line fix whenever this card next
moves, no functional impact.

**`mergeConditionLocations` sanity check (lower-priority ask).** Read `mergeConditionLocations`
(`src/lib/llm/enrich.ts`). It keys merges by `anatomical_location` + `laterality` label first,
falling back to a `cx`/`cy` coordinate key only when both label fields are empty. Since
laterality-bearing locations always have a non-empty label, they were already keyed by label
before this fix and still are — the newly-populated `cx`/`cy` values only feed the existing
`firstNonNull(previous.cx, location.cx)` merge-value logic (previously always resolving to
`null`, now resolving to a real value when present), the same `firstNonNull` pattern used for
every other scalar field in this merge path. No behavior was silently changed here — this is
exactly what the existing code was already written to do once the field was populated.

**Validation run (2026-08-18, this session, independent):**
- `npx tsc --noEmit` — PASS, clean, no output (after removing my own scratch test files, which
  had a couple of unrelated "possibly undefined" TS errors only in my own throwaway
  assertions — not in any file that will be committed).
- `npx expo lint` — PASS, no errors/warnings.
- `npm test` (full suite) — PASS, **55/55 suites, 549/549 tests, 0 failed** — matches
  ArchAgent's independently reported numbers. No `ProviderSettings.test.tsx` flake surfaced
  this run (it has intermittently in prior sessions per this card's history; not investigated
  further here since it did not reproduce and is unrelated to this diff).

**Still-open, explicitly-acknowledged item — confirmed still accurately recorded, not
re-litigated.** The "Remaining open item, not blocking" note (point-by-point coordinate
accuracy across all 45 conditions in the live record was spot-checked, not exhaustively
hand-verified) is still accurate and unaffected by this fix — it concerns the quality of the
anatomy LLM's proposed points, which this fix does not touch; this fix only concerns whether a
laterality-bearing condition's secondary dot correctly reuses whatever point the anatomy call
already proposed, and whether the alpha-mask repair picks the nearest valid pixel when a
proposed point needs correcting.

**Verdict: Defect 4 is genuinely fixed — both issue 1 and issue 2.** Confirmed by independent
code reading (not agent prose) and independently-authored, pre/post-fix-differentiated tests.
No new regressions found; diff scope is exactly as claimed. Full validation green.

**Before this card moves to `kb4-DONE`, still needed (not new — carried forward, explicitly
tracked on this card already):**
1. A live browser/OpenRouter re-run against the same or a similar multi-laterality-condition
   record, to close the "not verified in session" gap the DevAgent itself flagged (the
   mechanical fix is proven by unit tests; real-world visual confirmation that the
   "duplicate dot" symptom is gone has not been done since the fix landed).
2. The pre-existing, explicitly-acknowledged, non-blocking item: exhaustive point-by-point
   coordinate accuracy across all conditions in a real record (spot-checked only so far).
3. Optional cleanup, not a blocker: fix the stale `kb2-CODE` path reference in
   `userDataTask.md`'s Phase 10 section next time this file is touched.

This card remains in `kb3-TEST` pending ArchAgent's decision on item 1 above (live browser
verification) — QA does not have a live OpenRouter/browser environment available this
session to close that gap itself.

---

## QA Record (Defect 4 independent re-verification, separate QAAgent session, 2026-08-18)

**Note on prior QA entry above:** the immediately preceding "QA Record (Defect 4 retest...
2026-08-18)" entry was flagged by the orchestrating agent as produced during a session that
hit an unrelated harness tool error, so it was not trusted as evidence on its own. This entry
is a fully independent, from-scratch re-verification — every claim below comes from reading
the current working-tree diff and running freshly authored tests in this session, not from
re-reading that prior entry's prose. Its conclusions happen to agree with what's recorded
below, but nothing here was carried over without re-derivation.

**Issue 1 fix (`src/lib/llm/enrich.ts`, `buildConditionFromSummary`) — CONFIRMED FIXED.**
Read `git diff HEAD -- src/lib/llm/enrich.ts` directly. The `locations[]` entry built when
`anatomy?.laterality` is set now reads:
```
locations: anatomy?.laterality
  ? [{ anatomical_location: anatomy.anatomical_location, laterality: anatomy.laterality, evidence: null, cx: anatomy?.cx ?? null, cy: anatomy?.cy ?? null }]
  : [],
```
`cx: anatomy?.cx ?? null` / `cy: anatomy?.cy ?? null` are sourced from the exact same
`anatomy` object as the top-level condition's `cx`/`cy` fields a few lines below (also
`anatomy?.cx ?? null` / `anatomy?.cy ?? null`) — same object, same optional-chain expression,
not two independently-maintained values that could drift apart. Traced
`persistEnrichmentResult`'s secondary-location loop in `src/lib/db/indexedDb.ts`
(`cx: loc.cx ?? locationPosition.cx, cy: loc.cy ?? locationPosition.cy`, unchanged by this
defect's fix) and confirmed it already prefers a real `loc.cx`/`loc.cy` over
`defaultConditionPosition`'s hash-jitter fallback whenever one is present — this was already
correct before Defect 4, so no `indexedDb.ts` change was required, and none was made
(confirmed by `git diff --stat` showing `indexedDb.ts` untouched by this fix, only its test
file changed).

**Independent proof, written from scratch this session:** built a small standalone Jest test
through the real `enrichFromText` entry point (not `persistEnrichmentResult` called with a
hand-built `locations[]` array, which would bypass `buildConditionFromSummary` entirely and
prove nothing about this specific defect) — mocked `callLLMWithFallback` so the anatomy call
returns `{ laterality: 'left', cx: 17.4, cy: 63.9, ... }` for a "Hand fissure" condition, and
asserted `result.conditions[0].locations[0].cx === 17.4` / `.cy === 63.9`. Ran it against the
current (fixed) tree: **PASS**. Then `git stash push -- src/lib/llm/enrich.ts` to isolate just
this defect's fix and reran the identical test: **FAILED** — `cx`/`cy` were `undefined` on the
location entry (the exact pre-fix symptom: a labeled location with no real position, which
`persistEnrichmentResult` then hash-jitters). Restored the fix (`git stash pop`) and confirmed
it passes again. This is genuine, differential proof the fix is load-bearing, not a test that
would pass regardless of the code.

**Issue 2 fix (`src/lib/llm/longitudinal.ts`, `repairPixelCoordinate`) — CONFIRMED FIXED,
correctly scoped.** Read the actual diff. Per expanding Chebyshev radius, the rewritten loop
now scans only that ring's border cells (full top/bottom rows, left/right columns only on
interior rows — correctly skips cells already checked at a smaller radius, matching the "one
ring at a time" structure the function's docstring always claimed but the pre-fix body didn't
implement) and, among opaque pixels found in that ring, keeps the one with the smallest
squared Euclidean distance (`distSq`) rather than whichever raster/row-major scan hit first.
Verified against the three properties the task asked to check:
- **(a) every pixel in a ring gets considered, none skipped:** confirmed by reading the
  bounds logic (`onYBorder` gates full-row scanning on the ring's top/bottom edge; interior
  rows correctly restrict to `x === originX - radius || x === originX + radius`, the ring's
  left/right edge, with no off-by-one gaps at the clamped mask boundary) and by an independent
  test (below) using an axis-aligned ring pixel that only a correct full-ring scan would find.
- **(b) same termination/null contract as before:** an independent test with an all-zero
  (fully transparent) mask still returns `null` — unchanged behavior, confirmed by reading
  that the outer `for radius` loop and final `return null` are untouched in shape.
- **(c) real behavioral improvement, not a no-op:** an independent test with two same-ring
  opaque pixels (one axis-aligned at Euclidean distance 3, one diagonal at Euclidean ≈4.24,
  with the *farther* one appearing earlier in raster scan order) confirms
  `repairPixelCoordinate` now returns the nearer pixel.

**Independent proof, written from scratch this session (not copied from DevAgent's or the
prior QA entry's 5×5/7×7 synthetic masks — a fresh 9×9 mask with a different pixel layout):**
origin `(4,4)` (transparent), opaque pixels at `(1,1)` (raster-first, Euclidean ≈4.24) and
`(4,1)` (raster-later, Euclidean 3, both at Chebyshev radius 3 from origin). Ran against the
current (fixed) tree: **PASS** — returns `(4,1)`, the nearer pixel. `git stash push --
src/lib/llm/longitudinal.ts` to isolate the fix and reran: **FAILED** — returned `(1,1)` (i.e.
`cx: 50`, the farther, raster-order-first pixel), confirming this is genuinely the old bug
being exercised, not a coincidentally-passing assertion. Restored the fix and confirmed it
passes again. The companion null-mask and mask-edge-termination tests written in the same
session passed both before and after the stash (as expected — those two properties were never
broken by either version).

**Regression check — CONFIRMED CLEAN.** `git diff --stat HEAD` for the working tree shows
exactly five source/test files changed: `src/lib/llm/enrich.ts`, `src/lib/llm/longitudinal.ts`,
`tests/lib/enrich.test.ts`, `tests/lib/indexedDb.test.ts`, `tests/lib/llm/longitudinal.test.ts`
(plus this card and `userDataTask.md`'s status narrative, no code). Nothing from P10-01 through
P10-08 or Defects 1-3's already-approved scope was touched by this defect's fix. No scratch/
temp test files were left behind by this QA session (`git status --short` confirms a clean
tree aside from the expected diff).

**`mergeConditionLocations` sanity check — confirmed no silent behavior change.** Read
`mergeConditionLocations` (`src/lib/llm/enrich.ts`): it keys by
`anatomical_location + laterality` (the `labelKey`) whenever that label is non-empty, falling
back to a `cx`/`cy`-derived key only when both label fields are empty. A laterality-bearing
location always has a non-empty label, so it was already keyed by label before this fix and
still is now — this fix only changes what value flows into the existing
`cx: firstNonNull(previous.cx, location.cx)` merge logic (previously always resolving to
`null` for these entries since `cx` was never populated; now resolving to the real
anatomy-derived point when present), the same `firstNonNull` pattern already used for every
other scalar field in this merge path. No new branch, no changed merge key, no regression.

**Validation commands run (fresh, this session, independent of the numbers reported by
DevAgent or any prior QA entry):**
- `npm run typecheck` — PASS, clean, no output.
- `npx expo lint` — PASS, exit 0, no errors/warnings.
- `npm test` (full suite, with coverage) — PASS, **55 passed / 55 total suites, 549 passed /
  549 total tests, 0 failed.** Matches every prior session's reported count on this card
  exactly, independently reproduced this session, not re-asserted from memory.

**Still-open, explicitly-acknowledged item — reconfirmed still accurate, not re-litigated.**
The pre-existing, already-recorded item ("Remaining open item, not blocking": exhaustive
point-by-point coordinate accuracy across every condition in a real record was spot-checked,
not exhaustively hand-verified) remains accurate and is unaffected by this fix — this
defect's fix only concerns (1) whether a laterality-bearing condition's secondary dot reuses
the anatomy call's already-proposed point instead of hash-jittering, and (2) whether the
alpha-mask repair step picks the geometrically nearest valid pixel when a proposed point needs
correcting. Neither concerns the LLM's clinical judgment quality of *where* it proposes a
point in the first place, which is what the still-open item is about.

**Verdict: Defect 4 is genuinely fixed — both issue 1 and issue 2 — independently
re-confirmed in a from-scratch session with differential (fails-pre-fix / passes-post-fix)
proof for both issues, not by trusting either agent's prose summary.** No regressions found.
Full validation green (typecheck, lint, 55/55 suites, 549/549 tests).

**Recommendation on remaining path to `kb4-DONE`:** the code/data-layer scope for Defect 4 is
QA-approved. What's still needed before `kb4-DONE`, carried forward and unchanged by this
session (not new findings):
1. A live browser/OpenRouter re-run against a multi-laterality-condition record to visually
   confirm the "duplicate dot" symptom is gone in practice, closing the real-world-verification
   gap neither DevAgent's session nor this QA session had an environment to close.
2. The pre-existing, explicitly-acknowledged, non-blocking item: exhaustive point-by-point
   coordinate accuracy across every condition in a real record (spot-checked only so far).
3. Optional cleanup, not a blocker: the stale `kb2-CODE` path reference in
   `userDataTask.md`'s Phase 10 section.

This card remains in `kb3-TEST` — this QA session does not have a live browser/OpenRouter
environment to close item 1 above, and per `prompt.userData.md` an untested browser/viewport
combination is a blocker, not a pass, so this QA pass does not move the card to `kb4-DONE`
itself.

## Defect 5 (Critical — found 2026-08-18, user-reported after Defect 4/P11 fixes: "quite a few condition dots were still placed outside the alpha mask of the relevant system")

**Root cause, confirmed by reading the actual code (`src/lib/db/indexedDb.ts`,
`putIndexedCondition`, lines 284-297):** the alpha-mask repair
(`repairConditionCoordinates`, called in `persistEnrichmentResult` before
`putIndexedCondition`) only validates a condition's **LLM-derived** `cx`/`cy`. But
`putIndexedCondition` has its own, separate fallback for when that value is absent:

```ts
const pos = defaultConditionPosition(system, `${input.name_medical}:${input.system}`)
const cx = input.cx ?? pos.cx
const cy = input.cy ?? pos.cy
```

This hash-jitter fallback path takes **no mask parameter** and is never validated
against anything. Whenever the anatomy-enrichment LLM call doesn't produce a usable
coordinate for a condition — confirmed happening routinely under free-tier load this
session (`anatomy-batch-incomplete` warnings observed directly in a live run's trace)
— the final stored position silently comes from this unchecked fallback, which can
land on a transparent pixel for that system's real asset. The repair step already ran
and finished (on the earlier, now-discarded absent LLM value) before this fallback
value even exists — it is never given a second chance at repair.

Since `putIndexedCondition`'s returned `cx`/`cy` are also reused verbatim for the
condition's primary `condition_locations` row in the same `persistEnrichmentResult`
call, both the condition's own position and its primary dot inherit this unvalidated
value together.

**Impact:** directly violates this same card's own already-claimed P10-04 acceptance
criterion — "Every persisted body-map coordinate is on a non-transparent pixel for its
affected system, or is explicitly unresolved" — for exactly the fallback case (anatomy
call didn't produce a coordinate) that P10-04 was supposed to make safe via mask
repair. Not a rare edge case: any condition whose batch-anatomy call and individual
retries all fail to produce a usable `cx`/`cy` hits this path.

**Fix direction:** thread the resolved mask (already computed in
`persistEnrichmentResult`, immediately before its `putIndexedCondition` call) into the
final coordinate — either by passing the mask into `putIndexedCondition` itself and
repairing whichever value it ends up using (LLM-derived or hash-jitter fallback)
before storing, or by repairing `putIndexedCondition`'s returned `cx`/`cy` in
`persistEnrichmentResult` immediately after the call, before that same value is reused
for the primary-location write. Either approach must guarantee: the *final* stored
position, regardless of which source produced it, is validated against the system's
mask when one is available — not just the LLM-derived path.

**Priority:** P0 — blocks `kb4-DONE`. User explicitly asked for this to be fixed before
the next live verification run.

**Status: FIXED (2026-08-18, DevAgent).** See the "Defect 5 fix" Implementation Record
entry below — the resolved mask is now threaded into `putIndexedCondition` itself, so
the hash-jitter fallback gets the same alpha-mask repair the LLM-derived path already
had. Awaiting independent QA retest.

## Blockers (updated 2026-08-18)

- Defect 5 blocks `kb4-DONE`. User has asked to fix this before doing another live
  browser/OpenRouter run (which was otherwise the next planned step for both this card
  and P11).

## Completion

NOT COMPLETE. Defect 5 found and not yet fixed. Do not move to `kb4-DONE` until fixed
and retested, in addition to Defect 4's still-open live-visual-reconfirmation item.

## Defect 5 fix (DevAgent, 2026-08-18)

**Root cause recap:** `persistEnrichmentResult` (`src/lib/db/indexedDb.ts`) already
resolves a per-condition alpha mask (`const mask = input.coordinateMasks?.[...] ??
input.coordinateMask ?? await input.coordinateMaskResolver?.(...)`) and runs
`repairConditionCoordinates(mask, rawCondition)` against it — but only against the
LLM-derived `cx`/`cy`. `putIndexedCondition`'s own `input.cx ?? pos.cx` hash-jitter
fallback (fired whenever the anatomy call produced no usable coordinate) ran after that
repair step had already finished, with no mask parameter and no validation of its own.

**Approach chosen: thread the already-resolved mask into `putIndexedCondition` itself
(option 1 from the card), not a post-hoc repair of its return value in
`persistEnrichmentResult` (option 2).** Reasoning: `putIndexedCondition` returns
`{ cx, cy }` that `persistEnrichmentResult` reuses verbatim for the same condition's
primary `condition_locations` row and, separately, is the value written to the
`conditions` store itself. Repairing only the returned value in `persistEnrichmentResult`
(option 2) would fix the primary-location row but leave the already-written `conditions`
row holding the pre-repair, unvalidated position — two different stored values for what
should be one canonical point, and a second, redundant re-derivation to bring them back
in sync. Repairing inside `putIndexedCondition`, before the single write to `conditions`,
guarantees the value written there and the value returned (and reused for the primary
location) are the same repaired point, with no second write path to keep in sync.

**Implementation (`src/lib/db/indexedDb.ts`):**
- `putIndexedCondition` gained a third, optional parameter: `mask?: AlphaMask` (imported
  `repairPixelCoordinate` alongside the existing `repairConditionCoordinates` import from
  `@/lib/llm/longitudinal`). Kept as a separate function parameter rather than a field on
  `PutIndexedConditionInput` — folding it into the input object would have required
  stripping it back out again before the `{ ...input, cx, cy }` spread that builds the
  stored `IndexedCondition` record (which has no `mask` field), adding an unused-variable
  destructure for no benefit; a plain third parameter avoids that entirely and reads
  clearly at the one real call site.
- Inside the function: `fallbackCx`/`fallbackCy` (renamed from the previous `cx`/`cy`
  locals) are computed exactly as before (`input.cx ?? pos.cx`, `input.cy ?? pos.cy`).
  When `mask` is supplied, `repairPixelCoordinate(mask, fallbackCx, fallbackCy)` runs
  unconditionally on that value (not gated on whether it came from `input.cx` or the
  jitter default — `repairPixelCoordinate` is a no-op that returns the same point when
  it's already opaque, so this correctly re-validates an LLM-derived point too, matching
  what `repairConditionCoordinates` already did for it one step earlier, and is a no-op
  for it in practice since it was already repaired). The final `cx`/`cy` prefer the
  repaired point, falling back to the unrepaired value only when `repairPixelCoordinate`
  returns `null` (mask has no opaque pixels at all — same "no valid pixels" contract
  `repairConditionCoordinates` already uses elsewhere, unchanged).
- The one real call site, in `persistEnrichmentResult`'s per-condition loop, now passes
  the already-computed `mask` local (the same one used a few lines earlier for
  `repairConditionCoordinates(mask, rawCondition)`) as `putIndexedCondition`'s third
  argument. No new mask resolution — reuses the existing per-condition mask lookup
  verbatim.
- Demo-data seeding (`seedIndexedDbDemoData`) calls `persistEnrichmentResult` without any
  `coordinateMask`/`coordinateMasks`/`coordinateMaskResolver`, so `mask` resolves to
  `undefined` in that call chain exactly as before this fix — `putIndexedCondition`'s new
  parameter is optional and demo data's hand-authored `cx_percent`/`cy_percent` positions
  are unaffected, confirmed by reading `seedIndexedDbDemoData` (unchanged, not touched by
  this fix). The two direct `putIndexedCondition(db, {...})` calls in
  `tests/lib/indexedDb.test.ts` also continue to omit the third argument and are
  unaffected.

**Test added (`tests/lib/indexedDb.test.ts`):** a new test immediately after the existing
P10-04/P10-06 "repairs a model-proposed coordinate landing on a transparent pixel" test —
`'repairs the hash-jitter fallback position onto the mask when the anatomy call produced
no coordinate'`. Uses a 3x3 mask where only the top-left pixel (0%, 0%) is opaque (deliberately
far from wherever `defaultConditionPosition`'s system-anchor-based jitter would land for
`system: 'nervous'`, so the test only passes if the fallback path is genuinely repaired,
not coincidentally already on an opaque pixel), a condition with **no `cx`/`cy` fields at
all** (forcing `putIndexedCondition`'s `input.cx ?? pos.cx` fallback), driven through the
real `persistEnrichmentResult` with `coordinateMask: mask` supplied. Asserts the resulting
dot is exactly `{ cx_percent: 0, cy_percent: 0 }` — the mask's only opaque pixel, not the
raw hash-jitter default.

**Validation run (2026-08-18, this session):**
- `npm run typecheck` — PASS, clean, no output.
- `npx expo lint` — PASS, exit 0, no errors/warnings.
- `npx jest --runInBand --coverage=false tests/lib/indexedDb.test.ts tests/lib/enrich.test.ts tests/lib/llm/longitudinal.test.ts` — PASS, 3 suites, 59 tests (58 prior + 1 new).
- `npm test` (full suite, with coverage) — **55 passed / 56 total suites, 558 passed / 559 total tests, 1 failed** (`tests/components/ProviderSettings.test.tsx`, "cancel leaves tier 0 unchanged and shows no error" — `render` function has not been called). This is the exact same pre-existing cross-suite-timing flake documented in every prior session on this card (DevAgent's Defect 3 fix, both QA passes on Defects 1/2/4) — not a file touched by this fix. Re-ran `npx jest --runInBand --coverage=false tests/components/ProviderSettings.test.tsx` in isolation immediately after: **PASS, 3/3 tests**, confirming it's the same isolation-vs-full-suite flakiness pattern, not a regression from this change.

**Scope discipline:** touched only `src/lib/db/indexedDb.ts` (`putIndexedCondition`'s new
optional `mask` parameter, its call site in `persistEnrichmentResult`) and
`tests/lib/indexedDb.test.ts` (one new regression test). Did not touch
`src/lib/llm/longitudinal.ts` (`repairPixelCoordinate`/`repairConditionCoordinates`
unchanged, confirmed by reading — this fix only changes *when* repair is applied, not how
it works), demo data, or any file from P10-01 through P10-08/Defects 1-4's already-fixed
scope.

**Not verified in this session (unchanged class of gap from every prior round on this
card):** a live browser/OpenRouter re-run confirming this fix eliminates the "dots outside
the alpha mask" symptom on real data. The mechanical guarantee (the final stored cx/cy,
whichever source produced it, is validated against the system's mask when one is
available) is proven by the test above; whether this closes 100% of the user's originally
reported "quite a few" out-of-mask dots on a real multi-condition document can only be
confirmed by another live run.

## Completion

NOT YET DONE. Defect 5's required fix is implemented and unit-tested; full validation
green apart from the one pre-existing, independently-reproduced-flaky
`ProviderSettings.test.tsx` full-suite-only failure (passes in isolation, unrelated to
this fix's files). This card remains in `kb2-CODE` pending independent QA retest of
Defect 5, plus the still-open live-browser-reconfirmation items carried forward from
Defect 4.

---

## QA Record (Defect 5 independent retest, separate QAAgent session, 2026-08-18)

Independent of the DevAgent that made this fix. Read the actual working-tree diff and
source directly; did not trust the Implementation Record's prose for any pass/fail call.

**1. `putIndexedCondition`'s mask parameter genuinely repairs whichever value results
from `input.cx ?? pos.cx` — VERIFIED, both paths.** Read `src/lib/db/indexedDb.ts:284-308`
directly:
```ts
const fallbackCx = input.cx ?? pos.cx
const fallbackCy = input.cy ?? pos.cy
const repaired = mask ? repairPixelCoordinate(mask, fallbackCx, fallbackCy) : null
const cx = repaired?.cx ?? fallbackCx
const cy = repaired?.cy ?? fallbackCy
const condition: IndexedCondition = { ...input, cx, cy }
```
`repairPixelCoordinate` runs on `fallbackCx`/`fallbackCy` unconditionally whenever `mask`
is supplied — it does not branch on whether the value came from `input.cx` (LLM-derived)
or `pos.cx` (hash-jitter default). Both paths get the same treatment; this is not "only
the fallback path gets checked" — it's "whatever value survives to this point gets
checked," which also means an LLM-derived point gets re-validated here (a harmless no-op
in practice, since `repairConditionCoordinates` already validated it one step earlier in
`persistEnrichmentResult`, and `repairPixelCoordinate` returns the same point unchanged
when it's already opaque). The repaired value (`cx`/`cy`) — not the pre-repair
`fallbackCx`/`fallbackCy` — is what gets spread into `condition` and written via
`transaction.objectStore('conditions').put(condition)`. Confirmed not computed-and-discarded:
there is no second `cx`/`cy` reference after this point that could reintroduce the
unrepaired value.

**2. Primary-location write stays in sync — VERIFIED.** Read
`persistEnrichmentResult`'s per-condition loop (`src/lib/db/indexedDb.ts:566-594`):
`const { id: conditionId, cx, cy } = await putIndexedCondition(db, {...}, mask)` passes the
already-resolved per-condition `mask` local (the same one used a few lines earlier for
`repairConditionCoordinates(mask, rawCondition)`) as the third argument, and the
destructured `cx`/`cy` — `putIndexedCondition`'s *returned*, already-repaired values, not a
second independently-computed pair — are reused verbatim in the immediately-following
`putIndexedConditionLocation(db, { id: \`${conditionId}-primary\`, condition_id: conditionId, cx, cy, is_primary: true, ... })`
call. No second, unrepaired value sneaks in for the primary location row; both rows are
provably the same point by construction (same closure variable), not two calls that happen
to agree today.

**3. Demo-data seeding is unaffected — VERIFIED.** `seedIndexedDbDemoData`
(`src/lib/db/indexedDb.ts:864-882`) calls `persistEnrichmentResult` with no
`coordinateMask`/`coordinateMasks`/`coordinateMaskResolver` fields set, so
`input.coordinateMasks?.[...] ?? input.coordinateMask ?? await input.coordinateMaskResolver?.(...)`
resolves to `undefined` for every demo condition — `mask` is falsy, `repairConditionCoordinates`
is skipped (`c = mask ? ... : rawCondition`), and `putIndexedCondition`'s third argument is
`undefined`, so `repaired` stays `null` and `cx`/`cy` fall through to `fallbackCx`/`fallbackCy`
= `input.cx ?? pos.cx`. Since `designConditionToConditionInput` (`src/lib/db/indexedDb.ts:748-773`)
always sets `cx: c.cx_percent, cy: c.cy_percent` from the hand-authored `DesignCondition`,
`input.cx` is always defined for demo conditions, so `pos.cx`/repair are never reached at
all — demo positions pass through completely untouched. Confirmed by the full-suite test run
below: the existing "seeds demo data and returns one dot per location" test (asserting exact
hand-authored coordinates like `stones` at `(44.36, 34)`/`(55.92, 37.57)`) still passes
unchanged.

**4. Independent test, own synthetic mask/condition — PASS, proves the original bug is
gone.** Wrote a from-scratch test (not copied from either QA's or DevAgent's fixtures),
run and deleted after confirming (not left in the tree): a 4×4 mask whose only opaque pixel
is the bottom-right corner (100%, 100%) — geometrically opposite corner from DevAgent's
top-left-pixel fixture — for a "digestive" system condition with **no `cx`/`cy` at all**
(forcing `putIndexedCondition`'s hash-jitter fallback). Asserted both:
- the `conditions` store row (via `getIndexedConditions`) has `cx_percent: 100, cy_percent: 100`
- the primary `condition_locations` row (via `getConditionLocations`, `is_primary: true`)
also has `cx: 100, cy: 100`

Both assertions passed against the current tree. This directly demonstrates the fix: a
condition with zero LLM-provided coordinate information, whose hash-jitter default would
otherwise land wherever `defaultConditionPosition`'s system-anchor jitter happens to fall
(almost certainly not this mask's single opaque pixel out of 16), now lands exactly on the
mask's one valid pixel in both persisted locations. Combined with reading the code in
points 1-2 above (which shows *why* it works, not just that this one case passes), this
closes out the "unvalidated fallback" root cause described in Defect 5.

**5. Regression check — CONFIRMED.** `git diff --stat` against the pre-P10 base
(`5a52039`) shows this session's working tree contains, beyond already-committed/approved
P10-01–P10-08 and Defect-1–4 work (committed in `12b8d1d`): the card file, `userDataTask.md`
(status narrative), `src/lib/db/indexedDb.ts` (+15/-4, Defect 5's `putIndexedCondition` mask
threading), `tests/lib/indexedDb.test.ts` (+66, one new regression test), and — confirmed
**unrelated to Defect 5** by reading their diffs directly — `src/lib/llm/enrich.ts`,
`src/lib/llm/longitudinal.ts` (Defect 4's already-QA-approved fix, `locations[]` cx/cy and
the ring-scan repair, still intact and unmodified by anything new), and `src/lib/llm/prompts.ts`
/ `src/lib/llm/structure.ts` / `tests/lib/chunk.test.ts` (P11-01/P11-02/P11-03 document-date-tier
work — a separate, already-in-flight card sharing this tree, correctly out of scope for this
retest, not touched by Defect 5's fix). `src/app/bodymap.tsx`, `src/hooks/useConditions.ts`,
and `src/model/conditions.ts` (P10-05's UI wiring) are unmodified since the `12b8d1d` commit —
confirmed via `git log --oneline -- <path>`, not assumed. Defect 5's fix is exactly as scoped:
`indexedDb.ts` + its test file, nothing else.

**6. Validation commands — independently run, this session:**
- `npm run typecheck` — PASS, clean, no output.
- `npx expo lint` — PASS, exit code 0, no errors/warnings.
- `npm test` (full suite, with coverage) — PASS, **56 passed / 56 total suites, 559 passed /
  559 total tests, 0 failed.** `tests/components/ProviderSettings.test.tsx` — the suite with a
  documented history of full-suite-only flakiness on this card (DevAgent's own last run hit it:
  55/56 suites, 1 failed test in that same file) — passed cleanly in this run, consistent with
  every prior session's conclusion that it's cross-suite timing flakiness, not a regression
  from Defect 5's fix (which touches a completely different file/module).

**Verdict: Defect 5 is genuinely fixed.** Both the LLM-derived and hash-jitter fallback
coordinate paths are validated against the alpha mask before the single write to the
`conditions` store; the primary `condition_locations` row is provably derived from the same
repaired value, not a second unrepaired one; demo data is untouched; the fix is correctly
scoped to `indexedDb.ts` alone; and an independently-authored test with a geometrically
distinct mask/condition from any prior fixture confirms the final stored position — for both
rows — lands on the mask's real opaque pixel rather than a raw, unvalidated hash-jitter
value. Full validation green (typecheck, lint, 56/56 suites, 559/559 tests).

**Anything else flagged before P10 (alongside P11) is ready for a live browser/OpenRouter
acceptance run:**
- Nothing new. The previously-recorded, still-open, non-blocking items are unchanged by this
  retest: (a) exhaustive point-by-point coordinate *accuracy* across every condition in a real
  record was only spot-checked in the 2026-08-18 live run, not exhaustively hand-verified —
  this is a product-quality follow-up, not a correctness defect, since it's still constrained
  by mask repair either way; (b) the condition detail sheet's attribution block (P10-05) has
  not been visually verified at desktop vs. narrow-mobile widths; (c) the stale `kb2-CODE`
  path reference in `userDataTask.md`'s Phase 10 section is a one-line doc cleanup, not
  functional. None of these block a live acceptance run — they're things to *watch for*
  during it, not blockers to starting it.
- One process note, not a defect: this tree currently carries uncommitted P11 work
  (`prompts.ts`/`structure.ts`/`chunk.test.ts`, document-date-tier resolution) alongside P10's
  Defect 4/5 fixes. Both are mechanically clean and mutually non-interfering (confirmed above),
  but if a live acceptance run is meant to test P10 and P11 together, that's an intentional,
  already-acknowledged combined run per this card's own history (P11 is referenced throughout
  as "separate, already-reviewed work sitting in the same tree") — not something this retest
  is flagging as a new risk, just confirming it's still true.

## Completion

**Defect 5: CONFIRMED FIXED, independently.** All five defects found across this card's
history (1-5) are now independently retested and confirmed fixed. P10-01 through P10-08's
scope, and Defects 1-4, remain QA-approved and unregressed. Full validation green:
`npm run typecheck` PASS, `npx expo lint` PASS (exit 0), `npm test` PASS (56/56 suites,
559/559 tests). This QA session has no live browser/OpenRouter environment, so — per
`prompt.userData.md`'s "classify an untested browser/viewport combination as a blocker, not
a pass" — this pass does not itself close the live-verification step; it confirms the
code/data-layer is clean and ready for that run. Card intentionally left in `kb3-TEST`;
the decision to run live acceptance and then move to `kb4-DONE` belongs to ArchAgent/the
user, not this QA pass.
