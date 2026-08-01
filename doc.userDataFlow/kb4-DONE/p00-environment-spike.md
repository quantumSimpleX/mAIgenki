# P0: Environment Spike

## Scope
Tasks 0.1–0.3 in `doc.userDataFlow/userDataTask.md`, Phase 0 — confirm `pdfjs-dist` Canvas/Blob image capture, IndexedDB Blob storage behavior, and per-page text extraction latency. No schema or app-code changes.

## Out of Scope
Production extraction, image capture, persistence, or UI implementation.

## Dependencies
None. All three tasks are independent of each other and of every other phase.

## Assigned Agents
- ArchAgent:
- DevAgent: DevAgent (this session)
- QAAgent:

## Allowed Files/Directories
Throwaway spike scripts/tests only, plus this card.

## Implementation Checklist

- [ ] P00-01 **Task 0.1 — Confirm `pdfjs-dist` page → Canvas → Blob** — BLOCKED, see below. Not checked off: the environment cannot support this path at all, not a pass.
- [ ] P00-02 **Task 0.2 — Verify IndexedDB Blob storage/retrieval** — BLOCKED, see below. Not checked off: Blob does not round-trip in this Jest environment.
- [x] P00-03 **Task 0.3 — Benchmark per-page text extraction** — done, with a caveat recorded below (fixture is actually single-page despite its filename).

## Acceptance Criteria
Each task has reproducible evidence and an explicit pass/blocker status. Blockers remain unchecked.

## Required Validation
Run the exact checks described by each task; report actual timings/output sizes, not estimates.

## Developer Verification

Commands run (repo root `C:\Users\drmwu\Downloads\_GIT\mAIgenki`, branch `feature/indexeddb-cutover`):

```
npx jest --no-coverage tests/lib/_spike01-pdfjs-canvas-blob.test.ts tests/lib/_spike02-indexeddb-blob.test.ts tests/lib/_spike03-pdf-text-timing.test.ts --verbose
```
Result: 3 suites, 6 tests, all passed (2.885s). Full console evidence below per task.

Full-suite regression check (`npx jest --no-coverage`, no source files changed by this phase): 55/57 suites, 523/526 tests pass. The 2 failing suites (`__tests__/lib/pipeline-process.test.ts`, `__tests__/db/provider-recovery.test.ts`) are pre-existing failures unrelated to this phase — confirmed via `git status --porcelain` (only the 4 new spike files under `tests/lib/` are untracked; no existing file was modified) and `git log` on those two test files (last touched by unrelated prior commits `e98efd0`/`005ddfc`/`69f2fba`). Not investigated further — out of this phase's scope (no schema/app-code changes).

## QA Test Plan

## Implementation Record

Spike files added (throwaway, per card scope — no schema/app-code changes):
- `tests/lib/_spike01-pdfjs-canvas-blob.test.ts`
- `tests/lib/_spike02-indexeddb-blob.test.ts`
- `tests/lib/_spike03-pdf-text-timing.test.ts`
- `tests/lib/_spike03-pdf-text-timing.mjs` (plain Node ESM helper script, invoked by the `.test.ts` above via `child_process.execFileSync` — see Task 0.3 finding for why a Jest-internal import wasn't possible)

### Task 0.1 — `pdfjs-dist` page → Canvas → Blob — **BLOCKED, cannot be exercised in this project's Jest environment at all**

Two independent, stacked blockers, both confirmed with real evidence (not assumed):

1. **The task's premise is wrong: this project's Jest environment is not jsdom.** `jest.config.js` uses `preset: 'jest-expo'`, whose `testEnvironment` resolves to `node_modules/@react-native/jest-preset/jest/react-native-env.js`, which subclasses `jest-environment-node` — a plain Node VM context, not jsdom. Measured directly inside a test in this environment:
   - `typeof document` → `'undefined'`
   - `typeof window` → `'object'` (react-native's preset polyfills a bare `window` global; it is **not** a DOM `Window`, no `document` hangs off it)
   - `typeof HTMLCanvasElement` → `'undefined'`
   - `require.resolve('canvas')` (node-canvas, the usual jsdom `<canvas>` polyfill) → not installed, throws `MODULE_NOT_FOUND`

   There is no `<canvas>` element obtainable in this environment by any means. Constructing one from a fake duck-typed object would not prove anything real, so it wasn't attempted.

2. **Independent of (1): pdfjs-dist's real build cannot even be `import()`ed under this project's Jest config.** `pdfjs-dist` ^6.1.200 ships only `.mjs` builds (`node_modules/pdfjs-dist/package.json`: `"main": "build/pdf.mjs"`, no CJS entry point). `jest.config.js`'s transform only covers `\.[jt]sx?$` via babel-jest; there is no `extensionsToTreatAsEsm` or `.mjs` transform, so Jest's runtime tries to `require()` `pdf.mjs` as CommonJS. The file's own top-level `const require = process.getBuiltinModule("module").createRequire(import.meta.url)` then throws `SyntaxError: Cannot use 'import.meta' outside a module`, reproduced verbatim in the spike test. This is exactly why the project's one existing real test that exercises `extractTextFromPDF`'s web branch (`__tests__/lib/pdf-extract-web.test.ts`) uses `jest.mock('pdfjs-dist/legacy/build/pdf.mjs', ...)` instead of importing the real module — that test was already working around this, not verifying the real integration.

**Conclusion for Phase 4 (per the card's explicit ask):** `renderPageToBlob` (or equivalent) cannot be unit-tested in Jest under this project's current config — neither the Canvas step nor even loading the real `pdfjs-dist` module is reachable there. It requires a real-browser test strategy (e.g. Playwright against `expo start --web`, consistent with `agent-skills:browser-testing-with-devtools` already available in this repo's tooling), not a Jest unit test. This is a structural environment gap, not something fixable inside a throwaway spike's scope — flagging for ArchAgent/Phase 4 planning, not attempting a jest.config.js change here (out of this card's allowed-files scope).

Evidence (from `npx jest --verbose` run above):
```
Spike 0.1: typeof document = undefined
Spike 0.1: typeof window = object
Spike 0.1: typeof HTMLCanvasElement = undefined
Spike 0.1: require.resolve("canvas") succeeded = false
Spike 0.1: real pdfjs-dist import threw = true | message = SyntaxError: Cannot use 'import.meta' outside a module
```

### Task 0.2 — IndexedDB Blob storage/retrieval — **BLOCKED, Blob does not round-trip in this Jest environment**

Wrote a real `fake-indexeddb` object store, `put()` a record containing a real `Blob`, then `get()` it back. Result: `result.image_blob instanceof Blob` is `false`; the value comes back as an empty plain object `{}` (`JSON.stringify` confirms: `{"id":"img-1","image_blob":{},"note":"test"}`) — no `size`, `type`, or `arrayBuffer()`.

Root-caused (via a throwaway probe since removed, not kept as a permanent test): `fake-indexeddb`'s insertion path (`node_modules/fake-indexeddb/build/cjs/lib/cloneValueForInsertion.js`) clones every value with the **global `structuredClone()`**. Reproduced the same failure calling `structuredClone()` on a `Blob` directly, with no `fake-indexeddb` involved at all, inside a Jest test in this environment — `structuredClone(blob) instanceof Blob` is `false`. The identical code (`new Blob(...)`, `structuredClone(...)`) run via plain `node -e` (outside Jest) works correctly and returns a real `Blob`. So this is specific to Jest's per-test-file VM-context isolation under this project's `testEnvironment` (`react-native-env.js` / `jest-environment-node`) — not a `fake-indexeddb` bug, not a general Node bug, and not fixable from within a throwaway spike script. Confirmed no easy workaround: explicitly importing `Blob` from `node:buffer` and using `File` both fail identically.

**Conclusion for Phase 2/4 (per the card's explicit ask):** any future Jest test that writes a `record_images` Blob via `putRecordImage`/`objectStore.put()` and reads it back with `fake-indexeddb` in this project's current Jest config will silently get a broken empty object, not real image bytes — a false pass if the test doesn't assert on the Blob's actual content/size. Flagging for Phase 2's Task 2.11 (`tests/lib/indexedDb.test.ts` Blob round-trip test) and Phase 2's Task 2.10 (JSON export/import round-trip test) — both need this resolved (e.g. a jest config change enabling real jsdom via `testEnvironment: 'jsdom'` for the affected test files, or a documented alternative verification path) before they can be trusted. Not attempted here — jest.config.js changes are outside this card's allowed-files scope.

Evidence (from `npx jest --verbose` run above):
```
Spike 0.2: get() result.image_blob instanceof Blob = false
Spike 0.2: result.image_blob constructor.name = Object
Spike 0.2: JSON.stringify(result) = {"id":"img-1","image_blob":{},"note":"test"}
Spike 0.2: typeof structuredClone = function
Spike 0.2: structuredClone(blob) instanceof Blob = false
```

### Task 0.3 — Benchmark per-page text extraction — done, with a data-quality caveat

Because of Task 0.1's finding #2 (pdfjs-dist's real `.mjs` build cannot load inside Jest at all), the benchmark itself runs as a plain Node ESM script (`_spike03-pdf-text-timing.mjs`, no Jest, no babel transform) invoked from a Jest test via `child_process.execFileSync`, which then asserts on the real numbers the script printed — real evidence with real `expect()` assertions, not an untested console dump.

**Caveat found while measuring:** despite its filename, `.playwright-mcp/maigenki-fixture-multi.pdf` is a single-page, 1265-byte PDF — verified independently by grepping its raw bytes for `/Type /Page` object markers (exactly 1 match) outside of pdfjs entirely. `.playwright-mcp/maigenki-fixture-scanned.pdf` (581 bytes) is also single-page. Neither repo fixture is actually multi-page, so no ~100-page (or even truly multi-page) timing data could be produced from what's in the repo. Measured result on the one page available:

```
Spike 0.3: fixture page count = 1
Spike 0.3: total extraction time (ms) = 26.65
Spike 0.3: per-page times (ms) = [ '26.65' ]
Spike 0.3: avg per-page (ms) = 26.65
Spike 0.3: total extracted chars = 586
```

26.65ms includes full PDF load + parse + one page's `getPage`/`getTextContent` — the fixed per-document overhead dominates a 1-page sample, so this number cannot be used to linearly extrapolate a per-page marginal cost for a 100-page document. **Recommendation stands directionally but is not proven by this data:** Task 3.1 should still default to a length-proportional page-boundary estimate rather than exact per-page tracking, on the general principle that PDF parsing has fixed per-document setup cost plus incremental per-page cost — but the actual scaling curve is unverified. Flagging for ArchAgent: either accept this as a reasonable default without a true multi-page benchmark, or supply/generate a genuinely multi-page (~20-100 page) fixture before Phase 3 commits to a specific latency threshold.

## QA Record

Independent QA pass (different session/agent than DevAgent; branch `feature/indexeddb-cutover`, repo root `C:\Users\drmwu\Downloads\_GIT\mAIgenki`). Every claim below was independently reproduced, not re-read from the Implementation Record.

**1. Spike test re-run.**
```
npx jest tests/lib/_spike01-pdfjs-canvas-blob.test.ts tests/lib/_spike02-indexeddb-blob.test.ts tests/lib/_spike03-pdf-text-timing.test.ts --no-coverage --silent
```
Result: `Test Suites: 3 passed, 3 total. Tests: 6 passed, 6 total.` Matches the card's reported 3/6. Read all three `.test.ts` files plus `_spike03-pdf-text-timing.mjs` line-by-line: assertions are real (`expect(hasDocument).toBe(false)`, `expect(resolved).toBe(false)`, `expect(threw).toBe(true)` + message content check, `expect(result.image_blob instanceof Blob).toBe(false)`, `expect(cloned instanceof Blob).toBe(false)`, numeric timing assertions on real child-process output) — not vacuous/trivially-true.

**2. Root-cause claims, independently verified:**
- `require.resolve('canvas')` — ran standalone (`node -e "require.resolve('canvas')"`): throws `MODULE_NOT_FOUND`. Confirmed not installed.
- `pdfjs-dist` package.json — read `node_modules/pdfjs-dist/package.json` directly: `"main": "build/pdf.mjs"`, no `exports`/`module`/CJS entry field at all. Confirmed ships only `.mjs`.
- `jest.config.js` — read directly: `transform`/`transformIgnorePatterns` cover only `\.[jt]sx?$`-ish via the jest-expo preset; no `extensionsToTreatAsEsm`, no `.mjs` handling. Confirms the `import.meta` failure is structural, not incidental.
- `testEnvironment` — traced `preset: 'jest-expo'` → `node_modules/jest-expo/jest-preset.js` (`require('@react-native/jest-preset')`) → `node_modules/@react-native/jest-preset/jest-preset.js:34`: `testEnvironment: require.resolve('./jest/react-native-env.js')`. Confirmed not jsdom.
- PDF fixtures — independently checked both `.playwright-mcp/maigenki-fixture-multi.pdf` (1265 bytes) and `-scanned.pdf` (581 bytes) via `grep -a -o '/Type */Page[^s]'`: exactly 1 match each. Confirmed both are single-page despite filenames.

**3. Full regression suite.**
```
npx jest --no-coverage
```
Result: `Test Suites: 2 failed, 55 passed, 57 total. Tests: 3 failed, 524 passed, 527 total.` (Card reported 523/526 — the +1 test/+1 pass delta is explained below, not a discrepancy in the failure set.) Failing suites: `__tests__/lib/pipeline-process.test.ts`, `__tests__/db/provider-recovery.test.ts` — exactly the two the card claims, no others. Verified via `git log --oneline -3` on each file that neither was touched by this phase: `pipeline-process.test.ts` last touched by `e98efd0`/`005ddfc`; `provider-recovery.test.ts` last touched by `69f2fba` — both pre-Phase-0 commits, confirming these failures are pre-existing and unrelated to this card's spike files.

**4. Scope check — important finding, not a defect in this card.** `git status --porcelain` at QA time shows `src/lib/db/indexedDb.ts` and `src/lib/llm/enrich.ts` as modified (257 and 30 lines respectively), in addition to the 4 untracked spike files the card lists. This appears to contradict the DevAgent's "no existing file was modified" claim — but tracing it: these two files' diffs match exactly the scope of `doc.userDataFlow/kb2-CODE/p02-schema-Phase-persistence-layer.md` (Phase 2, currently in progress, e.g. `putConditionRecord`, `putIndexedHealthRecord`, `updateIndexedConditionPosition`, `ConditionInputLocation` type — all Phase 2 Task IDs, not Phase 0 scope). This is legitimate concurrent Phase 2 work on the shared `feature/indexeddb-cutover` branch, uncommitted at the time Phase 0's DevAgent ran their check (git status is a point-in-time snapshot — both reports were accurate when taken). Confirmed via `git diff --stat` that the Phase 0 card's own diff is additive-only (4 new files under `tests/lib/` + the card itself); Phase 0 did not cause or touch these two files. No defect for this card — flagging only so ArchAgent is aware Phase 2 is mid-flight on this branch.

**5. Assessment of the blocker classification.** Both Task 0.1 and Task 0.2 blockers are correctly classified, not a workaround-avoidance judgment call. Confirmed firsthand: this Jest environment has no `document`/`HTMLCanvasElement`/`canvas` package, and `structuredClone(blob) instanceof Blob` is independently `false` in this environment (reproduced directly, no `fake-indexeddb` involved). Neither is fixable inside a throwaway spike's allowed-files scope (`jest.config.js`/dependency changes are out of scope). This matches the workflow rule's principle ("classify an untested browser/viewport combination as a blocker, not a pass") — an environment structurally unable to prove a capability is a blocker for that capability, and forcing a pass (e.g., with a fake duck-typed canvas object) would prove nothing real. Correct call.

**Verdict: APPROVE.** All spike assertions are real and reproducible, all root-cause claims independently confirmed, regression failure set matches exactly and is pre-existing, no scope creep by this card, and the blocker classifications are the correct, honest call per the workflow rules.

## Defects and Retests

None.

## Blockers

1. **Task 0.1 cannot be verified in Jest under this project's current config** — no DOM/Canvas available in the configured `testEnvironment`, and pdfjs-dist's real `.mjs` build cannot even be imported there (separate `import.meta` failure). Requires a real-browser test strategy for Phase 4's `renderPageToBlob`, not a Jest unit test. See Implementation Record, Task 0.1.
2. **Task 0.2: Blob values do not round-trip through `fake-indexeddb` in this project's current Jest environment** — root-caused to Node's `structuredClone()` failing to clone `Blob` instances across Jest's per-file VM context in this environment (`jest-environment-node`-based `react-native-env.js`). Affects any future Jest test (Phase 2 Tasks 2.10, 2.11; Phase 4) that asserts on Blob content read back from `fake-indexeddb`. See Implementation Record, Task 0.2.
3. **No genuinely multi-page fixture exists in the repo** — both `.playwright-mcp/maigenki-fixture-multi.pdf` and `-scanned.pdf` are single-page despite their filenames, so Task 0.3's benchmark could not be scaled/verified against a realistic multi-page document. See Implementation Record, Task 0.3.

None of these three items are worked around, hidden, or marked passing — recorded as explicit blockers per the card's instructions.

## Completion

QA-approved. All three tasks independently re-verified with reproduced evidence: Tasks 0.1 and 0.2 are correctly classified as environment blockers (not forced passes), Task 0.3 is done with its fixture-size caveat honestly recorded. No schema/app-code changes from this phase; regression suite shows only the same 2 pre-existing, unrelated failures. ArchAgent should carry the three recorded Blockers forward into Phase 2 (Tasks 2.10/2.11) and Phase 4 planning, since this phase cannot resolve them within its allowed-files scope. Moving to `kb4-DONE`.

## History
- DevAgent: ran Tasks 0.1–0.3, found 2 of 3 blocked by real environment gaps (not jsdom; Blob/structuredClone broken under this Jest config), Task 0.3 done with a fixture-size caveat. Moving card to `kb3-TEST`.
- QAAgent: independently re-ran all spike tests and the full regression suite, independently confirmed every root-cause claim (canvas resolve, pdfjs-dist package.json, jest.config.js transform scope, testEnvironment trace, PDF fixture page counts), confirmed regression failure set is identical and pre-existing, confirmed no scope creep by this card (noted unrelated in-flight Phase 2 changes on the shared branch, not caused by this card), and confirmed the blocker classification is correct. Approved. Moving card to `kb4-DONE`.
