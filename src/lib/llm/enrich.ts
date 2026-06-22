import { callLLMWithFallback, DEFAULT_MODELS } from './client'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ConditionInput = {
  name_medical: string
  name_common: string | null
  system: string
  organ: string | null
  anatomical_location: string | null
  status: 'documented' | 'resolved' | 'suspected'
  severity: string | null
  date_onset: string | null
  date_diagnosed: string | null
  evidence: string | null
}

export type MeasurementInput = {
  name: string
  value_numeric: number
  unit: string
  reference_low: number | null
  reference_high: number | null
  flag: 'low' | 'high' | 'critical' | null
  date: string | null
}

export type EnrichmentResult = {
  conditions: ConditionInput[]
  measurements: MeasurementInput[]
}

const EMPTY: EnrichmentResult = { conditions: [], measurements: [] }

// ── Validate callback ─────────────────────────────────────────────────────────

function parseEnrichment(content: string): EnrichmentResult | null {
  try {
    const cleaned = content.replace(/```(?:json)?\n?|\n?```/g, '').trim()
    const parsed = JSON.parse(cleaned) as unknown
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      Array.isArray((parsed as Record<string, unknown>).conditions) &&
      Array.isArray((parsed as Record<string, unknown>).measurements)
    ) {
      return parsed as EnrichmentResult
    }
  } catch { /* fall through */ }
  return null
}

// ── Prompt ────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a clinical data extraction assistant. Your task is to extract structured medical information from health records written in any language (English, Traditional Chinese, Japanese, or others).

Always respond with a single JSON object — no markdown, no explanation. The JSON must have exactly two keys:

{
  "conditions": [
    {
      "name_medical": "standardized English medical name (e.g. Essential hypertension)",
      "name_common": "plain English name or null",
      "system": "one of: cardiovascular, respiratory, digestive, musculoskeletal, nervous, endocrine, urinary, reproductive, immune, integumentary",
      "organ": "specific organ or null",
      "anatomical_location": "specific location or null",
      "status": "documented | resolved | suspected",
      "severity": "mild | moderate | severe | null",
      "date_onset": "YYYY-MM-DD or null",
      "date_diagnosed": "YYYY-MM-DD or null",
      "evidence": "brief verbatim quote from the record that supports this condition, or null"
    }
  ],
  "measurements": [
    {
      "name": "standardized English measurement name (e.g. HbA1c, Blood Pressure Systolic)",
      "value_numeric": <number>,
      "unit": "unit string (e.g. %, mmHg, mg/dL)",
      "reference_low": <number or null>,
      "reference_high": <number or null>,
      "flag": "low | high | critical | null",
      "date": "YYYY-MM-DD or null"
    }
  ]
}

Rules:
- Output all condition names and measurement names in English, regardless of the source language.
- Extract every distinct medical condition mentioned, including chronic diseases, acute diagnoses, and resolved conditions.
- Extract every numeric lab value, vital sign, or clinical measurement, even if you do not flag it.
- If the record contains no conditions, return an empty array for "conditions".
- If the record contains no measurements, return an empty array for "measurements".
- Never invent data not present in the record.
- Never recommend treatments or medications.`

// ── Main export ───────────────────────────────────────────────────────────────

export async function enrichFromText(
  text: string,
  apiKey: string,
  models?: string[],
): Promise<EnrichmentResult> {
  const result = await callLLMWithFallback<EnrichmentResult>({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Extract all medical conditions and measurements from the following health record:\n\n${text}` },
    ],
    apiKey,
    models: models && models.length > 0 ? models : DEFAULT_MODELS,
    temperature: 0,
    label: 'enrich',
    validate: parseEnrichment,
  })

  return result.value ?? EMPTY
}
