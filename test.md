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
