# Phase 09 — Whole-document longitudinal extraction and body-map enrichment

## Goal

Replace the current structure-analysis plus per-section condition extraction contract with two explicit stages:

```text
complete redacted PDF text
  → longitudinal condition/provider extraction
  → condition-level organ/system/location enrichment
  → deterministic coordinate-mask validation
  → existing IndexedDB/bodymap stores
```

Reports under roughly 100 pages are expected to fit the selected model context after local text extraction. The implementation must still detect context-limit failures and fall back to the existing section/chunk strategy for unusually large documents.

## Stage 1 — longitudinal extraction

The model receives the complete extracted, PII-redacted text plus document/page hierarchy. It returns unique conditions, earliest diagnosis date for each condition, longitudinal notes/evidence, and the physician/provider/facility responsible for care. If the report is date-organized, sections inherit the section date unless contradicted by section text. If condition-organized, sections inherit the section condition unless contradicted. Institution/provider details stated once at report scope may be inherited by conditions covered by that report. Every inherited field must be listed in provenance/inferred fields; unsupported details remain null.

The application computes `yearFrac` analytically from the selected earliest date. The LLM does not generate coordinates or year fractions.

## Stage 2 — condition enrichment

For each extracted condition, the model receives the condition name, notes/evidence, inherited provider/facility context, and the allowed organ-system vocabulary. It returns normalized organ, system, and an anatomical-region proposal. The model may propose a region but cannot bypass local validation.

The browser loads the affected system’s body-map alpha mask and deterministically verifies that the final `cx`/`cy` lies on a non-zero pixel. If not, the application searches the nearest valid pixel/region or leaves the coordinate unresolved for user correction. The original evidence and inference provenance remain stored.

## Acceptance criteria

- Sparse reports containing only condition name/date produce valid records with other fields null.
- Earliest diagnosis date wins across repeated mentions and inherited section dates.
- Report-level and section-level provider/facility inheritance is preserved and marked inferred.
- No provider or facility is attached when the document does not support the relationship.
- `yearFrac` is deterministic and testable without an LLM.
- Every body-map dot has coordinates on a non-transparent pixel for its system, or is explicitly unresolved.
- Existing IndexedDB records, demo data, fallback routing, exports, and body-map rendering remain compatible.
- No raw PDF/image bytes are sent to the LLM; only extracted/redacted text and approved body-map metadata are used.

## Deliverables

- Versioned extraction/enrichment schemas and centralized prompts.
- Prompt/version telemetry and provenance fields.
- Alpha-mask coordinate validator and deterministic fallback.
- Fixture-based tests for sparse, chronological, problem-oriented, mixed, repeated-condition, provider-inheritance, context-limit, and invalid-coordinate cases.
- Browser acceptance evidence and updated migration/compatibility notes.
