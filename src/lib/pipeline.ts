import type { SQLiteDatabase } from 'expo-sqlite'
import { extractTextFromPDF } from './pdf/extract'
import { extractTextFromImage } from './ocr/extract'
import { enrichFromText } from './llm/enrich'
import { applyInferenceRules } from './inference/rules'
import { getModelChain } from './llm/client'
import { insertHealthRecord, insertCondition, insertMeasurement, getSetting } from './db/queries'
import { scheduleSnapshot } from './db/snapshot'
import { redactPII } from './privacy/redact'

// ── Error ─────────────────────────────────────────────────────────────────────

export class OcrRequiredError extends Error {
  constructor() {
    super('This PDF appears to be image-based. Please use an OCR tool to convert it to a text-based PDF, then upload again.')
    this.name = 'OcrRequiredError'
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

// Progress phases, reported at boundaries with monotonic fractions:
//   0 extract · 1 redact+enrich · 2 infer · 3 persist
export type ProgressPhase = 0 | 1 | 2 | 3

export type PipelineOptions = {
  uri: string
  db: SQLiteDatabase
  // Optional — falls back to the stored `openrouter_api_key` setting, then to
  // the free tier (service.ts resolves an empty key against the local/env
  // fallback key). Callers no longer need to read the setting themselves.
  apiKey?: string
  models?: string[]
  sex?: 'male' | 'female'
  // Explicit input kind from the picker; overrides the URI-suffix heuristic
  // (web blob/data URIs often lack a .pdf extension).
  kind?: 'pdf' | 'image'
  onProgress?: (phase: ProgressPhase, progress: number) => void
}

export type PipelineResult = {
  recordId: string
  conditionCount: number
  measurementCount: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isPdf(uri: string): boolean {
  return uri.toLowerCase().split('?')[0].endsWith('.pdf')
}

function filenameFromUri(uri: string): string {
  return uri.split('/').pop()?.split('?')[0] ?? 'unknown'
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

export async function processHealthRecord(opts: PipelineOptions): Promise<PipelineResult> {
  const { uri, db, sex, kind, onProgress } = opts
  const report = (phase: ProgressPhase, progress: number): void => onProgress?.(phase, progress)

  // Step 1 — extract text
  let text: string
  let extractionMethod: string
  let pageCount: number | null = null

  report(0, 0.05)
  const isPdfInput = kind ? kind === 'pdf' : isPdf(uri)
  if (isPdfInput) {
    const extracted = await extractTextFromPDF(uri)
    if (extracted.method === 'ocr') throw new OcrRequiredError()
    text = extracted.text
    pageCount = extracted.pageCount
    extractionMethod = 'text'
  } else {
    text = await extractTextFromImage(uri)
    extractionMethod = 'image'
  }

  // Step 2 — redact PII before any text leaves the device
  report(1, 0.4)
  const safeText = redactPII(text)

  // Step 3 — get model chain + API key, enrich with LLM
  const models = opts.models ?? await getModelChain(db)
  const apiKey = opts.apiKey ?? (await getSetting(db, 'openrouter_api_key')) ?? ''
  const { conditions: llmConditions, measurements } = await enrichFromText(safeText, apiKey, models)

  // Step 4 — apply threshold inference rules
  report(2, 0.75)
  const inferredConditions = applyInferenceRules(measurements, llmConditions, sex)
  const allConditions = [...llmConditions, ...inferredConditions]

  // Step 5 — persist health record
  report(3, 0.9)
  const recordId = await insertHealthRecord(db, {
    filename: filenameFromUri(uri),
    pageCount,
    extractionMethod,
  })

  // Step 6 — persist conditions
  for (const c of allConditions) {
    await insertCondition(db, {
      recordId,
      nameMedical: c.name_medical,
      nameCommon: c.name_common,
      system: c.system,
      organ: c.organ,
      anatomicalLocation: c.anatomical_location,
      status: c.status,
      severity: c.severity,
      certainty: c.certainty,
      dateOnset: c.date_onset,
      dateDiagnosed: c.date_diagnosed,
      evidence: c.evidence,
    })
  }

  // Step 7 — persist measurements
  for (const m of measurements) {
    await insertMeasurement(db, {
      recordId,
      name: m.name,
      valueNumeric: m.value_numeric,
      unit: m.unit,
      referenceLow: m.reference_low,
      referenceHigh: m.reference_high,
      flag: m.flag,
      date: m.date ?? today(),
    })
  }

  scheduleSnapshot(db)
  report(3, 1)

  return {
    recordId,
    conditionCount: allConditions.length,
    measurementCount: measurements.length,
  }
}
