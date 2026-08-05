# P09: LLM extraction/enrichment refactor

## Scope

Replace the current structure-plus-section extraction contract with whole-document longitudinal extraction for normal-sized redacted text, followed by condition-level organ/system/location enrichment and local body-map alpha-mask validation. Preserve context-limit fallback, existing IndexedDB schemas, demo hydration, provider attribution, and body-map rendering.

## Dependencies

- P08 connection/onboarding complete in `kb4-DONE`.
- Existing PDF text extraction, redaction, LMF fallback, IndexedDB persistence, and body-map assets.

## Assigned Agents

- DevAgent: Confucius
- QAAgent: Herschel (assigned after DevAgent completion)

## Implementation Checklist

- [ ] P09-01 Define versioned whole-document extraction schema for unique conditions, earliest diagnosis date, longitudinal notes/evidence, providers, facilities, source pages, and inherited-field provenance.
- [ ] P09-02 Replace the normal-size structure/chunk extraction call with complete-document longitudinal extraction; retain context-limit detection and section/chunk fallback.
- [ ] P09-03 Merge repeated conditions deterministically, select earliest diagnosis date, and compute `yearFrac` analytically in application code.
- [ ] P09-04 Define condition-level enrichment output for normalized organ, system, anatomical region, uncertainty, and provenance.
- [ ] P09-05 Implement local alpha-mask loading and nearest-valid-pixel coordinate validation/repair; never persist transparent-pixel coordinates as valid.
- [ ] P09-06 Adapt `ConditionInput`/`condition_locations` mapping while preserving provider/facility attribution, IndexedDB persistence, demo data, and existing body-map reads.
- [ ] P09-07 Add sparse-report, hierarchy-inheritance, repeated-condition/date, provider/facility, context-limit/fallback, enrichment, mask-coordinate, and regression tests.
- [ ] P09-08 Run required typecheck, lint, Jest, and browser desktop/mobile acceptance; record exact evidence here before QA handoff.

## Acceptance Criteria

- Sparse reports containing only condition name/date produce valid records with unsupported fields null.
- Date-organized reports inherit section dates unless explicitly overridden; condition-organized reports inherit section conditions unless overridden.
- Report-level physician/institution context is inherited only when scope supports it and is marked inferred.
- Earliest diagnosis date is deterministic; `yearFrac` is never LLM-generated.
- Enrichment never invents patient-specific severity, anatomy, laterality, provider, or measurements.
- Every persisted body-map coordinate is on a non-transparent pixel for its affected system, or is explicitly unresolved.
- Existing IndexedDB records, demo flow, fallback routing, exports, and body-map rendering remain compatible.
- Raw PDF/image bytes remain local; only extracted/redacted text reaches OpenRouter.

## Required Validation

- `npm run typecheck`
- `npx expo lint`
- Targeted Phase 09 Jest suites plus `npm test`
- Browser acceptance at desktop and narrow mobile-browser widths
- Fixture evidence for sparse, chronological, problem-oriented, mixed, repeated-condition, context-limit, and invalid-coordinate reports

## Implementation Record

DevAgent `/root/qa_phase08` implementation slice (2026-08-05):

- Added `src/lib/llm/longitudinal.ts`: versioned whole-document extraction types, deterministic earliest-date selection, application-derived `yearFrac`, repeated-condition merge preserving provenance/evidence, and alpha-mask opaque-pixel validation/nearest-valid repair.
- Integrated deterministic longitudinal merge into `enrichFromText` after existing section/chunk extraction, preserving context-limit and partial-failure fallback behavior.
- Added `tests/lib/llm/longitudinal.test.ts` covering date/year fraction, repeated-condition merge, and transparent-coordinate repair.
- Added a normal-size (`>=12,000` redacted characters) whole-document extraction call with a versioned JSON contract and deterministic fallback to the existing structure/section pipeline when the response is invalid or context-limited. The prompt requests hierarchy/date/provider/facility inheritance with explicit provenance and null unsupported fields.

Validation for this slice:

- `npx jest --runInBand --coverage=false tests/lib/llm/longitudinal.test.ts tests/lib/enrich.test.ts` — PASS (2 suites, 25 tests).
- `npm run typecheck` — PASS.
- `npx expo lint` — PASS, 0 errors (existing warnings plus two array-type warnings in the new module).

Remaining checklist work (blocked): map report-context provider/facility and source-page fields into the existing persistence schema, wire alpha-mask repair into pipeline coordinate writes/assets, add whole-document fixture/fallback tests, preserve condition-location/provider attribution end-to-end, and complete browser desktop/mobile acceptance. Existing `enrich.ts` already owns a merge helper, so the new utility is tested independently without replacing that contract. Phase remains in `kb2-CODE`; do not hand off as complete.

Final bounded validation 2026-08-05: `npm run typecheck` PASS; focused longitudinal/enrichment tests PASS (2 suites, 25 tests). Full P09 checklist is not complete.

## QA Record

Pending independent QAAgent validation.

## Defects and Retests

None recorded.

## Blockers

None recorded.

## Completion

Not complete. Card remains in `kb2-CODE` until DevAgent evidence is recorded, then transitions to `kb3-TEST` for independent QA.
