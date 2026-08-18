# P11: Tiered condition/section/document date hierarchy for extraction merge

## Scope

A 2026-08-18 live run (same session that closed out P10's Defect 4) surfaced a distinct
date-resolution defect in P10-01's `backfillDocumentWideDate`
(`src/lib/llm/enrich.ts`), found by the user manually inspecting the body-map time
rail: 21 of 45 conditions in one real record shared the exact same backfilled date,
causing them to visually cluster and "ripple" together at one point on the timeline.
Root cause, confirmed against the live IndexedDB data: every one of those 21 conditions
had `inferred_fields: ["date_diagnosed"]` (i.e. none had a date of their own or a
useful nearby section date) and all fell through to `backfillDocumentWideDate`'s
current semantics — take the single global-minimum date found *anywhere* in the whole
document and stamp it on every remaining undated condition, regardless of where in the
document that condition actually appears. That's not a real "document date"; it's a
computed minimum with no hierarchy awareness, and it produces false precision (implying
21 unrelated conditions were literally diagnosed on the same day).

**User-directed fix, locked for implementation (2026-08-18):**

Track three separate date tiers per condition through extraction — condition, section,
document — rather than collapsing to one resolved `earliest_date` early and papering
over gaps with a computed minimum:

1. **Condition tier (most granular, highest confidence).** The condition's own explicit
   date, extracted directly from its own text. Already exists (`ConditionSummary.earliest_date`
   when not inherited) — no change to this tier's extraction.
2. **Section tier.** The enclosing section's own date, from structure analysis
   (`RecordSection.inferredDate` / `TextChunk.inferredDate`) — already exists per chunk,
   but is currently only used via *forward-only* carry-forward
   (`carriedChunkDates` in `extractConditionSummaries`) that fills a *per-chunk* gap
   immediately during extraction, before merge. It must instead be tracked as a
   *separate, still-visible* field alongside the condition's own date (not immediately
   collapsed into `earliest_date`), so merge-time resolution (below) can still tell
   the two tiers apart.
3. **Document tier (last resort only).** A genuine, single extracted document-level
   date (e.g. a report-generation date or patient-intake date explicitly stated once,
   typically near the top of a real full medical record) — not a computed minimum
   across everything found. This does not currently exist as an extracted field
   anywhere in the pipeline; `analyzeRecordStructure` (`src/lib/llm/structure.ts`) must
   be extended to also return a document-level `documentDate: string | null` on
   `RecordStructure`, extracted once for the whole document, alongside its existing
   per-section `inferredDate`s.

**Resolution order, locked:** for a given condition, after merging all its occurrences
across chunks — earliest non-null **condition**-tier date among those occurrences wins;
only if none of its occurrences has one does earliest non-null **section**-tier date
(among those occurrences) win; only if that's also absent does the single **document**-tier
date apply; only if that's absent too does `earliest_date` stay null (the honest,
already-documented P10-01 terminal case). This replaces
`backfillDocumentWideDate`'s current single-pass "collapse to one value early, backfill
blindly" behavior with proper tiered resolution deferred to merge time, matching how
`pickEarliestDate`/`mergeConditionSummaryGroup` already resolve *within* one tier today
— extend that same merge step to resolve *across* tiers in the locked order above,
rather than doing it as a separate later pass.

**Explicitly out of scope for this card (user-directed, 2026-08-18):** bidirectional
(forward-and-backward) nearest-section-date search was considered and explicitly
rejected as unlikely to be a common real-world need. **Do not implement it.** If, after
this 3-tier fix ships, real-world documents still show implausible date clustering that
this hierarchy doesn't explain, revisit extending section-tier resolution to look both
directions (not just forward/preceding) as a documented, deferred future option — see
`doc.userDataFlow/userDataReq.md`'s open-questions section (or wherever this project
tracks deferred product decisions) for where to record that when/if it's revisited.

The test record used to find this defect was a partial extract of a larger real report,
manually truncated for testing — the user does not currently have confirmed evidence
that a full real report includes an explicit document-level date, but expects one is
typical for a complete medical record and wants the document tier built regardless
(not skipped just because it wasn't observed in this one partial test case).

## Dependencies

- P10 (`doc.userDataFlow/kb3-TEST/p10-extraction-merge-enrichment-fixes.md` at time of
  writing — Defects 1-4 fixed and independently QA-verified, including strong
  differential-test proof for Defect 4; only a live-browser visual re-confirmation of
  Defect 4 remains open there, unrelated to this card). This card builds directly on
  P10-01's `backfillDocumentWideDate`/`carriedChunkDates` and the merge/dedupe pipeline
  in `src/lib/llm/enrich.ts`.
- Existing structure analysis (`src/lib/llm/structure.ts`, `analyzeRecordStructure`,
  `RecordStructure`/`RecordSection`) and chunking (`src/lib/llm/chunk.ts`, `TextChunk`).

## Assigned Agents

- DevAgent: dev-engineer subagent, session 2026-08-18
- QAAgent: qa-engineer subagent (assigned after DevAgent completion; must be a different agent)

## Implementation Checklist

- [ ] P11-01 Extend `RecordStructure` (`src/lib/llm/structure.ts`) with a document-level
  `documentDate: string | null` field, extracted once per document by
  `analyzeRecordStructure`'s LLM call (extend `STRUCTURE_PROMPT` /
  `P09_WHOLE_DOCUMENT_EXTRACTION_PROMPT` context as needed — check which prompt actually
  drives `analyzeRecordStructure` vs which drives per-chunk extraction before editing;
  `src/lib/llm/prompts.ts` is the prompt-experiment surface). Fall back to `null` when
  no explicit document-level date is stated — never compute a substitute minimum here.
- [ ] P11-02 Track condition-tier and section-tier dates as **separate** fields through
  extraction (e.g. `ConditionSummary` gains a `section_date: string | null` alongside
  its existing `earliest_date`, populated from that chunk's `TextChunk.inferredDate` —
  distinct from today's `earliest_date_inherited` boolean-collapse approach). Do not
  collapse the two into one value before merge; merge is where tier resolution happens
  (P11-03).
- [ ] P11-03 Rewrite the per-condition date resolution in the merge/dedupe step
  (`dedupeConditionSummaries`/`mergeConditionSummaryGroup`/`pickEarliestDate` in
  `src/lib/llm/enrich.ts`) to resolve across all three tiers in the locked order:
  earliest non-null condition-tier date across a merged condition's occurrences: else
  earliest non-null section-tier date across those occurrences; else the single
  document-tier date; else null. Remove `backfillDocumentWideDate`'s current
  "single global minimum stamped on everything" behavior entirely — it is superseded
  by this tiered resolution, not layered on top of it.
- [ ] P11-04 Update `extractConditionSummaries`'s orchestration in `enrich.ts` to thread
  the new `documentDate` (from P11-01) through to the merge step, and to stop doing the
  current single-pass `carriedChunkDates` forward-fill *before* merge for the purpose of
  final date resolution (it may still be useful as the section-tier value itself, per
  P11-02 — read the current flow carefully before changing it, since
  `carriedChunkDates` is also referenced by `withSectionContext`/chunk labeling
  elsewhere and those uses are unaffected).
- [ ] P11-05 Tests: a condition with only a section-tier date (no own date, no document
  date) resolves to the section date, not null and not a document-wide value; a
  condition with no date at any tier but the document has one resolves to the document
  date; a condition with no date at any tier and no document date resolves to null (the
  honest terminal case); a condition merged from two occurrences where one has a
  condition-tier date and the other only a section-tier date resolves to the
  condition-tier date (most granular always wins, regardless of occurrence order);
  `analyzeRecordStructure` correctly extracts a stated document-level date when present
  and returns null when absent (not a computed substitute).
- [ ] P11-06 Run required typecheck, lint, Jest, and — budget permitting — one live
  browser/OpenRouter acceptance run on a real multi-condition document, checking
  specifically that conditions no longer cluster onto one implausible shared date the
  way they did before this fix. Record exact evidence here before QA handoff. A full
  live run has taken 25-40 minutes in every prior session on this project — plan
  accordingly, and confirm with the user before spending that time again if it's not
  clearly warranted by the size of this change.

## Acceptance Criteria

- A condition's resolved date always prefers the most granular tier with a real,
  non-null value: its own explicit date first, its enclosing section's date second, the
  document's own stated date third, and is left null only when none of the three tiers
  has anything — never a computed "earliest found anywhere" substitute.
- The document-level date is a genuinely extracted, single value (or null) — never a
  minimum computed across unrelated conditions/sections.
- No behavior change to condition-tier or section-tier extraction itself — only to how
  the three tiers are tracked separately and resolved at merge time.
- Existing P10-01 through P10-06 behavior (merge, provider/facility handling,
  name_common/local_names, coordinate derivation, UI attribution) remains unaffected —
  confirm via regression tests, not just non-overlap by file.
- Bidirectional section-date search is not implemented; its omission is intentional and
  documented as a deferred, user-rejected-for-now option, not a silently skipped item.

## Required Validation

- `npm run typecheck`
- `npx expo lint`
- Targeted Phase 11 Jest suites plus `npm test`
- One live browser acceptance run (budget/time permitting, per P11-06) confirming
  clustering is resolved on a real document, with document-tier date extraction
  exercised on a document that actually states one (the test record used to find this
  defect did not — a fuller real report likely does, per the user)

## Implementation Record

**DevAgent, 2026-08-18.** P11-01 through P11-05 fully implemented. P11-06's
typecheck/lint/Jest portion is complete and green; the live browser/OpenRouter
acceptance run is deliberately left undone this session (see note at bottom).

Files changed:

- `src/lib/llm/structure.ts` — `RecordStructure`/`RawStructure` gained
  `documentDate: string | null`. `parseStructure` now reads a top-level
  `documentDate` string off the LLM response (else `null` — never computed).
  `singleSectionFallback` sets `documentDate: null` (no structure analysis
  succeeded, so there's nothing genuine to draw from). `analyzeRecordStructure`
  threads `result.value.documentDate` through on the success path.
- `src/lib/llm/prompts.ts` — `STRUCTURE_PROMPT` extended to also request a
  single top-level `documentDate` (explicit document-level date stated once,
  e.g. report/intake date near the top; `null` if none stated, "never compute
  or estimate one from section/visit dates"), and the JSON shape example in
  the prompt updated to include it.
- `src/lib/llm/enrich.ts`:
  - `ConditionSummary` gained `section_date: string | null`, tracked
    separately from `earliest_date` (condition tier) through extraction and
    merge. `earliest_date_inherited` is now set only by the new final
    resolution step, not during extraction.
  - `parseExtractionStepResponse`'s condition mapping now sets
    `section_date: null` (unknown at that per-line parse stage — attached
    later, per chunk).
  - `extractConditionSummaries`: the old per-chunk fallback that mutated
    `earliest_date` from `carriedChunkDates` before merge is removed. Each
    chunk's conditions are now tagged with `section_date: carriedChunkDates[index]`
    (the chunk's own/carried section date) alongside whatever condition-tier
    `earliest_date` the chunk itself extracted — both tiers stay visible
    through dedupe. The final call is now
    `resolveConditionDateTiers(dedupedConditions, structure.documentDate)`
    (replacing `backfillDocumentWideDate(dedupedConditions, carriedChunkDates)`).
  - `mergeConditionSummaryGroup` (used by `dedupeConditionSummaries` when
    grouping same-condition occurrences) now merges each tier independently —
    `earliest_date: earlierDate(a.earliest_date, b.earliest_date)`,
    `section_date: earlierDate(a.section_date, b.section_date)` — leaving tier
    resolution to the step after dedupe, not decided mid-merge. The old
    `pickEarliestDate` helper (which conflated "explicit vs inherited" mid-merge)
    is removed as dead code superseded by this simpler per-tier merge, since
    `earliest_date` is now always condition-tier-only before final resolution.
  - `backfillDocumentWideDate` **removed entirely** (superseded, not layered
    on top of) and replaced by `resolveConditionDateTiers(conditions,
    documentDate)`, exported: for each already-merged condition, condition-tier
    date wins if non-null; else section-tier; else the single `documentDate`;
    else stays `null` (unchanged honest terminal case). `earliest_date_inherited`
    is set `true` only when the section or document tier supplied the value.
  - No changes to `backfillDocumentWideAttribution` (provider/facility
    document-wide inheritance) — out of this card's scope, confirmed unaffected.
- `tests/lib/enrich.test.ts` — removed the old `backfillDocumentWideDate`
  describe block (function no longer exists); added `describe('resolveConditionDateTiers', ...)`
  covering: section-tier-only resolution, document-tier-only resolution,
  all-tiers-absent stays null, condition-tier wins when all three present, and
  section-over-document precedence. Added
  `describe('enrichFromText — cross-occurrence tier resolution (P11-05)', ...)`
  — two integration tests through the full extraction→dedupe→resolution flow,
  merging one occurrence with an explicit condition-tier date and one with
  only a section-tier date, in both occurrence orders, both asserting the
  condition-tier date wins (most granular wins regardless of order). Updated
  the two pre-existing local `summary()` fixture helpers to include the new
  required `section_date: null` field.
- `tests/lib/structure.test.ts` — new file. Three tests on
  `analyzeRecordStructure`: extracts a stated `documentDate` on success;
  returns `null` (not a computed substitute) when the model reports none, and
  confirms a section's own `inferredDate` doesn't leak into `documentDate`;
  degrades to `documentDate: null` via the single-section fallback when
  structure analysis fails outright.
- `tests/lib/chunk.test.ts` — the local `structure()` fixture helper now
  includes `documentDate: null`, required to keep constructing a valid
  `RecordStructure` after the type change (P11 did not touch `chunk.ts`
  itself — `chunkRecordBySections` doesn't read `documentDate` at all).

Judgment calls for ArchAgent/QA:

- **"Genuinely extracted" vs. computed, mechanically enforced**: `documentDate`
  only ever gets a value in two places — the LLM's own `parsed.documentDate`
  string (`structure.ts`'s `parseStructure`) or `null` (both fallback paths).
  Nothing in the codepath computes a minimum/substitute for it, so there's no
  way for a "computed" value to reach this field — verified by reading the
  full diff, not just by test coverage.
- **Where the two tiers "stay separate until merge"**: literally as two
  distinct fields (`earliest_date`, `section_date`) on `ConditionSummary`,
  carried in parallel through `dedupeConditionSummaries`/
  `mergeConditionSummaryGroup`, and only collapsed into one final
  `earliest_date` by `resolveConditionDateTiers`, which runs once, after
  dedupe, directly in `extractConditionSummaries`'s return path — matching the
  card's instruction to extend the merge step rather than add a separate later
  pass.
- **`pickEarliestDate` removal**: this helper existed solely to decide, at
  merge time, whether an already-collapsed `earliest_date` was "explicit" or
  "inherited" so it could correctly rank against another occurrence's date.
  Since `earliest_date` is no longer pre-collapsed with a fallback before
  merge (P11-02), that distinction became unnecessary — a plain earliest-wins
  merge per tier is sufficient and simpler. Confirmed no other caller
  referenced it (`grep` across `src/`).
- **Bidirectional section-date search**: not implemented, per the card's
  explicit instruction. No code path was added or stubbed for it.

Validation commands and results (all run from repo root, 2026-08-18):

- `npm run typecheck` → passed clean (`tsc --noEmit`, no output/errors).
- `npx expo lint` → passed clean (no warnings or errors reported).
- `npm test` → **56 test suites passed, 557 tests passed**, 0 failed. Full
  suite run (not just Phase 11 files), so this also serves as the P10
  regression check the acceptance criteria call for — no P10-01 through
  P10-06 test broke.

P11-06 live-run note: per the task brief, the live browser/OpenRouter
acceptance run (confirming real-document clustering is resolved, and
exercising `documentDate` extraction on a document that actually states one)
is intentionally left for ArchAgent to run/schedule — every full live run this
session has taken 25-40 minutes, and this agent has no live OpenRouter
connection available. All non-live-run validation (typecheck, lint, full Jest
suite including new/rewritten Phase 11 tests) is complete and green above.

Card intentionally left in `kb2-CODE` per workflow rules — not moved, not
marked complete.

**DevAgent, 2026-08-18 (Defect 1 fix).** Returned from `kb3-TEST` with one
open defect (see `## Defects and Retests` below for full detail): the
second, `conditionKey`-based merge pass (`mergeConditions`/
`mergeTwoConditions` in `src/lib/llm/enrich.ts`) combined `date_onset`/
`date_diagnosed` across occurrences with a tier-blind `earlierDate`
comparison, letting a less-granular section/document-tier date silently
beat a more-granular condition-tier date when the `extraction-dedupe` LLM
call fails (a real, documented non-fatal degrade path, not a contrived
edge case). Fixed by adding a `mergeTieredDate` helper that prefers the
occurrence whose date came from a more granular tier — using the
`inferred_from_structure` marker `buildConditionFromSummary` already
stamps per occurrence — falling back to earliest-within-the-same-tier only
when both occurrences are at the same tier. Full detail, reasoning, and
validation results are in the Defect 1 entry below (not duplicated here to
avoid drift between the two records). `npm run typecheck`, `npx expo lint`,
and `npm test` (56/56 suites, 558/558 tests) all green. Card left in
`kb2-CODE`, not moved — QA retest still required per workflow rules.

## QA Record

**QAAgent, 2026-08-18.** Independent review — read `structure.ts` and `enrich.ts` in
full myself (not from the Implementation Record's prose), wrote my own tests, and
independently reran all required validation.

**1. `structure.ts` — `documentDate` genuinely extraction-only, verified by reading
code, not trusting the record.** `parseStructure` sets `documentDate` only from
`typeof parsed.documentDate === 'string' ? parsed.documentDate : null` (line 99) — no
computed fallback. `singleSectionFallback` hardcodes `documentDate: null` (line 124).
`analyzeRecordStructure`'s success path passes `result.value.documentDate` straight
through (line 175) with no transformation. Confirmed `STRUCTURE_PROMPT`
(`src/lib/llm/prompts.ts`) is the prompt that actually drives `analyzeRecordStructure`
(imported directly, aliased `EDITABLE_STRUCTURE_PROMPT` in `structure.ts`) and that it
explicitly asks for `"documentDate": "YYYY-MM-DD or null"` with instruction text
"never compute or estimate one from section/visit dates." Matches the card's P11-01
requirement exactly.

**2. `enrich.ts` tier tracking and merge order — verified by reading the code.**
`ConditionSummary.earliest_date` (condition tier) and `.section_date` (section tier)
are tracked as genuinely separate fields from extraction (line 199-201,
`parseExtractionStepResponse` sets `section_date: null` at parse time; line 324-325,
`extractConditionSummaries` attaches the chunk's carried date onto `section_date`
per-chunk, never collapsing into `earliest_date`) through `mergeConditionSummaryGroup`
(lines 426-435, each tier merged independently with its own `earlierDate` reduction) and
final resolution runs once, after `dedupeConditionSummaries` (merge/dedupe), via
`resolveConditionDateTiers(dedupedConditions, structure.documentDate)` (line 336) — this
matches the card's requirement that resolution happen *after* merge, not before.
Confirmed by grep: zero references to `backfillDocumentWideDate` or `pickEarliestDate`
remain anywhere in `src/` or `tests/` (both only appear in explanatory comments noting
their removal).

**3. Independent tests written and run (not copies of DevAgent's):**
- `resolveConditionDateTiers` unit — section-only resolves to section date;
  no-tier-but-document resolves to document date; nothing-anywhere stays null (honest
  terminal case); and a batch of two unrelated conditions resolves independently (no
  cross-condition minimum leaks from one condition's tier into another's). **All 4
  passed.**
- `structure.test.ts` (DevAgent's file) rerun independently: **3/3 passed** — document
  date extracted when present, null (not computed) when absent, fallback path also null.
- **Adversarial order-independence test — FAILED. See Defect below.**

**4. Regression / scope check.** `git diff --stat` against `HEAD` (last commit
`12b8d1d`, nothing else committed since) shows the working tree also contains
`src/lib/llm/longitudinal.ts`, `tests/lib/llm/longitudinal.test.ts`, and
`tests/lib/indexedDb.test.ts` changes beyond what the P11 Implementation Record lists.
Traced these: they are P10's Defect 4 (nearest-opaque-pixel repair) fix, already
recorded and independently QA-approved on `p10-extraction-merge-enrichment-fixes.md`
(same card, still open only pending a live-browser re-confirmation, unrelated to P11).
Not a P11 scope violation — just uncommitted P10 work sitting in the same working tree.
Confirmed `withSectionContext`/chunk-labeling's use of `carriedChunkDates` is untouched
(still line 274-278, unrelated to the tier-resolution rework, exactly as the card
warned to check). No dead code left behind: `pickEarliestDate` fully removed, nothing
else references it.

**5. Validation commands, independently rerun (not accepted from ArchAgent's report):**
- `npm run typecheck` → clean, no output.
- `npx expo lint` → clean, no warnings/errors.
- `npm test` (full suite, before adding any of my own test files) → **56 suites
  passed / 56 total, 557 tests passed / 557 total** — matches ArchAgent's reported
  numbers exactly, independently reproduced.

**Minor doc issue (non-blocking):** the Implementation Record's closing paragraph says
"Card intentionally left in `kb2-CODE`" and "Card is in `kb1-TODO`, awaiting ArchAgent
assignment" in the `## Completion` section — both stale/boilerplate, since the file was
in fact already in `kb3-TEST` for this QA pass. Cosmetic only; flagging so it gets
cleaned up on next edit rather than propagating further.

## Defects and Retests

**Defect 1 — Fixed (DevAgent, 2026-08-18), pending QA retest.**

Root cause was exactly as QA traced it: `resolveConditionDateTiers` only runs
once, right after `dedupeConditionSummaries`. When the `extraction-dedupe`
LLM call fails (documented non-fatal degrade), same-condition occurrences
skip that combining step and are each tier-resolved independently, then
later reach the second, `conditionKey`-based merge pass
(`mergeConditions`/`mergeTwoConditions`) with their tiers already collapsed
into a single `date_diagnosed`/`date_onset` value. That pass previously
combined dates with a tier-blind `earlierDate(a.date, b.date)` — purely
numeric earliest-wins — so a less-granular-but-earlier section/document-tier
date could beat a more-granular-but-later condition-tier date.

**Fix (option (b) from QA's recommendation — provenance thread-through, not
a second `resolveConditionDateTiers` pass):** `buildConditionFromSummary`
already stamps `inferred_from_structure: ['date_diagnosed']` on a
`ConditionInput` whenever `resolveConditionDateTiers` had to fall back to
the section/document tier for that occurrence (via
`summary.earliest_date_inherited`) — this survives onto `ConditionInput`
unchanged, so it's the exact per-occurrence tier marker needed at the
second merge stage; no new field was required.

- Added `mergeTieredDate(field, a, b)` in `src/lib/llm/enrich.ts` (just
  above `mergeTwoConditions`): for `date_onset` and `date_diagnosed`
  independently, if one occurrence's date is tier-inherited
  (`inferred_from_structure` includes that field name) and the other's
  isn't, the non-inherited (more granular) occurrence's date wins outright,
  regardless of numeric ordering. Only when both occurrences' dates are at
  the same tier (both inherited or both condition-tier) does it fall back to
  `earlierDate` — matching `resolveConditionDateTiers`' own within-tier
  tie-break.
- `mergeTwoConditions` now calls `mergeTieredDate` for both date fields
  instead of the old direct `earlierDate(a.date_onset, b.date_onset)` /
  `earlierDate(a.date_diagnosed, b.date_diagnosed)` calls. `date_onset` was
  included per the card's "same function, same risk" note even though no
  current caller populates it with a tier-inherited value yet
  (`buildConditionFromSummary` always sets `date_onset: null`) — the fix is
  symmetric so a future caller that does populate it inherits correct
  behavior for free.
- `inferred_from_structure` on the merged output is no longer a blind union
  for `date_onset`/`date_diagnosed`: it now reflects the *winning* value's
  actual tier from `mergeTieredDate`'s `inherited` flag for those two
  fields specifically (still a plain union for any other field name), so a
  condition-tier date that won over an inherited one from the other
  occurrence is no longer incorrectly left flagged "inferred" in persisted
  `inferred_fields` (`indexedDb.ts` line 576). This wasn't strictly required
  by QA's repro (which only asserts on `date_diagnosed`'s value) but is the
  same provenance signal the fix relies on, so leaving it stale seemed like
  a needless latent inaccuracy in data this same defect is about.

Files changed: `src/lib/llm/enrich.ts` only (`mergeTieredDate` added,
`mergeTwoConditions` updated). No changes to `resolveConditionDateTiers`,
`mergeConditionSummaryGroup`, `dedupeConditionSummaries`, or any P10 scope,
per the card's instruction to keep this fix scoped.

**Regression test added:** `tests/lib/enrich.test.ts`, in the existing
`describe('enrichFromText — cross-occurrence tier resolution (P11-05)', ...)`
block — QA's exact repro (dedupe call fails, one occurrence with only a
section-tier-inherited date `2020-03-01`, one with an explicit condition-tier
date `2023-06-15`), asserting `result.conditions[0].date_diagnosed === '2023-06-15'`.

**Validation (2026-08-18, repo root):**
- `npm run typecheck` → clean, no output.
- `npx expo lint` → clean, no warnings/errors.
- `npm test` (full suite) → **56 test suites passed / 56 total, 558 tests
  passed / 558 total** (557 baseline + 1 new regression test), 0 failed —
  including all P11-05 dedupe-succeeds tests unchanged and passing, and the
  full P10 regression set.

Ready for QA retest: this specific repro, the existing P11-05
dedupe-succeeds tests, and the full suite/typecheck/lint.

---

**Defect 1 — Open (original QA finding, preserved below for history).**

- **Severity:** High.
- **Title:** Tier resolution is silently undone by the second (conditionKey-based)
  merge pass when the semantic dedupe LLM call fails.
- **Impact:** Any user whose document triggers a failure of the `extraction-dedupe`
  LLM call (network error, malformed/rejected response, model exhaustion — a
  documented, non-fatal degrade path per `dedupeConditionSummaries`'s own comment:
  "any failure just skips the pass") can end up with a condition's final displayed
  date reverting to a less-granular, less-reliable section/document-tier value even
  though one of its occurrences had an explicit, condition-tier date. This is the same
  *class* of bug this card was opened to fix (a less-granular date silently winning
  over a more-granular one) — just reintroduced one merge stage later.
- **Likelihood:** Real, not contrived. The dedupe LLM call runs on every document with
  2+ candidate conditions and has no retry beyond the normal model-fallback chain; on
  free-tier models under load this is a plausible real-world failure mode (this
  project's own architecture doc and prior QA notes both call out free-tier
  reliability as a known pressure point). It also does not require every occurrence to
  fail dedupe — only the ones sharing a `conditionKey` (name+organ+location) that the
  semantic dedupe pass happened not to group together.
- **Root cause:** `extractConditionSummaries` resolves tiers exactly once, via
  `resolveConditionDateTiers(dedupedConditions, structure.documentDate)`
  (`src/lib/llm/enrich.ts` line 336), immediately after `dedupeConditionSummaries`.
  When that dedupe call succeeds, same-condition occurrences are already combined into
  one `ConditionSummary` first (tiers merged independently, per-tier, by
  `mergeConditionSummaryGroup`), so resolution runs once per real condition — correct.
  When the dedupe call fails, `dedupeConditionSummaries` returns the input unchanged
  (line 457), so each occurrence is tier-resolved **independently**, each losing sight
  of the other's tier data. Both occurrences later get combined anyway — but by
  `enrichFromText`'s second merge pass, `mergeConditions` (line 1155), which groups by
  `conditionKey` (name/organ/location, computed post-anatomy) and merges
  `date_diagnosed` via a tier-blind `earlierDate(a.date_diagnosed, b.date_diagnosed)`
  (`mergeTwoConditions`, line 1070) — i.e., whichever value is textually/numerically
  earlier wins, with no notion of which tier it came from.
- **Repro (independent adversarial test, run against the current tree, FAILED):**
  ```ts
  // tests/lib/enrich.test.ts pattern; add to the P11-05 describe block or its own
  mockByLabel({
    'structure-analysis': () => ({
      ok: true, model: 'm', content: '',
      value: { organization: 'chronological', documentDate: null,
        sections: [{ heading: 'Full record', startOffset: 0, endOffset: 9999,
          inferredDate: '2020-03-01', sectionType: 'other', imageWorthy: false }] },
      failures: [],
    }),
    'extraction-condition-list': () => ({
      ok: true, model: 'm', content: '',
      value: { conditions: [
        { name_medical: 'Essential hypertension', earliest_date: null, notes: null, provider: null, facility: null },
        { name_medical: 'Essential hypertension', earliest_date: '2023-06-15', notes: null, provider: null, facility: null },
      ], measurements: [] },
      failures: [],
    }),
    // Dedupe LLM call fails — documented non-fatal degrade path.
    'extraction-dedupe': () => ({ ok: false, model: null, content: null, value: null, failures: [] }),
    'enrichment-anatomy': () => ({
      ok: true, model: 'm', content: '',
      value: new Map([
        [0, { system: 'cardiovascular', organ: 'heart', anatomical_location: null, laterality: null, name_common: null, local_names: null, cx: null, cy: null }],
        [1, { system: 'cardiovascular', organ: 'heart', anatomical_location: null, laterality: null, name_common: null, local_names: null, cx: null, cy: null }],
      ]),
      failures: [],
    }),
  })
  const result = await enrichFromText('report text', '', [])
  expect(result.conditions).toHaveLength(1)
  expect(result.conditions[0].date_diagnosed).toBe('2023-06-15') // condition-tier date
  ```
  - **Expected:** `date_diagnosed === '2023-06-15'` (the explicit condition-tier date
    from occurrence B — most granular tier must win per the card's locked resolution
    order, "regardless of which occurrence appears first" / regardless of which path
    combined them).
  - **Actual:** `date_diagnosed === '2020-03-01'` (the section-tier-inherited date from
    occurrence A — won only because `earlierDate` treats it as numerically smaller,
    with no tier awareness).
- **Recommendation (smallest fix):** Either (a) run `resolveConditionDateTiers` a
  second time, or move it to run *after* `mergeConditions` instead of before
  `buildConditionFromSummary`, so tier resolution happens once, after all merging
  (both the semantic-dedupe pass and the conditionKey pass) is complete — this matches
  the card's own stated intent ("merge-time resolution... after merge/dedupe... so
  merge-time resolution can pick the most granular tier regardless of which occurrence
  contributed it") more literally, since there are actually two merge passes, not one;
  or (b) thread `section_date` (and a per-occurrence tier marker) through
  `buildConditionFromSummary`/`ConditionInput`/`mergeTwoConditions` so the
  conditionKey-based merge can also resolve tier-aware rather than using a blind
  `earlierDate` on an already-collapsed `date_diagnosed`. (a) is smaller and keeps tier
  logic in one place.
- **Not a regression from a prior phase** — this exact failure mode did not exist
  before P11 (there was no tier concept to lose), so it's a defect in this card's own
  new logic, not pre-existing.

## Blockers

None. (No live browser/OpenRouter run performed this session — see recommendation
below; this is a scope/budget question for the user, not a QA blocker on the code-level
review.)

## Completion

**Not approved — returning to `kb2-CODE` for Defect 1.** All other verified scope
(P11-01, P11-02, P11-04, the `documentDate` prompt/extraction path, dead-code removal,
regression against P10) is correct and independently confirmed. Defect 1 is the one
blocking item: the tiered resolution the whole card exists to deliver has a real,
non-contrived gap under the dedupe-LLM-failure fallback path, which is exactly the
"regardless of occurrence order/path" guarantee the card's acceptance criteria and
P11-05 test requirement call for. Once fixed, retest should re-verify: this specific
repro, the existing P11-05 dedupe-succeeds tests still pass, and the full suite/typecheck/lint
remain green.

**Recommendation on the live browser/OpenRouter acceptance run (P11-06):** not
necessary before returning this defect to Dev — fix Defect 1 first, since it's a
deterministic code-path bug independent of any live model behavior and would need a
retest regardless. Once Defect 1 is fixed and retested, I'd lean toward recommending
the live run given the card's own origin (a live session found real-world clustering
that a mocked/unit-test suite alone would not have caught) and the fact that
`documentDate` extraction has never been exercised against a real LLM response — but
that 25-40 minute cost is the user's call to make at that point, not mine to decide now.

---

**QAAgent, 2026-08-18 (Defect 1 retest).** Different QAAgent from the original
finding, per workflow rules. Read the actual fix in `src/lib/llm/enrich.ts` myself
(not from the Implementation Record's prose), independently wrote and ran fresh
adversarial tests (not copied from either the original repro or DevAgent's regression
test), and reran full required validation.

**1. `mergeTieredDate` logic — read line-by-line, verified correct.**
`src/lib/llm/enrich.ts` lines 1070-1083:
```
function mergeTieredDate(field, a, b) {
  const aInherited = a.inferred_from_structure?.includes(field) ?? false
  const bInherited = b.inferred_from_structure?.includes(field) ?? false
  if (!aDate) return { value: bDate ?? null, inherited: bInherited }
  if (!bDate) return { value: aDate, inherited: aInherited }
  if (aInherited !== bInherited) return aInherited ? { value: bDate, inherited: false } : { value: aDate, inherited: false }
  return { value: earlierDate(aDate, bDate), inherited: aInherited }
}
```
- Different tiers (`aInherited !== bInherited`): the non-inherited (more granular)
  occurrence's date wins outright, with no numeric comparison at all — correctly
  bypasses `earlierDate` entirely for the cross-tier case, which is exactly what was
  broken before.
- Same tier (both inherited or both condition-tier): falls through to
  `earlierDate(aDate, bDate)` — correct, matches `resolveConditionDateTiers`'
  within-tier semantics.
- Symmetric under occurrence swap: the cross-tier branch doesn't depend on which
  argument is `a` vs `b` (checks `aInherited` only to decide which literal date to
  return, but the outcome — the non-inherited value — is the same regardless of
  which side supplied it), and `earlierDate` itself is order-independent (picks the
  textual min). Confirmed this holds in practice via the reverse-order test below,
  not just by inspection.
- `mergeTwoConditions` (lines 1089-1138) calls `mergeTieredDate` for both
  `date_onset` and `date_diagnosed` and is the function `mergeConditions` (line
  1140-1150, groups by `conditionKey`, reduces via `mergeTwoConditions`) reduces
  occurrences through — confirmed this is genuinely the code path
  `enrichFromText`'s second merge pass (line 1198) invokes, not a parallel/dead
  path.

**2. `inferred_from_structure` provenance — verified correct.** Lines 1126-1136: for
`date_onset`/`date_diagnosed` specifically, the merged output's
`inferred_from_structure` is built from `dateOnset.inherited`/`dateDiagnosed.inherited`
(the winning value's actual tier per `mergeTieredDate`'s return), not a blind union of
both occurrences' flags — any other field name still unions normally. This means a
condition-tier date that wins over an inherited one from the other occurrence is
correctly no longer flagged `date_diagnosed` in `inferred_fields`. Confirmed this
behaviorally, not just by reading the code — see test 3 below (`not.toContain`
assertion on the reverse-order case, and `toContain` on the same-tier-inherited case).

**3. Independent adversarial tests — written fresh, run against the current tree, all
passed, then removed (verification-only, not left as a permanent test file since the
existing `tests/lib/enrich.test.ts` P11-05 block already carries the permanent
regression coverage for this defect class):**
- **Reverse order of the original repro** (condition-tier occurrence FIRST this time,
  section-tier-only occurrence SECOND, dedupe LLM call fails) — `date_diagnosed`
  resolved to `2023-06-15` (condition-tier), and `inferred_from_structure` correctly
  did NOT contain `date_diagnosed`. **Passed.** This specifically closes the gap that
  DevAgent's own regression test only exercised one occurrence order for the
  dedupe-fails path (the order-swap test in the suite only covers the
  dedupe-*succeeds* path).
- **Same tier, both section-tier-inherited, dedupe fails** — built via two real
  document sections (each >200 chars, so `chunk.ts`'s `mergeTinySections` doesn't
  collapse them into one chunk) with distinct `inferredDate`s (`2021-09-10`,
  `2018-01-05`), each producing one dateless occurrence of the same condition.
  Resolved to `2018-01-05` (earliest-within-tier) and `inferred_from_structure`
  correctly contained `date_diagnosed`. **Passed.** (First attempt at this case used
  a too-short document text where both occurrences collapsed into the same chunk and
  therefore the same section date — not a product defect, a test-construction error
  on my part, caught and corrected before relying on the result.)
- **Same tier, both explicit condition-tier dates, dedupe fails** — `2023-06-15` vs
  `2017-11-02`, resolved to `2017-11-02` (earliest-within-tier), correctly NOT flagged
  inferred. **Passed.**

**4. DevAgent's own regression test — read and confirmed genuine, not tautological.**
`tests/lib/enrich.test.ts`, `describe('enrichFromText — cross-occurrence tier
resolution (P11-05)', ...)`, third test ("resolves to the condition-tier date through
the conditionKey-based merge pass when the dedupe LLM call fails"): mocks
`extraction-dedupe` to fail (`ok: false`), two occurrences of the same condition (one
null date + section-tier date `2020-03-01`, one explicit `2023-06-15`), asserts
`result.conditions[0].date_diagnosed === '2023-06-15'`. This is QA's exact original
repro, genuinely exercises the previously-broken path (confirmed it would have failed
against the pre-fix code, since that's literally what the original Defect 1 report
demonstrated), and is not a trivial/always-true assertion.

**5. Full regression check.** `git diff --stat` against `HEAD` shows the same file set
as the original QA pass plus this defect fix: `src/lib/llm/enrich.ts`,
`tests/lib/enrich.test.ts`, `tests/lib/chunk.test.ts`, `tests/lib/indexedDb.test.ts`,
`tests/lib/llm/longitudinal.test.ts`, `tests/lib/structure.test.ts`, plus this phase
file and `userDataTask.md` — no new files beyond what P11 and the co-resident P10
Defect 4 fix (already independently QA-approved, noted in the prior QA Record) account
for. `resolveConditionDateTiers`, `mergeConditionSummaryGroup`,
`dedupeConditionSummaries` are unchanged (grep confirms no edits outside
`mergeTieredDate`/`mergeTwoConditions` in `enrich.ts`'s diff region), matching the
Defect 1 fix's own stated scope. Re-ran the full P11-05 dedupe-succeeds tests (still
pass) and the full P10 regression set (still pass) as part of `npm test` below.

**6. Validation commands, independently rerun:**
- `npm run typecheck` → clean, no output.
- `npx expo lint` → clean, no warnings/errors.
- `npm test` (full suite) → **56 test suites passed / 56 total, 558 tests passed / 558
  total**, 0 failed — matches DevAgent's reported numbers, independently reproduced,
  both before and after adding/removing my own verification-only test file.

**Verdict on Defect 1: genuinely fixed.** The fix is not merely plausible from the
diff — it was exercised against occurrence orders and same-tier cases the existing
regression suite didn't cover, and held in every case.

## Completion

**Approved — code-level verification complete.** All P11 acceptance criteria are
independently confirmed: tiered resolution (condition > section > document > null)
holds both in the primary merge path (`resolveConditionDateTiers`, verified in the
original QA pass) and in the previously-broken secondary conditionKey-based merge
path (`mergeTieredDate`, verified in this retest, including under dedupe-LLM-failure
degrade, both occurrence orders, and same-tier ties). `documentDate` extraction is
genuinely extraction-only with no computed substitute. No P10 regression. Typecheck,
lint, and full Jest suite all green, independently reproduced. Bidirectional
section-date search remains intentionally unimplemented, as documented.

Not moving this card to `kb4-DONE` myself, per workflow rules (QAAgent does not move
kanban files) — recommending it to ArchAgent.

**Open item, not a blocker on this QA pass but not yet proven end-to-end:** P11-06's
live browser/OpenRouter acceptance run has still never been performed for this card —
`documentDate` extraction, the whole three-tier resolution against a real LLM's actual
output shape, and the original real-world clustering complaint this card exists to fix
have only ever been verified against mocked LLM responses. Everything mock-provable
has now been proven twice (original QA pass + this retest), including the specific
defect class found in between. Given that this card's own origin was a live-session
discovery that unit tests alone would not have caught, I'd still recommend the live
run before calling the underlying user complaint (implausible date clustering)
resolved in practice — but whether to spend the 25-40 minutes now, given how much
mock-level coverage already exists, is the user's/ArchAgent's call, not mine.
