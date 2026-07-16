import { callLLMWithFallback, DEFAULT_MODELS, type LLMTraceEvent } from './client'
import type { SQLiteDatabase } from 'expo-sqlite'
import type { KeyStore, LMFProfile } from '@/lib/lmf'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ConditionInput = {
  name_medical: string
  name_common: string | null
  system: string
  organ: string | null
  anatomical_location: string | null
  status: 'documented' | 'resolved' | 'suspected' | 'inferred'
  severity: string | null
  certainty: string | null
  date_onset: string | null
  date_diagnosed: string | null
  evidence: string | null
  provider?: ProviderInput | null
  care_events?: CareEventInput[]
}

export type MeasurementInput = {
  name: string
  value_numeric: number
  unit: string
  date: string | null
  /** Legacy response fields accepted for migration compatibility; ignored on write. */
  reference_low?: number | null
  reference_high?: number | null
  flag?: 'low' | 'high' | 'critical' | null
}

export type ProviderInput = {
  name: string
  specialty: string | null
  email: string | null
  phone: string | null
  evidence: string | null
}

export type FacilityInput = {
  name: string
  address: string | null
  city: string | null
  state: string | null
  country: string | null
}

export type CareEventInput = {
  event_type: 'diagnosed' | 'revisited' | 'treated' | 'monitored' | 'referred' | 'other'
  date: string
  provider: ProviderInput
  facility: FacilityInput | null
  evidence: string | null
}

export type ConditionCandidate = {
  name_medical: string
  name_common: string | null
  evidence: string | null
}

type ConditionInventory = {
  condition_inventory: ConditionCandidate[]
}

type SingleConditionResult = {
  condition: ConditionInput
  measurements: MeasurementInput[]
}

export type EnrichmentResult = {
  conditions: ConditionInput[]
  measurements: MeasurementInput[]
  providers?: ProviderInput[]
}

const EMPTY: EnrichmentResult = { conditions: [], measurements: [], providers: [] }

// Thrown when every model in the fallback chain failed to produce usable
// output (network down, all candidates errored, etc.) — distinct from a
// successful call that legitimately found no conditions/measurements.
export class EnrichmentFailedError extends Error {
  failures: string[]

  constructor(failures: string[]) {
    super('LLM enrichment failed: ' + (failures.join('; ') || 'no models available'))
    this.name = 'EnrichmentFailedError'
    this.failures = failures
  }
}

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
      const result = parsed as Record<string, unknown>
      return {
        conditions: result.conditions as ConditionInput[],
        measurements: result.measurements as MeasurementInput[],
        providers: Array.isArray(result.providers) ? result.providers as ProviderInput[] : [],
      }
    }
  } catch { /* fall through */ }
  return null
}

function parseConditionInventory(content: string): ConditionInventory | EnrichmentResult | null {
  try {
    const cleaned = content.replace(/```(?:json)?\n?|\n?```/g, '').trim()
    const parsed = JSON.parse(cleaned) as Record<string, unknown>
    if (Array.isArray(parsed.condition_inventory)) {
      return { condition_inventory: parsed.condition_inventory as ConditionCandidate[] }
    }
    // Backward-compatible path for callers/tests and cached model responses
    // that already contain the old one-pass shape.
    return parseEnrichment(content)
  } catch {
    return null
  }
}

function parseSingleCondition(content: string): SingleConditionResult | null {
  try {
    const cleaned = content.replace(/```(?:json)?\n?|\n?```/g, '').trim()
    const parsed = JSON.parse(cleaned) as Record<string, unknown>
    if (parsed.condition !== null && typeof parsed.condition === 'object' && Array.isArray(parsed.measurements)) {
      return {
        condition: parsed.condition as ConditionInput,
        measurements: parsed.measurements as MeasurementInput[],
      }
    }
  } catch { /* fall through */ }
  return null
}

const INVENTORY_PROMPT = `You are the first stage of a clinical record extraction pipeline.
Read the entire medical record, including summaries, assessment sections, problem lists, and dated history.
Create an inventory of every distinct medical condition mentioned anywhere in the record. Numeric measurements will be extracted in the second stage.
Do not assign diagnosis dates or providers in this stage. Do not omit a condition because it appears only in a summary.
Return only JSON with this shape:
{"condition_inventory":[{"name_medical":"standardized English name","name_common":"plain English name or null","evidence":"brief quote showing the condition or null"}]}
Never invent conditions. Never recommend treatment or medication.`

const CONDITION_PROMPT = `You are the second stage of a clinical data extraction pipeline.
The user message contains one condition candidate and the complete medical record.
Return only JSON with exactly this shape:
{"condition":{"name_medical":"standardized English name","name_common":"plain English name or null","system":"one of the supported organ systems","organ":"specific organ or null","anatomical_location":"specific location or null","status":"documented | resolved | suspected","severity":"mild | moderate | severe | null","certainty":"confirmed | probable | possible | null","date_onset":"YYYY-MM-DD or null","date_diagnosed":"YYYY-MM-DD or null","evidence":"brief supporting quote or null","care_events":[{"event_type":"diagnosed | revisited | treated | monitored | referred | other","date":"YYYY-MM-DD","provider":{"name":"clinician name","specialty":"specialty or null","email":"email or null","phone":"phone or null","evidence":"provider evidence or null"},"facility":{"name":"institution","address":"street address or null","city":"city or null","state":"state or null","country":"country or null"},"evidence":"brief quote supporting this event or null"}]},"measurements":[]}
Determine the earliest supported diagnosis date in the entire record. A summary date is not necessarily the diagnosis date. Use dated history, assessment notes, referrals, test results, and explicit diagnosis statements. If no reliable date exists, return null.
Do not assign the primary physician unless the record supports that relationship. A specialist at another clinic may be the diagnosing provider.
The measurements array should contain actual numeric lab/vital values, their units, and dates. Do not output reference ranges or interpretation flags. It may be repeated across calls; the app will deduplicate it.
Never invent data or recommend treatment.`

// ── Prompt ────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a clinical data extraction assistant. Your task is to extract structured medical information from health records written in any language (English, Traditional Chinese, Japanese, or others).

Always respond with a single JSON object — no markdown, no explanation. The JSON must have exactly three keys:

{
  "conditions": [
    {
      "name_medical": "standardized English medical name (e.g. Essential hypertension)",
      "name_common": "plain English name or null",
      "system": "one of: integumentary, muscular, skeletal, cardiovascular, nervous, digestive, respiratory, renal, lymphatic, endocrine, reproductive",
      "organ": "specific organ or null",
      "anatomical_location": "specific location or null",
      "status": "documented | resolved | suspected",
      "severity": "mild | moderate | severe | null",
      "certainty": "confirmed | probable | possible | null",
      "date_onset": "YYYY-MM-DD or null",
      "date_diagnosed": "YYYY-MM-DD or null",
      "evidence": "brief verbatim quote from the record that supports this condition, or null",
      "care_events": [{
        "event_type": "diagnosed | revisited | treated | monitored | referred | other",
        "date": "YYYY-MM-DD",
        "provider": {"name": "clinician name", "specialty": "specialty or null", "email": "email or null", "phone": "phone or null", "evidence": "provider evidence or null"},
        "facility": {"name": "institution", "address": "address or null", "city": "city or null", "state": "state or null", "country": "country or null"},
        "evidence": "brief quote supporting this event or null"
      }]
    }
  ],
  "measurements": [
    {
      "name": "standardized English measurement name (e.g. HbA1c, Blood Pressure Systolic)",
      "value_numeric": <number>,
      "unit": "unit string (e.g. %, mmHg, mg/dL)",
      "date": "YYYY-MM-DD or null"
    }
  ],
  "providers": [
    {
      "name": "doctor or other clinician name, or null",
      "specialty": "specialty or null",
      "email": "clinician email or null",
      "phone": "clinician phone or null",
      "evidence": "brief quote identifying this clinician, or null"
    }
  ]
}

Rules:
- Output all condition names and measurement names in English, regardless of the source language.
- Extract every distinct medical condition mentioned, including chronic diseases, acute diagnoses, and resolved conditions.
- Extract every numeric lab value, vital sign, or clinical measurement, even if you do not flag it.
- If the record contains no conditions, return an empty array for "conditions".
- If the record contains no measurements, return an empty array for "measurements".
- Extract every clinician named as the doctor, provider, author, attending, ordering, or referring clinician.
- Only include contact details clearly belonging to a clinician; never assign the patient's contact details to a provider.
- If provider contact details are not visible, use null. Do not infer or invent them.
- The conditions array is the primary inventory: identify every distinct condition first, then fill every field for each condition.
- Never invent data not present in the record.
- Never recommend treatments or medications.`

// ── Main export ───────────────────────────────────────────────────────────────

export async function enrichFromText(
  text: string,
  apiKey: string,
  models?: string[],
  routing?: { db?: SQLiteDatabase; profile?: LMFProfile; keys?: KeyStore; timeoutMs?: number; onTrace?: (event: LLMTraceEvent) => void },
  onConditionProgress?: (completed: number, total: number) => void,
): Promise<EnrichmentResult> {
  const inventoryResult = await callLLMWithFallback<ConditionInventory | EnrichmentResult>({
    messages: [
      { role: 'system', content: INVENTORY_PROMPT },
      { role: 'user', content: `Inventory every medical condition in this complete health record:\n\n${text}` },
    ],
    apiKey,
    models: models && models.length > 0 ? models : DEFAULT_MODELS,
    temperature: 0,
    label: 'condition-inventory',
    validate: parseConditionInventory,
    ...routing,
  })

  if (!inventoryResult.ok || !inventoryResult.value) {
    throw new EnrichmentFailedError(inventoryResult.failures)
  }

  if ('conditions' in inventoryResult.value && 'measurements' in inventoryResult.value) {
    return inventoryResult.value
  }

  const inventory = inventoryResult.value.condition_inventory
  const conditions: ConditionInput[] = []
  const measurements: MeasurementInput[] = []
  const providers: ProviderInput[] = []
  const total = inventory.length

  if (total === 0) {
    const result = await callLLMWithFallback<EnrichmentResult>({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Extract numeric measurements from this complete health record:\n\n${text}` },
      ],
      apiKey,
      models: models && models.length > 0 ? models : DEFAULT_MODELS,
      temperature: 0,
      label: 'enrich-measurements',
      validate: parseEnrichment,
      ...routing,
    })
    if (!result.ok || !result.value) throw new EnrichmentFailedError(result.failures)
    onConditionProgress?.(0, 0)
    return result.value
  }

  for (let index = 0; index < inventory.length; index += 1) {
    const candidate = inventory[index]
    const result = await callLLMWithFallback<SingleConditionResult>({
      messages: [
        { role: 'system', content: CONDITION_PROMPT },
        { role: 'user', content: `Condition candidate ${index + 1} of ${total}:\n${JSON.stringify(candidate)}\n\nComplete medical record:\n${text}` },
      ],
      apiKey,
      models: models && models.length > 0 ? models : DEFAULT_MODELS,
      temperature: 0,
      label: 'enrich-condition',
      validate: parseSingleCondition,
      ...routing,
    })

    if (!result.ok || !result.value) throw new EnrichmentFailedError(result.failures)
    conditions.push(result.value.condition)
    for (const measurement of result.value.measurements) {
      const duplicate = measurements.some((existing) =>
        existing.name === measurement.name &&
        existing.value_numeric === measurement.value_numeric &&
        existing.unit === measurement.unit &&
        existing.date === measurement.date,
      )
      if (!duplicate) measurements.push(measurement)
    }
    if (result.value.condition.provider) providers.push(result.value.condition.provider)
    onConditionProgress?.(index + 1, total)
  }

  return { conditions, measurements, providers }
}
