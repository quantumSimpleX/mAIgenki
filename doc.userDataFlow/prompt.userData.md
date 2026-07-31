# User Data Flow Build Prompt

Implement `doc.userDataFlow/userDataReq.md` through the phases in
`doc.userDataFlow/userDataTask.md`.

## Required Reading

Before assigning or performing work, read:

- `CLAUDE.md`
- `doc.userDataFlow/userDataReq.md`
- `doc.userDataFlow/userDataTask.md`
- The assigned phase file, including its latest implementation and QA notes

Inspect the current code before changing it. The task document defines dependency order; the
phase file defines the active scope and records its complete history.

## Operating Rules

- ArchAgent plans and coordinates. It does not implement phase code or perform phase QA.
- DevAgent implements every checklist item in its assigned phase.
- QAAgent independently tests the completed phase. It must not validate its own implementation.
- Builder and validator must always be different subagents.
- Agents work only on phases explicitly assigned by ArchAgent. They do not self-select work.
- A phase is handed to QA only after its full implementation scope is complete.
- QA defects return the phase to a DevAgent. Dev fixes all defects, then QA retests the complete
  phase. Repeat until every requirement and required test is green.
- A phase moves to DONE only after independent QA approval. Partial completion, skipped tests,
  or unresolved environmental blockers cannot be marked DONE.
- Never weaken schema/constraints, tests, or acceptance criteria to obtain a pass.

## Kanban Workflow

Use only these state folders:

| State | Folder | Owner | Entry condition |
| --- | --- | --- | --- |
| Planned | `doc.userDataFlow/kb1-TODO/` | ArchAgent | Phase is specified and dependency-ready |
| Implementing | `doc.userDataFlow/kb2-CODE/` | DevAgent | ArchAgent assigns implementation |
| Validating | `doc.userDataFlow/kb3-TEST/` | QAAgent | Dev completes the entire phase |
| Complete | `doc.userDataFlow/kb4-DONE/` | None | Independent QA approves all acceptance criteria |

Legal transitions:

```text
kb1-TODO -> kb2-CODE -> kb3-TEST -> kb4-DONE
                         |
                         +-- defect --> kb2-CODE
```

Move the phase file itself; never copy it between states. Its location is the authoritative
status. Record the assigned agent whenever ownership changes.

## Phase Files

ArchAgent must create exactly one file per phase, matching `userDataTask.md`'s phases:

1. `p0-environment-and-library-spike.md`
2. `p1-provider-attribution-fix.md`
3. `p2-schema-and-persistence-layer.md`
4. `p3-extraction-pipeline-rebuild.md`
5. `p4-image-capture-pipeline.md`
6. `p5-bodymap-ui-wiring.md`
7. `p6-final-verification.md`

Numbers must match `userDataTask.md`'s `## Phase N` headings. Each `Task X.Y` becomes one
checklist item, ID `PN-YY` (e.g. `Task 2.11` → `P2-11`), with its full body — files, exact
signatures/SQL — copied in, not paraphrased.

Each phase file must contain:

```markdown
# P{N}: Phase title

## Scope
## Dependencies
## Assigned Agents
- DevAgent:
- QAAgent:

## Implementation Checklist
- [ ] P{N}-01 ...

## Acceptance Criteria
## Required Validation
## Implementation Record
## QA Record
## Defects and Retests
## Blockers
## Completion
```

Append concise records; do not erase prior defects or test results.

## ArchAgent Workflow

1. Confirm prerequisite phases are in `kb4-DONE`.
2. Create the phase file in `kb1-TODO` with complete scope, checklist, acceptance criteria, and
   validation commands, copied from `userDataTask.md`.
3. Assign one DevAgent and move the file to `kb2-CODE`.
4. When Dev reports the complete phase ready, assign a different QAAgent and move it to
   `kb3-TEST`.
5. If QA reports defects, record them, assign Dev, and move the file back to `kb2-CODE`.
6. Continue the Dev/QA loop until QA independently approves the full phase.
7. Verify evidence, move the file to `kb4-DONE`, and mark the corresponding tasks
   `**Status: DONE**` in `userDataTask.md`.

ArchAgent may clarify scope and resolve cross-phase conflicts. It must relay any decision
`userDataReq.md` explicitly left open (e.g. the PDF-render library choice, §9) to the user rather
than deciding it unilaterally. It must not substitute its own implementation or validation for
the assigned agents.

## DevAgent Workflow

1. Read all required documents and inspect existing behavior.
2. Claim only the phase assigned by ArchAgent.
3. Implement every checklist item and acceptance criterion exactly as specified.
4. Add or update tests at the correct layer.
5. Run the phase validations and relevant regression tests.
6. Update the phase file with changed files, decisions, commands, and exact results.
7. Return the complete phase to ArchAgent for independent QA.

When QA finds defects, fix every recorded defect, rerun relevant validation, document results,
and return the complete phase for QA retest.

## QAAgent Workflow

1. Confirm Dev completed every checklist item and supplied implementation evidence.
2. Inspect the diff and test behavior independently against requirements and acceptance criteria.
3. Run every required phase validation plus risk-based regression tests.
4. Record exact commands, results, and evidence in the phase file.
5. For any failure, record reproducible defects with expected and actual behavior; return the
   phase to ArchAgent for reassignment to Dev.
6. After fixes, retest defects and the complete phase — not only the changed assertion.
7. Approve only when all criteria and required tests pass.

Classify an untested browser/viewport combination as a blocker, not a pass. State
what was and was not proven.

## Dependencies and Parallel Work

Schedule phases in these integration waves (per `userDataTask.md` §12):

1. Foundation: Phase 0, Phase 1 (independent of everything else)
2. Data layer: Phase 2
3. Pipeline: Phase 3
4. Media: Phase 4
5. UI: Phase 5
6. Release gate: Phase 6

Respect the exact prerequisites in `userDataTask.md`. Parallel work is allowed only when
dependencies are complete and file scopes do not overlap — Phase 3 and Phase 4 both touch
`src/lib/pipeline.ts` and must never run concurrently. ArchAgent resolves shared-file ownership
before assignment.

## Architecture Constraints

- IndexedDB remains the complete on-device source of truth; no app-managed remote storage.
- Raw PDF/image bytes are never sent to an LLM — only extracted, redacted text.
- Condition chat stays session-only and is never persisted to IndexedDB.
- Schema changes are additive/backward-compatible (IndexedDB versioned `onupgradeneeded`
  migrations); existing demo data and UI must render unchanged after migration.
- No whole-original-PDF storage — extracted, compressed images only (`userDataReq.md` §5.7).
- Phase 4 (image capture) and Phase 6's manual tests run in a browser — no separate native build
  step applies.

## Validation and Completion

Use phase-specific tests from `userDataTask.md`. Before final completion, run:

```text
npm run typecheck
npx expo lint
npm test
```

Browser verification (Phase 4, Phase 6) is evidence-gated; an untested browser/viewport
combination is a blocker, not a pass.

The build is complete only when all seven phase files are in `kb4-DONE`, every task in
`userDataTask.md` is marked `**Status: DONE**`, all required validation is green, no blocker is
represented as passed, and every acceptance-criteria bullet in `userDataReq.md` §10 is recorded
as passing or has an explicit, user-acknowledged follow-up.
