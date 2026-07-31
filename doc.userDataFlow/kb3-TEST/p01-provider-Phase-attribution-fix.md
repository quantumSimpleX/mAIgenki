# P01: Provider Attribution Fix

## Scope

Correct condition-provider persistence so providers are linked only when directly evidenced by the condition or a dated care event.

## Out of Scope

Later schema, extraction, image, UI, and verification phases.

## Dependencies

None. This phase may run independently.

## Assigned Agents

- ArchAgent:
- DevAgent:
- QAAgent:

## Allowed Files/Directories

- `src/lib/pipeline.ts`
- `tests/lib/pipeline.test.ts`
- This phase card

## Implementation Checklist

### Phase 1 — Provider Attribution Fix

- [x] P01-01 **Task 1.1 — Remove the blanket provider fallback in `pipeline.ts`**

  Files: `src/lib/pipeline.ts`.

  In the condition-persistence loop, use `const conditionProviders = c.provider ? [...] : []`. The unconditional `insertConditionCareEvent` loop above remains responsible for dated care-event provider links gated by `event.date && event.provider?.name`.

  Depends on: none.

- [x] P01-02 **Task 1.2 — Regression test for provider attribution**

  Files: `tests/lib/pipeline.test.ts`.

  Add a `processHealthRecord` case where a condition has no `c.provider` and no matching `care_events` entry while the document has a top-level provider. Assert that `insertConditionProvider` is never called for that condition. Existing care-event attribution tests must continue to pass.

  Depends on: 1.1.

## Acceptance Criteria

Every checklist item is implemented by DevAgent and independently approved by QAAgent. A blocked or failed item remains unchecked.

## Required Validation

- `npx jest tests/lib/pipeline.test.ts --runInBand --silent`

## Developer Verification

- `npx jest tests/lib/pipeline.test.ts --runInBand --silent` — PASS (18 tests).
- Confirmed `src/lib/pipeline.ts` uses an empty provider list when `c.provider` is absent; dated care-event provider persistence remains separately handled.

## QA Test Plan

- Run the required focused Jest command.
- Inspect the provider persistence loop for absence of the document-level fallback.
- Verify the regression test asserts zero condition-provider links for an unrelated top-level provider.
- Verify no care-event behavior is regressed.

## Implementation Record

- 2026-07-31 DevAgent: Completed P01-01; removed document-level provider fallback.
- 2026-07-31 DevAgent: Completed P01-02; added regression coverage and query mocks in `tests/lib/pipeline.test.ts`.

## QA Record

- 2026-07-31 QA: Returned for repair because the original Task 1.2 block was concatenated with validation text and was not independently traceable.
- QA retest pending after this card repair.

## Defects and Retests

- D01: Malformed Task 1.2 body/validation evidence. Rewritten as a self-contained task with explicit command and acceptance assertion; awaiting QA retest.

## Blockers

- None known.

## Completion

- Dev implementation complete; card is in `kb3-TEST` awaiting independent QA approval.

## History

- 2026-07-31: Moved `kb1-TODO` → `kb2-CODE` → `kb3-TEST` after implementation.
- 2026-07-31: QA returned card to CODE for documentation repair; repaired and returned to TEST.


