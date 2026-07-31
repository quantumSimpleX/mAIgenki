# Research Notes

Living document. Add new findings here before making decisions. Resolved items are marked.

---

## Summary of All Decisions

| Area | Decision | Key Reason |
|---|---|---|
| Framework | Expo (React Native) | Single codebase — iOS, Android, web |
| Language | TypeScript | Type safety for complex health data model |
| Storage | expo-sqlite (on-device only) | Medical data never leaves device — privacy as a feature |
| PDF extraction — text | `expo-pdf-text-extract` | On-device, MIT, fast (<100ms/10 pages) |
| PDF extraction — scanned | `expo-ocr` fallback | On-device OCR via iOS Vision + Android MLKit |
| LLM provider | OpenRouter | Free tier works out of the box; user can add own key for premium models |
| Default LLM | `meta-llama/llama-3.1-8b-instruct:free` | No API key required |
| Vision LLM (OCR) | `google/gemini-flash-1.5:free` | Free multimodal; handles scanned PDF page images |
| LLM integration | `openai` npm package + custom `baseURL` | OpenRouter is OpenAI-compatible |
| Anatomy rendering | Pre-rendered PNGs, stacked as absolute `Image` components | SVG paths can't achieve illustrated 3D quality |
| Anatomy source | Z-Anatomy + BodyParts3D (CC-BY) + MPFB 2 (CC0) | All 10 systems covered; zero cost; Blender-ready |
| Anatomy render style | Blender Eevee + toon/NPR shader | Illustrated, not photographic — medical app aesthetic |
| Body type | Inferred from records; user prompted only if indeterminate | Reduces friction |
| Condition chat | Session-only LLM chat with condition context injected | Educational only; not medical advice |
| Auth | Deferred — no auth for MVP | Frictionless upload → visualize is the aha moment |

**All 10 organ systems confirmed covered by Z-Anatomy / BodyParts3D.** Two caveats handled by existing plan: female reproductive via MPFB 2; integumentary only needs body surface silhouette.

---

---

## PDF Text Extraction

**Status: Resolved** — expo-pdf-text-extract (text) + expo-ocr (scanned fallback)

### Options Evaluated

| Package | Platform | Method | License | Notes |
|---|---|---|---|---|
| `expo-pdf-text-extract` ✅ | iOS + Android | iOS PDFKit / Android PDFBox | MIT | Fast (<100ms/10 pages), on-device, requires dev build |
| `expo-ocr` ✅ | iOS + Android | iOS Vision / Android MLKit | Open source | On-device OCR, SDK 52+, fallback for scanned PDFs |
| `expo-text-extractor` | iOS + Android | Same as expo-ocr | Open source | Alternative to expo-ocr, SDK 52+ |
| `pdfjs-dist` | Web only | JavaScript PDF parser | Apache 2.0 | Web-only; does not work natively on iOS/Android |
| `react-native-pdf` | iOS + Android | Renders PDF, limited text API | MIT | Good for display, poor for extraction |

### Decision
- **Text-based PDFs:** `expo-pdf-text-extract` (fast path, on-device)
- **Scanned/image PDFs:** `expo-ocr` fallback (on-device OCR, no cloud needed)
- Both require an Expo dev build (not compatible with Expo Go)
- Both keep all data on-device — no external service

---

## LLM / AI Enrichment

**Status: Resolved** — OpenRouter with free-tier models; user can add own key

### Options Evaluated

| Provider | Free Tier | Key Required | Notes |
|---|---|---|---|
| OpenRouter ✅ | Yes (multiple free models) | Optional | OpenAI-compatible API; aggregates many providers |
| Claude API (Anthropic) | No | Yes | High quality; costs money out of the box |
| OpenAI | Limited ($5 credit) | Yes | Costs money; GPT-4o best in class |
| Local LLM (llama.cpp) | Yes | No | Too heavy for mobile; no internet required |
| AWS Textract + LLM | Pay-per-use | Yes | Cloud; violates local-data requirement |

### Free Models via OpenRouter (no key required)
| Model ID | Type | Best For |
|---|---|---|
| `meta-llama/llama-3.1-8b-instruct:free` | Text | Condition extraction + organ tagging |
| `google/gemini-flash-1.5:free` | Vision + Text | Scanned PDF OCR via image input |
| `microsoft/phi-3-mini-128k-instruct:free` | Text | Lightweight alternative |
| `mistralai/mistral-7b-instruct:free` | Text | General enrichment |

### Decision
- Use OpenRouter with `meta-llama/llama-3.1-8b-instruct:free` as default (no key, no cost)
- Vision fallback: `google/gemini-flash-1.5:free` for scanned PDF pages
- User can enter their own OpenRouter key in Settings to unlock GPT-4o, Claude, etc.
- Integration: use `openai` npm package with `baseURL: 'https://openrouter.ai/api/v1'`

---

## Anatomy Assets

**Status: Revised** — Pre-rendered PNG layers via Blender 3D pipeline (Z-Anatomy + MPFB 2)

> **Why revised:** `react-body-highlighter` and SVG path approaches do not meet the quality bar. Assets need to be illustrated, high-resolution, and 3D in appearance — not flat vector. Pre-rendered PNGs from a Blender toon-shader pipeline achieve this at zero cost.

### Options Evaluated

| Source | License | Format | Quality | Male/Female | Notes |
|---|---|---|---|---|---|
| `react-body-highlighter` ❌ | MIT | SVG | Low (flat vector, muscle regions) | Yes | Does not meet quality bar |
| Wikimedia Commons (Gray's) ❌ | CC-BY-SA | SVG | Medium (2D line art) | Partial | Accurate but flat; not 3D illustrated |
| OpenStax Anatomy & Physiology | CC-BY 4.0 | PNG/PDF | Medium-High | Yes | 2D textbook illustrations; not 3D |
| **Z-Anatomy** ✅ | CC-BY-SA | OBJ/FBX (Blender) | Excellent | Via MPFB 2 | 5,000+ structures from BodyParts3D; Blender-native |
| **BodyParts3D (DBCLS)** ✅ | CC-BY 4.0 | OBJ/STL | Excellent | Primarily male | Comprehensive organ systems; Blender-ready |
| **MakeHuman / MPFB 2** ✅ | CC0 | OBJ/FBX (Blender) | Excellent | Both | Generates base body mesh; male + female variants |
| OpenAnatomy Project (Harvard) | BSD-based | 3D Slicer | Medical-grade | Limited | Best for nervous system; less complete elsewhere |
| NIH 3D Print Exchange | CC/Public Domain | STL/OBJ | Medical (photorealistic) | Mixed | Derived from medical imaging; needs NPR post-processing |
| Sketchfab (CC models) | Varies | Various | Mixed | Mixed | Verify per model; not reliably zero-cost |
| Zygote Body | Commercial | — | Excellent | Yes | Not free; reference only |

### Recommended Pipeline (zero cost)

```
Z-Anatomy + BodyParts3D (3D organ models, CC-BY)
        +
MPFB 2 / MakeHuman (male + female base body mesh, CC0)
        ↓
Blender — Eevee or Cycles + Toon/NPR shader
        ↓
Render each organ system as PNG (transparent background, illustrated style)
        ↓
10 PNG files per body type (male/female) × front view = 20 asset files
        ↓
React Native — stacked absolute-positioned <Image> components in BodyCanvas
```

### Architecture Implication
**SVG path groups → pre-rendered PNG layers.** Each organ system is a PNG with a transparent background rendered in Blender. `BodyCanvas` stacks them as absolute-positioned `Image` components. Toggling a layer = setting `opacity: 0` or unmounting. Color tinting per layer applied via React Native `tintColor` or a color-multiply shader if needed.

This is simpler to implement in React Native than complex SVG path compositing, and achieves the 3D illustrated aesthetic that SVG never could.

### 10 Organ System Layers
| System | Color | Key Structures |
|---|---|---|
| Cardiovascular | Red | Heart, aorta, major vessels |
| Respiratory | Blue | Lungs, trachea, bronchi |
| Digestive | Orange | Stomach, intestines, liver, pancreas |
| Nervous | Yellow | Brain, spinal cord |
| Musculoskeletal | Purple | Spine, major joints, bones |
| Endocrine | Pink | Thyroid, adrenals, pancreas (endocrine) |
| Urinary | Teal | Kidneys, ureters, bladder |
| Reproductive | Magenta | Sex-specific (male/female PNG sets differ) |
| Immune / Lymphatic | Green | Lymph nodes, spleen, thymus |
| Integumentary | Tan | Skin/body silhouette base layer |

### Where to Preview Asset Quality

| Resource | What you'll see | URL | Status |
|---|---|---|---|
| Z-Anatomy itch.io demo | Full atlas in-browser, togglable organ layers — closest to final app UX | https://lluisv.itch.io/z-anatomy | ✅ Working |
| Z-Anatomy Sketchfab | Interactive 3D models per structure | https://sketchfab.com/Z-Anatomy | ✅ Working |
| Z-Anatomy official site | Screenshots + overview | https://www.z-anatomy.com/ | ✅ Working |
| Z-Anatomy Blender video | Workflow + rendered output | https://video.blender.org/w/nwugqp7cGM7Ko65r2Bh73U | ✅ Working |
| CG Channel writeup | Visual overview with screenshots | https://www.cgchannel.com/2022/05/check-out-amazing-free-3d-anatomy-reference-z-anatomy/ | ✅ Working |
| AnatomyTOOL | Open-source 3D atlas by university anatomists | https://anatomytool.org/open3dmodel | ✅ New find |
| Innerbody.com | Free interactive 3D viewer — quality benchmark (not for use in app) | https://www.innerbody.com/htm/body.html | ✅ Working |
| BodyParts3D web viewer | Raw 3D model quality | http://lifesciencedb.jp/ag/bp3d/ | ❌ Offline (404) |

> The itch.io demo is the fastest quality check — runs the full atlas with layer toggling in-browser. Blender toon-shader renders will look better than the raw viewer since lighting and style are fully controllable.

### System Coverage Confirmed

| System | Z-Anatomy / BodyParts3D | Notes |
|---|---|---|
| Cardiovascular | ✅ | Heart + major vessels (full-body CT source) |
| Respiratory | ✅ | Lungs, trachea, bronchi |
| Digestive | ✅ | Full GI tract, liver, pancreas |
| Nervous | ✅ | Brain, spinal cord, cranial nerves |
| Musculoskeletal | ✅ | Bones, cartilage, major joints |
| Endocrine | ✅ | Thyroid, adrenals, pituitary |
| Urinary | ✅ | Kidneys, ureters, bladder |
| Reproductive | ⚠️ | Male only in base model — female via MPFB 2 (already planned) |
| Immune / Lymphatic | ✅ | Lymph nodes, spleen, thymus |
| Integumentary | ⚠️ | Surface mesh present; detailed skin minimal — only need silhouette outline as base layer |

**Verdict: All 10 systems covered.** Two caveats are both handled by the existing plan.

### Asset Production Notes
- Blender render resolution: minimum 1080×1920px (portrait, mobile-first)
- All layers share identical canvas size and coordinate space so they align when stacked
- Body silhouette (integumentary/skin layer) is the bottom-most layer, always visible
- Male and female sets differ primarily in reproductive layer + body proportions
- Placeholder: solid-color ellipses at approximate anatomical positions during development
- **This is a design/3D art task** — estimated 3–5 days for someone with Blender experience

---

## Local Storage

**Status: Resolved** — expo-sqlite

### Options Evaluated

| Option | Platform | Notes |
|---|---|---|
| `expo-sqlite` ✅ | iOS + Android + Web | Built into Expo; SQL queries; persistent; well-documented |
| AsyncStorage | All | Key-value only; not suitable for relational health data |
| WatermelonDB | iOS + Android | High-performance reactive DB; overkill for MVP |
| MMKV | iOS + Android | Key-value; fast; not relational |
| Realm | iOS + Android | Good but heavier dependency |

### Decision
- `expo-sqlite` for all structured health data (records, conditions, timestamps)
- No remote database at any point — local-first is a privacy feature, not a constraint

---

---

## OpenRouter Model Options

**Status: Documented** — free tier default, user-configurable

### Free Models (no API key required)
| Model ID | Type | Context | Best For |
|---|---|---|---|
| `meta-llama/llama-3.1-8b-instruct:free` | Text | 128k | PDF enrichment, condition extraction |
| `google/gemini-flash-1.5:free` | Vision + Text | 1M | Scanned PDF OCR, fast responses |
| `microsoft/phi-3-mini-128k-instruct:free` | Text | 128k | Lightweight fallback |
| `mistralai/mistral-7b-instruct:free` | Text | 32k | General enrichment |

### Recommended Paid Models (user's own key)
| Model ID | Strengths | Notes |
|---|---|---|
| `openai/gpt-4o` | Best accuracy for complex/ambiguous medical text | Most expensive |
| `anthropic/claude-sonnet-4-6` | Strong reasoning, good at structured output | Good balance |
| `google/gemini-pro-1.5` | Huge context window (good for long records) | Fast |
| `openai/gpt-4o-mini` | Cheap, fast, good enough for most records | Best cost/quality ratio |

### Integration
- Use `openai` npm package with `baseURL: 'https://openrouter.ai/api/v1'`
- Same client instance used for both PDF enrichment and condition chat
- API key read from local Zustand store (persisted to expo-sqlite)
- If no key: omit `Authorization` header — OpenRouter serves free models unauthenticated (rate-limited)

---

## Condition Chat Feature

**Status: Added to spec** — session-only LLM chat on condition drill-down

### Architecture Decision
- Chat is **session-only** (not persisted) for MVP — clears when user leaves screen
- Only the single condition's context is injected into the system prompt — not the full health record
- Same OpenRouter client used as PDF enrichment (user's model preference applies to both)
- Disclaimer shown before first message every session (cannot be dismissed permanently — reinforces educational intent)

### Chat UI Library Options
| Option | Notes |
|---|---|
| `react-native-gifted-chat` | Most popular RN chat UI; MIT; actively maintained |
| Custom FlatList | Full control; ~100 lines; no dependency needed for simple Q&A |
| `@flyerhq/react-native-chat-ui` | Modern, performant; MIT |

**Recommendation:** Custom `FlatList` for MVP — the chat is simple Q&A (not multimedia), avoids a heavy dependency, and matches the app's minimal style.

### System Prompt Design
Context injected per session:
- Condition name, status (documented/inferred), date, organ system
- Evidence text from the PDF (the raw excerpt that surfaced the condition)
- Explicit instruction: educational only, not medical advice, always refer to doctor

---

## Portable Binary Storage Clarification

- `expo-sqlite` stores every structured record and binary asset needed to
  reconstruct the explorer; embedded X-rays and report images may use BLOBs.
- SQLite is the complete portable source of truth. An app-private path or OS
  photo-library asset cannot be the only stored copy.
- Export/import must preserve BLOBs losslessly so a user-owned backup saved to a
  computer or chosen cloud drive can recreate the complete explorer.
- The app provides no managed remote database. Explicit user-owned backup is
  allowed and is distinct from app-managed cloud storage.

---

## Future Research Areas

- [ ] **Auth (deferred):** Evaluate Clerk, Supabase Auth, or Expo Auth Session when auth phase begins
- [ ] **PDF rendering preview:** Package for showing PDF pages in-app before/during processing
- [ ] **Offline LLM on device:** Monitor progress of on-device LLM solutions (llama.cpp RN bindings) as a future privacy upgrade — eliminate the only network call
- [ ] **Anatomy SVG sources:** Evaluate BodyParts3D exports more thoroughly; may offer better base paths than manual Wikimedia compositing
- [ ] **Sync / backup (deferred):** iCloud / Google Drive backup of local SQLite as an optional privacy-preserving sync mechanism
