# mAI Genki — Implementation Tasks (Handoff05)

Reference: `mAIGenki-handoff/project/mAI Genki.dc.html` (authoritative)
Handoff spec: `mAIGenki-handoff/project/maigenki-handoff05_MASTER.md`

Complete tasks in order. Mark each `[x]` when done.

---

## Phase 0 — Foundation

### Task 0.1 — Fix `src/model/conditions.ts`
- [x] Fix `SYSTEM_META.cardiovascular.label`: `'Circulatory'` → `'Cardiovascular'`
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

### Phase 7 QA findings (2026-07-04)

**B-P7-1 — Native Import has no post-restore refresh path** (`src/app/bodymap.tsx` line 1308-1324, `src/lib/db/backup.ts` line 50-85)
Severity: Medium. Impact: on native (iOS/Android), a user who imports a backup gets a
silently stale app — the SQLite write succeeds but nothing re-hydrates the Zustand store
or re-renders `bodymap.tsx`, so the UI keeps showing pre-import data until the app is force-
restarted. Likelihood: only reachable once native builds exist and `db !== null` (currently
web-first, so low likelihood today, but nothing in the code prevents it from firing right
now if a native dev build is used).
Expected (per SPEC.md line 451, "After a successful import on web, the app reloads to
re-hydrate all state") and per repo convention (`IS_WEB` from `@/lib/scale` gates every
other platform-diverging behavior in `bodymap.tsx`, e.g. lines 472, 630, 658, 699, 1580,
1688): either (a) guard the Import button/flow behind `IS_WEB` like every other web-only
affordance in this file, matching the spec's implicit web-only Import scope and the
existing `Platform.OS === 'web'` guard already used for export in `backup.ts:92`, or (b)
add a native-appropriate re-hydration step (e.g. re-run the store's DB-load routine) after
`restoreBackup` resolves on native.
Actual: `handleImport` (bodymap.tsx:1308-1324) calls `restoreBackup(db, backup)`
unconditionally, then only does `if (Platform.OS === 'web') window.location.reload()`
(line 1319) — no `else` branch for native. The Import button itself is enabled whenever
`db` is non-null (line 1445 `disabled={!db}`), with no `IS_WEB` check, unlike every other
platform-diverging UI element in this file.
Recommendation: smallest fix is to also disable/hide the Import (and Export, already
throws but silently via inline error) affordances via `!IS_WEB` until native re-hydration
is implemented, consistent with the "web-first" framing of Phase 7's own task.md heading.

**Status: FIXED (2026-07-04)** — Applied option (a). In `src/app/bodymap.tsx` `SettingsSheet`,
added `const backupAvailable = !!db && IS_WEB`; both `handleExport`/`handleImport` early-return
unless `backupAvailable` (stale-state path can no longer fire on native), and both buttons are
disabled (opacity 0.4) when `!backupAvailable`. Native now shows a "Backup is web-only for now."
hint (the `db === null` case still shows "Storage unavailable — backup disabled."). Verified:
`npm run typecheck` clean, `npx expo lint` no new warnings, `npx jest` full suite 270 passing.

**Note (not a defect):** `restoreBackup`'s DELETE-then-INSERT loop (`backup.ts:58-84`) does
not wrap individual PRAGMA/INSERT calls in the kind of "table absent from live schema"
guard the spec describes (SPEC.md line ~450) as an explicit check — it relies on
`PRAGMA table_info` returning an empty array for a nonexistent table (so `cols.length === 0`
short-circuits the insert loop). This is correct real-SQLite behavior and matches the
schema-drift tests in `__tests__/db/backup.test.ts`, but the equivalent DELETE loop
(`backup.ts:60-62`) issues `DELETE FROM ${t}` for every entry in the hardcoded
`BACKUP_TABLES` regardless of whether it exists live — currently safe only because
`BACKUP_TABLES` is kept in lockstep with `schema.ts`. If a future schema migration drops a
table without updating `BACKUP_TABLES`, `DELETE FROM <dropped-table>` will throw
"no such table" and abort the whole restore transaction. Flagging for awareness; no action
needed today since the two lists are currently in sync (verified against `schema.ts`).

---

## Phase 6 — Condition Dot Position Editor

Tasks must be implemented in order. Mark each `[x]` when done.

### Task 6.1 — Zustand store: relocation state + actions
**File:** `src/store/useAppStore.ts`

Add to `AppState` type (after `uploadBtnsHovered: boolean`):
```ts
relocatingCondition: DesignCondition | null
preRelocationSystems: SystemId[]
```

Add initial values in the `create` body (after `uploadBtnsHovered: false`):
```ts
relocatingCondition: null,
preRelocationSystems: [],
```

Add to `AppActions` type:
```ts
startRelocation: (c: DesignCondition) => void
cancelRelocation: () => void
```

Implement actions:
```ts
startRelocation: (c) => set((s) => ({
  preRelocationSystems: [...s.activeSystems],
  activeSystems: [c.system],
  relocatingCondition: c,
  sheetOpen: false,
  selectedCondition: null,
})),
cancelRelocation: () => set((s) => ({
  activeSystems: [...s.preRelocationSystems],
  relocatingCondition: null,
  preRelocationSystems: [],
})),
```

- [x] Done

---

### Task 6.2 — SQLite query: updateConditionPosition
**File:** `src/lib/db/queries.ts`

Add after `getConditions`:
```ts
export async function updateConditionPosition(
  db: SQLiteDatabase, id: string, cx: number, cy: number,
): Promise<void> {
  await db.runAsync(
    'UPDATE conditions SET cx = ?, cy = ? WHERE id = ?',
    [cx, cy, id],
  )
}
```

- [x] Done

---

### Task 6.3 — useConditions: add refresh callback
**File:** `src/hooks/useConditions.ts`

Change `useConditions` signature from returning `DesignCondition[]` to `[DesignCondition[], () => void]`:

```ts
import { useCallback, useEffect, useState } from 'react'

export function useConditions(): [DesignCondition[], () => void] {
  const [conditions, setConditions] = useState<DesignCondition[]>([])
  const db = useOptionalDatabase()

  const refresh = useCallback(() => {
    if (!db) { setConditions(CONDITIONS); return }
    getConditions(db).then(setConditions).catch(() => setConditions(CONDITIONS))
  }, [db])

  useEffect(() => { refresh() }, [refresh])

  return [conditions.length > 0 ? conditions : CONDITIONS, refresh]
}
```

**Also update the one caller in `src/app/bodymap.tsx`:**
- Find `const conditions = useConditions()` (in `BodyMapScreen`) and change to:
  `const [conditions, refreshConditions] = useConditions()`

- [x] Done

---

### Task 6.4 — Pencil icon in ConditionSheet header
**File:** `src/app/bodymap.tsx` — `ConditionSheet` function

1. Add `startRelocation` to the destructured store values in `ConditionSheet`.

2. In the `!chatOpen` header branch, replace the bare `<Text style={styles.sheetSysLabel}>` with a row that includes a pencil icon. Find this block (around line 937):
```tsx
) : (
  <Text
    style={[styles.sheetSysLabel, meta && { color: meta.color }]}
    numberOfLines={1}
  >
    {meta ? meta.label.toUpperCase() : 'HEALTH ASSISTANT'}
  </Text>
)}
```
Replace with:
```tsx
) : (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: sc(8) }}>
    <Text
      style={[styles.sheetSysLabel, meta && { color: meta.color }]}
      numberOfLines={1}
    >
      {meta ? meta.label.toUpperCase() : 'HEALTH ASSISTANT'}
    </Text>
    {selectedCondition && meta && (
      <TouchableOpacity
        onPress={() => startRelocation(selectedCondition)}
        hitSlop={10}
      >
        <Text style={{ color: meta.color, fontSize: fs(13) }}>✏️</Text>
      </TouchableOpacity>
    )}
  </View>
)}
```

- [x] Done

---

### Task 6.5 — GhostDots: relocation placement mode
**File:** `src/app/bodymap.tsx` — `GhostDots` function

Add `onRelocationPlace?: (cx: number, cy: number) => void` prop to `GhostDots`.

In **both** click handlers, branch on whether `onRelocationPlace` is set:

Web `onClick`:
```ts
onClick: (e: any) => {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const svgX = (e.clientX - rect.left) * 260 / rect.width
  const svgY = (e.clientY - rect.top) * 460 / rect.height
  if (onRelocationPlace) { onRelocationPlace(svgX, svgY) } else { pressNearest(svgX, svgY) }
},
```

Native `onPress`:
```ts
onPress={(e) => {
  const svgX = (e.nativeEvent.locationX / nativeSize.w) * 260
  const svgY = (e.nativeEvent.locationY / nativeSize.h) * 460
  if (onRelocationPlace) { onRelocationPlace(svgX, svgY) } else { pressNearest(svgX, svgY) }
}}
```

- [x] Done

---

### Task 6.6 — handleRelocationPlace + wire everything in BodyMapScreen
**File:** `src/app/bodymap.tsx` — `BodyMapScreen` function

1. Add `relocatingCondition` and `cancelRelocation` to the destructured store.
2. Add `preferredLanguage` to the destructured store (if not already present).
3. Import `updateConditionPosition` from `@/lib/db/queries`.
4. Import `useOptionalDatabase` from `@/lib/db/provider` (if not already imported).
5. Add `const db = useOptionalDatabase()` in `BodyMapScreen`.

6. Add handler after `handleConditionPress`:
```ts
const handleRelocationPlace = useCallback(async (cx: number, cy: number) => {
  if (!relocatingCondition) return
  if (db) await updateConditionPosition(db, relocatingCondition.id, cx, cy)
  await refreshConditions()
  cancelRelocation()
}, [relocatingCondition, db, refreshConditions, cancelRelocation])
```

7. Update `<GhostDots>`:
```tsx
<GhostDots
  conditions={conditions}
  activeSystems={activeSystems}
  onPress={handleConditionPress}
  onRelocationPlace={relocatingCondition ? handleRelocationPlace : undefined}
/>
```

- [x] Done

---

### Task 6.7 — Relocation overlay banner
**File:** `src/app/bodymap.tsx` — inside `bodyAspect` View in `BodyMapScreen`

After `<ConditionRipples .../>`, add the banner (before the closing `</View>` of `bodyAspect`):
```tsx
{relocatingCondition && (() => {
  const rMeta = SYSTEM_META[relocatingCondition.system]
  return (
    <View style={styles.relocationBanner} pointerEvents="none">
      <Text style={[styles.relocationText, { color: rMeta?.color ?? C.aqua }]}>
        Tap to place · {getLocalName(relocatingCondition, preferredLanguage)}
      </Text>
      <TouchableOpacity
        onPress={cancelRelocation}
        hitSlop={10}
        style={{ pointerEvents: 'box-only' } as object}
      >
        <Text style={styles.relocationCancel}>✕</Text>
      </TouchableOpacity>
    </View>
  )
})()}
```

Add styles to `StyleSheet.create`:
```ts
relocationBanner: {
  position: 'absolute', top: sc(12), left: sc(8), right: sc(8),
  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  backgroundColor: 'rgba(10,12,20,0.85)', borderRadius: sc(10),
  paddingHorizontal: sc(14), paddingVertical: sc(8),
},
relocationText: {
  fontFamily: 'BarlowCondensed-SemiBold', fontSize: fs(13),
  flex: 1, letterSpacing: sc(0.3),
},
relocationCancel: {
  fontSize: fs(16), color: 'rgba(255,255,255,0.55)', paddingLeft: sc(12),
},
```

- [x] Done

---

### Task 6.8 — Relocating dot visual (enlarged, full opacity)
**File:** `src/app/bodymap.tsx` — `BodySvg` function

1. Add `relocatingCondition: DesignCondition | null` prop to `BodySvg`.
2. In the dots renderer, update radius and opacity based on relocation state:
```tsx
const isRelocating = relocatingCondition?.id === c.id
<Circle
  key={c.id} cx={c.cx} cy={c.cy}
  r={isRelocating ? 4 : isSelected ? 2.5 : 1.5}
  fill={color}
  pointerEvents="none"
/>
```
3. Pass `relocatingCondition={relocatingCondition}` to `<BodySvg>` in `BodyMapScreen`.

- [x] Done

---

### Phase 6 Verification checklist (run after all tasks done)

- [x] `npm run typecheck` — zero new errors
- [ ] Open condition card → tap ✏️ → sheet closes, only that system layer is active, timeline position unchanged
- [ ] Tap body canvas in relocation mode → dot moves to tapped position, banner disappears, all layers restore to pre-relocation state
- [ ] New dot position persists after app reload (SQLite saved)
- [ ] Tap ✕ in banner → dot stays at original position, layers restore
- [ ] Tap the relocated dot → condition card opens at new position normally

---

## Phase 7 — Backup / Restore (Export + Import, web-first, plain JSON)

Spec: SPEC.md § "Backup & Restore (Export / Import)". Plan: PLAN.md Phase 5.
Tasks must be implemented in order. Mark each `[x]` when done.

### Task 7.1 — Backup module: types + table order
**File:** NEW `src/lib/db/backup.ts`

- [x] `BACKUP_TABLES: readonly string[]` — the 10 tables in FK-safe parent→child order:
  `facilities`, `providers`, `health_records`, `conditions`, `condition_providers`,
  `measurements`, `medications`, `condition_localnames`, `condition_records`, `settings`
  (verify against `src/lib/db/schema.ts`)
- [x] Export type:
  ```ts
  export type BackupFile = {
    app: 'maigenki'
    formatVersion: 1
    exportedAt: string
    tables: Record<string, unknown[]>
  }
  ```
- [x] No new dependencies. Code style: 2-space, single quotes, no semicolons, named exports,
  no `any` (use `unknown` + narrowing).

### Task 7.2 — `buildBackup(db)`
**File:** `src/lib/db/backup.ts`

- [x] `export async function buildBackup(db: SQLiteDatabase): Promise<BackupFile>`
- [x] For each table in `BACKUP_TABLES`: `db.getAllAsync('SELECT * FROM ' + t)` (same read
  style as `queries.ts`), collected into `tables`
- [x] `exportedAt: new Date().toISOString()`

### Task 7.3 — `restoreBackup(db, backup)`
**File:** `src/lib/db/backup.ts`

- [x] `export async function restoreBackup(db: SQLiteDatabase, backup: BackupFile): Promise<void>`
- [x] Validate before any write: `backup.app === 'maigenki'` and `backup.formatVersion === 1`;
  throw a descriptive Error otherwise
- [x] Inside `db.withTransactionAsync`:
  - DELETE all rows from every table in reverse `BACKUP_TABLES` order (children first —
    same ordering principle as `seed.ts` `clearDemoData`)
  - For each table in `BACKUP_TABLES` order (parents first):
    - read live columns via `PRAGMA table_info(<t>)`
    - for each backup row, INSERT using only `Object.keys(row) ∩ liveColumns`
      (schema-drift tolerance: older/newer backups still restore)
    - skip tables absent from the live schema; skip unknown columns silently
- [x] All-or-nothing: any thrown error inside the transaction rolls back

### Task 7.4 — Web file I/O: `exportBackupToFile` + `pickAndReadBackup`
**File:** `src/lib/db/backup.ts`

- [x] `export async function exportBackupToFile(db: SQLiteDatabase): Promise<void>` —
  guard `Platform.OS === 'web'` (throw clear 'not supported on native yet' otherwise);
  `buildBackup` → `JSON.stringify` → `new Blob([json], { type: 'application/json' })` →
  `URL.createObjectURL` → temporary `<a download="maigenki-backup-YYYY-MM-DD.json">` click →
  `URL.revokeObjectURL`
- [x] `export async function pickAndReadBackup(): Promise<BackupFile | null>` —
  `DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true })`
  (same pattern as `index.tsx` PDF pick); return `null` on cancel;
  `fetch(asset.uri).then(r => r.text())` → `JSON.parse` → validate shape (type guard, no `any`)
  → `BackupFile`; throw descriptive Error on malformed JSON / wrong envelope
- [x] Never log backup contents

### Task 7.5 — Settings UI: Backup section in `SettingsSheet`
**File:** `src/app/bodymap.tsx` — `SettingsSheet` (~line 1283)

- [x] Add `const db = useOptionalDatabase()` inside `SettingsSheet` (hook already imported
  at top of file)
- [x] After the Birth/Gender section, before `</Animated.View>`: section label "Backup"
  (existing `settingsSectionLabel` style) + two buttons:
  - **Export backup** → `exportBackupToFile(db)`; errors caught → short inline error text
  - **Import backup** → inline two-step confirm (component state, NO platform dialogs):
    first tap reveals "This replaces all current data — Confirm / Cancel"; Confirm →
    `pickAndReadBackup()` → if non-null `restoreBackup(db, backup)` →
    `window.location.reload()` (web); Cancel resets confirm state
- [x] Both buttons disabled + short note when `db === null` (SQLite unavailable/demo fallback)
- [x] Add styles `backupBtn`, `backupBtnText`, `backupWarn` next to existing settings styles,
  matching existing visual language

### Task 7.6 — Round-trip test
**File:** NEW `__tests__/db/backup.test.ts`

- [x] Follow the existing `__tests__/db` harness (see `__tests__/db/pipeline.test.ts` /
  `queries.test.ts` for the expo-sqlite test setup)
- [x] Round trip: open test DB → `initDatabase` + `seedDemoData` → `buildBackup` →
  mutate (e.g. `updateConditionPosition(htn)`) and/or delete rows → `restoreBackup` →
  assert: htn `cx`/`name_medical` back to backed-up values; per-table row counts equal
  the original backup's
- [x] Envelope validation: `restoreBackup` rejects `{ app: 'other' }` and unknown
  `formatVersion` without touching the DB
- [x] Schema-drift tolerance: a backup row containing an extra unknown column restores
  without error (unknown key skipped)

### Phase 7 Verification checklist (run after all tasks done)

- [x] `npm run typecheck` — zero new errors
- [x] `npx expo lint` — no new warnings in changed files
- [x] `npx jest __tests__/db/backup.test.ts` — all green (5 tests) + full suite `npx jest` 269 passing
- [x] Manual (web dev server): Settings → Export backup downloads `maigenki-backup-*.json`
  containing all 10 tables — PASS (Playwright, 2026-07-04)
- [x] Manual: relocate a demo dot → import a pre-relocation backup → after reload the dot
  is back at the backed-up position — PASS (Playwright, 2026-07-04)
- [x] Manual: import into a freshly-wiped OPFS store → full restore — PASS (Playwright, 2026-07-04)
- [x] Native unaffected (all web file I/O is `Platform.OS === 'web'`-guarded)

---

## Phase 8 — Storage Durability (web): persist() + IndexedDB auto-snapshot + restore-on-heal

Plan: PLAN.md Phase 6. Spec: SPEC.md "Storage Durability (web)". Reuses the Phase 7 backup
module (`buildBackup`/`restoreBackup`/`BackupFile`) wholesale — the snapshot payload IS a
`BackupFile`. Zero runtime dependencies; `fake-indexeddb` as devDependency for tests.

### Task 8.1 — Snapshot module (`src/lib/db/snapshot.ts`, NEW)

- [x] 8.1.1 Minimal promise wrapper over raw IndexedDB (no `idb` package): open DB
  `maigenki-meta` (version 1, `onupgradeneeded` creates object store `snapshots`), plus
  `get`/`put`/`delete` helpers for key `latest`. Value shape:
  `{ savedAt: string (ISO-8601), backup: BackupFile }`
- [x] 8.1.2 Web gate: a single `snapshotAvailable()` check (`Platform.OS === 'web' &&
  typeof indexedDB !== 'undefined'`); every exported entry point no-ops (resolves
  null/undefined) when unavailable — native and jest-without-fake-idb are safe by default
- [x] 8.1.3 `saveSnapshotNow(db: SQLiteDatabase): Promise<void>` — `buildBackup(db)` →
  IDB put under `latest`. All failures caught + `console.warn('[snapshot] ...')`; NEVER
  throws into callers. Must not log snapshot contents (health data)
- [x] 8.1.4 `scheduleSnapshot(db: SQLiteDatabase): void` — module-singleton debounce,
  `SNAPSHOT_DEBOUNCE_MS = 3000`; each call resets the timer; timer fires `saveSnapshotNow`.
  Registers (once) a `pagehide` listener that flushes a pending debounced snapshot
  best-effort
- [x] 8.1.5 `loadSnapshot(): Promise<BackupFile | null>` — IDB get; envelope sanity check
  (`app === 'maigenki'`, `formatVersion === 1`, `tables` object) before returning; returns
  null on missing/invalid/error
- [x] 8.1.6 `clearSnapshot(): Promise<void>` — IDB delete of `latest` (tests + future use)

### Task 8.2 — Provider: persist() + restore-on-heal (`src/lib/db/provider.tsx`)

- [x] 8.2.1 On web setup, fire-and-forget `navigator.storage?.persist?.().catch(() => {})`
  (never blocks open; result may be console.debug-logged, no health data involved)
- [x] 8.2.2 Extract the open/heal sequence from the effect into an exported
  `async function openDatabaseWithRecovery(): Promise<SQLiteDatabase | null>` (same
  behavior; effect body calls it). Exported for direct jest coverage
- [x] 8.2.3 Restore-on-heal: in the CANTOPEN branch, after `wipeOpfsSqliteStore()` and a
  successful retry `openInitSeed()`: `const snap = await loadSnapshot()`; if non-null,
  `await restoreBackup(database, snap)`. On restore failure: `console.warn`, continue with
  the seeded DB (snapshot stays in IDB untouched)
- [x] 8.2.4 Non-heal open failures keep existing behavior exactly (demo fallback, no wipe,
  no restore)

### Task 8.3 — Snapshot trigger wiring (one line per existing write site)

- [x] 8.3.1 `src/lib/pipeline.ts` — `scheduleSnapshot(db)` once after the persist step
  (after the insertHealthRecord/insertCondition/insertMeasurement writes complete)
- [x] 8.3.2 `src/app/bodymap.tsx` — `scheduleSnapshot(db)` after `updateConditionPosition`
  in the relocation drop handler (~line 1567)
- [x] 8.3.3 `src/app/bodymap.tsx` — `await saveSnapshotNow(db)` after `restoreBackup` in
  `handleImport` (~line 1321), BEFORE `window.location.reload()` (page reloads immediately,
  so the debounced path would be lost; also prevents a heal from resurrecting pre-import
  data)
- [x] 8.3.4 `src/hooks/useSettingsPersistence.ts` — `scheduleSnapshot(db)` in each of the
  four `upsertSetting` effects (language, birth_year, birth_month, gender)
- [x] 8.3.5 `src/lib/llm/refresh.ts` — `scheduleSnapshot(db)` after the
  `llm_chain_last_checked` upsert
- [x] 8.3.6 No snapshot on boot/seed (demo data self-rebuilds; nothing user-authored)

### Task 8.4 — Tests (>90% line coverage of new/changed code)

- [x] 8.4.1 Add `fake-indexeddb` to devDependencies (test-only; nothing ships)
- [x] 8.4.2 `__tests__/db/snapshot.test.ts` (fake-indexeddb as `global.indexedDB` +
  the fake-SQLite harness pattern from `__tests__/db/backup.test.ts`):
  - save → load round-trip equals `buildBackup` output
  - debounce collapses rapid `scheduleSnapshot` calls into one save (jest fake timers)
  - `loadSnapshot` returns null when store empty
  - `loadSnapshot` returns null for an invalid envelope (wrong app/formatVersion)
  - `saveSnapshotNow` failure (e.g. IDB put rejects) does not throw
  - all entry points no-op cleanly when `indexedDB` is undefined
- [x] 8.4.3 `__tests__/db/provider-recovery.test.ts` (mock `expo-sqlite`'s
  `openDatabaseAsync`):
  - first open throws CANTOPEN → wipe runs → reopen succeeds → snapshot restored into new DB
  - CANTOPEN with no snapshot in IDB → seeded demo path, no restore call
  - CANTOPEN, snapshot present, but `restoreBackup` throws → provider still returns a
    usable DB (seeded state)
  - non-CANTOPEN failure → demo fallback (null), no wipe, no restore
- [x] 8.4.4 Full suite green (`npx jest`, currently 271 passing) + `npm run typecheck` +
  `npx expo lint` (no new warnings in changed files)

### Phase 8 Verification checklist (run after all tasks done)

- [x] `npm run typecheck` — zero errors
- [x] `npx expo lint` — no new warnings in changed files
- [x] `npx jest` — full suite green including the two new test files
- [x] Coverage of `src/lib/db/snapshot.ts` and changed provider code > 90% lines
- [x] Manual (web dev server): real UI write → past debounce → IDB
  `maigenki-meta/snapshots/latest` contains it — PASS (Playwright live, 2026-07-04)
- [x] Manual: destroy OPFS store → reload → user record + relocated dot survive via
  restore (boot guard; CANTOPEN heal path covered by jest) — PASS (Playwright live, 2026-07-04)
- [x] Manual: `navigator.storage.persisted()` false on automation profile, denial
  logged `[storage] persistent storage denied` — PASS (Playwright live, 2026-07-04)
- [x] Native unaffected: all snapshot entry points no-op off web
- [x] Hard constraints upheld: snapshot never leaves the device, contents never logged

### Phase 8 QA findings (2026-07-04)

Independent QA verification: `npm run typecheck` (0 errors), `npx expo lint` (5 warnings, all
confirmed pre-existing via `git stash` comparison — 0 new in touched files), `npx jest` (286/286
passing), coverage of `snapshot.ts` 96.29% lines and `openDatabaseWithRecovery` 100% lines. Full
results in test.md "Phase 8 overall QA status". Two non-blocking Low-severity findings:

- **B-P8-1** (Low) — `navigator.storage.persist()` denial is silently dropped, not logged.
  - File: `src/lib/db/provider.tsx:68`
  - Expected (per SPEC.md "Storage Durability (web)" §1): "A denial is logged, not treated as
    an error."
  - Actual: `navigator.storage?.persist?.().catch(() => {})` only handles promise *rejection*.
    `navigator.storage.persist()` resolves to a boolean (`false` on denial) — it does not
    reject — so the `.catch()` never fires for a denial and nothing is ever logged, granted or
    denied.
  - Impact: cosmetic/diagnostic only — a denied persistent-storage grant has the same runtime
    behavior either way (eviction risk unchanged from pre-Phase-8). No data-loss or correctness
    risk. But it blocks manual scenario M3 from being observable via console, and the spec's
    explicit requirement isn't met.
  - Recommendation: `navigator.storage?.persist?.().then((granted) => { if (!granted) console.debug('[storage] persistent storage denied') }).catch(() => {})`.
  - **Status: FIXED (2026-07-04)** — `src/lib/db/provider.tsx:68` now chains
    `.then((granted) => { if (!granted) console.debug('[storage] persistent storage denied') })`
    before `.catch(() => {})`, so a resolved `false` (denial) is logged while genuine throws
    are still swallowed. No health data in the log. typecheck/lint/jest all green.

- **B-P8-2** (Low) — Zero automated test coverage for the trigger wiring in `src/app/bodymap.tsx`
  and `src/hooks/useSettingsPersistence.ts`.
  - Files: `src/app/bodymap.tsx:1323` (`saveSnapshotNow` in `handleImport`), `:1571`
    (`scheduleSnapshot` in `handleRelocationPlace`); `src/hooks/useSettingsPersistence.ts:78,85,92,99`
    (one `scheduleSnapshot` call per settings effect)
  - Evidence: `npx jest --coverage --collectCoverageFrom="src/app/bodymap.tsx" --collectCoverageFrom="src/hooks/useSettingsPersistence.ts"` shows `useSettingsPersistence.ts` at 0% (no test file
    exists for this hook at all) and `bodymap.tsx` at ~2.9% lines. `__tests__/screens/bodymap.test.tsx`
    never mocks `useOptionalDatabase` to return a non-null db, so every `if (db) { … }` /
    `if (!backupAvailable || !db) return` guard around these call sites short-circuits and the
    snapshot-trigger lines are never executed by any test.
  - Impact: these are one-line wiring additions and manual/static code review confirms they are
    currently correct (right call, right place, right order relative to `restoreBackup`/reload).
    But there is no regression safety net — a future refactor of `handleImport`,
    `handleRelocationPlace`, or the settings effects could silently drop the snapshot call (e.g.
    reorder `saveSnapshotNow` after `window.location.reload()`) with no test catching it. This
    is consistent with a pre-existing project pattern: `src/app/**` and `src/hooks/**` are
    outside the `jest.config.js` coverage gate (`collectCoverageFrom` only covers `src/lib`,
    `src/model`, `src/store`), so this isn't a regression introduced by Phase 8's own bar, but
    it is a real gap for code this risk-sensitive (data durability).
  - Recommendation: not blocking for this phase given the project's existing coverage-scope
    convention. If addressed, a targeted test mocking `useOptionalDatabase` to return
    `makeFakeDb()` and asserting `scheduleSnapshot`/`saveSnapshotNow` fire at the right call site
    (via `jest.mock('@/lib/db/snapshot')`) would close the gap cheaply.
  - **Status: FIXED (settings hook) / consciously skipped (bodymap) — 2026-07-04.**
    - Settings hook (required minimum): new `__tests__/hooks/useSettingsPersistence.test.ts`
      (2 tests). Mocks `@/lib/db/snapshot`, `@/lib/db/provider` (`useOptionalDatabase` → a stub
      handle), `@/hooks/useConditions`, and `@/lib/db/queries`; renders the hook via
      `renderHook` (RNTL v14) and asserts (a) a `birth_year` change and a `preferred_language`
      change each schedule exactly one snapshot for the db handle, and (b) no snapshot is
      scheduled when the db is `null`. This exercises the wiring at
      `useSettingsPersistence.ts:78/85/92/99`.
    - bodymap call sites (`handleImport` `saveSnapshotNow`, `handleRelocationPlace`
      `scheduleSnapshot`): **consciously skipped.** These are closures inside the `BodyMapScreen`
      component; asserting them requires a full render with a non-null db, plus mocks for the
      document picker, `window.location.reload`, and the relocation gesture flow. The repo's
      screen tests (`__tests__/screens/*.test.tsx`) deliberately avoid full component renders
      due to React 19 / RNTL v14 interop issues, so forcing this would be a brittle, dispro-
      portionate test. The one-line calls were verified by code inspection instead
      (`bodymap.tsx:1323` and `:1571`).

- **B-P8-3** (Medium) — OPFS loss WITHOUT a CANTOPEN heal clobbers the surviving snapshot
  within seconds of boot; restore never fires.
  - Files: `src/lib/db/provider.tsx` (`openDatabaseWithRecovery` success path),
    `src/lib/db/snapshot.ts`
  - Found via live Playwright QA (2026-07-04): corrupted all 6 OPFS pool-file headers to
    induce the wedge. wa-sqlite's VFS did NOT throw CANTOPEN — it self-repaired
    ("Disassociating file with bad digest" / "Remove file with unexpected flags" console
    warnings), silently discarding the old DB and opening a fresh empty one. The app
    reseeded demo data, the settings-hydration effects fired `scheduleSnapshot`, and ~4 s
    after boot the IndexedDB snapshot (containing the pre-loss data) was OVERWRITTEN by a
    demo-only snapshot (observed: pre-loss snapshot savedAt 21:48:54 replaced by 21:51:04).
  - Expected: an OPFS-data-loss event with a surviving IndexedDB snapshot should restore the
    snapshot (the whole point of Phase 8). Actual: restore only runs in the CANTOPEN heal
    branch; the VFS self-repair path (header corruption from e.g. a crash mid-write) loses
    OPFS data with NO error thrown, so the app boots "successfully" empty and immediately
    destroys the last good copy.
  - Impact: none today (demo-only web data), but defeats the feature's purpose for a future
    real user in this scenario. The heal-only scoping assumed OPFS loss always surfaces as
    CANTOPEN or full-origin eviction; live evidence shows a third path.
  - Recommended fix (restore-on-boot guard, small): in `openDatabaseWithRecovery`'s SUCCESS
    path, after `openInitSeed()`: load the snapshot; if the live DB has ZERO non-demo
    `health_records` rows AND the snapshot contains ≥1 non-demo `health_records` row,
    `restoreBackup(db, snap)` before returning (i.e. before any consumer/effect can write or
    re-snapshot). The guard can never overwrite real live user data (only fires when live
    has none), and demo-only snapshots never trigger it. Add tests: boot-with-empty-live +
    user-snapshot → restores; boot with live user data → never restores; demo-only
    snapshot → never restores.
  - **Status: FIXED (2026-07-04)** — `src/lib/db/provider.tsx`: added
    `restoreSnapshotIfBootLostData(database)` called from `openDatabaseWithRecovery`'s
    success path immediately after `openInitSeed()` (before any consumer/effect can write
    or re-snapshot). Guard: snapshot non-null AND snapshot `tables.health_records` has ≥1
    row with `record_type !== 'demo'` AND live `health_records` has none → `restoreBackup`.
    Never throws (internal try/catch + console.warn without data contents), so a guard
    failure cannot turn a successful open into a heal/fallback. Heal-path restore unchanged
    (unconditional after wipe). 5 new tests in `__tests__/db/provider-recovery.test.ts`
    ("restore-on-boot guard (B-P8-3)" describe block) cover: restores when live is empty of
    user records + snapshot has them; never restores over live user data; demo-only
    snapshot ignored; no snapshot ignored; guard restore failure leaves usable seeded DB.
    SPEC.md §3 retitled "Restore-on-heal and restore-on-boot"; PLAN.md Task 6.2 updated.
    typecheck clean, lint no new warnings, full suite 293/293.

---

## Phase 9 — Upload → Pipeline → Bodymap wiring (PLAN Task 2.6) + Phase 3 integration

Plan: PLAN.md Task 2.6 + Phase 3 (3.2 body type inference, 3.3 performance, 3.4 e2e).
User decisions: pdfjs-dist for web PDF extraction; images gated off on web; API key
required before upload, persisted in settings (endpoint stays OpenRouter — hard
constraint; key + model chain user-editable). Out of scope: C.3 female PNG (art asset),
on-device Android profiling, physical-device uploads (user-run residue, see test.md).

### Task 9.1 — Platform-safe extraction

- [x] 9.1.1 `src/lib/pdf/extract.ts`: make the `expo-pdf-text-extract` import dynamic
  (`await import(...)` inside the native branch) so importing the module no longer
  crashes web bundles. Keep return shape `{ text, pageCount, method }` and the
  `MIN_CHARS_PER_PAGE = 50` density check → `method: 'ocr'`
- [x] 9.1.2 Web branch: dynamic `await import('pdfjs-dist')` (legacy build; worker
  disabled or inlined so Metro web bundles it), per-page `getTextContent()` items joined,
  same density check. New runtime dependency `pdfjs-dist`
- [x] 9.1.3 `src/lib/ocr/extract.ts`: dynamic native import; on web throw a clear
  `Error` ("Image OCR is not available on web") — defense in depth behind the UI gate

### Task 9.2 — API key setting (SQLite + two entry points)

- [x] 9.2.1 Settings key `openrouter_api_key` via existing `getSetting`/`upsertSetting`.
  NEVER logged, never sent anywhere except openrouter.ai (existing client fetch)
- [x] 9.2.2 SettingsSheet (bodymap.tsx): "AI model access" section — masked TextInput
  (secureTextEntry), persisted on change/blur, clearable, short hint. Matches existing
  settings section styling
- [x] 9.2.3 `index.tsx`: upload press with no stored key → inline masked key prompt
  (input + Save) in the upload area; Save persists the key then proceeds with the
  pending pick (key required before upload)

### Task 9.3 — Pipeline progress callback + store plumbing

- [x] 9.3.1 `PipelineOptions` += `onProgress?: (phase: 0|1|2|3, progress: number) => void`
  invoked at phase boundaries (extract / redact+enrich / infer / persist) with monotonic
  progress fractions
- [x] 9.3.2 `useAppStore` += `pendingUpload: { uri: string; kind: 'pdf' | 'image' } | null`,
  `lastUploadResult: { recordId: string; conditionCount: number; measurementCount: number } | null`,
  `pipelineError: string | null` + setters (URI flows via store, not route params)

### Task 9.4 — index.tsx wiring

- [x] 9.4.1 PDF/image handlers: on successful pick → key check (9.2.3) →
  `setPendingUpload({ uri, kind })` → `startAnalyze()` → `router.push('/analyzing')`
- [x] 9.4.2 Image column on web: disabled with a "not available on web" note (camera
  column already hidden on web); native keeps full OCR path

### Task 9.5 — analyzing.tsx real progress

- [x] 9.5.1 When `pendingUpload && db`: run `processHealthRecord({ uri, db, apiKey,
  onProgress })`; `onProgress` drives `setAnalyzePhase`/`setAnalyzeProgress` (bar animates
  smoothly toward callback targets). Success → `setLastUploadResult`, clear pendingUpload,
  `router.replace('/bodymap')`
- [x] 9.5.2 `OcrRequiredError` / other pipeline errors → inline error state (message +
  Back button), `setPipelineError`, no bodymap navigation
- [x] 9.5.3 No `pendingUpload` (demo/direct nav) → existing timed animation unchanged;
  `db === null` → "storage unavailable" error state

### Task 9.6 — Bodymap arrival: refresh + result notice + demo prompt

- [x] 9.6.1 Effect keyed on `lastUploadResult`: call `useConditions` `refresh()`
- [x] 9.6.2 Result banner: `conditionCount > 0` → "N conditions added" (dismissible);
  `=== 0` → "No conditions extracted — check the document or your API key in Settings"
- [x] 9.6.3 If `lastUploadResult && isDemoDataPresent(db)`: inline prompt "Remove the
  sample demo data?" [Keep] [Remove]; Remove → `clearDemoData(db)` + `refresh()` +
  `scheduleSnapshot(db)`. Clear `lastUploadResult` once handled

### Task 9.7 — Body type inference module (PLAN Task 3.2)

- [x] 9.7.1 NEW `src/lib/inference/bodyType.ts`: `inferBodyType(conds): 'male' | 'female'
  | 'unknown'` — regex logic moved from `useSettingsPersistence.ts`, `'unknown'` when no
  gendered signal (no silent female default)
- [x] 9.7.2 `useSettingsPersistence` uses it; `'unknown'` + no stored gender → store flag
  `genderPromptNeeded` (no silent default)
- [x] 9.7.3 Bodymap one-time inline gender prompt (♀/♂, settings styling); choice →
  `setGender` + persisted setting, prompt never returns. Reproductive layer stays `-m`
  (C.3 outstanding)

### Task 9.8 — Tests (>90% line coverage of new/changed code)

- [x] 9.8.1 NEW `__tests__/lib/pipeline-process.test.ts`: mock extract modules + LLM
  client; happy path (rows persisted via fake DB harness, counts, onProgress sequence),
  OcrRequiredError path, image path, keyless/empty enrichment → 0-condition record
- [x] 9.8.2 NEW `__tests__/lib/bodyType.test.ts`: male / female / unknown / mixed signals
- [x] 9.8.3 Extraction web branch: mock `pdfjs-dist`; text join + density → 'ocr'
- [x] 9.8.4 Store slice tests: pendingUpload / lastUploadResult / pipelineError setters
- [x] 9.8.5 Settings key persistence test (useSettingsPersistence pattern)
- [x] 9.8.6 Full suite green (`npx jest`, baseline 293) + `npm run typecheck` +
  `npx expo lint` (no new warnings in changed files)

### Task 9.9 — Performance validation (PLAN Task 3.3, automatable scope)

- [x] 9.9.1 Live Playwright web pass: rapid-toggle all 11 layers + zoom/pan; no console — PASS (Playwright live, 2026-07-05)
  errors, no gross jank (long-task check); findings recorded in test.md
- [ ] 9.9.2 On-device Android 60fps profiling: recorded in test.md as user-run residue

### Task 9.10 — E2E flow test (PLAN Task 3.4, automatable scope)

- [x] 9.10.1 Script-generate PDF fixtures (scratchpad): multi-condition text PDF +
  near-empty scanned-style PDF
- [x] 9.10.2 Live Playwright: key prompt on first upload → text PDF → phases advance → — PASS (Playwright live, 2026-07-05)
  bodymap banner; scanned PDF → OcrRequiredError message; demo Remove prompt clears 22
  demo conditions, uploaded rows remain
- [ ] 9.10.3 Real-key LLM extraction + physical-device uploads: user-run residue in
  test.md

### Phase 9 Verification checklist (run after all tasks done)

- [x] `npm run typecheck` — zero errors
- [x] `npx expo lint` — no new warnings in changed files
- [x] `npx jest` — full suite green including new suites
- [x] Coverage of new/changed modules > 90% lines
- [x] Live web: full upload flow works per 9.10.2 — PASS (Playwright live, 2026-07-05)
- [x] Native unaffected: dynamic imports, platform branches (static verification)
- [x] Hard constraints upheld: API key never logged, only sent to openrouter.ai; raw PDFs
  never leave the device (only extracted, redacted text goes to the LLM)

Note (QA, 2026-07-05): coverage is not uniformly >90% — `src/lib/ocr/extract.ts` is 80% lines
(the web-guard throw branch, see B-P9-1) and `src/store/useAppStore.ts` is 88.67% (pre-existing
code, unrelated to Phase 9; new slices are 100%). Independently re-run and confirmed: typecheck
0 errors, lint 4 warnings all pre-existing (no new warnings in touched files, confirmed via
`git stash` baseline diff), jest 314/314 passing.

### Phase 9 QA findings (2026-07-05)

Independent QA pass (code review + re-run automated suites; live browser out of scope for this
pass — that's the orchestrator's Playwright job). No blocking defects; all findings below are
Low or Medium severity and do not gate GREEN status per the review brief, but should be tracked.

**B-P9-1 (Low) — OCR web-guard throw path has zero test coverage**
File: `src/lib/ocr/extract.ts:6-8`. The `Platform.OS === 'web'` defense-in-depth guard
(`throw new Error('Image OCR is not available on web')`) is correct by inspection, but no test
sets `Platform.OS` to `'web'` for this module (contrast with `__tests__/lib/pdf-extract-web.test.ts`,
which does this for the PDF extractor). Coverage report confirms line 7 is never executed
(80% lines / 50% branch on this file). Recommendation: add a 3-line test mirroring the
`pdf-extract-web` pattern — `Object.defineProperty(Platform, 'OS', ...)` then assert the
rejection message.

**Status: FIXED (2026-07-05)** — Added `__tests__/lib/ocr-extract-web.test.ts`: forces
`Platform.OS='web'` and asserts `extractTextFromImage` rejects with
`'Image OCR is not available on web'`. `src/lib/ocr/extract.ts` now reports 100% line coverage.

**B-P9-2 (Low) — No regression test enforces redact-before-enrich ordering**
File: `src/lib/pipeline.ts:82-88`. Code is correct today (`redactPII(text)` runs and its output
`safeText` is what's passed to `enrichFromText`), verified by reading. But
`__tests__/lib/pipeline-process.test.ts` mocks `enrichFromText` unconditionally and never asserts
on what text argument it was called with — so a future refactor that reordered these two lines
(a real risk: this is the exact code path the hard constraints call out) would not be caught by
any automated test. Recommendation: add one assertion — e.g. feed extract-mock text containing a
recognizable PII pattern (a fake SSN or name) and assert `mockEnrich.mock.calls[0][0]` does not
contain it, or assert equality against `redactPII(rawText)`.

**Status: FIXED (2026-07-05)** — Added a case to `__tests__/lib/pipeline-process.test.ts`
("hard constraint: redact before enrich"): the extractor mock returns text containing a fake
`SSN 123-45-6789`; the test asserts `mockEnrich.mock.calls[0][0]` equals `redactPII(raw)` AND does
not contain the raw SSN. Guards against a future reorder of the redact/enrich lines.

**B-P9-3 (Medium) — Pipeline keeps running after analyzing.tsx unmounts; can force-navigate later**
File: `src/app/analyzing.tsx` (the `void (async () => {...})()` IIFE inside the main effect,
~line 185-212). The effect's cleanup only does `clearInterval(smooth)` — it does not cancel or
ignore the in-flight `processHealthRecord` promise. If the component unmounts mid-analysis (e.g.
the user hits the browser Back button, or on web navigates away by URL) while the async work is
still running, the `.then`/`.catch` continuation still fires: on success it calls
`setLastUploadResult`, `setScreen('bodymap')`, and `router.replace('/bodymap')`, silently
overriding wherever the user navigated to. On failure it calls `setPipelineError`/`setErrorMsg`
(the latter is local React state and is simply dropped since the component is gone, but the
Zustand `pipelineError` persists). Likelihood is low (no in-app affordance leaves this screen
mid-run other than the error-state Back button, which only appears after failure), but browser
back-navigation on web is trivially reachable by any user and by definition not gated by the
app's own UI. Recommendation: guard the continuation with an `isMounted`/cancelled flag set in
the effect's cleanup, mirroring the pattern already used elsewhere in this same file (`let
cancelled = false`) and in `bodymap.tsx`'s `isDemoDataPresent` effect.

**Status: FIXED (2026-07-05)** — `src/app/analyzing.tsx`: the async continuation is guarded so it
does not setState/navigate after the screen unmounts (e.g. browser Back). **Correction:** the
initial fix used a `let cancelled` flag set in the effect cleanup, which regressed the happy path
(see B-P9-7 — a `setPendingUpload(null)` dependency-change re-run also fires cleanup, false-
cancelling the in-flight pipeline and hanging at 0%). The corrected implementation uses a
`mountedRef` set false only in a dedicated empty-deps unmount effect, so it distinguishes a true
unmount from a dependency-change re-run. See B-P9-7 for the final approach.

**B-P9-4 (Low) — `pendingUpload` not cleared on the db-null timeout error path**
File: `src/app/analyzing.tsx`, the `db === null` branch (~line 160-173). On timeout it sets
`pipelineError`/`errorMsg` but never calls `setPendingUpload(null)`. The stale pick sits in the
store until overwritten by the next upload attempt. Not currently exploitable (a later successful
upload just overwrites it, and `startedRef` prevents re-processing the stale value on this same
screen instance), but it's inconsistent with the real-pipeline path, which clears it eagerly and
atomically before starting work. Recommendation: clear it in the timeout branch too, for
consistency and to avoid confusing state if inspected via devtools mid-session.

**Status: FIXED (2026-07-05)** — `src/app/analyzing.tsx`: the db-null 5s-timeout branch now calls
`setPendingUpload(null)` before setting the error state, matching the real-pipeline path.

**B-P9-5 (Low) — Demo-seeded gender inference forecloses future automatic inference from real data**
Files: `src/hooks/useSettingsPersistence.ts:63-69`, `src/lib/inference/bodyType.ts`. The
inference effect runs at most once per app session (`genderResolved.current` latches true) and
the demo dataset's `bph` condition deterministically resolves to `'male'` before any real upload
happens. Once `gender` is persisted (even from demo-only inference), a subsequent real upload
with its own gendered signal (e.g. a female-specific diagnosis) is silently ignored — inference
never re-runs and no prompt fires. This is arguably intentional per the "don't clobber a
resolved choice" comment, but the demo dataset is not a user choice — it's bundled sample data
inferring a real setting on the user's behalf without asking. Mitigated: the SettingsSheet has a
manual ♀/♂ toggle so the user can correct it, but users are not prompted to check unless they
already suspect an error. Recommendation (no code change required immediately): consider not
treating demo-derived inference as "resolved" for the purposes of a later real upload — or note
this explicitly as a WONTFIX given the manual override exists.

**Status: WON'T FIX (2026-07-05)** — Demo-seeded inference latching to `'male'` (via `bph`) and
not re-inferring on a later real upload is acceptable. The SettingsSheet ♀/♂ toggle lets the user
correct it, and auto-overriding a possibly-manual choice on every upload is worse than a stable
default the user can adjust. No code change.

**B-P9-6 (Low) — Index key-prompt "Save" silently discards the key and proceeds when `db` is null**
File: `src/app/index.tsx`, `handleSaveKey` (~line 147-158). `if (db) { await upsertSetting(...) }`
— if `db` is null (storage unavailable), the typed key is never persisted, yet `proceed(upload)`
still runs unconditionally, pushing to `/analyzing` where the `db === null` branch will show
"Storage unavailable" after a 5s timeout regardless of the key the user just typed. The user
experience is: type a key, tap Save, wait 5 seconds, get an unrelated storage error, with no
indication their key wasn't saved. Low severity/likelihood (requires DB init failure, an
already-abnormal state), but worth a short-circuit: if `!db`, show a storage-unavailable message
immediately instead of accepting a key that will be silently dropped.

**Status: FIXED (2026-07-05)** — `src/app/index.tsx` `handleSaveKey`: when `db` is null it now sets
an inline `keySaveError` ("Storage unavailable — can't save your key on this device.") shown in the
key prompt and returns early WITHOUT proceeding to `/analyzing`. New `keyPromptError` style; the
error is cleared when a fresh key prompt opens and on a successful save.

**Test-quality note (non-blocking):** `__tests__/lib/pipeline-process.test.ts`,
`__tests__/lib/bodyType.test.ts`, `__tests__/lib/pdf-extract-web.test.ts`, and
`__tests__/store/uploadSlices.test.ts` all assert concrete outcomes (row counts, exact phase
sequences, exact classification, stored/cleared values) rather than "doesn't throw" — good test
quality. The OCR-required-error path (`__tests__/lib/pipeline-process.test.ts`, scenario 4) does
assert no rows persisted, not just that it throws — confirmed by reading the test body. As noted
in the review brief, `analyzing.tsx`'s double-run guard, the demo-remove handler, the gender
prompt, and `index.tsx`'s key prompt have no unit tests of their own (screens are covered only by
existing module-shape smoke tests) — this is a real coverage gap for logic that a reviewer would
otherwise want direct tests for (see B-P9-3's recommendation, which doubles as a test-coverage
fix for the cancellation gap).

- **B-P9-7** (High, REGRESSION from the B-P9-3 fix) — a successful upload hangs forever on
  the analyzing screen at "Reading records / 0%"; the pipeline completes and persists but the
  UI never advances or navigates to bodymap.
  - File: `src/app/analyzing.tsx:161-226` (real-upload effect)
  - Found via live Playwright QA (2026-07-05): uploaded `maigenki-fixture-multi.pdf` with a
    dummy key. Console showed 5× OpenRouter 401 (fallback chain) → extraction+redact+enrich
    all ran; the IndexedDB snapshot's `health_records` became `["demo", null]` — proving the
    uploaded record WAS persisted. Yet the screen stayed frozen at phase 0 / 0% and never
    reached bodymap.
  - Root cause: the effect calls `setPendingUpload(null)` (line 181), and `pendingUpload` is
    in the effect's dependency array (line 223). That state change makes React run the
    effect's cleanup (`cancelled = true`, line 221) immediately, before the re-run. The
    in-flight pipeline continuation then resolves and hits `if (cancelled) return` (line 205),
    so `setAnalyzeProgress(1)` / `setScreen` / `router.replace('/bodymap')` are all skipped.
    The smooth-progress interval was also cleared by the same cleanup, so the bar never eased
    past 0%. The B-P9-3 `cancelled` flag conflates a dependency-change re-run with a real
    unmount.
  - Recommended fix: detect *true unmount* rather than any effect cleanup. Add a dedicated
    `const mountedRef = useRef(true)` with its own `useEffect(() => () => { mountedRef.current
    = false }, [])` (empty deps → cleanup runs only on unmount). Replace the per-effect
    `cancelled` checks in the async continuation and `onProgress` with `!mountedRef.current`.
    Remove the `cancelled = true` side effect from the pipeline effect's cleanup (keep
    `clearInterval(smooth)`), and make the smooth interval self-stop on `!mountedRef.current`
    so a dep-change re-run doesn't kill an in-flight, still-mounted run. This preserves the
    B-P9-3 goal (Back mid-analysis must not setState/navigate) without breaking the happy
    path. Re-verify live: a dummy-key upload must reach bodymap with the "No conditions
    extracted" banner; a real/mocked success must show the "N conditions added" banner.

  **Status: FIXED (2026-07-05)** — Implemented the recommended true-unmount detection in
  `src/app/analyzing.tsx`. Added `const mountedRef = useRef(true)` with a dedicated
  `useEffect(() => () => { mountedRef.current = false }, [])` (empty deps ⇒ cleanup only on real
  unmount). Removed the `let cancelled` flag and the `cancelled = true` side effects from both
  the real-upload effect cleanup and the db-null timeout cleanup (they now only `clearInterval` /
  `clearTimeout`). All post-await guards — inside `onProgress`, after `processHealthRecord`
  resolves, in the `catch`, and in the db-null 5s timeout — now check `!mountedRef.current`. The
  smooth-progress interval self-stops on `!mountedRef.current`, so a `setPendingUpload(null)`
  dependency-change re-run no longer cancels an in-flight, still-mounted pipeline. B-P9-4's
  `setPendingUpload(null)` on the timeout path is retained. typecheck 0 errors; lint no new
  warnings; jest 316/316.
