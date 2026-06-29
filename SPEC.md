# Spec: mAIgenki — Medical History Visualization App

## Objective

Build a mobile-first, cross-platform app (iOS, Android, web) that lets anyone upload their medical history PDFs and see their entire health — across all organ systems — visualized as toggleable transparent anatomical layers on a human body with a scrollable time axis.

**Core user story:**
> As someone with years of medical records scattered across providers, I upload my PDFs and immediately see which organ systems have been affected, what conditions I've accumulated, and how my health has changed over time — without reading a single document.

**The aha moment:** Upload PDF → see your body's health story mapped onto anatomy. No account required. No friction.

**Users:** Anyone with accumulated medical records, typically people managing multiple conditions.

**Success looks like:**
- User uploads a PDF and within 30 seconds sees conditions mapped to anatomical layers
- User toggles any combination of organ system layers simultaneously
- User scrolls the time rail and watches conditions appear/disappear
- Tapping a highlighted region reveals condition name, date, and supporting evidence
- Medical data never leaves the user's device

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | Expo (React Native) | Single codebase: iOS, Android, web |
| Language | TypeScript | Type safety for complex health data model |
| Local storage | expo-sqlite | On-device SQLite — data never leaves device |
| PDF extraction (text-based) | `expo-pdf-text-extract` | On-device via iOS PDFKit + Android PDFBox, MIT |
| PDF extraction (scanned/OCR) | `expo-ocr` fallback | On-device OCR via iOS Vision + Android MLKit |
| LLM enrichment | OpenRouter API (openai-compatible) | Free tier models; user can add own key for premium |
| Anatomy rendering | React Native SVG (`react-native-svg`) | SVG layers with per-system paths; viewBox 0 0 260 460 |
| State | Zustand | Lightweight, no boilerplate |
| Styling | NativeWind (Tailwind for RN) | Responsive, consistent across platforms |
| Navigation | Expo Router | File-based routing, web-compatible |

**Privacy model:** PDFs are processed on-device (text extraction via native libraries). Only extracted plain text — never raw PDFs or binary data — is sent to OpenRouter for condition enrichment. All structured results are stored on-device only (SQLite). No user accounts required.

**LLM key model:** App ships with OpenRouter free-tier models that require no API key. Users can enter their own OpenRouter API key in Settings to unlock faster models. Key is stored locally on-device only.

---

## Commands

```bash
npx expo start            # dev server (interactive platform picker)
npx expo start --ios      # iOS simulator
npx expo start --android  # Android emulator
npx expo start --web      # browser

npm run typecheck         # tsc --noEmit
npx expo lint             # ESLint
npm test                  # jest --coverage (80% target on src/lib/)
npx eas build             # production build
```

---

## Screens & Navigation

Three screens via Expo Router Stack:

1. **`src/app/index.tsx`** — Upload screen (entry point, aha moment)
2. **`src/app/analyzing.tsx`** — Processing animation (4 phases)
3. **`src/app/bodymap.tsx`** — Body map viewer (main experience)

Condition detail and Settings are **bottom sheets** within `bodymap.tsx`, not separate routes.

### Upload Screen (`index.tsx`)
- Dark background (#0A0A0F)
- Logo: "m/" in Barlow Condensed 700 + "Genki" in Bourbon Grotesque Regular
- Tagline below logo
- Upload zone: single 3-column grid box (PDF icon | "Upload records" | action)
- CTA button label: **"Explore demo data"**
- No separate upload/camera/gallery buttons — single tap-to-upload zone

### Analyzing Screen (`analyzing.tsx`)
- 4 phases (in order):
  1. Reading records
  2. Extracting diagnoses
  3. Mapping anatomy
  4. Building story
- Scan line color: **aqua (#1FC3A4)**
- Progress bar fills as phases complete

### Body Map Screen (`bodymap.tsx`)
- NavBar at top: back arrow | "Health Story" title | settings gear icon
- Legend panel (left side): 11 colored system chips, all independently toggleable — including Integumentary (toggling it off fades the ghost body silhouette to 0 opacity). Per design handoff, no layer is locked always-on.
- BodySvg: SVG anatomy (viewBox="0 0 260 460"), organ highlight paths per system + condition dots
- Time rail: **vertical, right side**, log-scale (K=2.5), tick marks 14px inactive / 36px active
- Tab switcher: **Body Map | Timeline** tabs to switch bodyMapMode
- ConditionSheet: animated bottom sheet when a condition dot is tapped
- SettingsSheet: animated bottom sheet from gear icon
- UploadPanel: FAB at bottom-right to add more records

---

## Organ Systems (11 Layers)

These are the canonical system IDs, display names, and colors. They are the source of truth — do not change without updating all pipeline code and the design.

| ID | Display Name | Color | Key anatomy |
|---|---|---|---|
| `integumentary` | Integumentary | `#4F46E5` (indigo) | Skin layer outline (ghost silhouette; toggleable like all other systems) |
| `muscular` | Muscular | `#F472B6` (pink) | Major muscle groups |
| `skeletal` | Skeletal | `#94A3B8` (slate) | Spine, major bones, joints |
| `cardiovascular` | Circulatory | `#EF4444` (red) | Heart, major vessels |
| `lymphatic` | Lymphatic | `#22C55E` (green) | Lymph nodes, spleen |
| `nervous` | Nervous | `#EAB308` (yellow) | Brain, spinal cord, nerves |
| `respiratory` | Respiratory | `#06B6D4` (cyan) | Lungs, trachea |
| `digestive` | Digestive | `#F97316` (orange) | Stomach, intestines, liver |
| `renal` | Renal | `#84CC16` (lime) | Kidneys, bladder |
| `endocrine` | Endocrine | `#D946EF` (fuchsia) | Thyroid, pancreas, adrenals |
| `reproductive` | Reproductive | `#C0526A` (rose) | Sex-specific organs |

Colors were chosen to minimize visual conflict when layers overlap on the dark background. The reproductive color was changed from `#7F1D1D` to `#C0526A` in design session 04 for visibility.

---

## Data Model

```typescript
// src/model/health.ts

export type OrgSystem =
  | 'integumentary' | 'muscular' | 'skeletal' | 'cardiovascular' | 'lymphatic'
  | 'nervous' | 'respiratory' | 'digestive' | 'renal' | 'endocrine' | 'reproductive'

export type ConditionStatus = 'documented' | 'resolved' | 'inferred'

export type Condition = {
  id: string
  name: string        // e.g. "Hypertension"
  organ: string       // e.g. "heart"
  system: OrgSystem
  date: string        // ISO date from record
  status: ConditionStatus
  evidence: string    // verbatim text excerpt from PDF
  sourceFile: string  // PDF filename
}

export type HealthRecord = {
  id: string
  filename: string
  uploadedAt: string
  conditions: Condition[]
}

// Final confirmed colors from design session 04
export const SYSTEM_COLORS: Record<OrgSystem, string> = { ... }
```

**`status: 'inferred'`** means the condition was derived from a clinical threshold rule (e.g., persistent BP ≥ 140/90 → hypertension), not explicitly stated in the record. Inferred conditions must be visually distinguished everywhere they appear (dashed border, different icon).

---

## Supported Languages

4 languages for initial release:

| Code | Display name |
|---|---|
| `en` | English |
| `zh-TW` | 繁體中文 |
| `ja` | 日本語 |
| `es` | Español |

Additional languages can be added later without architectural changes.

---

## Typography

| Usage | Font | Weight |
|---|---|---|
| Logo "m/" prefix | Barlow Condensed | 700 (Bold) |
| Logo "Genki" | Bourbon Grotesque | Regular |
| UI headings | MOMCAKE | Bold |
| UI body / captions | MOMCAKE | Thin |

Font files in `assets/fonts/`: MOMCAKE-Bold.otf, MOMCAKE-Thin.otf, BourbonGrotesque-Regular.otf. Barlow Condensed loaded from Google Fonts.

---

## Color Palette

| Role | Value |
|---|---|
| Background | `#0A0A0F` |
| Surface / card | `#12121A` |
| Border | `#1E1E2E` |
| Primary text | `#E8E8F0` |
| Secondary text | `#6B7280` |
| Accent / scan line | `#1FC3A4` (aqua) |
| Accent button | `#8A60EB` (purple) |

---

## Data Pipeline

```
PDF upload
  → src/lib/pdf/extract.ts        (text extraction; OCR fallback for scanned PDFs)
  → src/lib/privacy/redact.ts     (PII redaction — two-pass sweep before LLM call)
  → src/lib/llm/enrich.ts         (LLM extracts Condition[] from plain text)
  → src/lib/inference/rules.ts    (clinical threshold rules add inferred conditions)
  → src/lib/db/queries.ts         (persist to SQLite via expo-sqlite)
  → Zustand store                 (bodymap.tsx reads and renders)
```

---

## Time Rail

The time rail is **vertical, on the right side** of the body map screen.

- **Scale:** Logarithmic with K=2.5 (more space near recent dates)
- **Tick height:** 14px when inactive, 36px when active/selected
- **Direction:** Top = oldest, bottom = most recent
- Dragging the handle scrubs through time; conditions on the body map appear/disappear based on date

---

## Body Map View Modes

The body map screen has two tab modes (`bodyMapMode: 'body' | 'list'`):

- **Body Map** — SVG anatomy view with interactive organ highlights
- **Timeline** — Chronological list of all conditions

---

## Condition Records

Each condition in the demo data (`CONDITIONS` in `src/model/conditions.ts`) has 2–3 associated records. Record types:

| Type | Meaning |
|---|---|
| TREND | Trending numeric value over time |
| ECG | Electrocardiogram |
| IMAGING | Imaging study (X-ray, MRI, CT, ultrasound) |
| LABS | Laboratory results |
| SPIRO | Spirometry / pulmonary function test |
| SCAN | Generic scan result |

Records are displayed in the ConditionSheet when a condition is tapped. Tapping a record opens a full-screen lightbox at z-index 100 (phone-screen level, above all navigation).

---

## Condition Chat

Accessible from the ConditionSheet via a chat button.

**Purpose:** Let users understand what their conditions mean in plain language. Educational only — not medical advice.

**How it works:**
1. User taps a condition dot on the body map → ConditionSheet opens
2. Taps the chat button → chat panel opens within the sheet
3. Educational disclaimer is shown before the first message every session: *"This is a health education tool, not a medical professional. Nothing here constitutes medical advice. Always consult your doctor for medical decisions."*
4. User asks questions in plain language
5. LLM responds with context-aware educational explanation

**System prompt:**
```
You are a health education assistant helping a user understand their personal medical history.
You have access to the following condition from their records:

Condition: {condition.name}
Status: {condition.status}
Date: {condition.date}
System: {condition.system}
Evidence from their records: {condition.evidence}

Help the user understand what this means in plain language.
You are NOT a medical professional and this is NOT medical advice.
Always encourage the user to consult their doctor for medical decisions.
Keep responses clear and accessible — assume no medical background.
```

**Constraints (non-negotiable):**
- Chat is session-only — never persisted to SQLite
- Only the condition context is injected — never the full health record
- Educational disclaimer must appear before the first message every session; cannot be permanently dismissed
- LLM must never recommend specific treatments, medications, or dosages

---

## Anatomy Assets

**Approach:** React Native SVG (`react-native-svg`) with viewBox="0 0 260 460". Each organ system has SVG path(s) composited at accurate anatomical positions. All paths share the same coordinate space and are stacked as SVG `<G>` elements with per-system fill/opacity.

During development, placeholder ellipses at approximate anatomical positions stand in until final SVG paths are traced.

**Body type:** Inferred from uploaded medical records. User is prompted to select only if gender cannot be determined from records.

---

## Project Structure

```
mAIgenki/
├── src/
│   ├── app/
│   │   ├── _layout.tsx             # Font loading + Stack navigator
│   │   ├── index.tsx               # Upload screen
│   │   ├── analyzing.tsx           # 4-phase analysis animation
│   │   └── bodymap.tsx             # Body map + condition/settings sheets
│   ├── components/
│   │   └── anatomy/
│   │       └── BodyCanvas.tsx      # SVG body (placeholder; final paths TBD)
│   ├── lib/
│   │   ├── pdf/extract.ts          # PDF → plain text (platform-aware)
│   │   ├── privacy/redact.ts       # PII redaction (two-pass)
│   │   ├── llm/
│   │   │   ├── client.ts           # OpenRouter client + fallback chain
│   │   │   └── enrich.ts           # Plain text → Condition[] via LLM
│   │   ├── inference/rules.ts      # Clinical threshold rules
│   │   └── db/
│   │       ├── schema.ts           # SQLite table definitions
│   │       └── queries.ts          # Typed query helpers
│   ├── model/
│   │   ├── health.ts               # OrgSystem, Condition, HealthRecord + SYSTEM_COLORS
│   │   └── conditions.ts           # Demo CONDITIONS[], SYSTEM_META, SupportedLang
│   └── store/useAppStore.ts        # Zustand store
├── assets/
│   ├── anatomy/                    # SVG/PNG anatomy assets (TBD)
│   └── fonts/                      # MOMCAKE-Bold.otf, MOMCAKE-Thin.otf, BourbonGrotesque-Regular.otf
├── tests/lib/                      # Unit tests for pipeline logic
└── global.css                      # NativeWind entry point
```

---

## Testing Strategy

- **Unit tests (Jest):** `tests/lib/` — PDF text extraction, LLM response parsing, clinical inference rules, DB queries. 80% coverage target on `src/lib/`.
- **Manual testing:** Upload → visualize flow on iOS simulator, Android emulator, and Chrome.
- No e2e for MVP.

---

## Hard Constraints

**Always:**
- Store all health data locally (SQLite). No remote database.
- Send only extracted plain text to the LLM API — never raw PDFs or binary data.
- Label inferred conditions visually as "inferred" — never present as diagnoses.
- Show the educational disclaimer before the first chat message every session.
- Store the OpenRouter API key on-device only — never log or transmit elsewhere.

**Ask before changing:**
- Adding cloud storage or sync of health data
- Adding user authentication or accounts
- Changing the LLM provider
- Adding or removing an organ system from `OrgSystem`
- Persisting chat history to SQLite
- Any feature that sends health data to a third party

**Never:**
- Store raw PDFs on any remote server
- Present inferences as medical diagnoses
- Let the LLM recommend treatments, medications, or dosages
- Claim clinical accuracy or regulatory compliance
- Allow condition chat to access health records beyond the single condition in context

---

## Open Questions

- **Anatomy SVG paths:** Final organ paths need to be traced into the 260×460 coordinate space per body type. Placeholder ellipses are used during development. This is 2–3 days of design/tracing work.
- **Additional languages:** Architecture supports adding more `SupportedLang` values; localNames in CONDITIONS would need to be populated.
