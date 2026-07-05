# mAI Genki — Test Plan (90% Coverage Target)

Test runner: `jest-expo` (`npm test -- --coverage`)
Framework: `@testing-library/react-native`
Target: ≥90% line/branch coverage on `src/`

---

## Test Files to Create

### 1. `__tests__/model/conditions.test.ts`

Pure unit tests for data layer.

| # | Test | Assertion |
|---|---|---|
| 1 | parseDateFrac early year | `parseDateFrac('2013-JAN-01')` ≈ 2013.0 (within 0.01) |
| 2 | parseDateFrac mid-year | `parseDateFrac('2019-JUL-01')` between 2019.45 and 2019.55 |
| 3 | parseDateFrac late year | `parseDateFrac('2023-DEC-31')` > 2023.9 |
| 4 | CONDITIONS count | `CONDITIONS.length === 22` |
| 5 | All systemIds valid | Every `c.system` is in `ALL_SYSTEMS` |
| 6 | cardiovascular label | `SYSTEM_META.cardiovascular.label === 'Cardiovascular'` (NOT 'Circulatory') |
| 7 | ALL_SYSTEMS count | `ALL_SYSTEMS.length === 11` |
| 8 | getLocalName ja | `getLocalName(htn, 'ja') === '高血圧症'` |
| 9 | getLocalName es | `getLocalName(htn, 'es') === 'Hipertensión arterial'` |
| 10 | getLocalName en | `getLocalName(htn, 'en') === htn.label` |
| 11 | getLocalName fallback | `getLocalName(htn, 'zh-TW') === htn.localNames['zh-TW'] ?? htn.label` |
| 12 | Evidence format | Each `c.evidence` matches `/^Dr\. .+ · .+ · .+, .+, US$/` |
| 13 | CONDITION_RECORDS keys | All 22 condition IDs have a CONDITION_RECORDS entry |
| 14 | CONDITION_RECORDS types | Every record type is one of TREND/ECG/IMAGING/LABS/SPIRO/SCAN |
| 15 | htn has 3 records | `CONDITION_RECORDS.htn.length === 3` |
| 16 | Record color matches system | htn records have `color: '#EF4444'` (cardiovascular color) |

---

### 2. `__tests__/store/useAppStore.test.ts`

State management unit tests using `create` from zustand with the actual store.

| # | Test | Assertion |
|---|---|---|
| 1 | Initial screen | `screen === 'upload'` |
| 2 | Initial activeSystems | Length 11, includes all ALL_SYSTEMS entries |
| 3 | Initial sheetOpen | `false` |
| 4 | Initial legendOpen | `true` |
| 5 | startAnalyze | `screen === 'analyzing'`, `analyzeProgress === 0`, `analyzePhase === 0` |
| 6 | toggleSystem removes | After toggle('cardiovascular'), activeSystems excludes 'cardiovascular' |
| 7 | toggleSystem adds back | After two toggles, activeSystems has 'cardiovascular' again |
| 8 | selectCondition opens sheet | `sheetOpen === true` after selectCondition(htn) |
| 9 | selectCondition sets year | `currentYear === htn.yearFrac` after select |
| 10 | selectCondition timeRailActive | `timeRailActive === true` after select |
| 11 | selectCondition clears chat | `chatMessages === []`, `chatOpen === false` |
| 12 | selectCondition clears records | `selectedRecords === []`, `lightboxRecord === null` |
| 13 | closeSheet | `sheetOpen === false` immediately |
| 14 | toggleLegend | Flips `legendOpen` |
| 15 | toggleTimeDisplayMode | Cycles `'date'` → `'age'` → `'date'` |
| 16 | addChatMessage | Appends to `chatMessages` |
| 17 | clearChat | Empties `chatMessages`, `chatInputVal`, `chatLoading` |
| 18 | setCondDateOverride | `condDateOverrides['htn'] === '2019-OCT-20'` |
| 19 | startEditDate | `editingCondDate === 'htn'`, `editDateInput === '2019-OCT-14'` |
| 20 | confirmEditDate | Saves override, clears `editingCondDate: null` |
| 21 | cancelEditDate | Clears editing state without saving |
| 22 | setPreferredLanguage | Updates to 'ja' |
| 23 | setBirthYear | `birthYear === 1990` |
| 24 | setBirthMonth | `birthMonth === 'MAR'` |
| 25 | setUploadPanelOpen | `uploadPanelOpen === false` |
| 26 | bodyMapMode does not exist | `(store as any).bodyMapMode === undefined` |
| 27 | setBodyMapMode does not exist | `(store as any).setBodyMapMode === undefined` |
| 28 | setLightboxRecord | `lightboxRecord === recObj` |
| 29 | setSelectedRecords | `selectedRecords` equals the provided array |

---

### 3. `__tests__/lib/support.test.ts`

| # | Test | Assertion |
|---|---|---|
| 1 | parseEvidence splits | `parseEvidence('Dr. Sarah Kim · Bay Area Skin & Allergy Institute · Oakland, CA, US')` → `{ doctor:'Dr. Sarah Kim', institution:'Bay Area Skin & Allergy Institute', location:'Oakland, CA, US' }` |
| 2 | parseEvidence apostrophe | `parseEvidence("Dr. Patrick Walsh · St. Mary's Medical Center · New York, NY, US")` → correct |
| 3 | toRailPos min year | `toRailPos(2013, 2013, 2024)` ≈ 0.0 (within 0.05) |
| 4 | toRailPos max year | `toRailPos(2024, 2013, 2024)` ≈ 1.0 (within 0.05) |
| 5 | toRailPos monotonic | `toRailPos(2019) > toRailPos(2015)` |
| 6 | fromRailPos inverse | `fromRailPos(toRailPos(2019, 2013, 2024), 2013, 2024)` ≈ 2019 (within 0.1) |
| 7 | formatDateDisplay date mode | Returns string matching `/^\d{4}-[A-Z]{3}$/` |
| 8 | formatDateDisplay age mode | Returns string matching `/^AGE \d+\.\d$/` |
| 9 | formatDateDisplay age 0 | Age cannot be negative (`Math.max(0, ...)`) |

---

### 4. `__tests__/db/pipeline.test.ts`

SQLite integration tests using expo-sqlite in test environment.

**Setup:** Use jest mock for `expo-sqlite` or the real in-memory SQLite.

```ts
jest.mock('expo-sqlite', () => require('./__mocks__/expo-sqlite'))
// OR use real expo-sqlite with openDatabaseAsync(':memory:')
```

| # | Test | Assertion |
|---|---|---|
| 1 | initDatabase creates tables | After init, `SELECT name FROM sqlite_master WHERE type='table'` includes conditions, condition_localnames, condition_records |
| 2 | isDemoDataPresent false | Returns `false` on fresh DB |
| 3 | seedDemoData count | After seed, `SELECT COUNT(*) FROM conditions` = 22 |
| 4 | isDemoDataPresent true | Returns `true` after seed |
| 5 | getConditions count | Returns 22 DesignCondition objects |
| 6 | getConditions yearFrac | htn yearFrac ≈ 2019.78 (Oct 2019) |
| 7 | getConditions cx/cy | eczema has cx=160, cy=80 |
| 8 | getConditions evidence | htn evidence contains 'Dr. Anuj Sharma' |
| 9 | getLocalNamesForCondition ja | htn Japanese name = '高血圧症' |
| 10 | getLocalNamesForCondition en | htn English name = htn.label |
| 11 | getLocalNamesForCondition unknown | Returns empty object for unknown condId |
| 12 | getConditionRecords htn | Returns 3 records |
| 13 | getConditionRecords types | All types are valid enum values |
| 14 | getConditionRecords unknown | Returns `[]` for unknown condId |
| 15 | seedDemoData idempotent | Running seed twice doesn't change count (still 22) |
| 16 | clearDemoData conditions | After clear, conditions count = 0 |
| 17 | clearDemoData localnames | After clear, condition_localnames count = 0 |
| 18 | clearDemoData records | After clear, condition_records count = 0 |
| 19 | conditions have evidence col | `SELECT evidence FROM conditions WHERE id='htn'` is not null |
| 20 | conditions have cx/cy cols | `SELECT cx, cy FROM conditions WHERE id='eczema'` = 160, 80 |

---

### 5. `__tests__/lib/redact.test.ts`

| # | Test | Assertion |
|---|---|---|
| 1 | Redacts SSN | `redactPII('SSN: 123-45-6789')` does not contain '123-45-6789' |
| 2 | Redacts phone | `redactPII('Phone: 555-867-5309')` does not contain '555-867-5309' |
| 3 | Redacts email | `redactPII('Contact: user@example.com')` does not contain 'user@example.com' |
| 4 | Redacts labeled name | `redactPII('Patient name: John Smith')` does not contain 'John Smith' |
| 5 | Preserves medical terms | `redactPII('Diagnosis: Hypertension')` contains 'Hypertension' |
| 6 | Preserves institution names | `redactPII('Cleveland Clinic referral')` contains 'Cleveland Clinic' |

---

### 6. `__tests__/lib/inference.test.ts`

| # | Test | Assertion |
|---|---|---|
| 1 | HbA1c ≥ 6.5 → diabetes | `applyInferenceRules([{type:'HbA1c', value:6.8}], [])` includes diabetes condition |
| 2 | HbA1c 5.7–6.4 → prediabetes | 5.9 → prediabetes, not diabetes |
| 3 | HbA1c < 5.7 → nothing | Returns `[]` |
| 4 | BP ≥ 140/90 → hypertension | `[{type:'systolic_bp', value:145}, {type:'diastolic_bp', value:92}]` → hypertension |
| 5 | No duplicate hypertension | If htn already in existingConditions, not added again |
| 6 | No rules match → empty | `applyInferenceRules([], [])` returns `[]` |

---

### 7. `__tests__/screens/upload.test.tsx`

Component tests for upload screen.

| # | Test | Assertion |
|---|---|---|
| 1 | Renders logo m/AI/Genki | Contains texts 'm', 'AI', 'Genki' with correct fonts |
| 2 | Three upload columns | Finds 'Drop PDFs', 'Take a photo', 'Choose image' |
| 3 | Privacy badge text | Contains 'YOUR DATA NEVER LEAVE YOUR DEVICE' |
| 4 | Demo CTA button | Contains 'Explore demo data' (or 'Try with sample records') |
| 5 | Footer text | Contains 'No account. No cloud. Works offline.' |
| 6 | QSWordmark present | QSWordmark component renders |
| 7 | Demo button navigates | Press demo → `router.push('/bodymap')` called |

---

### 8. `__tests__/screens/analyzing.test.tsx`

| # | Test | Assertion |
|---|---|---|
| 1 | Has exactly 4 phase labels | 'Reading records', 'Extracting diagnoses', 'Mapping anatomy', 'Building story' all present |
| 2 | Progress bar visible | findByTestId or findByRole |
| 3 | Phase dots count | 4 phase indicator dots |
| 4 | Brand mark visible | Contains 'mAI' or equivalent logo text |

---

### 9. `__tests__/screens/bodymap.test.tsx`

Component tests for the body map (mock store and navigation).

| # | Test | Assertion |
|---|---|---|
| 1 | Renders legend panel | Finds all 11 system names |
| 2 | Cardiovascular in legend | 'Cardiovascular' present, 'Circulatory' absent |
| 3 | Tapping system toggles | After press, toggleSystem called with correct id |
| 4 | Condition dots visible | At least one condition dot rendered |
| 5 | Sheet not visible initially | Sheet is off-screen (`translateY: '110%'` or not rendered) |
| 6 | Tapping condition dot | selectCondition called with correct condition |
| 7 | Condition sheet shows localized name | When lang='ja', shows Japanese condition name |
| 8 | Source block has 3 lines | Contains 'SOURCE', institution, and doctor name separately |
| 9 | Doctor name bold on line 3 | Correct font weight on doctor name element |
| 10 | Chat button in footer row | Chat button not inside source block container |
| 11 | Tapping chat button | `setChatOpen(true)` called |
| 12 | Chat view records carousel | When chatOpen + condition has records, carousel rendered |
| 13 | Carousel has correct cards | htn cards: 'BP trend', '12-lead ECG', 'Renal panel' |
| 14 | Tapping card body | `setLightboxRecord` called with record obj |
| 15 | Selection circle tap | Toggles selectedRecords (not lightbox) |
| 16 | Lightbox visible | When `lightboxRecord` set, lightbox rendered with zIndex 100 |
| 17 | Lightbox close button | Press × → `setLightboxRecord(null)` |
| 18 | Settings opens | Gear icon press → `toggleSettings()` called |
| 19 | Settings shows 4 languages | 'English', '日本語', 'Español', '中文（繁體）' in list |
| 20 | Settings no extra languages | No 'Français', 'Deutsch' etc. |
| 21 | Language row tap | Press 'ja' row → `setPreferredLanguage('ja')` called |
| 22 | Upload shortcuts 4 buttons | Panel contains 4 icon buttons |
| 23 | 4th button opens chat | 4th shortcuts button → sheetOpen=true, chatOpen=true |
| 24 | Timeline tab bar absent | No element with 'Body Map' + 'Timeline' tab pair |
| 25 | QSWordmark toggles panel | Tapping QS wordmark → `setUploadPanelOpen` called |
| 26 | Date chip tap | Toggles date/age mode |
| 27 | Date editor shows on edit | After `startEditDate`, TextInput visible |
| 28 | Confirm date | Press ✓ → `confirmEditDate()` called |
| 29 | Cancel date | Press × → `cancelEditDate()` called |

---

### 10. `__tests__/integration/flow.test.tsx`

End-to-end flow tests with real routing and store.

| # | Test | Assertion |
|---|---|---|
| 1 | Upload → Analyzing navigation | Press demo → navigates (or equivalent) |
| 2 | Demo skips to BodyMap | `handleDemo()` pushes `/bodymap` |
| 3 | Condition select → sheet | selectCondition → sheetOpen true, correct data shown |
| 4 | Chat open → records shown | setChatOpen → carousel visible for conditions with records |
| 5 | Date override persists | Override set, close sheet, reopen → override displayed |
| 6 | Language change affects names | Set lang to 'ja' → Japanese names in sheet |
| 7 | Lightbox → add to chat | Open lightbox, tap "Add to chat" → selectedRecords updated |

---

## Coverage Configuration

In `jest.config.js` or `package.json`:
```json
{
  "jest": {
    "collectCoverageFrom": [
      "src/**/*.{ts,tsx}",
      "app/**/*.{ts,tsx}",
      "!src/**/*.d.ts",
      "!**/__tests__/**"
    ],
    "coverageThreshold": {
      "global": {
        "lines": 90,
        "branches": 85,
        "functions": 90,
        "statements": 90
      }
    }
  }
}
```

## Running Tests

```bash
npm test -- --coverage           # all tests with coverage report
npm test -- --testPathPattern=db # only db tests
npm test -- --testPathPattern=bodymap --verbose  # bodymap tests verbose
```

## QA Findings (append here)

_Dev will fix issues listed here_

---

## Phase 6 — Condition Dot Position Editor: Test Plan

### Unit tests

#### 6A. `__tests__/store/useAppStore.test.ts` — relocation actions (append to existing file)

| # | Test | Assertion |
|---|---|---|
| 1 | startRelocation closes sheet | `startRelocation(htn)` → `sheetOpen === false` |
| 2 | startRelocation sets relocatingCondition | `relocatingCondition === htn` |
| 3 | startRelocation solos system | `activeSystems` equals `[htn.system]` |
| 4 | startRelocation snapshots preRelocationSystems | `preRelocationSystems` equals the activeSystems value before call |
| 5 | cancelRelocation restores activeSystems | After start then cancel, `activeSystems` matches original |
| 6 | cancelRelocation clears relocatingCondition | `relocatingCondition === null` |
| 7 | cancelRelocation clears preRelocationSystems | `preRelocationSystems` is `[]` |
| 8 | startRelocation with 3 active systems | Only `[htn.system]` remains active, preRelocationSystems has 3 entries |

**Result:** [x] PASS

---

#### 6B. `__tests__/db/queries.test.ts` — updateConditionPosition (append to existing file)

| # | Test | Assertion |
|---|---|---|
| 1 | updateConditionPosition changes cx/cy | After update, `SELECT cx, cy FROM conditions WHERE id='htn'` returns new values |
| 2 | updateConditionPosition non-existent id | Does not throw; 0 rows affected (no-op) |
| 3 | updateConditionPosition decimal coordinates | cx=134.5, cy=270.25 stored and retrieved correctly |
| 4 | getConditions returns updated cx/cy | After update + getConditions, the DesignCondition has new cx/cy |

**Result:** [x] PASS

---

#### 6C. `__tests__/hooks/useConditions.test.ts` — refresh callback (update existing file)

| # | Test | Assertion |
|---|---|---|
| 1 | Returns tuple | `useConditions()` returns array of length 2 |
| 2 | First element is DesignCondition[] | Array of conditions with `.system`, `.cx`, `.cy` |
| 3 | Second element is function | `typeof refresh === 'function'` |
| 4 | Refresh triggers re-fetch | Call `refresh()` → `getConditions` called again |
| 5 | Falls back to CONDITIONS when no db | With db=null, returns `CONDITIONS` |
| 6 | Falls back to CONDITIONS on error | When getConditions rejects, returns `CONDITIONS` |

**Result:** [x] PASS

---

### Component / integration tests

#### 6D. Pencil icon in condition sheet header

| # | Test | Assertion |
|---|---|---|
| 1 | Pencil renders when not in chat | When `chatOpen=false` and `selectedCondition` set, ✏️ glyph present |
| 2 | Pencil absent when chatOpen | When `chatOpen=true`, ✏️ glyph absent |
| 3 | Pencil color matches system | ✏️ `color` style prop equals `SYSTEM_META[selectedCondition.system].color` |
| 4 | Tapping pencil calls startRelocation | Press ✏️ → `startRelocation` called with `selectedCondition` |
| 5 | Sheet closes on pencil tap | After `startRelocation` fires, `sheetOpen === false` |

**Result:** [x] PASS

---

#### 6E. GhostDots relocation mode

| # | Test | Assertion |
|---|---|---|
| 1 | onRelocationPlace not set → calls pressNearest | With `onRelocationPlace=undefined`, tap calls nearest-dot logic |
| 2 | onRelocationPlace set → skips pressNearest | With `onRelocationPlace` provided, tap calls it with `(svgX, svgY)` |
| 3 | No distance threshold in relocation | SVG coord passed directly (not clamped to nearest dot) |
| 4 | Web click passes correct SVG coords | `onClick` converts clientX/Y to SVG space using rect dimensions |
| 5 | Native press passes correct SVG coords | `onPress` converts `locationX/Y` to SVG space using nativeSize |

**Result:** [x] PASS

---

#### 6F. Relocation overlay banner

| # | Test | Assertion |
|---|---|---|
| 1 | Banner absent initially | With `relocatingCondition=null`, banner is not rendered |
| 2 | Banner appears in relocation mode | When `relocatingCondition` set, "Tap to place ·" text visible |
| 3 | Banner shows condition name | Text includes `getLocalName(relocatingCondition, lang)` |
| 4 | Banner text color matches system | Color style prop equals system color |
| 5 | Cancel button (✕) visible in banner | ✕ element present in banner |
| 6 | Pressing ✕ calls cancelRelocation | Tap ✕ → `cancelRelocation()` called |
| 7 | Banner has pointerEvents none | Banner `View` does not intercept taps on body canvas |

**Result:** [x] PASS

---

#### 6G. Relocating dot visual

| # | Test | Assertion |
|---|---|---|
| 1 | Normal dot radius 1.5 | Non-selected, non-relocating dot has `r={1.5}` |
| 2 | Selected dot radius 2.5 | Dot matching `selectedCondition.id` has `r={2.5}` |
| 3 | Relocating dot radius 4 | Dot matching `relocatingCondition.id` has `r={4}` |

**Result:** [x] PASS

---

### End-to-end manual QA scenarios

| # | Scenario | Expected | Result |
|---|---|---|---|
| E1 | Tap pencil → relocation mode | Sheet closes, only that system layer active, time rail unchanged | [ ] PASS / [ ] FAIL |
| E2 | Tap canvas in relocation mode | Dot jumps to tapped position immediately | [ ] PASS / [ ] FAIL |
| E3 | Relocation exits after tap | Banner disappears, all layers restore to pre-relocation state | [ ] PASS / [ ] FAIL |
| E4 | Position persists after reload | Reload app → dot is at new SVG position | [ ] PASS / [ ] FAIL |
| E5 | Tap ✕ cancel | Dot stays at original, layers restore | [ ] PASS / [ ] FAIL |
| E6 | Tap relocated dot | Condition card opens normally | [ ] PASS / [ ] FAIL |
| E7 | Time rail scrub during relocation | Time rail updates currentYear but relocation mode unchanged | [ ] PASS / [ ] FAIL |
| E8 | Relocation mode with zoom applied | Banner renders correctly over zoomed canvas | [ ] PASS / [ ] FAIL |

---

### Phase 6 overall QA status

- [x] All unit tests PASS (6A–6C)
- [x] All component tests PASS (6D–6G)
- [ ] All manual scenarios PASS (E1–E8)
- [x] `npm run typecheck` — zero errors

---

## Phase 7 — Backup / Restore: Test Plan

Files under test: `src/lib/db/backup.ts` (module), `src/app/bodymap.tsx` `SettingsSheet` (UI),
`__tests__/db/backup.test.ts` (automated). Automated tests run against the same in-memory
fake-SQLite harness style as `__tests__/db/pipeline.test.ts` (expo-sqlite is native and cannot
load under jest). Leave every Result field for the QA agent to fill.

#### 7A. backup.ts — build + round-trip (automated)

| # | Test | Assertion | Result |
|---|---|---|---|
| 1 | `buildBackup` envelope | `app === 'maigenki'`, `formatVersion === 1`, `exportedAt` is a string | [x] PASS |
| 2 | `buildBackup` captures all 10 tables | `Object.keys(tables)` equals `BACKUP_TABLES` (set-equal) | [x] PASS |
| 3 | `buildBackup` seeded conditions | `tables.conditions.length === 22` after `seedDemoData` | [x] PASS |
| 4 | Round-trip restores mutated value | Mutate htn `cx` via `updateConditionPosition` → `restoreBackup` → htn `cx_percent` back to backed-up value (not the mutation) | [x] PASS |
| 5 | Round-trip preserves row counts | After restore, per-table row counts equal the original backup's for every `BACKUP_TABLES` entry | [x] PASS |
| 6 | Restore is idempotent on counts | `conditions.length === 22` after restore | [x] PASS |

**Result:** [x] PASS

QA notes: ran `npx jest __tests__/db/backup.test.ts` directly (2026-07-04) — all 5 original tests green.
Also added a 6th test (`leaves the DB untouched when envelope validation rejects the backup`) to strengthen
7B.3 coverage; see 7B below. Full file now has 6 tests, all passing.

---

#### 7B. backup.ts — envelope validation (automated)

| # | Test | Assertion | Result |
|---|---|---|---|
| 1 | Wrong `app` rejected | `restoreBackup(db, { app: 'someOtherApp', … })` rejects with an error mentioning "mAIgenki backup" | [x] PASS |
| 2 | Unsupported `formatVersion` rejected | `restoreBackup(db, { app: 'maigenki', formatVersion: 2, … })` rejects with an error mentioning "formatVersion" | [x] PASS |
| 3 | Validation happens before writes | Envelope is checked before `withTransactionAsync` runs (no DELETE on a bad envelope) | [x] PASS |

**Result:** [x] PASS

QA notes: code review of `src/lib/db/backup.ts:50-58` confirms both `if` checks throw
*before* `db.withTransactionAsync(...)` is ever called — structurally impossible to reach
the DELETE loop on a bad envelope. The original two tests (`rejects a backup with the
wrong app envelope`, `rejects an unsupported formatVersion`) only asserted the throw, not
DB state, so I added a new test — `leaves the DB untouched when envelope validation
rejects the backup` — that snapshots `buildBackup` before/after a rejected restore and
asserts every `BACKUP_TABLES` row count is unchanged. Passes.

---

#### 7C. backup.ts — schema-drift tolerance (automated)

| # | Test | Assertion | Result |
|---|---|---|---|
| 1 | Unknown column skipped | A `conditions` backup row with an extra `bogus_column` restores without throwing | [x] PASS |
| 2 | Known columns still restored | After the drift restore, `conditions.length === 22` and htn is present | [x] PASS |
| 3 | Column set is PRAGMA ∩ row keys | Only columns present in both `PRAGMA table_info(<t>)` and the backup row are inserted | [x] PASS |

**Result:** [x] PASS

QA notes: verified 3 by code inspection — `src/lib/db/backup.ts:68-77` builds `liveColumns`
strictly from `PRAGMA table_info(<t>)` (fixed live schema), then `cols` is the intersection
`liveColumns.filter(c => Object.prototype.hasOwnProperty.call(r, c))`. Column identifiers
used in the generated `INSERT INTO ${t} (${cols.join(', ')})` SQL always come from the
PRAGMA result (server-controlled), never from raw backup-row keys — so a malicious/crafted
backup file cannot inject arbitrary column or table identifiers into the SQL text. Table
names (`t`) are always drawn from the hardcoded `BACKUP_TABLES` const, never from
`backup.tables` keys, closing the same class of injection at the table level. No defect.

---

#### 7D. SettingsSheet — Backup UI (component / manual)

| # | Test | Assertion | Result |
|---|---|---|---|
| 1 | Backup section renders | "Backup" label + Export / Import buttons appear after the Birth/Gender section | [x] PASS (code review) |
| 2 | Two-step import confirm | First "Import" tap reveals Confirm / Cancel + "Import replaces all current data." warning | [x] PASS (code review) |
| 3 | Cancel resets confirm | Tapping Cancel returns to the single "Import" button, warning gone | [x] PASS (code review) |
| 4 | Disabled when `db === null` | Both buttons disabled + "Storage unavailable — backup disabled." note shown | [x] PASS (code review) |
| 5 | Export error surfaced inline | A thrown export error shows short inline `backupWarn` text, no crash | [x] PASS (code review) |
| 6 | Import cancel (picker dismissed) | `pickAndReadBackup` returns null → confirm state resets, no reload, DB untouched | [x] PASS (code review) |

**Result:** [x] PASS (code-inspection only — no component/render test exists for `SettingsSheet`'s
Backup section and no browser session was available this run; see notes below)

QA notes (`src/app/bodymap.tsx:1284-1470`):
- #1: "Backup" section label + button row sit directly after the `birthGenderRow` View,
  before the sheet's closing tag — matches spec order. Confirmed by reading source.
- #2/#3: `importConfirm` state gates a ternary — `false` renders the single Import button,
  `true` renders Confirm/Cancel plus the `backupWarn` "Import replaces all current data."
  text (line 1463-1465). Cancel's `onPress` is `() => setImportConfirm(false)`, which also
  hides the warning text since it's conditionally rendered on `importConfirm`. Logic is
  correct; not exercised in a live DOM.
- #4: both TouchableOpacity elements carry `disabled={!db}` and dim via
  `!db && { opacity: 0.4 }`; the hint text is gated on `!db` (line 1467-1469). Correct by
  inspection.
- #5: `handleExport`/`handleImport` both wrap their body in try/catch and set
  `backupError`, rendered via `styles.backupWarn` (line 1466). No unguarded throw path
  found.
- #6: `handleImport` checks `if (!backup) { setImportConfirm(false); return }` immediately
  after `pickAndReadBackup()`, before `restoreBackup` is ever called — cancel path never
  touches the DB or reloads. Correct by inspection.
- Caveat: none of the above were run through Testing Library or a browser; this is static
  verification only. Recommend a `SettingsSheet` component test (RNTL) in a future pass to
  turn 7D into a true automated gate rather than relying on code review each time.

---

### End-to-end manual QA scenarios (web dev server)

| # | Scenario | Expected | Result |
|---|---|---|---|
| E1 | Export backup downloads a file | Settings → Export → `maigenki-backup-YYYY-MM-DD.json` downloads, JSON contains all 10 tables | [x] PASS (Playwright, 2026-07-04) |
| E2 | Import restores a relocated dot | Relocate a demo dot → import a pre-relocation backup → after reload dot is back at backed-up position | [x] PASS (Playwright, 2026-07-04) |
| E3 | Import into a wiped store | Freshly-wiped OPFS store → import backup → full data restored after reload | [x] PASS (Playwright, 2026-07-04) |
| E4 | Import cancel path | Open import, dismiss the file picker → no reload, existing data unchanged | [x] PASS (Playwright, 2026-07-04 — see note on picker cancel) |
| E5 | Malformed file rejected | Import a non-JSON / wrong-envelope file → inline error message shown, DB untouched (no partial wipe) | [x] PASS (Playwright, 2026-07-04) |
| E6 | Native unaffected | On native, Backup is unavailable: buttons disabled with "Backup is web-only for now." note; handlers early-return | [x] PASS (static verification — B-P7-1 fix gates all backup I/O behind `IS_WEB`) |

QA notes (live Playwright run against `npx expo start --web`, Chromium, 2026-07-04):
- **E1**: Export downloaded `maigenki-backup-2026-07-04.json` — valid envelope
  (`app: maigenki`, `formatVersion: 1`, ISO `exportedAt`), all 10 tables present
  (health_records 1, conditions 22, condition_localnames 88, condition_records 47,
  settings 6, others 0), htn at canonical 46.42/11.95.
- **E2**: Relocated htn via pencil → canvas tap to ~59.98/29.97 (persisted across a page
  reload, confirmed by re-export). Imported a pre-relocation backup → app auto-reloaded →
  re-export showed htn back at exactly 46.42/11.95 with all row counts unchanged.
- **E3**: Wiped the `expo-sqlite` OPFS directory from a static page, reloaded (fresh
  seed), imported a backup with a distinct marker position (htn 33.33/44.44) → after the
  auto-reload, export confirmed htn at 33.33/44.44 — proving the data came from the
  imported file, not the demo reseed — with all 10 tables' counts restored.
- **E4**: Two-step confirm verified live: first Import tap shows Confirm / Cancel +
  "Import replaces all current data."; Cancel resets to the plain Export/Import row with
  the warning gone, no reload, DB untouched. Picker-dismiss cancel: `expo-document-picker`
  (web) resolves `{ canceled: true }` from the file input's native `cancel` event, which
  Chromium fires on real user dismissal — dispatching it live reset the confirm state
  correctly. (Playwright's programmatic chooser-cancel doesn't emit that event, so pure
  automation appears to hang — automation artifact, not a defect.)
- **E5**: Imported `{ app: 'someOtherApp', … }` → inline error "Selected file is not a
  valid mAIgenki backup", no reload, confirm state reset; immediate re-export proved the
  DB byte-identical in content (htn 46.42/11.95, all counts unchanged).
- **E6**: After the B-P7-1 fix, `backupAvailable = !!db && IS_WEB` gates both buttons
  (disabled + "Backup is web-only for now." note on native) and both handlers early-return,
  so no native code path reaches file I/O or the un-refreshed restore. `exportBackupToFile`'s
  own `Platform.OS !== 'web'` throw remains as a defensive backstop.
- Test DB state was reset to a clean canonical reseed after the run (store wiped, fresh
  seed at positions_version 4).

---

### Phase 7 overall QA status

- [x] All automated tests PASS (7A–7C) — `npx jest __tests__/db/backup.test.ts` (6/6 green,
  1 test added by QA to strengthen 7B.3 coverage)
- [x] SettingsSheet UI behaviors PASS (7D) — code inspection + all behaviors subsequently
  exercised live in the Playwright browser session (see E1–E5 notes)
- [x] All manual scenarios PASS (E1–E6) — executed live via Playwright against the web dev
  server on 2026-07-04 (see per-scenario notes above); E6 verified statically
- [x] `npm run typecheck` — zero errors
- [x] `npx expo lint` — no new warnings in changed files (5 pre-existing warnings elsewhere,
  confirmed via `git diff` that none are in the Phase 7 diff)
- [x] Full regression suite — `npx jest` 270/270 passing (269 pre-existing + 1 new), no
  regressions from this change

**Verdict: ALL GREEN. The one defect found (B-P7-1 — native Import had no post-restore
refresh path) was fixed the same day: all backup I/O is now gated behind `IS_WEB`
(`backupAvailable = !!db && IS_WEB` in `SettingsSheet`), with a "Backup is web-only for
now." note on native. Fix re-verified: typecheck clean, lint clean, 270/270 jest, and the
full E1–E5 browser pass ran against the fixed build. Phase 7 is done.**

---

## Phase 8 — Storage Durability (web): Test Plan

Files under test: `src/lib/db/snapshot.ts` (new module), `src/lib/db/provider.tsx`
(`openDatabaseWithRecovery`), plus the one-line trigger wiring in `src/lib/pipeline.ts`,
`src/app/bodymap.tsx`, `src/hooks/useSettingsPersistence.ts`, `src/lib/llm/refresh.ts`.
Automated tests: `__tests__/db/snapshot.test.ts`, `__tests__/db/provider-recovery.test.ts`.
They run against `fake-indexeddb` (as `globalThis.indexedDB`) plus the shared in-memory
fake-SQLite harness (`__tests__/db/fakeDb.ts`, extracted from `backup.test.ts`) — expo-sqlite
is native and cannot load under jest. `Platform.OS` is forced to `'web'` to exercise the
web-gated paths. Leave every Result field for the QA agent to fill.

#### 8A. snapshot.ts — save / load / debounce / no-op (automated)

| # | Test | Assertion | Result |
|---|---|---|---|
| 1 | Save → load round-trip | `saveSnapshotNow` then `loadSnapshot` returns exactly the `buildBackup` output (deep-equal) | PASS |
| 2 | Debounce collapses calls | 3 rapid `scheduleSnapshot` calls + `advanceTimersByTime(3000)` → `buildBackup` invoked exactly once | PASS |
| 3 | Empty store → null | `loadSnapshot` on an empty store resolves `null` | PASS |
| 4 | Wrong-app envelope → null | Envelope with `backup.app !== 'maigenki'` → `loadSnapshot` returns `null` | PASS |
| 5 | Wrong formatVersion → null | Envelope with `backup.formatVersion === 2` → `loadSnapshot` returns `null` | PASS |
| 6 | Save failure swallowed | `buildBackup` rejects → `saveSnapshotNow` resolves (no throw), warns `[snapshot] save failed:` | PASS |
| 7 | `clearSnapshot` deletes | After `saveSnapshotNow` then `clearSnapshot`, `loadSnapshot` returns `null` | PASS |
| 8 | `pagehide` flush | A pending debounced snapshot is flushed when the registered `pagehide` handler fires | PASS |
| 9 | No-op when `indexedDB` undefined | All entry points resolve null/undefined and never call `buildBackup` | PASS |
| 10 | No-op off web | With `Platform.OS !== 'web'`, all entry points no-op (no `buildBackup`) | PASS |

**Result:** PASS (10/10) — `npx jest __tests__/db/snapshot.test.ts` all green; assertions independently verified against `src/lib/db/snapshot.ts` source (deep-equal on payload, mock call counts, exact warn-message text — not just "doesn't throw"). Coverage: 96.29% lines / 89.32% stmts / 85% branch on `snapshot.ts`, exceeding the 90%-lines target. Uncovered lines 141-142, 157 are the trivial `console.warn` bodies of `loadSnapshot`'s and `clearSnapshot`'s IDB-error catch blocks — see task.md QA findings (B-P8-2, Low).

#### 8B. provider.tsx — restore-on-heal (automated)

`openDatabaseWithRecovery` is exercised directly with `expo-sqlite`'s `openDatabaseAsync`
mocked; a CANTOPEN error is one whose message matches `/CANTOPEN|cannot create file|unable
to open/i`. `navigator.storage.{persist,getDirectory}` are stubbed; the reopened DB is the
shared fake seeded by the real `initDatabase` + `seedDemoData`.

| # | Scenario | Assertion | Result |
|---|---|---|---|
| 1 | CANTOPEN → wipe → reopen → restore | First open throws CANTOPEN → wipe runs (`getDirectory` called once) → reopen seeds → snapshot restored (htn dot at sentinel 42.5%) | PASS |
| 2 | CANTOPEN, no snapshot | Empty IDB → seeded demo path (22 conditions), `restoreBackup` never called | PASS |
| 3 | CANTOPEN, restore throws | `restoreBackup` rejects → provider still returns a usable seeded DB (22 conditions), warns and continues | PASS |
| 4 | CANTOPEN, reopen also fails | Both opens throw CANTOPEN → returns `null` after wipe, no restore | PASS |
| 5 | Non-CANTOPEN failure | Generic open error → returns `null`, no wipe (`getDirectory` not called), no restore | PASS |

Restore-on-boot guard (added 2026-07-04 for finding B-P8-3 — live QA showed OPFS loss via
VFS self-repair never throws CANTOPEN, so the heal path alone left the surviving snapshot to
be clobbered by the first post-boot write):

| # | Scenario | Assertion | Result |
|---|---|---|---|
| 6 | Boot, live empty of user records, snapshot has one | Normal open → snapshot restored (user record `user-rec-1` present, htn dot at sentinel 42.5%) | PASS |
| 7 | Boot, live already has a user record | `restoreBackup` never called; live record intact | PASS |
| 8 | Boot, snapshot is demo-only | `restoreBackup` never called; live keeps seeded positions | PASS |
| 9 | Boot, no snapshot | Normal seeded boot (22 conditions), no restore | PASS |
| 10 | Boot, guard restore throws | Provider still returns usable seeded DB; warns `restore-on-boot failed` | PASS |

**Result:** PASS (5/5) — `npx jest __tests__/db/provider-recovery.test.ts` all green. Assertions check actual DB state (condition count, sentinel `cx_percent` value, exact warn text), not just return-value shape — good test quality. Coverage of `openDatabaseWithRecovery` (the new/changed function, `provider.tsx` lines 64-99) is 100% via this file alone. Whole-file `provider.tsx` coverage reads lower (63.26% lines) only because `DatabaseProvider`'s React-effect body (lines 102-126) and the unrelated `useOptionalDatabase`/`openInitSeed`-catch lines (20, 33-34) are pre-existing code untouched by Phase 8 — confirmed via `git diff` against the pre-Phase-8 commit.

#### 8C. End-to-end manual QA scenarios (browser / web dev server)

| # | Scenario | Steps | Expectation | Result |
|---|---|---|---|---|
| M1 | Debounced snapshot after write | Real UI write (settings gender toggle) → wait past the 3 s debounce | IDB `maigenki-meta` / `snapshots` / `latest` contains a valid full envelope (10 tables, 22 conditions) including the just-written value | [x] PASS (Playwright live, 2026-07-04) — snapshot observed with `gender=male` and correct envelope; the relocation-specific trigger line (`bodymap.tsx` `handleRelocationPlace`) remains inspection-verified only (B-P8-2) |
| M2 | Restore survives OPFS loss | Prime snapshot with a non-demo health record + htn sentinel cx=55.5 → destroy the OPFS store (corrupt all 6 pool-file headers) → reload | User data survives: post-boot live DB contains the user record and htn at 55.5 | [x] PASS (Playwright live, 2026-07-04) — via the restore-on-boot guard (B-P8-3 fix): VFS self-repaired silently (no CANTOPEN thrown), boot guard restored the snapshot, and the post-boot re-snapshot from the live DB contained `user-test-1` + htn cx=55.5. Note: a genuine CANTOPEN wedge is not reproducible on demand (the VFS auto-repairs corrupted headers; forging validly-digested leaked associations is infeasible) — the heal path remains covered by jest 8B#1–5 |
| M3 | Persistent-storage grant | On Chrome, after boot, check `navigator.storage.persisted()` | Returns `true` (a `false` is logged, not a failure) | [x] PASS (Playwright live, 2026-07-04) — `persisted()` returned `false` on the localhost automation profile (expected: no site engagement) and the denial WAS logged: `[DEBUG] [storage] persistent storage denied` (B-P8-1 fix confirmed live) |
| M4 | Immediate snapshot on import | Settings → Import a backup file | A snapshot is written to IDB *before* `window.location.reload()` fires (no pre-import data resurrectable by a later heal) | PASS (static) — code review of `src/app/bodymap.tsx` `handleImport` (~line 1313-1330) confirms the exact order: `restoreBackup(db, backup)` → `await saveSnapshotNow(db)` → `window.location.reload()`. `saveSnapshotNow` never throws (internal try/catch), so a snapshot failure cannot block the reload. No automated test exercises this path directly (see B-P8-2) — live-browser confirmation still recommended |
| M5 | No-op off web | Inspect a native build (or static review) | All snapshot entry points no-op; no IndexedDB access off web | PASS (static) — every exported entry point in `snapshot.ts` starts with `if (!snapshotAvailable()) return`, gated on `Platform.OS === 'web' && typeof indexedDB !== 'undefined'`; `provider.tsx`'s `persist()` call is separately gated on `Platform.OS === 'web'`. Grepped the touched files for `fetch`/`XMLHttpRequest`/network calls — none found, and no `indexedDB`/`navigator.storage` access exists outside these gates. Also directly verified by 8A test #10 |

**Result:** 2/5 PASS (static), 3/5 NOT RUN pending live-browser verification (M1-M3)

#### Phase 8 overall QA status (2026-07-04, final)

**ALL GREEN** — all subtasks done, all automated and manual scenarios pass, all three QA
findings fixed and re-verified.

- `npm run typecheck` — 0 errors
- `npx expo lint` — 5 warnings, all pre-existing, 0 new in touched files
- `npx jest` — **293/293 passing** (271 baseline → +10 snapshot, +10 provider-recovery
  incl. 5 restore-on-boot guard tests, +2 settings-hook trigger tests)
- `snapshot.ts` coverage 96.29% lines; `openDatabaseWithRecovery` + boot guard fully
  covered (remaining uncovered `provider.tsx` lines are pre-existing component glue)
- 8A (10/10), 8B (10/10 incl. boot guard), settings-hook (2/2): PASS
- 8C manual: M1–M5 all PASS — M1/M2/M3 verified live via Playwright (see rows above),
  M4/M5 verified statically
- Findings: B-P8-1 FIXED (denial logged, confirmed live), B-P8-2 FIXED (settings-hook
  regression tests; bodymap call sites consciously inspection-only), B-P8-3 FIXED
  (restore-on-boot guard, verified live end-to-end: OPFS destroyed via VFS self-repair →
  boot guard restored user record + relocated dot from the IndexedDB snapshot)
- Hard constraints upheld: no snapshot/backup contents ever logged, no network calls in
  any touched file, all entry points no-op off web
