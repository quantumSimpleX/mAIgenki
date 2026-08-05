import { callLLMWithFallback, DEFAULT_MODELS } from './client'
import { analyzeRecordStructure, type EnrichRoutingOptions } from './structure'
import { chunkRecordBySections, type TextChunk } from './chunk'
import { runWithConcurrency } from './pool'
import { CHUNK_EXTRACTION_PROMPT as EDITABLE_CHUNK_EXTRACTION_PROMPT, LONGITUDINAL_EXTRACTION_PROMPT } from './prompts'
import type { ConditionStatus } from '@/model/health'

export type { EnrichRoutingOptions } from './structure'

const LONGITUDINAL_LIMIT = 12_000

export function parseLongitudinalResponse(content: string): EnrichmentResult | null {
  try {
    const parsed = JSON.parse(content) as { schema_version?: number; conditions?: ConditionInput[]; measurements?: MeasurementInput[]; report_context?: { providers?: ProviderInput[]; facilities?: FacilityInput[] } }
    if (parsed.schema_version !== 1 || !Array.isArray(parsed.conditions) || !Array.isArray(parsed.measurements)) return null
    const reportProvider = parsed.report_context?.providers?.find(isValidProviderInput)
    const reportFacility = parsed.report_context?.facilities?.find(isValidFacilityInput)
    const conditions = parsed.conditions.map((condition) => {
      const inheritedProvider = !condition.provider && reportProvider
      const selectedProvider = condition.provider ?? reportProvider ?? null
      const careEvents = condition.care_events ?? []
      const inheritedDate = condition.date_diagnosed ?? condition.date_onset
      // A report-scoped facility is inherited independently from the provider.
      // When a provider is available (condition-scoped or report-scoped), retain
      // the facility attribution as a care event so persistence cannot drop it.
      if (selectedProvider && reportFacility && inheritedDate && !careEvents.some((event) => event.facility?.name === reportFacility.name)) {
        careEvents.push({ event_type: 'other', date: inheritedDate, provider: selectedProvider, facility: reportFacility, evidence: null })
      }
      const inheritedFields = [
        ...(inheritedProvider ? ['provider:report_context'] : []),
        ...(reportFacility && selectedProvider && inheritedDate ? ['facility:report_context'] : []),
      ]
      return {
        ...condition,
        provider: selectedProvider,
        care_events: careEvents,
        provenance: inheritedFields.length > 0 ? [...new Set([...(condition.provenance ?? []), ...inheritedFields])] : condition.provenance,
      }
    })
    return {
      conditions,
      measurements: parsed.measurements,
      providers: parsed.report_context?.providers?.filter(isValidProviderInput),
      facilities: parsed.report_context?.facilities?.filter(isValidFacilityInput),
    }
  } catch {
    return null
  }
}

async function extractWholeDocument(text: string, apiKey: string, models: string[], routing: EnrichRoutingOptions): Promise<EnrichmentResult | null> {
  const result = await callLLMWithFallback<EnrichmentResult>({
    messages: [{ role: 'system', content: LONGITUDINAL_EXTRACTION_PROMPT }, { role: 'user', content: text }],
    apiKey,
    models,
    label: 'enrichment-longitudinal',
    db: routing.db,
    profile: routing.profile,
    keys: routing.keys,
    timeoutMs: routing.timeoutMs,
    validate: parseLongitudinalResponse,
  })
  return result.ok ? result.value : null
}

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
  /** Phase 09 longitudinal provenance metadata. */
  source_pages?: number[] | null
  provenance?: string[]
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
  /** Report-scoped facilities retained even when no provider is named. */
  facilities?: FacilityInput[]
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

/** Deterministic longitudinal merge: repeated mentions retain the earliest supported date. */
export function mergeLongitudinalConditions(conditions: ConditionInput[]): ConditionInput[] {
  const result = new Map<string, ConditionInput>()
  const date = (values: Array<string | null | undefined>): string | null => values.filter((v): v is string => Boolean(v && /^\d{4}(-\d{2}-\d{2})?$/.test(v))).sort()[0] ?? null
  for (const condition of conditions) {
    const key = `${condition.name_medical.trim().toLowerCase()}|${condition.system.trim().toLowerCase()}`
    const prior = result.get(key)
    if (!prior) { result.set(key, { ...condition, date_diagnosed: date([condition.date_diagnosed, condition.date_onset]) }); continue }
    result.set(key, { ...prior, date_diagnosed: date([prior.date_diagnosed, prior.date_onset, condition.date_diagnosed, condition.date_onset]), source_pages: [...new Set([...(prior.source_pages ?? []), ...(condition.source_pages ?? [])])], provenance: [...new Set([...(prior.provenance ?? []), ...(condition.provenance ?? [])])] })
  }
  return [...result.values()]
}

const EMPTY: EnrichmentResult = { conditions: [], measurements: [], providers: [], facilities: [] }

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

export function isValidProviderInput(value: unknown): value is ProviderInput {
  if (!isRecord(value)) return false
  return typeof value.name === 'string'
    && isNullableString(value.specialty)
    && isNullableString(value.email)
    && isNullableString(value.phone)
    && isNullableString(value.evidence)
}

export function isValidFacilityInput(value: unknown): value is FacilityInput {
  if (!isRecord(value)) return false
  return typeof value.name === 'string' && isNullableString(value.address) && isNullableString(value.city) && isNullableString(value.state) && isNullableString(value.country)
}

export function isValidCareEventInput(value: unknown): value is CareEventInput {
  if (!isRecord(value)) return false
  const eventTypes = ['diagnosed', 'revisited', 'treated', 'monitored', 'referred', 'other']
  return typeof value.event_type === 'string'
    && eventTypes.includes(value.event_type)
    && typeof value.date === 'string'
    && isValidProviderInput(value.provider)
    && (value.facility === null || (isRecord(value.facility)
      && typeof value.facility.name === 'string'
      && isNullableString(value.facility.address)
      && isNullableString(value.facility.city)
      && isNullableString(value.facility.state)
      && isNullableString(value.facility.country)))
    && isNullableString(value.evidence)
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
      const conditions = parsed.conditions.filter(isRecord).map((raw) => {
        const condition = { ...raw } as unknown as ConditionInput
        if (Array.isArray(condition.care_events)) {
          condition.care_events = condition.care_events.filter(isValidCareEventInput)
        } else if (condition.care_events != null) {
          condition.care_events = []
        }
        if (condition.provider != null && !isValidProviderInput(condition.provider)) {
          condition.provider = null
        }
        return condition
      })
      return {
        conditions,
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
  chunkIndex = 0,
  chunkCount = 1,
): Promise<ChunkExtractionResult> {
 const CHUNK_EXTRACTION_PROMPT = EDITABLE_CHUNK_EXTRACTION_PROMPT
  const contextLine = `Section: "${chunk.sectionHeading}" (type: ${chunk.sectionType}${chunk.inferredDate ? `, dated ${chunk.inferredDate}` : ''})`
  const result = await callLLMWithFallback<ChunkExtractionResult>({
    messages: [
      { role: 'system', content: CHUNK_EXTRACTION_PROMPT },
      { role: 'user', content: `${contextLine}\n\n${chunk.text}` },
    ],
    apiKey,
    models,
    temperature: 0,
    label: `enrichment-chunk-${chunkIndex + 1}-of-${chunkCount}`,
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
  // An explicit locations array represents one condition with multiple sites
  // (for example left and right kidneys). Do not split those occurrences into
  // separate conditions based on their section-level location labels.
  const locationKey = c.locations && c.locations.length > 0 ? '' : normalizedKey(c.anatomical_location ?? '')
  return [normalizedKey(c.name_medical), normalizedKey(c.organ ?? ''), locationKey].join('|')
}

function earlierDate(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null
  if (!b) return a
  return a < b ? a : b
}

function firstNonNull<T>(a: T | null | undefined, b: T | null | undefined): T | null {
  return a ?? b ?? null
}

function mergeConditionLocations(
  locations: ConditionInputLocation[],
): ConditionInputLocation[] {
  const merged = new Map<string, ConditionInputLocation>()
  for (const location of locations) {
    const labelKey = [
      normalizedKey(location.anatomical_location ?? ''),
      normalizedKey(location.laterality ?? ''),
    ].join('|')
    const coordinateKey = `${location.cx ?? ''}|${location.cy ?? ''}`
    const key = labelKey === '|' ? coordinateKey : labelKey
    const previous = merged.get(key)
    merged.set(key, previous
      ? {
        ...previous,
        cx: firstNonNull(previous.cx, location.cx),
        cy: firstNonNull(previous.cy, location.cy),
        evidence: firstNonNull(previous.evidence, location.evidence),
      }
      : location)
  }
  return Array.from(merged.values())
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
    locations: mergeConditionLocations([...(a.locations ?? []), ...(b.locations ?? [])]),
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

  if (text.length >= LONGITUDINAL_LIMIT) {
    const wholeDocument = await extractWholeDocument(text, apiKey, modelChain, llmRouting)
    if (wholeDocument) {
      return {
        ...wholeDocument,
        conditions: mergeConditions(wholeDocument.conditions),
      }
    }
  }

  const structure = await analyzeRecordStructure(text, apiKey, modelChain, llmRouting, pageBreaks)
  const chunks = chunkRecordBySections(text, structure, undefined, pageBreaks)
  const total = chunks.length

  if (total === 0) {
    onChunkProgress?.(0, 0)
    return { ...EMPTY }
  }

  let completed = 0
  const settled = await runWithConcurrency(chunks, POOL_SIZE, async (chunk) => {
    const chunkIndex = chunks.indexOf(chunk)
    const result = await extractConditionsFromChunk(chunk, apiKey, modelChain, llmRouting, chunkIndex, total)
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
    if (chunk.imageWorthy && chunk.pageStart != null && chunk.pageEnd != null) {
      imageSections.push({
        heading: chunk.sectionHeading,
        pageStart: chunk.pageStart,
        pageEnd: chunk.pageEnd,
        inferredDate: chunk.inferredDate,
        conditionKeys: outcome.status === 'fulfilled' ? outcome.value.conditions.map(conditionKey) : [],
      })
    }
    if (outcome.status === 'fulfilled') {
      succeededCount += 1
      conditions.push(...outcome.value.conditions)
      measurements.push(...outcome.value.measurements)
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
  const facilities = mergedConditions
    .flatMap((c) => (c.care_events ?? []).map((event) => event.facility))
    .filter((facility): facility is FacilityInput => Boolean(facility))
  const coalescedImageSections = coalesceImageSections(imageSections)

  return {
    conditions: mergedConditions,
    measurements: mergedMeasurements,
    providers,
    facilities,
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
