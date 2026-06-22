# Spec: mAIgenki — Medical History Visualization App

## Objective

Build a mobile-first, cross-platform app (iOS, Android, web) that lets anyone upload their medical history PDFs and see their entire health — across all organ systems — visualized as toggleable transparent anatomical layers on a scrollable time axis.

**Core user story:**
> As someone with years of medical records scattered across providers, I upload my PDFs and immediately see which organ systems have been affected, what conditions I've accumulated, and how my health has changed over time — without reading a single document.

**The aha moment:** Upload PDF → see your body's health story mapped onto anatomy. No account required. No friction.

**Users:** Anyone with accumulated medical records, typically people who are older or managing multiple conditions.

**Success looks like:**
- User uploads a PDF and within 30 seconds sees conditions mapped to anatomical layers
- User toggles any combination of organ system layers simultaneously
- User scrolls the time axis and watches conditions appear/disappear
- Tapping a highlighted region reveals condition name, date, and supporting evidence from the record
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
| Default free LLM | `meta-llama/llama-3.1-8b-instruct:free` | No cost, no key required out of box |
| Vision LLM (OCR fallback) | `google/gemini-flash-1.5:free` | Free multimodal for scanned page images |
| Anatomy rendering | React Native `Image` (absolute-positioned, stacked) | Pre-rendered PNGs with transparency; simpler than SVG paths |
| Anatomy assets | Z-Anatomy + BodyParts3D → Blender toon render → PNG | CC-BY; illustrated 3D style; zero cost |
| State | Zustand | Lightweight, no boilerplate |
| Styling | NativeWind (Tailwind for RN) | Responsive, consistent across platforms |
| Navigation | Expo Router | File-based routing, web-compatible |

**Privacy model:** PDFs are processed on-device (text extraction via native libraries). Only extracted plain text — never raw PDFs or binary data — is sent to OpenRouter for condition enrichment. Scanned PDF pages are rendered to images on-device and sent to a vision model for OCR. All structured results are stored on-device only (SQLite). No user accounts required for MVP.

**LLM key model:** App ships with OpenRouter free-tier models that require no API key — works out of the box. Users can enter their own OpenRouter API key in Settings to unlock faster, higher-quality models (GPT-4o, Claude Sonnet, Gemini Pro, etc.) and higher rate limits. The chosen model is used for both PDF enrichment and the condition chat feature. Key is stored locally on-device only (never sent anywhere except OpenRouter).

---

## Commands

```bash
# Install dependencies
npx expo install

# Start dev server (choose platform interactively)
npx expo start

# Run on iOS simulator
npx expo start --ios

# Run on Android emulator
npx expo start --android

# Run in web browser
npx expo start --web

# Type check
npx tsc --noEmit

# Lint
npx eslint src --ext .ts,.tsx --fix

# Test
npx jest --coverage

# Production build (EAS)
npx eas build
```

---

## Project Structure

```
mAIgenki/
├── src/
│   ├── app/                        # Expo Router screens (SDK 56 — routes live in src/app/)
│   │   ├── index.tsx               # Upload screen — entry point, aha moment
│   │   ├── visualize.tsx           # Main anatomy viewer with layer controls + timeline
│   │   ├── condition/[id].tsx      # Condition drill-down (text + evidence)
│   │   ├── condition/[id]/chat.tsx # LLM chat about a specific condition
│   │   └── settings.tsx            # LLM key entry, model selection, body type
│   ├── components/
│   │   ├── anatomy/
│   │   │   ├── BodyCanvas.tsx      # Stacks 10 Image layers (PNG per system)
│   │   │   └── layers/             # One PNG per organ system (male + female)
│   │   ├── timeline/
│   │   │   └── TimeScrubber.tsx
│   │   └── ui/                     # Shared primitives (Button, Card, etc.)
│   ├── lib/
│   │   ├── pdf/
│   │   │   └── extract.ts          # PDF → plain text (platform-aware)
│   │   ├── llm/
│   │   │   ├── client.ts           # OpenRouter client; reads user key from store
│   │   │   ├── enrich.ts           # Plain text → structured Condition[] via LLM
│   │   │   └── chat.ts             # Condition chat: context injection + turns
│   │   ├── inference/
│   │   │   ├── rules.ts            # Clinical threshold rules (BP → hypertension etc.)
│   │   │   └── bodyType.ts         # Infer male/female from record text
│   │   └── db/
│   │       ├── schema.ts           # SQLite table definitions
│   │       └── queries.ts          # Typed query helpers
│   ├── model/
│   │   └── health.ts               # OrgSystem, Condition, HealthRecord types + SYSTEM_COLORS
│   ├── store/
│   │   └── health.ts               # Zustand store (active layers, selected date, records)
│   └── global.css                  # NativeWind / Tailwind entry point
├── assets/
│   └── anatomy/                    # Pre-rendered PNG layers ({system}_{male|female}.png)
├── tests/
│   └── lib/                        # Unit tests for pipeline logic (80% coverage target)
├── expo-env.d.ts                   # CSS module + Expo type declarations
├── metro.config.js                 # NativeWind metro plugin
├── babel.config.js                 # NativeWind babel preset
├── tailwind.config.js
└── SPEC.md
```

---

## Data Model

```typescript
// src/model/health.ts

export type OrgSystem =
  | 'cardiovascular'
  | 'respiratory'
  | 'digestive'
  | 'musculoskeletal'
  | 'nervous'
  | 'endocrine'
  | 'urinary'
  | 'reproductive'
  | 'immune'
  | 'integumentary';

export type ConditionStatus = 'documented' | 'resolved' | 'inferred';

export type Condition = {
  id: string;
  name: string;           // e.g. "Hypertension"
  organ: string;          // e.g. "heart"
  system: OrgSystem;
  date: string;           // ISO date from record
  status: ConditionStatus;
  evidence: string;       // raw text excerpt from PDF supporting this condition
  sourceFile: string;     // PDF filename
};

export type HealthRecord = {
  id: string;
  filename: string;
  uploadedAt: string;
  conditions: Condition[];
};
```

**Inferred vs. documented:** Conditions derived from clinical threshold rules (e.g., BP 140/90 over multiple readings → hypertension) are tagged `status: 'inferred'` and visually distinguished from explicitly documented conditions.

---

## Code Style

```typescript
// Functions: verb phrases, explicit return types
async function extractConditionsFromText(text: string): Promise<Condition[]> { ... }

// Components: PascalCase, props typed inline or with named type
function SystemLayer({ system, conditions, visible, color }: {
  system: OrgSystem
  conditions: Condition[]
  visible: boolean
  color: string
}) { ... }

// Named exports only (except Expo Router screens which require default export)
export { SystemLayer }

// No comments unless the WHY is non-obvious
// No `any` — use `unknown` and narrow
```

- 2-space indent, single quotes, no semicolons
- `const` over `let`, never `var`
- Prefer `unknown` over `any`; narrow with type guards
- Co-locate types with the module that owns them; re-export from `src/model/` for shared types

---

## LLM Settings (User-Configurable)

Users can configure their LLM in Settings at any time:

| Setting | Default | Notes |
|---|---|---|
| OpenRouter API key | None (free tier) | Stored on-device only; unlocks paid models + higher rate limits |
| Model | `meta-llama/llama-3.1-8b-instruct:free` | Dropdown of supported OpenRouter models |
| Vision model (OCR) | `google/gemini-flash-1.5:free` | Used for scanned PDF pages |

**Recommended paid model suggestions to surface in UI:**
- `openai/gpt-4o` — best accuracy for complex records
- `anthropic/claude-sonnet-4-6` — strong reasoning, good for medical text
- `google/gemini-pro-1.5` — fast, long context window (useful for lengthy records)

The same model is used for both PDF enrichment and the condition chat feature. No separate configuration needed.

---

## Condition Chat Feature

Accessible from the condition drill-down screen via an "Ask about this" button.

**Purpose:** Let users understand what their conditions mean in plain language. Educational only — not medical advice.

**How it works:**
1. User opens a condition drill-down (e.g., "Hypertension — documented 2021")
2. Taps "Ask about this"
3. A disclaimer is shown before the first message: *"This is a health education tool, not a medical professional. Nothing here constitutes medical advice. Always consult your doctor for medical decisions."*
4. User types a question ("What does hypertension mean for me?", "Is this serious?", "What lifestyle changes help?")
5. LLM responds with context-aware educational explanation

**Context injected into every chat session (system prompt):**
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

**Constraints:**
- Chat is session-only — not persisted between app sessions (MVP simplicity)
- No conversation history saved to SQLite
- Only the condition context is sent — no other health records are included in the prompt unless the user pastes them manually

---

## Anatomy Assets

**Approach:** Each organ system is a **pre-rendered PNG with transparent background**, produced in Blender using Z-Anatomy + BodyParts3D (CC-BY 4.0) organ models and a toon/NPR shader. `BodyCanvas` stacks these as absolute-positioned `Image` components — toggling a layer sets `opacity: 0`. All PNGs share identical canvas dimensions so they align when overlaid.

**Source pipeline:** Z-Anatomy / BodyParts3D (3D organ models) + MPFB 2 / MakeHuman (male + female base mesh, CC0) → Blender Eevee + toon shader → 1080×1920px PNG per system per body type.

**During development:** Placeholder colored ellipses at approximate anatomical positions until final Blender renders are ready.

**Organ systems to implement (10 layers):**

| System | Color | Key organs shown |
|---|---|---|
| Cardiovascular | Red | Heart, major vessels |
| Respiratory | Blue | Lungs, trachea |
| Digestive | Orange | Stomach, intestines, liver |
| Nervous | Yellow | Brain, spinal cord |
| Musculoskeletal | Purple | Spine, major joints |
| Endocrine | Pink | Thyroid, pancreas, adrenals |
| Urinary | Teal | Kidneys, bladder |
| Reproductive | Magenta | Sex-specific (male/female SVG set) |
| Immune/Lymphatic | Green | Lymph nodes, spleen |
| Integumentary | Tan | Skin layer outline |

**Body type:** Inferred from uploaded medical records (gender field in lab reports, diagnoses). User is prompted to select male/female only if gender cannot be determined from records.

---

## Testing Strategy

- **Unit tests (Jest):** `tests/lib/` — PDF text extraction, LLM response parsing, clinical inference rules, DB queries. These are the riskiest parts of the pipeline.
- **Component tests (React Native Testing Library):** Layer toggle behavior, time scrubber interaction.
- **Manual testing:** Upload → visualize flow on iOS simulator, Android emulator, and Chrome (web).
- **No e2e for MVP** — manual device testing is sufficient at this stage.
- **Coverage target:** 80% on `src/lib/` (pipeline logic). UI coverage is not required for MVP.

---

## Boundaries

**Always:**
- Store all health data locally on-device (SQLite). No remote database.
- Send only extracted plain text to the LLM API — never raw PDFs, images, or binary data.
- Label inferred conditions visually as "inferred" — never present them as diagnoses.
- Show the educational disclaimer before the first message in every condition chat session.
- Warn users that the app is a visualization and education tool, not a medical device.
- Store the user's OpenRouter API key on-device only — never log or transmit it elsewhere.

**Ask first:**
- Adding cloud storage or sync of any health data.
- Adding user authentication or accounts.
- Changing the LLM provider away from OpenRouter.
- Adding a new organ system to `OrgSystem`.
- Persisting chat history to SQLite (currently session-only by design).
- Any feature that sends health data to a third party.

**Never:**
- Store raw PDFs or identifiable health data on any remote server.
- Present inferences as medical diagnoses.
- Let the LLM recommend specific treatments, medications, or dosages.
- Claim clinical accuracy or regulatory compliance.
- Allow the condition chat to access health records beyond the single condition in context.

---

## Success Criteria

- [ ] User uploads a PDF → conditions mapped on anatomical viewer within 30 seconds
- [ ] Each of the 10 organ systems is a distinct toggleable SVG layer with a unique color
- [ ] Any combination of layers (1 through all) can be active simultaneously with transparency
- [ ] Time scrubber moves through the full health timeline; conditions appear/disappear correctly
- [ ] Tapping a highlighted organ area navigates to drill-down: condition name, date, evidence text
- [ ] Inferred conditions are visually distinguished from documented conditions
- [ ] App works fully offline after initial PDF processing (LLM call is the only network dependency)
- [ ] Runs without modification on iOS, Android, and modern web browsers (single Expo codebase)
- [ ] No health data is written to any remote server at any point
- [ ] Settings screen allows user to enter their own OpenRouter API key and select a model
- [ ] Condition drill-down has an "Ask about this" button that opens the chat screen
- [ ] Chat screen shows educational disclaimer before the first message in every session
- [ ] LLM chat responses are context-aware (condition name, date, evidence injected into system prompt)
- [ ] Chat is session-only — cleared when user leaves the screen

---

## Open Questions

1. ~~**LLM API key:**~~ Resolved — OpenRouter free tier (no key required); user can add own key for premium models.
2. ~~**Native PDF extraction:**~~ Resolved — `expo-pdf-text-extract` (text PDFs) + `expo-ocr` fallback (scanned PDFs), both on-device.
3. ~~**Anatomy asset assembly:**~~ Resolved — custom `BodyCanvas` with `react-native-svg`, sourcing organ paths from Wikimedia Commons CC-BY-SA SVGs.
4. ~~**Body type selection:**~~ Resolved — inferred from records; user prompted only if indeterminate.
5. ~~**Auth deferral:**~~ Resolved — no auth for MVP. Frictionless upload → visualize is the aha moment. Auth is a later phase.

**Remaining open question:**
- **Anatomy SVG assembly is a design task.** The organ system paths need to be traced from Wikimedia source art and composited into a single coordinate space per body type. This is ~2–3 days of Inkscape/design work before the `BodyCanvas` component can render real anatomy. For early development, placeholder colored rectangles/ellipses in anatomically approximate positions can stand in until final SVGs are ready.
