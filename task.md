# mAI Genki — Implementation Tasks (Handoff05)

Reference: `mAIGenki-handoff/project/mAI Genki.dc.html` (authoritative)
Handoff spec: `mAIGenki-handoff/project/maigenki-handoff05_MASTER.md`

Complete tasks in order. Mark each `[x]` when done.

---

## Phase 0 — Foundation

### Task 0.1 — Fix `src/model/conditions.ts`
- [x] Fix `SYSTEM_META.cardio.label`: `'Circulatory'` → `'Cardiovascular'`
- [x] Keep `SupportedLang` as `'en' | 'zh-TW' | 'ja' | 'es'` (4 langs this iteration)
- [x] Update all 22 `evidence` strings to `'Dr. FirstName LastName · Institution · City, ST, US'` format:
  - eczema: `'Dr. Sarah Kim · Bay Area Skin & Allergy Institute · Oakland, CA, US'`
  - psoriasis: `'Dr. Meera Patel · St. Claire Medical Center · Boston, MA, US'`
  - fibro: `'Dr. Luis Torres · Northwestern Memorial Hospital · Chicago, IL, US'`
  - rotator: `'Dr. James Nguyen · Virginia Mason Medical Center · Seattle, WA, US'`
  - disc: `'Dr. Richard Okafor · Houston Methodist Hospital · Houston, TX, US'`
  - osteo: `'Dr. Christine Lee · Oregon Health & Science University · Portland, OR, US'`
  - htn: `'Dr. Anuj Sharma · Cleveland Clinic · Cleveland, OH, US'`
  - afib: `'Dr. Patrick Walsh · St. Mary\'s Medical Center · New York, NY, US'`
  - lymph1: `'Dr. Emily Brennan · Penn Medicine · Philadelphia, PA, US'`
  - mono: `'Dr. Thomas Park · University of Michigan Health · Ann Arbor, MI, US'`
  - migraine: `'Dr. Nina Rodriguez · Cedars-Sinai Medical Center · Los Angeles, CA, US'`
  - carpal: `'Dr. Fumiko Yamamoto · El Camino Health · San Jose, CA, US'`
  - asthma: `'Dr. Brian Chen · UCHealth Medical Center · Denver, CO, US'`
  - covid: `'Dr. Marcus Johnson · St. David\'s Medical Center · Austin, TX, US'`
  - gerd: `'Dr. Harpreet Singh · Emory University Hospital · Atlanta, GA, US'`
  - ibs: `'Dr. Olivia Murphy · Massachusetts General Hospital · Boston, MA, US'`
  - stones: `'Dr. Kevin Williams · Northwestern Memorial Hospital · Chicago, IL, US'`
  - uti: `'Dr. Divya Patel · Valleywise Health Medical Center · Phoenix, AZ, US'`
  - thyroid: `'Dr. Yuna Kim · Mayo Clinic Health System · Minneapolis, MN, US'`
  - vitd: `'Dr. Brian Chen · UCHealth Medical Center · Denver, CO, US'`
  - fibroid: `'Dr. Adaeze Obi · George Washington University Hospital · Washington, DC, US'`
  - pcos: `'Dr. Sachi Nakamura · UCSF Medical Center · San Francisco, CA, US'`
- [x] Add `ConditionRecord` type:
  ```ts
  export type ConditionRecord = {
    id: string
    type: 'TREND' | 'ECG' | 'IMAGING' | 'LABS' | 'SPIRO' | 'SCAN'
    label: string
    date: string
    color: string
  }
  ```
- [x] Add `CONDITION_RECORDS: Record<string, ConditionRecord[]>` with all 22 conditions
- [x] Update note text for all 22 conditions to match HTML reference (longer clinical notes with treatment detail)

### Task 0.2 — Update `src/store/useAppStore.ts`
- [x] Remove `bodyMapMode: BodyMapMode` state field and `BodyMapMode` type
- [x] Remove `setBodyMapMode` action
- [x] Add state fields:
  - `editingCondDate: string | null` (defaults to `null`)
  - `editDateInput: string` (defaults to `''`)
  - `dragging: boolean` (defaults to `false`)
  - `uploadBtnsHovered: boolean` (defaults to `false`)
- [x] Fix `selectedRecords` type: `string[]` → `ConditionRecord[]` (import from conditions.ts)
- [x] Fix `lightboxRecord` type: `string | null` → `ConditionRecord | null`
- [x] Update `selectCondition(c)` action: sets `currentYear: c.yearFrac`, `timeRailActive: true`, clears `selectedRecords: []`, `lightboxRecord: null`, `chatMessages: []`, `chatOpen: false`
- [x] Update `closeSheet()` action: immediately set `sheetOpen: false`, delay 340ms then clear `selectedCondition: null`, `chatOpen: false`, `chatMessages: []`, `editingCondDate: null`
- [x] Add actions:
  - `startEditDate(condId: string, date: string)`: `editingCondDate: condId, editDateInput: date`
  - `confirmEditDate()`: save override via `setCondDateOverride`, clear editing state
  - `cancelEditDate()`: clear `editingCondDate: null, editDateInput: ''`
  - `setUploadBtnsHovered(h: boolean)`: update `uploadBtnsHovered`
  - `setDragging(d: boolean)`: update `dragging`
  - `setLightboxRecord(r: ConditionRecord | null)`: update `lightboxRecord`
  - `setSelectedRecords(records: ConditionRecord[])`: update `selectedRecords`

---

## Phase 1 — Upload Screen (`app/index.tsx`)

### Task 1.1 — Minor content fixes
- [x] Upload strip text: `"Health records, discharge forms, lab results, imaging reports, etc."` (Barlow Condensed, color `#1A9E8A`, 13px)
- [x] Privacy badge text: `"YOUR DATA NEVER LEAVE YOUR DEVICE"` (uppercase, Source Code Pro 11px)
- [x] Add sample conditions preview below footer: `"9 conditions | 7 organ systems | 2015 — 2024"` (Barlow Condensed 400, 11px, `#1A9E8A`, opacity 0.6)

---

## Phase 2 — Analyzing Screen (`app/analyzing.tsx`)

### Task 2.1 — Fix phases and visual
- [x] Change phases from 5 → 4: `['Reading records', 'Extracting diagnoses', 'Mapping anatomy', 'Building story']`
- [x] Fix progress tick: `phase = Math.min(3, Math.floor(progress * 4))`
- [x] Replace headline text `"Analyzing\nrecords…"` with `"mAI Genki"` split logo (same m/AI/Genki font split as upload screen) using `Logo` component or inline
- [x] Fix progress bar gradient: replace solid purple with `#8A60EB → #1FC3A4` gradient (use a LinearGradient wrapper or SVG rect)
- [x] Phase label format: phase name + below it `"${pct}% — processing on-device"` (Source Code Pro 12px, `#3A434F`)
- [x] Phase dots: 4 dots in a flex row, each has a dot (8px circle) + text label below. Active = `#8A60EB`, complete = `#1FC3A4`, pending = `#1E2535`
- [x] Add stroke-dashoffset reveal animation on body silhouette path (use `Animated.timing` on a value, pass via `strokeDashoffset` prop to SVG `Path` using `Svg.Animated`)
- [x] Add 7 condition dot blinking SVG circles on the silhouette, staggered `dot-blink` animation

---

## Phase 3 — Body Map Screen (`app/bodymap.tsx`)

### Task 3.1 — Remove timeline tab bar
- [x] Delete the "Body Map | Timeline" tab bar component (the View containing two tab buttons)
- [x] Delete all reads of `bodyMapMode` from the store
- [x] Delete `onBodyMapTab`, `onListTab` (or equivalent tab handler functions)
- [x] Delete the Timeline List view overlay JSX and its styles
- [x] Body canvas now renders directly below the top bar — no tab switching

### Task 3.2 — Fix condition sheet dismissal animation
- [x] Replace `sheetAnim` height-based animation with `translateY` approach:
  - Create `sheetTranslateY = useRef(new Animated.Value(1)).current` (1 = off-screen)
  - When sheet opens: animate to 0
  - When sheet closes: animate to 1 (then on complete, clear selected condition)
  - Use `style={{ transform: [{ translateY: sheetTranslateY.interpolate({ inputRange:[0,1], outputRange:['0%','110%'] }) }] }}`
- [x] Sheet height: 400px when `!chatOpen`, 780px when `chatOpen` (animate height change too)
- [x] Border radius: `18px 18px 0 0` when detail, `0` when full chat
- [x] Transition: 420ms `cubic-bezier(0.16,1,0.3,1)` — use `Easing.bezier(0.16,1,0.3,1)`

### Task 3.3 — Fix source block to 3-line layout
- [x] Parse evidence string: `const [doctor, institution, location] = c.evidence.split(' · ')`
- [x] Remove old single-line evidence text and file icon
- [x] Render 3 lines:
  - Line 1: `"SOURCE"` (Barlow Condensed 600, 10px, rgba(255,255,255,0.2), uppercase, 0.18em tracking) + `" · "` + location (SCP 10px, rgba(255,255,255,0.32))
  - Line 2: institution (SCP 10px, rgba(255,255,255,0.32))
  - Line 3: doctor name (SCP 700, 13px, rgba(255,255,255,0.65)) + email SVG icon (aqua #1FC3A4, 15px, no background) + phone SVG icon (aqua #1FC3A4, 15px, no background)

### Task 3.4 — Relocate chat button to footer row
- [x] Move the "Ask AI" / chat button out of the source block area
- [x] Place it in a new footer row: `flexDirection:'row', justifyContent:'flex-end', marginTop:16`
- [x] Button: `#8A60EB` bg, 36×36px, borderRadius:8, chat-bubble SVG icon (14×14, white stroke)

### Task 3.5 — Inline date editor for condition date
- [x] When `editingCondDate === c.id`, show:
  - TextInput (fontFamily:'SourceCodePro', color:'#1FC3A4', width:160, inline)
  - ✓ confirm button (tap → `confirmEditDate()`)
  - × cancel button (tap → `cancelEditDate()`)
- [x] When not editing, show:
  - Calendar icon (aqua, 13px) + `"First noted YYYY-MMM-DD"` text
  - Pencil icon button (tap → `startEditDate(c.id, displayDate)`)

### Task 3.6 — Upload shortcuts: add AI chat (4th button)
- [x] Remove "Add records" button (+ button, aqua cross) if present
- [x] Panel now has exactly 4 buttons:
  1. PDF icon (amethyst stroke) → `startAnalyze()`
  2. Camera icon (aqua stroke) → `startAnalyze()`
  3. Image icon (amethyst stroke) → `startAnalyze()`
  4. AI Chat: 28×28px, `rgba(138,96,235,0.12)` bg, `rgba(138,96,235,0.3)` border, chat-bubble icon (`#8A60EB`) → opens general health chat
- [x] `uploadBtnsHovered` drives opacity: `!uploadPanelOpen ? 0 : uploadBtnsHovered ? 0.85 : 0.2`

### Task 3.7 — Records carousel (full implementation)
- [x] Import `CONDITION_RECORDS` from `src/model/conditions.ts`
- [x] Show carousel only when `chatOpen && condRecords.length > 0`
- [x] Horizontal ScrollView with cards 117×74px, borderRadius:6
- [x] Card tap → `setLightboxRecord(rec)` + exclusively select: `setSelectedRecords([rec])`
- [x] Selection circle (18×18, absolute top-right) → toggle selected
- [x] `renderRecordThumb(rec, w, h)` — SVG thumbnails for all 6 record types (TREND, ECG, IMAGING, LABS, SPIRO, SCAN)

### Task 3.8 — Full-screen record lightbox
- [x] When `lightboxRecord !== null`, render absolute overlay `position:'absolute', inset:0, zIndex:100`
- [x] Background: `rgba(10,12,20,0.96)`
- [x] Top: type badge + × close button
- [x] Center: enlarged thumbnail via `renderRecordThumb(lightboxRecord, 358, 226)`
- [x] Below: label + date
- [x] Bottom: "Add to chat" / "✓ In chat" toggle button
- [x] Tap-anywhere backdrop → `setLightboxRecord(null)`

### Task 3.9 — Settings: 4-language list layout
- [x] Replace pill grid with vertical list (ScrollView, maxHeight:224)
- [x] 4 languages: en (🇺🇸), zh-TW (🇹🇼), ja (🇯🇵), es (🇪🇸)
- [x] Each row: flag | native name | English name | ✓ checkmark
- [x] Selected row: amethyst 3px left border + tint background
- [x] Tap row → `setPreferredLanguage(code)`

### Task 3.10 — Chat input and system prompt
- [x] Input placeholder: dynamic based on selectedRecords / selectedCondition / general
- [x] System prompt: condition + selected records context + 1–3 sentence instruction

---

## Phase 4 — SQLite Pipeline

### Task 4.1 — Fix schema (`src/lib/db/schema.ts`)
- [x] Add missing columns to conditions table DDL: `evidence TEXT`, `cx REAL`, `cy REAL`, `year_frac REAL`
- [x] ALTER TABLE in try/catch for schema migration
- [x] `condition_localnames` table: `(cond_id TEXT, lang TEXT, name TEXT, PRIMARY KEY(cond_id, lang))`
- [x] `condition_records` table: `(id TEXT PRIMARY KEY, cond_id TEXT, type TEXT, label TEXT, date TEXT, color TEXT)`

### Task 4.2 — Fix seed (`src/lib/db/seed.ts`)
- [x] `seedDemoData(db)` inserts 22 CONDITIONS into conditions + condition_localnames + condition_records
- [x] Idempotent via `INSERT OR IGNORE`
- [x] `clearDemoData(db)` also clears `condition_localnames` and `condition_records`

### Task 4.3 — Complete `src/lib/db/queries.ts`
- [x] `getConditions(db): Promise<DesignCondition[]>`
- [x] `getLocalNamesForCondition(db, condId): Promise<Partial<Record<SupportedLang, string>>>`
- [x] `getConditionRecords(db, condId): Promise<ConditionRecord[]>`

### Task 4.4 — Create `src/hooks/useConditions.ts`
- [x] `useConditions()`: loads from SQLite, falls back to hardcoded `CONDITIONS`
- [x] `useConditionRecords(condId)`: loads from SQLite, falls back to `CONDITION_RECORDS[condId]`

### Task 4.5 — Wire body map to use `useConditions`
- [x] `app/bodymap.tsx` uses `useConditions()` hook instead of direct `CONDITIONS` import
- [x] `SQLiteProvider` wraps app in `app/_layout.tsx`

---

## Phase 5 — Support Utility (`src/lib/support.ts`)

### Task 5.1 — Create support utilities
- [x] `parseEvidence(ev: string): { doctor, institution, location }`
- [x] `toRailPos(yearFrac, minYear, maxYear, K=2.5): number` — log-scale 0..1
- [x] `fromRailPos(pos, minYear, maxYear, K=2.5): number` — inverse
- [x] `formatDateDisplay(yearFrac, mode, birthYear, birthMonth): string`

---

## Bugs Found by QA (append here)

_QA subagent will append failing test descriptions here for dev to fix_

### Found 2026-06-28

**B1 — eczema note missing connectors** (`src/model/conditions.ts` line 72)
HTML: `'Chronic eczema with flares on forearms and neck. Managed with topical corticosteroids and emollients.'`
Impl: `'Chronic eczema flares on forearms neck. Managed topical corticosteroids emollients.'`

**B2 — eczema medName wrong** (`src/model/conditions.ts` line 69)
HTML: `'Atopic dermatitis with eosinophilia'`
Impl: `'Atopic dermatitis (ICD-10: L20)'`

**B3 — psoriasis note missing connectors** (`src/model/conditions.ts` line 81)
HTML: `'Moderate plaque psoriasis on elbows and knees. On methotrexate 15mg weekly with good response.'`
Impl: `'Moderate plaque psoriasis on elbows knees. On methotrexate 15mg weekly good response.'`

**B4 — fibro note missing connectors** (`src/model/conditions.ts` line 90)
HTML: `'Widespread musculoskeletal pain with fatigue and sleep disturbance. On duloxetine 60mg and graded exercise.'`
Impl: `'Widespread musculoskeletal pain fatigue sleep disturbance. On duloxetine 60mg graded exercise.'`

**B5 — asthma medName wrong** (`src/model/conditions.ts` line 177)
HTML: `'Mild persistent asthma (GINA step 2)'`
Impl: `'Moderate persistent asthma (ICD-10: J45.1)'`

**B6 — carpal note missing connector** (`src/model/conditions.ts` line 171)
HTML: `'Right median nerve compression confirmed on NCS. Night splints and corticosteroid injection. Awaiting surgical consult.'`
Impl: `'Right median nerve compression confirmed on NCS. Night splints corticosteroid injection. Awaiting surgical consult.'`

**B7 — ibs note missing connector** (`src/model/conditions.ts` line 207)
HTML: `'IBS-mixed type diagnosed per Rome IV criteria. Low-FODMAP diet with partial response. Mebeverine PRN.'`
Impl: `'IBS-mixed type diagnosed per Rome IV criteria. Low-FODMAP diet partial response. Mebeverine PRN.'`

**B8 — uti note missing connector** (`src/model/conditions.ts` line 225)
HTML: `'Three culture-confirmed UTIs in 12 months. E. coli predominant. Post-coital prophylaxis with nitrofurantoin.'`
Impl: `'Three culture-confirmed UTIs in 12 months. E. coli predominant. Post-coital prophylaxis nitrofurantoin.'`

**B9 — migraine note missing connector** (`src/model/conditions.ts` line 162)
HTML: `'Chronic migraine with visual aura, 4–6 episodes/month. On topiramate 50mg daily.'`
Impl: `'Chronic migraine visual aura, 4–6 episodes/month. On topiramate 50mg daily.'`

**B10 — TypeScript errors in test files** (implicit `any` params)
5 errors in `__tests__/screens/analyzing.test.tsx`, `__tests__/screens/bodymap.test.tsx`, `__tests__/screens/upload.test.tsx` — parameter types not annotated. Runtime/production code unaffected.
