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

**Still NOT COMPLETE — cannot move to `kb4-DONE` yet.** The sole remaining blocker is
P10-07's live browser/OpenRouter acceptance pass (dot placement, condition-card content,
and now specifically a fresh confirmation that Defect 3's fix holds under a real upload),
plus the never-completed point-by-point coordinate-accuracy check. Both require a live
browser/OpenRouter session that this QA session did not have available, and a full
free-tier run has previously taken 35-40 minutes end to end — not something this QA pass
attempted to substitute for with a partial or simulated check. This is recorded as an
open blocker per `prompt.userData.md`'s explicit instruction to classify an untested
browser/viewport combination as a blocker, not a pass — not a silent gate and not a
silent pass. ArchAgent/the user must decide whether to schedule that live run before
`kb4-DONE`, or accept it as an explicit, user-acknowledged follow-up per the workflow
doc's closing line — that decision is not QA's to make. This card remains in
`kb3-TEST/` per workflow rules; not moved by this QA pass.
