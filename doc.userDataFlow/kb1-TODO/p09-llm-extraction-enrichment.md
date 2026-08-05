# Phase 09 — LLM extraction/enrichment refactor

Status: TODO

## Objective

Implement the whole-document longitudinal extraction and condition-level body-map enrichment contract described in `phase09-llm-extraction-enrichment.md`.

## Sequenced tasks

1. Define versioned extraction output: unique condition, earliest diagnosis date, longitudinal notes/evidence, provider/contact, institution/address/city/state/country, inherited-field provenance, and source pages.
2. Replace the structure-stage prompt/call with complete-document extraction for normal-sized reports; retain section/chunk fallback when context limits are detected.
3. Merge repeated conditions deterministically and compute earliest dates plus `yearFrac` locally.
4. Define enrichment output for normalized organ, system, anatomical region, and uncertainty/provenance.
5. Load system alpha masks and implement nearest-valid-pixel coordinate validation/repair. Never persist a transparent-pixel dot as valid.
6. Adapt `ConditionInput`/`condition_locations` mapping and preserve provider/facility attribution and existing IndexedDB/demo paths.
7. Add prompt-contract, inheritance, sparse-report, repeated-condition, date, context-limit, fallback, mask-coordinate, and body-map regression tests.
8. Run typecheck, lint, Jest, and browser acceptance at desktop/mobile widths; document evidence in `kb3-TEST`.

## Constraints

- Browser-only; no native modules or server storage.
- Raw PDF/image bytes remain local; only extracted/redacted text is sent to OpenRouter.
- LLM-proposed coordinates are advisory; local alpha-mask validation is authoritative.
- Missing source facts remain null; inferred values require provenance.
- Demo data must continue through the shared IndexedDB and rendering path.

## Test plan

- Sparse condition/date-only fixture.
- Chronological report with inherited dates/provider/facility.
- Problem-oriented report with inherited condition context.
- Mixed report with explicit overrides.
- Repeated condition with earliest-date selection.
- Missing/ambiguous provider and facility cases.
- Context-limit failure followed by chunk fallback.
- Organ/system enrichment with valid and transparent proposed coordinates.
- Existing demo, export/import, fallback, and body-map regression suites.
