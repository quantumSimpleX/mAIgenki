# mAI Genki — Project Handoff 01
**Date:** June 22, 2026  
**File:** `mAI Genki.dc.html`  
**Design system:** QSXC designSys (bound at `_ds/qsxc-designsys-609610ba-6924-415c-8ab5-533e3cf06c97/`)

---

## Product brief

**mAI Genki** ("my genki" — genki = Japanese for health and wellbeing) is a mobile-first, cross-platform app (iOS, Android, web) that lets anyone upload medical history PDFs and see their entire health — across all organ systems — visualized as toggleable transparent anatomical layers on a scrollable time axis. No account required. Medical data never leaves the device.

**Core user story:** Upload PDF → see conditions mapped to anatomy → toggle organ system layers → scrub time axis to watch health story unfold → tap a condition dot for full detail.

---

## Current prototype state

Single file: `mAI Genki.dc.html` — a Design Component with 3 screens in sequence:

1. **Upload screen** (light, `#FAFAF7` background)
2. **Analyzing screen** (dark, on-device processing animation)
3. **Body map screen** (dark, full interactive anatomy view)

Demo flow: tap "Try with sample records" or drag-drop → analyzing animation (~5s) → body map.

---

## Branding & identity

### App name
`mAI Genki` — rendered as three spans, `align-items:center`:
- `m` — Barlow Condensed 700, 17–18px, ink/white
- `AI` — MOMCAKE 700, 17–18px, `#8A60EB` (QS amethyst) — same height as `m`
- ` Genki` — Barlow Condensed 700, 17–18px, ink/white

### Builder attribution — Quantum SimpleX wordmark
Exact replica of `QSWordmark.jsx` from QSXC nav, at size=28:
- QS circular icon SVG (392×391.3 viewBox) at 28×28px, `gap:1px` to text
- Two-row MOMCAKE text: `fontSize:14px`, `lineHeight:0.78`, `letterSpacing:0.06em`
  - Row 1: `UANTUM` — `translateY(4px)` to optically align with icon centre
  - Row 2: `SIMPLE` (MOMCAKE 700, 14px) + `X` (Bourbon Grotesque 400, 17.8px, `letterSpacing:0.8px`) — indented `paddingLeft:10px`

**Placement:**
- Upload screen: lower-right, `opacity:0.4`, preceded by "Built by" label (Barlow Condensed, 9px, uppercase, `#A6ADB7`), dark fill version
- Body map screen: lower-left, `opacity:0.3`, no label, white fill version (avoids conflict with right-side time rail)

---

## Typography system

| Role | Face | Weight | Size | Notes |
|---|---|---|---|---|
| App name "m" / "Genki" | Barlow Condensed | 700 | 17–18px | |
| App name "AI" | MOMCAKE | 700 | 17–18px | #8A60EB |
| Display headlines | MOMCAKE | 700 | 30–42px | tight tracking -0.02 to -0.03em |
| Body / UI labels | Barlow Condensed | 400–600 | 10–17px | |
| Eyebrow tags | Barlow Condensed | 600 | 11px | uppercase, 0.18em tracking |
| Monospace / dates / IDs | Source Code Pro | 400 | 9–12px | |
| Wordmark X accent | Bourbon Grotesque | 400 | 17.8px | wordmark only |

**Fonts loaded locally:**
- `fonts/MOMCAKE-Bold.otf`
- `fonts/MOMCAKE-Thin.otf`
- `fonts/BourbonGrotesque-Regular.otf`
- `fonts/SourceCodePro-Regular.otf.woff2`
- Barlow Condensed via Google Fonts CDN (300/400/500/600/700)

---

## Color palette

| Token | Hex | Usage |
|---|---|---|
| QS Amethyst | `#8A60EB` | "AI" in logo, MSK layer, accents |
| QS Aqua | `#1FC3A4` | Renal layer, active count badge, time scrubber thumb, progress bar |
| Ink | `#0A0E14` | Upload screen text, dark backgrounds |
| Paper | `#FAFAF7` | Upload screen surface |
| Screen dark | `#0A0C14` | Analyzing + body map background |
| Phone shell | `#111318` | Device chrome |

### Organ system colors

| System | Color | SVG elements |
|---|---|---|
| Integumentary | `#C4A882` | Body outline ghost (always on, no toggle) |
| Cardiovascular | `#DC4A4A` | Heart, aorta |
| Respiratory | `#4A8FD4` | Lungs, trachea |
| Nervous | `#C9B840` | Brain, spinal cord |
| Musculoskeletal | `#8A60EB` | Collar bones, ribs, pelvis, knee caps |
| Digestive | `#E8A44A` | Liver, stomach, intestines |
| Renal | `#1FC3A4` | Kidneys, bladder, ureters |
| Endocrine | `#D4829A` | Thyroid, adrenals, pancreas |
| Lymphatic | `#5CAE82` | Thymus, spleen, lymph nodes, thoracic duct |
| Reproductive | `#B85CAE` | Uterus, ovaries, fallopian tubes |

---

## Screen 1 — Upload

**Background:** `#FAFAF7`  
**Nav bar:** `mAI Genki` logo (left) only — no right side element  
**Hero block:**
- Purple eyebrow: `Your body. Your records.` (Barlow Condensed 600, 11px, uppercase, `#7042D6`)
- Headline: `YOUR WELLNESS STORY` (MOMCAKE 700, 42px, `line-height:0.95`, `#0A0E14`)
- Body: `Upload health record PDFs. Every condition mapped to anatomy — across time.` (Barlow Condensed 400, 16px, `#5A6573`)

**Upload zone:** dashed border (`#CDD2D9` → `#8A60EB` on dragover), file icon, privacy badge in Source Code Pro  
**CTA button:** `Try with sample records` — full-width, ink background, paper text, 8px radius  
**Sub-copy:** `No account. No cloud. Works offline.`  
**Sample pills:** `9 conditions`, `7 organ systems`, `2015 — 2024` (pill chips, `#E6E9ED` border)  
**QS wordmark:** absolute lower-right, `opacity:0.4`, "Built by" label above

---

## Screen 2 — Analyzing

**Background:** `#0A0C14`  
**mAI Genki wordmark** centered top (fade-up animation)  
**Body silhouette SVG** (190×320) — stroke-dashoffset reveal animation (2.2s), scan line sweeping top-to-bottom (#1FC3A4), 7 condition dots blinking in sequence  
**Phase label** — Barlow Condensed 500, 20px, white  
**Progress %** — Source Code Pro, 12px, `#3A434F`, "processing on-device"  
**Progress bar** — amethyst→aqua gradient, 2px track  
**4 phase steps** (flex row, with dot + label):
1. Reading records
2. Extracting diagnoses
3. Mapping anatomy
4. Building story

Transitions: each dot turns aqua when complete, amethyst when active.

---

## Screen 3 — Body Map

**Layout:** flex column — top nav bar (fixed height) → body canvas (flex:1, fills remaining height) — no bottom chrome.

### Top nav bar
- Left: `mAI Genki` wordmark + chevron (↓/→) — **tapping toggles the legend panel**
- Right: `N active` badge (aqua tint) + `YYYY` year chip

### Legend panel (left overlay)
- Position: `absolute top:12 left:0`, slides open/closed via `maxHeight` transition (320ms QS easing)
- Semi-transparent dark background + backdrop blur
- **Row 0:** Integumentary — always on, dimmed, no toggle affordance
- **Rows 1–9:** 9 toggleable systems — colored dot (glows when active) + label
- Toggle: tap row → opacity of that layer's SVG group animates 0↔1 (280ms)
- Chevron in nav rotates 90° when collapsed

### Body SVG canvas
- `viewBox="0 0 260 460"`, fills `width:calc(100% - 36px)` × `height:100%` (right 36px reserved for time rail)
- 10 SVG layer groups (`<g class="organ-layer" opacity="...">`) — opacity driven from state
- Ghost silhouette always visible at `opacity:0.1` (Integumentary)
- Condition hotspots: pulsing ring + filled circle + white centre dot, tap to open detail sheet

### Right time rail (36px wide)
- Vertical range input (`writing-mode:vertical-lr; direction:rtl`)
- `2024` label top, `2015` label bottom (bottom=oldest, top=most recent)
- Aqua thumb (#1FC3A4), dark track

**⚠ Planned but not yet built (next session):**
- Color-coded horizontal tick marks on the rail for each condition event
- Log-scale time axis (more resolution for recent years)
- YYYY-MMM label on drag / tap on tick marks
- Toggle between calendar date and user's age display modes
- Span from first known condition to latest (not hardcoded 2015–2024)

### Condition detail bottom sheet
- Slides up from bottom on hotspot tap (340ms QS easing)
- Handle bar, backdrop blur
- Content: system eyebrow (colored) + × close button, MOMCAKE condition name (30px), aqua date chip, clinical note (Barlow Condensed 400, 16px, muted), source document (Source Code Pro, 12px)

### QS wordmark
- Absolute lower-left, `opacity:0.3`, white version, no label

---

## Sample conditions dataset (11 conditions)

| ID | System | Label | Year | SVG cx/cy |
|---|---|---|---|---|
| htn | cardio | Hypertension | 2019 | 112, 168 |
| afib | cardio | Atrial Fibrillation | 2021 | 135, 178 |
| asthma | pulm | Asthma | 2015 | 89, 194 |
| covid | pulm | COVID-19 | 2022 | 171, 194 |
| migraine | neuro | Migraine disorder | 2018 | 148, 45 |
| disc | msk | L4–L5 disc herniation | 2020 | 130, 325 |
| gerd | gi | GERD | 2016 | 114, 267 |
| stones | renal | Kidney stones | 2021 | 87, 292 |
| thyroid | endo | Hypothyroidism | 2017 | 130, 105 |
| lymph1 | lymph | Reactive lymphadenopathy | 2023 | 76, 130 |
| fibroid | repro | Uterine fibroids | 2020 | 130, 402 |

---

## Animation / motion spec

| Easing | Value |
|---|---|
| Brand easing | `cubic-bezier(0.16, 1, 0.3, 1)` |
| Micro (toggle) | 120–220ms |
| Sheet slide | 340ms |
| Screen transition | 380–480ms |
| Legend collapse | 320ms |

Keyframes defined: `pulse-ring`, `scan-line`, `fade-up`, `dot-blink`, `glow-pulse`, `body-reveal`

---

## Assets on disk

```
mAI Genki.dc.html          — main file
fonts/
  MOMCAKE-Bold.otf
  MOMCAKE-Thin.otf
  BourbonGrotesque-Regular.otf
  SourceCodePro-Regular.otf.woff2
assets/
  icon-black.svg            — QS simplex mark (dark)
  icon-white.svg            — QS simplex mark (light)
  logo-black.svg            — QS full wordmark (dark)
  logo-white.svg            — QS full wordmark (light)
_ds/qsxc-designsys-609610ba-6924-415c-8ab5-533e3cf06c97/
  _ds_bundle.js             — design system bundle
  base.css / colors_and_type.css
```

---

## Pending work (next session)

1. **Time rail overhaul** — log-scale axis, color-coded horizontal tick segments per condition, YYYY-MMM drag label, age/date toggle, dynamic range from first→latest condition
2. **Upload page body copy** — change to "Upload health record PDFs. Every condition mapped to anatomy — across time." (inline comment pending)
3. **Multi-PDF support** — ability to add more PDFs after initial upload
4. **Condition timeline list view** — alternate tab alongside body map
5. **Age display mode** — user enters DOB, axis switches from YYYY to age in years
6. **Analyzing screen dot colors** — update to match final 10-system color palette
7. **Export / share screen** — share a snapshot of the body map
