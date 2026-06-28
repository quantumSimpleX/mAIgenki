# mAI Genki — Comprehensive Project Handoff 04
**Date:** June 26, 2026
**File:** `mAI Genki.dc.html` (~1660 lines)
**Design system:** QSXC designSys bound at `_ds/qsxc-designsys-609610ba-6924-415c-8ab5-533e3cf06c97/`
> DS warning in console is **expected** — mAI Genki is a standalone mobile app prototype; it does not consume the DS bundle components directly. Brand tokens, typography, and color palette are manually applied inline per the DC authoring model.

---

## Product concept

**mAI Genki** ("my genki" — Japanese: health/vitality) is a private, offline-first mobile health records visualizer. Users upload medical PDFs → conditions are extracted and mapped to an anatomical body diagram across a log-scale time axis → tap any dot for full condition details + AI chat. No account. No cloud. All processing on-device.

**Three screens in sequence:** Upload → Analyzing → Body Map

---

## File structure

```
mAI Genki.dc.html           — single Design Component, all 3 screens (~1660 lines)
maigenki-handoff01..04.md   — session notes
fonts/
  MOMCAKE-Bold.otf
  MOMCAKE-Thin.otf
  BourbonGrotesque-Regular.otf
  SourceCodePro-Regular.otf.woff2
assets/
  icon-black.svg / icon-white.svg    — QS simplex mark
  logo-black.svg / logo-white.svg    — QS full wordmark
_ds/qsxc-designsys-609610ba-6924-415c-8ab5-533e3cf06c97/
  _ds_bundle.js / base.css / colors_and_type.css
```

---

## Branding

### App name rendering (all screens)
```
"m"       Barlow Condensed 700, 18px, rgba(255,255,255,0.9) dark / #0A0E14 light
"AI"      MOMCAKE 700, 20px, #8A60EB, line-height:1, vertical-align:baseline
" Genki"  Barlow Condensed 700, 18px, same as "m"
```
Logo tap on body map toggles the system legend.

### QS wordmark
- Upload screen: lower-right, `opacity:0.4`, "Built by" label (Barlow Condensed 9px, uppercase, `#A6ADB7`) above
- Body map: lower-left, `opacity:0.3`, no label, white version

---

## Typography

| Role | Font | Weight | Size |
|---|---|---|---|
| App logo "m"/"Genki" | Barlow Condensed | 700 | 18px |
| App logo "AI" | MOMCAKE | 700 | 20px |
| Hero headline | MOMCAKE | 700 | 42px |
| Condition name (sheet/list) | MOMCAKE | 700 | 26px / 16px |
| UI labels / body | Barlow Condensed | 400–700 | 10–17px |
| Tab / eyebrow labels | Barlow Condensed | 600 | 10–12px, UPPERCASE, 0.1em tracking |
| Mono / dates / codes | Source Code Pro | 400 | 9–12px |
| QS wordmark "X" accent | Bourbon Grotesque | 400 | 17.8px |

Barlow Condensed: Google Fonts CDN. All others: local `@font-face`.

---

## Color palette

### Brand / UI chrome
| Token | Hex | Use |
|---|---|---|
| Amethyst | `#8A60EB` | Logo "AI", active tab underline, primary accent |
| Aqua | `#1FC3A4` | Time rail thumb, progress bar, renal system, add-records CTA |
| Ink | `#0A0E14` | Upload screen text |
| Paper | `#FAFAF7` | Upload screen background |
| Screen dark | `#0A0C14` | Analyzing + body map background |
| Sheet dark | `#13171F` | Condition detail / chat sheet background |
| Phone shell | `#111318` | Device chrome |

### 11 organ systems (final confirmed order + colors)
| # | ID | Label | Hex |
|---|---|---|---|
| 1 | `integ` | Integumentary | `#4F46E5` |
| 2 | `muscle` | Muscular | `#F472B6` |
| 3 | `skeletal` | Skeletal | `#94A3B8` |
| 4 | `cardio` | Circulatory | `#EF4444` |
| 5 | `lymph` | Lymphatic | `#22C55E` |
| 6 | `neuro` | Nervous | `#EAB308` |
| 7 | `pulm` | Respiratory | `#06B6D4` |
| 8 | `gi` | Digestive | `#F97316` |
| 9 | `renal` | Renal | `#84CC16` |
| 10 | `endo` | Endocrine | `#D946EF` |
| 11 | `repro` | Reproductive | `#C0526A` ← was `#7F1D1D`, updated session 04 |

---

## Screen 1 — Upload

**Background:** `#FAFAF7`
**Top bar:** mAI Genki logo only (left), no right elements

**Hero block:**
- Purple eyebrow: `YOUR BODY. YOUR RECORDS.` — Barlow Condensed 600, 11px, uppercase, `#7042D6`
- Headline: `YOUR WELLNESS STORY` — MOMCAKE 700, 42px, line-height 0.95, `#0A0E14`
- Sub: `Upload health PDFs. Every condition mapped to anatomy — across time.` — Barlow Condensed 400, 16px, `#5A6573`

**Upload zone:** Single dashed-border box (`border-radius:8px`) with 3 equal columns (no dividers):
1. PDF icon (`#8A60EB`) + "Drop PDFs"
2. Camera icon (`#1FC3A4`) + "Take a photo"
3. Image icon (`#8A60EB`) + "Choose image"
Bottom strip: file type hint, `#1A9E8A`, 13px

**Privacy badge:** Source Code Pro, `#6B3FBF` text, `#C4A8F0` border
**OR divider → "Explore demo data"** button
**Footer:** `No account. No cloud. Works offline.` — `#1A9E8A`
**QS wordmark:** absolute lower-right, `opacity:0.4`, "Built by" label above

---

## Screen 2 — Analyzing

**Background:** `#0A0C14`
**Body silhouette SVG** (190×320): stroke-dashoffset reveal (2.2s) + aqua scan line sweeping top→bottom + 7 condition dots blinking in sequence
**Phase label:** Barlow Condensed 500, 20px
**Progress %:** Source Code Pro 12px, `#3A434F`
**Progress bar:** `#8A60EB → #1FC3A4` gradient, 2px height
**4 phase steps** (flex row, dot + label): Reading records → Extracting diagnoses → Mapping anatomy → Building story
- Dot states: `#8A60EB` (active), `#1FC3A4` (complete)

---

## Screen 3 — Body Map

### Full layout structure
```
┌──────────────────────────────┐
│  Top bar                     │  logo + chevron | date chip + gear
├──────────────────────────────┤
│  View tabs                   │  Body Map | Timeline
├──────────────────────────────┤
│                              │
│  Body canvas (flex:1,        │  SVG anatomy + hotspots + rail
│   position:relative)         │  + list view overlay
│                              │
│  ├─ Legend panel (abs)       │
│  ├─ Body SVG                 │
│  ├─ Condition hotspots       │
│  ├─ Timeline list (abs)      │
│  ├─ Upload shortcuts (abs)   │  lower-left
│  └─ Time rail (abs right)    │
├──────────────────────────────┤
│  Settings panel (abs overlay)│
│  Record lightbox (abs z:100) │  ← phone-screen level, full coverage
│  Condition sheet (abs z:10)  │  slides up from bottom
└──────────────────────────────┘
```

### Top bar (padding 10px 20px, border-bottom rgba(255,255,255,0.06))
- **Left:** mAI Genki logo + chevron svg (rotates 90° when legend collapsed) — tap toggles legend
- **Right:** Date/age chip (Source Code Pro 11px, border pill; tap = toggle date↔age) + gear icon (26×26, tap = open settings)
- `gearOpacity`: 1 when `settingsOpen`, 0.45 otherwise

### View tabs (below top bar, border-bottom rgba(255,255,255,0.06))
Two tabs with amethyst 2px underline on active tab:
- **Body Map** — shows SVG anatomy + hotspots
- **Timeline** — shows chronological condition list overlay

State key: `bodyMapMode: 'body' | 'list'`

### Legend panel
- `position: absolute, top:0, left:0`, semi-transparent dark bg + backdrop blur
- `maxHeight` animates 0 ↔ 320px (320ms brand easing) via `legendOpen`
- Row 0: Integumentary — always on, dimmed, non-interactive
- Rows 1–10: toggleable systems, colored dot (glows when active) + label

### Body SVG
```
viewBox="0 0 260 460"
position:absolute; top:2.5%; left:0; right:14px; width:auto; height:95%; overflow:visible;
```
`right: 14px` = inactive rail width, ensures figure centers correctly in available space.
10 `<g class="organ-layer" opacity="...">` groups — opacity 0/1 driven by `activeSystems` state.
Ghost silhouette always visible at ~18% opacity (Integumentary layer).

### Condition hotspots (SVG `<g>` elements)
Visible when: `activeSystems.includes(c.system)` AND `c.year <= currentYear`
- **Unselected:** 8px radius, 75% opacity
- **Selected:** 10px radius, 100% opacity + 2 staggered `pulse-ring` animations (0s / 0.7s delay)
- White inner dot: 3.5px / 4.5px unselected/selected
- **Tap → `selectCondition(c)`**: sets selectedCondition, sheetOpen, currentYear to c.yearFrac, timeRailActive; clears chat + selectedRecords + lightboxRecord

### Timeline list view (`bodyMapMode === 'list'`)
- `position:absolute; inset:0; overflow-y:auto; background:#0A0C14; z-index:2`
- Conditions sorted newest-first, filtered by `activeSystems`
- Each row: 3px left color bar | date chip (SCP 9px) | system tag | MOMCAKE name 16px | medName muted 11px | › chevron
- Tap → same `selectCondition(c)` as body map dot tap

### Time rail (right edge)
- Inactive: 14px wide, 20% transparent bg
- Active: 36px wide, 50% transparent bg
- Transition: `width 220ms, background 220ms` brand easing
- **Log-scale axis** (K=2.5): bottom = oldest condition, top = newest
- `toPos(yr)` / `fromPos(p)` helpers with steepness constant
- Colored dash markers per condition (3px height, system color, glow when selected)
- Same-date stacking: `STACK_STEP = 4px` (3px height + 1px gap)
- Thumb: 8×8px circle, `#1FC3A4`, with glow
- Floating label: `YYYY-MMM` (date mode) or `AGE N.N` (age mode, 1 decimal)
- Tap/drag snaps to nearest condition within 1% threshold — does **not** open sheet
- Bookend year labels (2-digit) visible when rail active

### Upload shortcuts (lower-left, above QS wordmark)
`opacity: 0.2 idle → 0.85 hover`; hidden (`opacity:0, pointer-events:none`) when `uploadPanelOpen: false`
Five 28×28px icon buttons (6px radius):
1. **PDF** (amethyst stroke) → `startAnalyze()`
2. **Camera** (aqua stroke) → `startAnalyze()`
3. **Image** (amethyst stroke) → `startAnalyze()`
4. **AI chat** (amethyst tint bg, message-square icon) → opens general health chat (no condition)
5. **＋ Add records** (aqua tint bg, aqua cross) → `startAnalyze()` (simulates adding more records)

QS wordmark logo below: `opacity:0.3`, tap toggles panel visibility.

---

## Condition detail sheet

### Height / animation
- Closed: `height: 0`
- Condition detail open: `height: 400px`, `borderRadius: 18px 18px 0 0`
- Chat open (full-screen): `height: 780px`, `borderRadius: 0`
- Transition: `height 420ms, border-radius 420ms cubic-bezier(0.16,1,0.3,1)`
- **↓ close button**: calls `closeSheet()` → dismisses back to body map (not just collapses chat)

### Sheet structure (top → bottom)
1. Handle bar (34×4px pill, rgba(255,255,255,0.14))
2. Compact header row (always visible when sheet open):
   - System color dot (8px) + localized condition name (Barlow 600, 14px, truncated) + `(label, medName)` sub
   - **Chat button** (amethyst, 36×36, 8px radius) → `chatOpen: true`
   - When chatOpen: condition info compresses + **↓ close button** appears
3. Sheet inner content (`sheetInnerEl`, flex:1):
   - **Condition detail** (`!chatOpen`) — see below
   - **Records carousel + chat** (`chatOpen`) — see below

### Condition detail view (`!chatOpen`)
- MOMCAKE 26px localized name
- English medical subtitle (Barlow 500, 13px, muted)
- **"First noted" date chip** (aqua tint, calendar icon, SCP 12px) — **editable via pencil icon button** (same height as chip, pen stroke). Tap → inline text input, confirm ✓/Enter, cancel ×. Stored in `condDateOverrides[condId]`.
- Clinical note (Barlow 400, 16px)
- Evidence source (SCP 11px, muted) — date suffix trimmed at render time: `evidence.split(' — ')[0]`

### Localized condition names
- `preferredLanguage !== 'en'`: shows `c.localNames[preferredLanguage]` in MOMCAKE 26px
- English medical name always shown as subtitle
- `getLocalName(c)` helper: `c.localNames[preferredLanguage] || c.label`

---

## Chat view (`chatOpen: true`, full-screen)

### Layout (top → bottom within sheetInnerEl)
1. Records carousel (when `condRecords.length > 0`)
2. Messages list (scrollable, flex:1)
3. Input row (fixed bottom)

### Records carousel
- Horizontal scroll-snap, 10px padding, 9px gap, `scrollbarWidth:none`
- Cards: **117×74px SVG thumbnail** + label row (10px, 8.5px)
- 2–3 records per condition, keyed from `CONDITION_RECORDS` map (22 conditions)
- Record types + thumbnail styles: TREND (line chart), ECG (waveform), IMAGING (ellipse scan), LABS (bar chart), SPIRO (spirometry loop), SCAN (skeletal outline)
- `renderRecordThumb(rec, w, h)` — parameterized SVG renderer

**Two distinct tap gestures:**
- **Tap card body** → opens full-screen lightbox + exclusively selects that record (`selectedRecords: [rec]`)
- **Tap selection circle** (upper-right of thumbnail, 18px, `e.stopPropagation()`) → multi-select toggle (add/remove from `selectedRecords` array, no lightbox)

**Selected card visual state:**
- Upper-right circle: filled with condition color + white ✓ checkmark
- Thumbnail area: 2px inset colored border + color tint overlay
- Card outer border: colored + box-shadow glow

### Full-screen record lightbox
- Rendered at **phone-screen level** (`position:absolute; inset:0; z-index:100`) — NOT inside the sheet
- Covers entire phone including top bar and tabs
- Shows: type badge + label + enlarged thumbnail (358×226px) + date
- "Add to chat" / "✓ In chat" button toggles in `selectedRecords` array
- Tap anywhere to dismiss (× button also available)

### Chat messages
- User: right-aligned, amethyst tint (`border-radius: 12px 12px 2px 12px`)
- Assistant: left-aligned, white/7% (`border-radius: 12px 12px 12px 2px`)
- Typing indicator: 3 dot-blink while `chatLoading`
- Auto-scroll on new message via `componentDidUpdate` + `_chatRef.scrollTop = scrollHeight`
- Empty state: "Ask anything about [condition name]."

### AI system prompt
Condition-aware + records-aware:
```js
const selRecs = this.state.selectedRecords || [];
const sys = `You are a concise medical information assistant for mAI Genki.
${cond ? ` The user has ${cond.label} (${cond.medName || cond.label}).` : ''}
${selRecs.length ? ` The user is referencing ${selRecs.length} record(s): ${selRecs.map(r => r.type + ' "' + r.label + '" (' + r.date + ')').join(', ')}.` : ''}
Answer in 1–3 short sentences. Always recommend consulting a healthcare provider.`;
```
Uses `window.claude.complete(input, { systemPrompt, onToken })` for streaming. Graceful mock fallback after 700ms.

### Input placeholder
- 1 record: "Ask about [label]…"
- Multiple: "Ask about N records…"
- None: "Ask a question…"

---

## Settings panel (gear icon → bottom sheet)

### Section 1 — Date of birth
- **Year:** `<input type="text" inputMode="numeric" maxLength=4>` — no spinner arrows, validates 1900–2020
- **Month:** `<select>` using MONTHS array (JAN–DEC)

### Section 2 — Preferred language (scrollable list, maxHeight 224px)
Pinned at top (thin separator below): 🇺🇸 EN · 🇹🇼 TW · 🇯🇵 JA · 🇪🇸 ES
Then alphabetical (16 more): Arabic, Chinese (Simplified), Dutch, French, German, Hindi, Indonesian, Italian, Korean, Malay, Polish, Portuguese, Russian, Thai, Turkish, Vietnamese

Each row: flag emoji + 2-letter code badge (SCP 9px, rgba bg) + native name (Barlow 14px) + English sub (SCP 9.5px muted)
Active row: amethyst 3px left border + amethyst tint bg + ✓ checkmark right

---

## Full state shape

```js
state = {
  screen: 'upload',              // 'upload' | 'analyzing' | 'bodymap'
  dragOver: false,
  analyzeProgress: 0,            // 0–100
  analyzePhase: 0,               // 0–3
  activeSystems: [               // all 11 on by default
    'integ','muscle','skeletal','cardio','lymph',
    'neuro','pulm','gi','renal','endo','repro'
  ],
  currentYear: 2024,             // float — fractional year for log-scale
  selectedCondition: null,
  sheetOpen: false,
  legendOpen: true,
  timeDisplayMode: 'date',       // 'date' | 'age'
  timeRailActive: false,
  timeRailDragging: false,
  dragging: false,
  settingsOpen: false,
  uploadPanelOpen: true,
  uploadBtnsHovered: false,
  birthYear: 1985,
  birthMonth: 'JAN',
  preferredLanguage: 'ja',       // ISO code — 20 languages supported
  chatOpen: false,
  chatMessages: [],              // [{role:'user'|'assistant', content:string}]
  chatInputVal: '',
  chatLoading: false,
  editingCondDate: null,         // condId being edited, or null
  editDateInput: '',
  condDateOverrides: {},         // { [condId]: 'YYYY-MMM-DD' } user edits
  selectedRecords: [],           // record objects (multi-select for AI context)
  lightboxRecord: null,          // record to show full-screen, or null
  bodyMapMode: 'body',           // 'body' | 'list'
};
```

---

## Key methods

| Method | What it does |
|---|---|
| `startAnalyze()` | Transitions to analyzing screen, runs fake progress tick |
| `toggleSystem(id)` | Toggle organ system layer visibility |
| `toggleLegend()` | Flip legendOpen |
| `selectCondition(c)` | Open sheet for condition; set currentYear + timeRailActive; clear chat + selectedRecords + lightboxRecord |
| `closeSheet()` | Dismiss sheet fully; clear all chat/record state; delayed selectedCondition null |
| `startEditDate(id, date)` | Enter inline date edit mode |
| `confirmEditDate()` | Save to condDateOverrides |
| `cancelEditDate()` | Discard edit |
| `sendChatMsg()` | Send chat; stream via window.claude; graceful fallback |
| `componentDidUpdate()` | Auto-scroll chat to bottom on new message |

---

## Age display formula

```js
const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const birthMonthIdx = MONTHS.indexOf(birthMonth); // 0–11
const birthFrac = birthYear + (birthMonthIdx + 0.5) / 12;
const age = Math.max(0, y - birthFrac);
return `AGE ${age.toFixed(1)}`;
```
Uses `birthMonth` for sub-year precision (e.g. "AGE 38.4" not "AGE 38.0").

---

## 22 sample conditions

| ID | System | Label | Date | cx | cy | Notes |
|---|---|---|---|---|---|---|
| eczema | integ | Atopic dermatitis | 2013-MAR-17 | 160 | 80 | |
| psoriasis | integ | Plaque psoriasis | 2018-NOV-04 | 80 | 310 | |
| fibro | muscle | Fibromyalgia | 2019-JUL-22 | 100 | 230 | |
| rotator | muscle | Rotator cuff tear | 2022-SEP-13 | 64 | 148 | |
| disc | skeletal | L4–L5 disc herniation | 2020-AUG-11 | 130 | 325 | |
| osteo | skeletal | Osteopenia | 2023-FEB-28 | 130 | 385 | |
| htn | cardio | Hypertension | 2019-OCT-14 | 112 | 168 | |
| afib | cardio | Atrial fibrillation | 2021-MAR-02 | 135 | 178 | |
| lymph1 | lymph | Reactive lymphadenopathy | 2016-JUN-09 | 76 | 130 | |
| mono | lymph | Infectious mononucleosis | 2014-SEP-03 | 152 | 130 | |
| migraine | neuro | Migraine disorder | 2018-MAY-23 | 148 | 45 | |
| carpal | neuro | Carpal tunnel syndrome | 2021-DEC-07 | 38 | 272 | |
| asthma | pulm | Asthma | 2015-APR-18 | 89 | 194 | |
| covid | pulm | COVID-19 | 2022-FEB-17 | 171 | 194 | |
| gerd | gi | GERD | 2016-MAR-30 | 114 | 255 | |
| ibs | gi | Irritable bowel syndrome | 2017-AUG-15 | 148 | 310 | |
| stones | renal | Kidney stones | 2021-SEP-05 | 87 | 292 | |
| uti | renal | Recurrent UTIs | 2020-APR-11 | 130 | 415 | |
| thyroid | endo | Hypothyroidism | 2017-NOV-19 | 130 | 105 | |
| vitd | endo | Vitamin D deficiency | 2015-JUL-08 | 162 | **113** | offset from thyroid |
| fibroid | repro | Uterine fibroids | 2020-JUN-22 | 130 | 402 | |
| pcos | repro | PCOS | 2016-OCT-29 | 148 | 392 | |

All 22 conditions carry:
- `medName` — full clinical name (e.g. `'Paroxysmal atrial fibrillation'`)
- `localNames: { ja, es, fr, zh, ko, zh-TW, de, ar, hi, id, it, ko, ms, nl, pl, pt, ru, th, tr, vi }` — 20 languages
- `yearFrac` — computed at render time from `date` string using `parseDateFrac()`
- `note` — 1–2 sentence clinical note
- `evidence` — source string (date suffix stripped at render: `evidence.split(' — ')[0]`)

---

## CONDITION_RECORDS data (visual records carousel)

Each condition has 2–3 associated record objects:
```js
{ id: 'r-htn-1', type: 'TREND', label: 'BP trend', date: '2019–2024', color: '#EF4444' }
```

Record types: `TREND` | `ECG` | `IMAGING` | `LABS` | `SPIRO` | `SCAN`

`renderRecordThumb(rec, w, h)` renders a distinct SVG miniature per type:
- TREND: line chart with gradient fill
- ECG: classic QRS waveform
- IMAGING: radiology-style ellipse shapes
- LABS: horizontal bar chart
- SPIRO: flow-volume loop
- SCAN: skeletal outline with density bar

---

## Animation keyframes

| Name | Use |
|---|---|
| `pulse-ring` | Selected hotspot ripple — scale 1→2.4, opacity 0.25→0, 2.2s, 2 rings (0s / 0.7s delay) |
| `scan-line` | Analyzing screen scan — translateY 0→340px, 1.4s |
| `fade-up` | Upload hero entrance — translateY 12px→0, 0.5s |
| `dot-blink` | Analyzing phase dots — opacity 0.3→1, staggered |
| `glow-pulse` | Rail elements — opacity 0.6→1 |
| Brand easing | `cubic-bezier(0.16, 1, 0.3, 1)` throughout |

---

## Open backlog (future sessions)

1. **Real Claude API** — `window.claude` wiring works; needs API key in hosting environment
2. **Multi-PDF merge UI** — "+ Add records" currently re-runs analyze animation; real merge UX would diff and add new conditions without resetting existing ones
3. **Body centering with active rail** — SVG uses `right:14px` (inactive rail width). When rail expands to 36px the figure shifts slightly left. Could animate `right` in sync with rail width.
4. **Export / share** — snapshot of body map as PNG or shareable link
5. **Analyzing screen dot colors** — verify 7 scan-line dots match the final 11-system colors
6. **Condition detail deep-links** — URL hash to open a specific condition on load
7. **Real record thumbnails** — `image-slot.js` could replace SVG placeholder thumbnails once users upload actual scan/chart images
