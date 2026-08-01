import { callLLMWithFallback, DEFAULT_MODELS } from './client'
import { analyzeRecordStructure, type EnrichRoutingOptions } from './structure'
import { chunkRecordBySections, type TextChunk } from './chunk'
import { runWithConcurrency } from './pool'
import type { ConditionStatus } from '@/model/health'

export type { EnrichRoutingOptions } from './structure'

// ── Types ─────────────────────────────────────────────────────────────────────

// Additional (non-primary) location for a condition with more than one site —
// e.g. bilateral findings. cx/cy are pre-resolved percentages when the caller
// already knows one (demo seeding); real LLM extraction leaves them unset and
// the primary condition's computed position is reused.
export type ConditionInputLocation = {
  cx?: number | null
  cy?: number | null
  anatomical_location?: string | null
  laterality?: string | null
  evidence?: string | null
}

export type ConditionInput = {
  // Stable id, set only by callers that already have one (e.g. demo seeding
  // from src/model/conditions.ts's fixed ids). Real LLM extraction leaves this
  // unset and the persistence layer generates one.
  id?: string
  name_medical: string
  name_common: string | null
  system: string
  organ: string | null
  anatomical_location: string | null
  status: ConditionStatus
  severity: string | null
  certainty: string | null
  date_onset: string | null
  date_diagnosed: string | null
  evidence: string | null
  // Free-text clinical summary, distinct from `evidence` (provider/source
  // attribution). Optional — real LLM extraction doesn't currently populate
  // this; demo seeding uses it to carry DesignCondition.note.
  notes?: string | null
  // Localized display names keyed by language code. Optional — real LLM
  // extraction doesn't currently populate this; demo seeding carries
  // DesignCondition.localNames through it.
  local_names?: Record<string, string> | null
  provider?: ProviderInput | null
  care_events?: CareEventInput[]
  // Pixel-position overrides (0-100 percent), set only by callers that already
  // know an exact position (demo seeding); real extraction leaves these unset
  // so the persistence layer computes a seeded default position.
  cx?: number | null
  cy?: number | null
  locations?: ConditionInputLocation[]
  // Fields the chunk-extraction stage filled from surrounding section context
  // (heading/sectionType/inferredDate) rather than text restated in-chunk —
  // e.g. ["date_onset"] when a visit-note chunk had no explicit date but
  // inherited one from its section. Task 3.5.
  inferred_from_structure?: string[]
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
  inferred_from_structure?: string[]
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

// One imageWorthy chunk (Task 3.2/3.3's imageWorthy flag, propagated onto
// TextChunk) worth capturing as a picture in Task 4.3's pipeline wiring.
// `conditionKeys` are conditionKey() values computed from that chunk's own
// (pre-merge) extraction result, so pipeline.ts can link the rendered image
// to whichever already-merged condition(s) share one of those keys — merging
// combines same-condition occurrences from different chunks but never changes
// what conditionKey() returns for a given name/organ/location, so the keys
// stay valid after merge.
export type ImageWorthySection = {
  heading: string
  pageStart: number
  pageEnd: number
  inferredDate: string | null
  conditionKeys: string[]
}

export type EnrichmentResult = {
  conditions: ConditionInput[]
  measurements: MeasurementInput[]
  providers?: ProviderInput[]
  // Sections whose chunk extraction failed even after the model fallback
  // chain was exhausted — surfaced for diagnostics (pipeline.ts traces these)
  // rather than silently dropped. Absent/empty when every chunk succeeded.
  partialFailures?: { section: string; reason: string }[]
  // Sections flagged imageWorthy whose chunk extraction succeeded, with page
  // ranges resolved (Task 3.1/3.2) — Task 4.3's pipeline wiring reads this to
  // know which pages to render/capture. Absent/empty when no chunk was
  // imageWorthy or had a resolved page range.
  imageSections?: ImageWorthySection[]
}

const EMPTY: EnrichmentResult = { conditions: [], measurements: [], providers: [] }

// Number of chunks processed concurrently. Bounded (not Promise.all-unlimited)
// so a large record's chunk count doesn't open dozens of simultaneous LLM
// calls — see src/lib/llm/pool.ts.
const POOL_SIZE = 3

// Thrown when every chunk failed to produce usable output (network down, all
// models exhausted for every chunk, etc.) — distinct from a successful run
// that legitimately found no conditions/measurements, and distinct from a
// partial failure (some chunks succeeded), which returns normally with
// `partialFailures` populated instead of throwing.
export class EnrichmentFailedError extends Error {
  failures: string[]

  constructor(failures: string[]) {
    super('LLM enrichment failed: ' + (failures.join('; ') || 'no models available'))
    this.name = 'EnrichmentFailedError'
    this.failures = failures
  }
}

// ── Per-chunk extraction ─────────────────────────────────────────────────────

type ChunkExtractionResult = {
  conditions: ConditionInput[]
  measurements: MeasurementInput[]
}

const CHUNK_EXTRACTION_PROMPT = `You are a clinical data extraction assistant. Your task is to extract structured medical information from one section of a health record written in any language (English, Traditional Chinese, Japanese, or others).

The user message tells you which section this is (a heading, its type, and its inferred date) followed by that section's text only — not the whole record. Use the section context to fill fields the section's own text doesn't restate (e.g. a date given only in the heading), and list any field you filled that way in "inferred_from_structure" (an array of field names, e.g. ["date_diagnosed"]) on that condition or measurement. Leave it empty/omitted when every field came directly from the section's own text.

Always respond with a single JSON object — no markdown, no explanation. The JSON must have exactly two keys:

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
      "evidence": "brief verbatim quote from the section that supports this condition, or null",
      "inferred_from_structure": ["field names filled from section context, or omit/empty"],
      "locations": [{"anatomical_location": "e.g. left kidney", "laterality": "left | right | bilateral | null", "evidence": "brief quote or null"}],
      "provider": {"name": "clinician name", "specialty": "specialty or null", "email": "email or null", "phone": "phone or null", "evidence": "provider evidence or null"} ,
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
      "date": "YYYY-MM-DD or null",
      "inferred_from_structure": ["field names filled from section context, or omit/empty"]
    }
  ]
}

Rules:
- Output all condition names and measurement names in English, regardless of the source language.
- Extract every distinct medical condition mentioned in this section, including chronic diseases, acute diagnoses, and resolved conditions.
- Extract every numeric lab value, vital sign, or clinical measurement in this section.
- "locations" is only for a condition with more than one distinct anatomical site (e.g. bilateral findings) — omit it or leave it empty for a single-site condition.
- Only include a "provider" when this section's text directly names the clinician responsible for that specific condition — never attach a clinician mentioned elsewhere for an unrelated reason.
- If this section has no conditions, return an empty array for "conditions". If it has no measurements, return an empty array for "measurements".
- Never invent data not present in this section.
- Never recommend treatments or medications.`

function parseChunkExtraction(content: string): ChunkExtractionResult | null {
  try {
    const cleaned = content.replace(/```(?:json)?\n?|\n?```/g, '').trim()
    const parsed = JSON.parse(cleaned) as Record<string, unknown>
    if (Array.isArray(parsed.conditions) && Array.isArray(parsed.measurements)) {
      return {
        conditions: parsed.conditions as ConditionInput[],
        measurements: parsed.measurements as MeasurementInput[],
      }
    }
  } catch { /* fall through */ }
  return null
}

async function extractConditionsFromChunk(
  chunk: TextChunk,
  apiKey: string,
  models: string[],
  routing: EnrichRoutingOptions | undefined,
): Promise<ChunkExtractionResult> {
  const contextLine = `Section: "${chunk.sectionHeading}" (type: ${chunk.sectionType}${chunk.inferredDate ? `, dated ${chunk.inferredDate}` : ''})`
  const result = await callLLMWithFallback<ChunkExtractionResult>({
    messages: [
      { role: 'system', content: CHUNK_EXTRACTION_PROMPT },
      { role: 'user', content: `${contextLine}\n\n${chunk.text}` },
    ],
    apiKey,
    models,
    temperature: 0,
    label: 'chunk-extraction',
    validate: parseChunkExtraction,
    ...routing,
  })
  if (!result.ok || !result.value) {
    throw new Error(result.failures.join('; ') || 'chunk extraction failed')
  }
  return result.value
}

// ── Cross-chunk merge ─────────────────────────────────────────────────────────

function normalizedKey(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function conditionKey(c: ConditionInput): string {
  return [normalizedKey(c.name_medical), normalizedKey(c.organ ?? ''), normalizedKey(c.anatomical_location ?? '')].join('|')
}

function earlierDate(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null
  if (!b) return a
  return a < b ? a : b
}

function firstNonNull<T>(a: T | null | undefined, b: T | null | undefined): T | null {
  return a ?? b ?? null
}

function latestConditionStatus(a: ConditionInput, b: ConditionInput): ConditionInput['status'] {
  const aDate = a.date_diagnosed ?? a.date_onset
  const bDate = b.date_diagnosed ?? b.date_onset
  if (aDate && bDate) return bDate >= aDate ? b.status : a.status
  if (bDate) return b.status
  if (aDate) return a.status
  return b.status
}

function latestStatusFromOccurrences(occurrences: ConditionInput[]): ConditionInput['status'] {
  let latest = occurrences[0]
  for (const occurrence of occurrences.slice(1)) {
    const latestDate = latest.date_diagnosed ?? latest.date_onset
    const occurrenceDate = occurrence.date_diagnosed ?? occurrence.date_onset
    if (!latestDate || (occurrenceDate && occurrenceDate >= latestDate)) latest = occurrence
  }
  return latest.status
}

// Merges two occurrences of "the same" condition found in different chunks:
// earliest date wins, evidence/care_events/locations concatenate, other
// scalar fields prefer whichever occurrence already has a non-null value.
function mergeTwoConditions(a: ConditionInput, b: ConditionInput): ConditionInput {
  return {
    id: a.id ?? b.id,
    name_medical: a.name_medical,
    name_common: firstNonNull(a.name_common, b.name_common),
    system: a.system,
    organ: firstNonNull(a.organ, b.organ),
    anatomical_location: firstNonNull(a.anatomical_location, b.anatomical_location),
    status: latestConditionStatus(a, b),
    severity: firstNonNull(a.severity, b.severity),
    certainty: firstNonNull(a.certainty, b.certainty),
    date_onset: earlierDate(a.date_onset, b.date_onset),
    date_diagnosed: earlierDate(a.date_diagnosed, b.date_diagnosed),
    evidence: [a.evidence, b.evidence].filter(Boolean).join(' | ') || null,
    notes: firstNonNull(a.notes, b.notes),
    local_names: a.local_names ?? b.local_names,
    provider: a.provider ?? b.provider,
    care_events: [...(a.care_events ?? []), ...(b.care_events ?? [])],
    cx: a.cx ?? b.cx,
    cy: a.cy ?? b.cy,
    locations: [...(a.locations ?? []), ...(b.locations ?? [])],
    inferred_from_structure: Array.from(new Set([...(a.inferred_from_structure ?? []), ...(b.inferred_from_structure ?? [])])),
  }
}

function mergeConditions(items: ConditionInput[]): ConditionInput[] {
  const byKey = new Map<string, ConditionInput[]>()
  for (const item of items) {
    const key = conditionKey(item)
    byKey.set(key, [...(byKey.get(key) ?? []), item])
  }
  return Array.from(byKey.values()).map((occurrences) => {
    const merged = occurrences.slice(1).reduce(mergeTwoConditions, occurrences[0])
    return { ...merged, status: latestStatusFromOccurrences(occurrences) }
  })
}

function mergeMeasurements(items: MeasurementInput[]): MeasurementInput[] {
  const merged: MeasurementInput[] = []
  for (const m of items) {
    const duplicate = merged.some((existing) =>
      existing.name === m.name &&
      existing.value_numeric === m.value_numeric &&
      existing.unit === m.unit &&
      existing.date === m.date,
    )
    if (!duplicate) merged.push(m)
  }
  return merged
}

// ── Main export ───────────────────────────────────────────────────────────────
// Orchestration (Task 3.5): analyze structure → chunk by section → extract
// each chunk under bounded concurrency → merge. LLM attempt count now scales
// with chunk count, not condition count (the prior inventory→per-condition
// loop's failure mode). `onChunkProgress` keeps the same (completed, total)
// call shape the old `onConditionProgress` used, so pipeline.ts's progress
// math and analyzing.tsx need zero changes.

export async function enrichFromText(
  text: string,
  apiKey: string,
  models?: string[],
  routing?: EnrichRoutingOptions,
  onChunkProgress?: (completed: number, total: number) => void,
): Promise<EnrichmentResult> {
  const modelChain = models && models.length > 0 ? models : DEFAULT_MODELS
  // pageBreaks isn't a callLLMWithFallback option — strip it before `llmRouting`
  // gets spread into the LLM call options below.
  const { pageBreaks, ...llmRouting } = routing ?? {}

  const structure = await analyzeRecordStructure(text, apiKey, modelChain, llmRouting, pageBreaks)
  const chunks = chunkRecordBySections(text, structure, undefined, pageBreaks)
  const total = chunks.length

  if (total === 0) {
    onChunkProgress?.(0, 0)
    return { ...EMPTY }
  }

  let completed = 0
  const settled = await runWithConcurrency(chunks, POOL_SIZE, async (chunk) => {
    const result = await extractConditionsFromChunk(chunk, apiKey, modelChain, llmRouting)
    completed += 1
    onChunkProgress?.(completed, total)
    return result
  })

  const conditions: ConditionInput[] = []
  const measurements: MeasurementInput[] = []
  const partialFailures: { section: string; reason: string }[] = []
  const imageSections: ImageWorthySection[] = []
  let succeededCount = 0

  settled.forEach((outcome, index) => {
    const chunk = chunks[index]
    if (outcome.status === 'fulfilled') {
      succeededCount += 1
      conditions.push(...outcome.value.conditions)
      measurements.push(...outcome.value.measurements)
      if (chunk.imageWorthy && chunk.pageStart != null && chunk.pageEnd != null) {
        imageSections.push({
          heading: chunk.sectionHeading,
          pageStart: chunk.pageStart,
          pageEnd: chunk.pageEnd,
          inferredDate: chunk.inferredDate,
          conditionKeys: outcome.value.conditions.map(conditionKey),
        })
      }
    } else {
      const reason = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)
      partialFailures.push({ section: chunk.sectionHeading || `chunk ${index + 1}`, reason })
    }
  })

  if (succeededCount === 0) {
    throw new EnrichmentFailedError(partialFailures.map((f) => f.reason))
  }

  const mergedConditions = mergeConditions(conditions)
  const mergedMeasurements = mergeMeasurements(measurements)
  const providers = mergedConditions
    .map((c) => c.provider)
    .filter((p): p is ProviderInput => Boolean(p))
  const coalescedImageSections = coalesceImageSections(imageSections)

  return {
    conditions: mergedConditions,
    measurements: mergedMeasurements,
    providers,
    ...(partialFailures.length > 0 ? { partialFailures } : {}),
    ...(coalescedImageSections.length > 0 ? { imageSections: coalescedImageSections } : {}),
  }
}

// A section longer than the chunk limit is split into multiple chunks that
// all inherit the same pageStart/pageEnd — merge those back into one entry
// (unioning conditionKeys) so captureRecordImages captures each page range once.
export function coalesceImageSections(sections: ImageWorthySection[]): ImageWorthySection[] {
  const byPageRange = new Map<string, ImageWorthySection>()
  for (const section of sections) {
    const key = `${section.pageStart}-${section.pageEnd}`
    const existing = byPageRange.get(key)
    if (existing) {
      existing.conditionKeys = [...new Set([...existing.conditionKeys, ...section.conditionKeys])]
    } else {
      byPageRange.set(key, { ...section })
    }
  }
  return [...byPageRange.values()]
}
