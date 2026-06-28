# mAI Genki — Project Handoff 02
**Date:** June 23, 2026  
**File:** `mAI Genki.dc.html` (~1149 lines)  
**Design system:** QSXC designSys (bound at `_ds/qsxc-designsys-609610ba-6924-415c-8ab5-533e3cf06c97/`)

---

## App concept

**mAI Genki** — personal health records visualizer. Private, offline-first. Three screens: Upload → Analyzing → Body Map.

Hero copy (upload screen):
- Eyebrow: *"Your body. Your records."*
- Headline: *"YOUR WELLNESS STORY"*
- Sub: *"Upload health PDFs. Every condition mapped to anatomy — across time."*
- Privacy badge: *"YOUR DATA NEVER LEAVE YOUR DEVICE"*
- Footer: *"No account. No cloud. Works offline."*

---

## Fonts (loaded locally via @font-face)

| Font | File | Weight | Use |
|---|---|---|---|
| MOMCAKE | `fonts/MOMCAKE-Bold.otf` | 700 | Hero headlines, logo "AI" |
| MOMCAKE | `fonts/MOMCAKE-Thin.otf` | 100 | Poster moments only |
| Source Code Pro | `fonts/SourceCodePro-Regular.otf.woff2` | 400 | Timestamps, mono tags, year chip |
| Bourbon Grotesque | `fonts/BourbonGrotesque-Regular.otf` | 400 | Available but not currently used |
| Barlow Condensed | Google Fonts | 300–700 | All UI body text, labels, buttons |

---

## Logo — mAI Genki (all three screens)

```
"m"       Barlow Condensed 700, 18px, #0A0E14 (light bg) / rgba(255,255,255,0.9) (dark bg)
"AI"      MOMCAKE 700, 20px, #8A60EB, line-height:1, vertical-align:baseline
" Genki"  Barlow Condensed 700, 18px, #0A0E14 (light) / rgba(255,255,255,0.9) (dark)
```
All three screens use the same sizing (20px AI). Body map logo tapping toggles the system legend.

---

## UI Chrome Colors (do NOT change — separate from body system palette)

| Role | Hex |
|---|---|
| Amethyst (brand) | `#8A60EB` |
| Aquamarine (accent) | `#1FC3A4` |
| Ink (dark text) | `#0A0E14` |
| Paper (light bg) | `#FAFAF7` |
| Body map bg | `#0A0C14` |
| Eyebrow purple | `#7042D6` |
| Hero sub-copy | `#5A6573` |
| File types line | `#1A9E8A` |
| Privacy badge text | `#6B3FBF` |
| Privacy badge border | `#C4A8F0` |
| "No account…" text | `#1A9E8A` |
| Upload box border | `#CDD2D9` |
| Drag-over border | `#8A60EB` |
| Drag-over bg | `#8A60EB0A` |
| Slider thumb | `#1FC3A4` |
| Progress bar | linear-gradient `#8A60EB → #1FC3A4` |

---

## 11 Body Systems — Final Color Palette (agreed order)

| # | ID | Label | Color Name | Hex |
|---|---|---|---|---|
| 1 | `integ` | Integumentary | Indigo | `#4F46E5` |
| 2 | `muscle` | Muscular | Pink | `#F472B6` |
| 3 | `skeletal` | Skeletal | Silver | `#94A3B8` |
| 4 | `cardio` | Circulatory | Red | `#EF4444` |
| 5 | `lymph` | Lymphatic | Green | `#22C55E` |
| 6 | `neuro` | Nervous | Yellow | `#EAB308` |
| 7 | `pulm` | Respiratory | Cyan | `#06B6D4` |
| 8 | `gi` | Digestive | Orange | `#F97316` |
| 9 | `renal` | Renal | Chartreuse | `#84CC16` |
| 10 | `endo` | Endocrine | Magenta | `#D946EF` |
| 11 | `repro` | Reproductive | Dark red | `#7F1D1D` |

Legend rendered in this exact order, vertical list with colored dot per system. All 11 are independently toggleable including Integumentary (toggling fades the ghost body silhouette).

---

## SVG Organ Layers — Color Map

Every path/element within a system layer must use its system hex. Verified:

| System | Key anatomy | Hex |
|---|---|---|
| Integumentary (ghost) | Full body silhouette fill | `#4F46E5` at 18% opacity (0 when toggled off) |
| Circulatory | Heart, aorta | `#EF4444` |
| Respiratory | Left + right lung lobes | `#06B6D4` |
| Nervous | Brain ellipse | `#EAB308` |
| Skeletal | Clavicles, ribs, spine rects, pelvis, kneecaps | `#94A3B8` |
| Muscular | Deltoids, pecs, biceps, forearms, abs, quads, calves | `#F472B6` |
| Digestive | Stomach, intestine path | `#F97316` |
| Renal | Kidneys (×2), bladder, ureters (×2) — ALL confirmed | `#84CC16` |
| Endocrine | Thyroid, adrenal glands | `#D946EF` |
| Lymphatic | Thymus, cervical nodes ellipse | `#22C55E` |
| Reproductive | Uterus/gonad shape | `#7F1D1D` |

---

## Body SVG

```html
<svg viewBox="0 0 260 460"
  style="position:absolute; top:2.5%; left:0; width:100%; height:95%; overflow:visible;">
```
- Centered full width
- Sits at 2.5% top offset, 95% height (breathing room at top and bottom)
- `overflow:visible` so hotspot ripples extend beyond bounds

---

## Screens

### Upload screen (`screen === 'upload'`)
- Background: `#FAFAF7`
- Logo top-left (no back button)
- **Single upload box** — dashed border, `border-radius:8px`, three equal columns, NO dividers between columns:
  1. Drop PDFs — PDF icon in amethyst `#8A60EB`
  2. Take a photo — camera icon in aquamarine `#1FC3A4`
  3. Choose image — image icon in amethyst `#8A60EB`
  - Bottom strip: "Health records, discharge forms, lab results, imaging reports, etc." `#1A9E8A`, 13px
- Privacy badge: Source Code Pro, text `#6B3FBF`, border `#C4A8F0`
- OR divider → "Explore demo data" button
- Footer: "No account. No cloud. Works offline." `#1A9E8A`

### Analyzing screen (`screen === 'analyzing'`)
- Dark bg `#0A0C14`
- Scanning animation, aquamarine scan line gradient
- Phase dots: amethyst active, aquamarine complete
- Progress bar: amethyst → aquamarine

### Body Map screen (`screen === 'bodymap'`)
- Dark bg `#0A0C14`
- **Top bar** (flex row, space-between):
  - Left: mAI Genki logo + chevron (tap toggles legend)
  - Right: current year chip (Source Code Pro, 11px) + gear icon
- **Legend panel**: absolute overlay, `top:0, left:0`, collapsible, vertical list
- **Body SVG**: centered, 95% height
- **Time rail**: right edge (see below)
- **Condition detail sheet**: bottom sheet, slides up on body dot tap only

---

## Time Rail — Full Spec

### Layout
- Position: `absolute, top:0, right:0, bottom:0`
- Default: `width:14px`, `background:rgba(10,12,20,0.2)` (80% transparent)
- Active: `width:36px`, `background:rgba(10,12,20,0.5)` (50% transparent)
- Transition: `width 220ms, background 220ms` both `cubic-bezier(0.16,1,0.3,1)`

### Log-scale axis
- Bottom = oldest condition's yearFrac, Top = newest + 0.5 padding
- Steepness constant K = 2.5
- `toPos(yr)` → 0 (top/newest) … 1 (bottom/oldest):
  ```js
  const t = (yr - condMinYear) / yearRange; // 0..1
  const scaled = (Math.exp(K * t) - 1) / (Math.exp(K) - 1);
  return 1 - scaled;
  ```
- `fromPos(p)` → inverse year from 0..1 position

### Fractional year parsing
All condition positions use precise date, not just integer year:
```js
const MONTH_IDX = {JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11};
const parseDateFrac = (d) => {
  const [yr, mo, day] = d.split('-');
  return parseInt(yr) + (MONTH_IDX[mo] * 30.44 + parseInt(day)) / 365.25;
};
```
Each condition gets `c.yearFrac` computed at render time. Rail markers and snap use `c.yearFrac`.

### Condition markers (colored dashes)
- Default: `width:10px, height:3px, borderRadius:2px`, system color, subtle glow
- Selected: `height:4px, scaleX(1.6)`, bright double glow
- Tap: highlights body dot with ripples + moves thumb to that date + activates rail
- Does NOT open detail sheet

### Snap behavior
- Threshold: **1%** of track height (tight snap)
- Snapping: highlights body dot, glows marker, sets `selectedCondition`
- Releasing drag does NOT open detail sheet (only body dot tap opens sheet)

### Thumb
- 8×8px circle, `#1FC3A4`, glow `rgba(31,195,164,0.8)`
- Smooth CSS transition unless dragging

### Floating label
- Appears left of thumb when rail is active
- Format: `YYYY-MMM` (date mode) or `AGE N.N` (age mode, 1 decimal)
- Source Code Pro, 9px, dark bg pill

### Gear icon (top bar)
- Toggles `timeDisplayMode`: `'date'` ↔ `'age'`
- `birthYear` prop: `this.props.birthYear ?? 1985`
- `gearOpacity`: 1 when age mode, 0.45 when date mode

### Bookend labels
- Top: newest year (2-digit), Bottom: oldest (2-digit)
- Only visible when rail is active

---

## Body Hotspots

- SVG `<g>` per visible condition (filtered by `activeSystems` AND `c.year <= currentYear`)
- **Unselected**: 8px radius dot, 75% opacity, no animation
- **Selected**: 10px radius, 100% opacity + 2 staggered `pulse-ring` rings (0s, 0.7s delay)
- White inner dot: 3.5px unselected, 4.5px selected
- Tap → `selectCondition(c)`: sets `selectedCondition`, `sheetOpen:true`, `currentYear:c.yearFrac`, `timeRailActive:true`

---

## Condition Detail Sheet
- Bottom sheet, slides up from bottom
- Opens ONLY on body map dot tap (not on rail marker tap, not on rail drag snap)
- Shows: condition label, system, date (`c.date` in `YYYY-MMM-DD`), clinical note, evidence source
- Backdrop blur `rgba(10,12,20,0.78)` + `blur(6px)`

---

## 22 Sample Conditions (2 per system, realistic dates)

| ID | System | Label | Date | cx | cy |
|---|---|---|---|---|---|
| eczema | integ | Atopic dermatitis | 2013-MAR-17 | 160 | 80 |
| psoriasis | integ | Plaque psoriasis | 2018-NOV-04 | 80 | 310 |
| fibro | muscle | Fibromyalgia | 2019-JUL-22 | 100 | 230 |
| rotator | muscle | Rotator cuff tear | 2022-SEP-13 | 64 | 148 |
| disc | skeletal | L4–L5 disc herniation | 2020-AUG-11 | 130 | 325 |
| osteo | skeletal | Osteopenia | 2023-FEB-28 | 130 | 385 |
| htn | cardio | Hypertension | 2019-OCT-14 | 112 | 168 |
| afib | cardio | Atrial fibrillation | 2021-MAR-02 | 135 | 178 |
| lymph1 | lymph | Reactive lymphadenopathy | 2016-JUN-09 | 76 | 130 |
| mono | lymph | Infectious mononucleosis | 2014-SEP-03 | 152 | 130 |
| migraine | neuro | Migraine disorder | 2018-MAY-23 | 148 | 45 |
| carpal | neuro | Carpal tunnel syndrome | 2021-DEC-07 | 38 | 272 |
| asthma | pulm | Asthma | 2015-APR-18 | 89 | 194 |
| covid | pulm | COVID-19 | 2022-FEB-17 | 171 | 194 |
| gerd | gi | GERD | 2016-MAR-30 | 114 | 255 |
| ibs | gi | Irritable bowel syndrome | 2017-AUG-15 | 148 | 310 |
| stones | renal | Kidney stones | 2021-SEP-05 | 87 | 292 |
| uti | renal | Recurrent UTIs | 2020-APR-11 | 130 | 415 |
| thyroid | endo | Hypothyroidism | 2017-NOV-19 | 130 | 105 |
| vitd | endo | Vitamin D deficiency | 2015-JUL-08 | 162 | 105 |
| fibroid | repro | Uterine fibroids | 2020-JUN-22 | 130 | 402 |
| pcos | repro | Polycystic ovary syndrome | 2016-OCT-29 | 148 | 392 |

---

## State Shape

```js
state = {
  screen: 'upload',           // 'upload' | 'analyzing' | 'bodymap'
  dragOver: false,
  analyzeProgress: 0,         // 0–100
  analyzePhase: 0,            // 0–3
  activeSystems: ['integ','muscle','skeletal','cardio','lymph','neuro','pulm','gi','renal','endo','repro'],
  currentYear: 2024,          // float — fractional year for log-scale position
  selectedCondition: null,
  sheetOpen: false,
  legendOpen: true,
  timeDisplayMode: 'date',    // 'date' | 'age'
  timeRailActive: false,
  timeRailDragging: false,
  dragging: false,
}
// Props: birthYear (default 1985)
```

---

## Key Methods

| Method | What it does |
|---|---|
| `selectCondition(c)` | Sets selectedCondition, sheetOpen:true, currentYear:c.yearFrac, timeRailActive:true |
| `toggleSystem(id)` | Toggles id in activeSystems array |
| `toggleLegend()` | Flips legendOpen |
| `closeSheet()` | Sets sheetOpen:false, selectedCondition:null |
| `onGearClick()` | Flips timeDisplayMode date↔age |
| `onUploadClick()` | Triggers file input |
| `startAnalyzing()` | Transitions to analyzing screen, runs fake progress |

---

## Animations

| Name | Use |
|---|---|
| `pulse-ring` | Selected condition ripple — scale 1→2.4, opacity 0.25→0, 2.2s, 2 rings at 0s/0.7s |
| `scan-line` | Analyzing screen scan — translateY 0→340px, 1.4s |
| `fade-up` | Upload screen hero — translateY 12px→0, 0.5s |
| `dot-blink` | Analyzing dots — opacity 0.3→1, staggered |
| `glow-pulse` | Rail elements — opacity 0.6→1 |
| Easing | `cubic-bezier(0.16, 1, 0.3, 1)` throughout |

---

## Pending / Next session

1. **Multi-PDF support** — "add more records" after initial upload (not started)
2. **Condition timeline list view** — alternate tab alongside body map (not started)
3. **DOB entry UI** — currently `birthYear` is hardcoded to 1985 as a prop default; needs an input field so age mode is meaningful
4. **Reproductive color visibility** — `#7F1D1D` very dark against `#0A0C14` body map bg; may need brightening
5. **Body centering refinement** — body figure still skews slightly left; consider `preserveAspectRatio` or viewBox nudge
6. **Export / share screen** — not started
7. **Analyzing screen system dot colors** — should match the 11-system palette (not verified)
8. **Condition overlap** — multiple conditions at same body position (e.g. thyroid + vitd at cx:130/162, cy:105) may need offset logic
