import type { SQLiteDatabase } from 'expo-sqlite'
import { extractTextFromPDF } from './pdf/extract'
import { extractTextFromImage } from './ocr/extract'
import { enrichFromText } from './llm/enrich'
import { applyInferenceRules } from './inference/rules'
import { getModelChain } from './llm/client'
import { insertHealthRecord, insertCondition, insertMeasurement } from './db/queries'

// ── Error ─────────────────────────────────────────────────────────────────────

export class OcrRequiredError extends Error {
  constructor() {
    super('This PDF appears to be image-based. Please use an OCR tool to convert it to a text-based PDF, then upload again.')
    this.name = 'OcrRequiredError'
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type PipelineOptions = {
  uri: string
  db: SQLiteDatabase
  apiKey: string
  models?: string[]
  sex?: 'male' | 'female'
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
  const { uri, db, apiKey, sex } = opts

  // Step 1 — extract text
  let text: string
  let extractionMethod: string
  let pageCount: number | null = null

  if (isPdf(uri)) {
    const extracted = await extractTextFromPDF(uri)
    if (extracted.method === 'ocr') throw new OcrRequiredError()
    text = extracted.text
    pageCount = extracted.pageCount
    extractionMethod = 'text'
  } else {
    text = await extractTextFromImage(uri)
    extractionMethod = 'image'
  }

  // Step 2 — get model chain, enrich with LLM
  const models = opts.models ?? await getModelChain(db)
  const { conditions: llmConditions, measurements } = await enrichFromText(text, apiKey, models)

  // Step 3 — apply threshold inference rules
  const inferredConditions = applyInferenceRules(measurements, llmConditions, sex)
  const allConditions = [...llmConditions, ...inferredConditions]

  // Step 4 — persist health record
  const recordId = await insertHealthRecord(db, {
    filename: filenameFromUri(uri),
    pageCount,
    extractionMethod,
  })

  // Step 5 — persist conditions
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

  // Step 6 — persist measurements
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

  return {
    recordId,
    conditionCount: allConditions.length,
    measurementCount: measurements.length,
  }
}
