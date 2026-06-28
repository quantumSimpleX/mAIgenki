# mAI Genki — Project Handoff 03
**Date:** June 23, 2026  
**File:** `mAI Genki.dc.html`  
**Design system:** QSXC designSys (bound at `_ds/qsxc-designsys-609610ba-6924-415c-8ab5-533e3cf06c97/`)

---

## Sessions 01–02 recap
See `maigenki-handoff01.md` and `maigenki-handoff02.md`.  
Core: upload → analyzing → body map with 11 organ systems, 22 conditions, log-scale time rail, condition detail sheet.

---

## Session 03 changes

### 1. DOB / gear / date-pill interaction
- **Gear icon** now opens a Settings bottom sheet (no longer toggles date/age).
- **Date chip** (year label in top nav) taps to toggle `date` ↔ `age` display mode.
- `gearOpacity` now reflects `settingsOpen` rather than age mode.

### 2. Settings panel (updated)
- **Language selector** — 6 pill chips: 日本語 · English · Español · Français · 中文 · 한국어.  
  `preferredLanguage` state drives condition name display throughout the app.
- **Date of birth** — YYYY-MMM format (year `<input>` + month `<select>`); no day stored for privacy.  
  `birthYear` + `birthMonth` in state; month select uses `MONTHS` array already in scope.
- Tip note about date chip retained.

### 3. Condition card — localized name display
Every condition card shows:
```
[Localized name in preferred language]   ← MOMCAKE 26px
(English name, Full medical name)        ← Barlow 12px, muted
```
When `preferredLanguage === 'en'`, only the medical name subtitle is shown (no redundant English/English duplication).

### 4. Condition data enrichment
All 22 CONDITIONS now carry:
- `medName` — full clinical/medical name (e.g. `'Paroxysmal atrial fibrillation'`)
- `localNames` — map `{ ja, es, fr, zh, ko }` for all 22 conditions

`getLocalName(c)` helper in renderVals: returns `c.localNames[preferredLanguage] || c.label`.

### 5. Chat button on condition card
- Bottom-right of condition detail sheet: amethyst stroked message-square icon button (`36×36`, `border-radius:8`).
- Tapping opens chat: `chatOpen: true`.
- When `chatOpen`:
  - Sheet grows to `height: 80%`, `display:flex flex-direction:column`.
  - Card **compresses** to a single row: system color dot + localized name (truncated) + `(label, medName)` subtext + collapse `↓` button.
  - Chat window fills remaining space: scrollable messages list + input row.
- Collapse `↓` button sets `chatOpen: false` → sheet returns to full card view.
- Selecting a new condition always resets `chatOpen: false` + clears messages.
- Closing sheet resets `chatOpen: false` + clears messages.

### 6. Chat UX
- Messages: user bubbles right (`border-radius:12px 12px 2px 12px`, amethyst tint), assistant left (`12px 12px 12px 2px`, white/7%).
- Typing indicator: 3 dot-blink dots while `chatLoading`.
- Input: `Enter` to send; send button activates (amethyst bg) when text is present.
- Auto-scroll via `componentDidUpdate` + `this._chatRef.scrollTop = scrollHeight`.
- Empty state prompt: `Ask anything about [condition name].` or general health prompt.

### 7. AI wiring (`sendChatMsg`)
- Uses `window.claude.complete(input, { systemPrompt, onToken })` for streaming responses.
- System prompt is condition-aware: includes `label` + `medName`.
- Graceful fallback (no `window.claude`): mock reply after 700ms.
- Prototype note: connect Claude API for real responses.

### 8. Upload shortcuts — 4th chat button
Below the Choose Image button, above the QS wordmark (lower-left of body map):
- **Chat/AI button** — amethyst tint, message-square icon.
- Tap opens a **general health chat** (no condition pre-selected): `sheetOpen:true, chatOpen:true, selectedCondition:null`.
- Chat header shows "Health assistant" when no condition is active.

### 9. Same-date rail stacking (previous session, confirmed)
Conditions sharing the same `date` string are vertically stacked on the time rail, centered on the date position, each segment offset by `STACK_STEP = 4px` (3px height + 1px gap).

---

## Full state shape (current)

```js
state = {
  screen: 'upload',           // 'upload' | 'analyzing' | 'bodymap'
  dragOver: false,
  analyzeProgress: 0,
  analyzePhase: 0,
  activeSystems: ['integ','muscle','skeletal','cardio','lymph','neuro','pulm','gi','renal','endo','repro'],
  currentYear: 2024,          // float, fractional year
  selectedCondition: null,
  sheetOpen: false,
  legendOpen: true,
  timeDisplayMode: 'date',    // 'date' | 'age'
  timeRailActive: false,
  timeRailDragging: false,
  dragging: false,
  settingsOpen: false,
  uploadPanelOpen: true,
  uploadBtnsHovered: false,
  birthYear: 1985,
  preferredLanguage: 'ja',    // 'ja'|'en'|'es'|'fr'|'zh'|'ko'
  birthMonth: 'JAN',
  chatOpen: false,
  chatMessages: [],           // [{role:'user'|'assistant', content:string}]
  chatInputVal: '',
  chatLoading: false,
}
```

---

## Key methods (current)

| Method | What it does |
|---|---|
| `selectCondition(cond)` | Open sheet for condition; reset chat |
| `closeSheet()` | Close sheet + reset chat + clear messages |
| `toggleSystem(id)` | Toggle organ system layer |
| `toggleLegend()` | Collapse/expand legend panel |
| `startAnalyze()` | Transition to analyzing screen |
| `onGearClick()` | Open settings panel |
| `onDatePillClick()` | Toggle date/age display mode |
| `onToggleUploadPanel()` | Toggle upload shortcuts visibility |
| `sendChatMsg()` | Send chat message; stream response via window.claude |
| `componentDidUpdate()` | Auto-scroll chat to bottom on new message |

---

## Condition data shape (current)

```js
{
  id: 'migraine',
  system: 'neuro',
  label: 'Migraine disorder',          // English common name
  medName: 'Migraine with visual aura (ICHD-3)',  // full medical name
  localNames: {                         // localized common names
    ja: '片頭痛',
    es: 'Migraña con aura',
    fr: 'Migraine avec aura',
    zh: '偏头痛',
    ko: '편두통',
  },
  year: 2018, date: '2018-MAY-23',
  cx: 148, cy: 45,
  note: '...',
  evidence: '...',
  yearFrac: 2018.39,                    // computed at render time
}
```

---

## Assets on disk

```
mAI Genki.dc.html          — main file (~1600 lines)
maigenki-handoff01.md
maigenki-handoff02.md
maigenki-handoff03.md      ← this file
fonts/ (MOMCAKE, BourbonGrotesque, SourceCodePro, Barlow Condensed)
assets/ (QS wordmark SVGs)
_ds/ (QSXC design system bundle)
```

---

## Pending / Next session

1. **Real Claude API** — `window.claude` integration works; just needs the API key wired in the hosting environment.
2. **Multi-PDF support** — "add more records" after initial upload (not started).
3. **Condition timeline list view** — alternate tab alongside body map.
4. **Reproductive color** — `#7F1D1D` still dark; consider brightening to `#C0526A` or similar.
5. **Body centering** — figure still slightly left; viewBox nudge or `preserveAspectRatio` tweak.
6. **Analyzing screen dots** — verify all 7 scan dots match 11-system palette.
7. **Condition overlap** — thyroid/vitd share cx:130/162, cy:105; may need offset logic.
8. **Export / share screen** — not started.
9. **Age display** — `birthMonth` now in state; `fmtDisplay()` uses only `birthYear` — can be refined to include month for more precise age decimal.
