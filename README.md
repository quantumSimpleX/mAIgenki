# mAIgenki

![mAI Genki Splash Screen](https://github.com/quantumSimpleX/mAIgenki/blob/2412d749f7cdd701028b9cccbe275d452ad56963/SplashScreen.png)

## Why

Medical history piles up as disconnected PDFs across different providers, portals, and years. Nobody has time to re-read years of lab reports and visit summaries to understand how their health has actually changed — so most people never do, and the big picture stays invisible.

## What

mAIgenki turns a stack of medical PDFs into a single visual story: upload your records, and the app extracts your conditions, maps each one to an organ system, and renders your entire health history as toggleable transparent anatomical layers on a human body — scrollable through time. Tap a highlighted region to see the condition, the date, and the evidence behind it. All processing and storage stays on-device; no account required.

## For Who

Anyone with accumulated medical records — especially people managing multiple chronic conditions across multiple providers — who wants to see the whole picture at a glance instead of re-reading every document.

## How

- **Upload** a PDF (or scanned image) of a medical record.
- **Extraction** — text is pulled on-device (native PDF/OCR libraries); nothing raw ever leaves the device.
- **Enrichment** — the extracted plain text (PII redacted first) is sent to an LLM via OpenRouter, which identifies conditions and measurements; clinical threshold rules add further inferred conditions (e.g. persistent high blood pressure → hypertension).
- **Storage** — everything is persisted to an on-device SQLite database.
- **Visualization** — `bodymap.tsx` renders the result as stacked, toggleable anatomical layers with a scrollable time rail and a per-condition drill-down.

Built with Expo (React Native), TypeScript, NativeWind, and OpenRouter. See `CLAUDE.md` for architecture, and `doc.InitialCoreBuild/SPEC.md` for the full requirements spec.

## Getting started

```bash
npm install
npx expo start         # dev server
npx expo start --web   # browser
```

## Commands

```bash
npm run typecheck   # tsc --noEmit
npm test            # jest --coverage
npx expo lint       # ESLint
```
