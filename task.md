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
