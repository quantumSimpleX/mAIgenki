import { callLLMWithFallback, DEFAULT_MODELS } from './client'
import { analyzeRecordStructure, type EnrichRoutingOptions } from './structure'
import { chunkRecordBySections, type TextChunk } from './chunk'
import { runWithConcurrency } from './pool'
import { P09_WHOLE_DOCUMENT_EXTRACTION_PROMPT, CONDITION_ENRICHMENT_PROMPT, CONDITION_DEDUPE_PROMPT } from './prompts'
import { pipelineDebug } from '../debug/pipelineDebug'
import type { ConditionStatus } from '@/model/health'

export type { EnrichRoutingOptions } from './structure'

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

// ── Step 2: extraction (single whole-document LLM call) ────────────────────────
// Input is the record's redacted full text (persisted as pending_extraction_text
// by pipeline.ts). Output is deliberately minimal — one entry per unique
// condition with just its name, earliest supported date, and notes/evidence —
// plus measurements. No organ/system/anatomy/provider here; that's Step 3.

export type ConditionSummary = {
  name_medical: string
  earliest_date: string | null
  notes: string | null
  // Resolved per condition: the condition's own explicit attribution if the
  // text names one, otherwise inherited from the document/report-level
  // provider or facility (a record often states the clinician/institution
  // once rather than repeating it for every condition) — inheritance is
  // resolved here in the parser, not left for Step 3 to figure out.
  provider: ProviderInput | null
  facility: FacilityInput | null
}

type ExtractionStepResult = {
  conditions: ConditionSummary[]
  measurements: MeasurementInput[]
}

function isValidConditionSummaryShape(value: unknown): value is { name_medical: string; earliest_date: string | null; notes: string | null; provider?: unknown; facility?: unknown } {
  if (!isRecord(value)) return false
  return typeof value.name_medical === 'string' && isNullableString(value.earliest_date) && isNullableString(value.notes)
}

// Logged whenever a model's response fails validation — the engine only
// records "Response failed validation.", with no indication of whether the
// JSON was truncated, malformed, or just shaped wrong, so that's opaque
// without this. Preview only (not the full response) to keep the debug log
// readable for a document-sized response.
function logExtractionValidationFailure(reason: string, content: string): void {
  // JSON.parse's SyntaxError message ends with "at position N" for a syntax
  // error (not for "Unexpected end of JSON input", which has no position) —
  // when present, a window around N is far more useful than head/tail alone,
  // since N is usually deep inside content neither of those covers.
  const positionMatch = /at position (\d+)/.exec(reason)
  const errorPosition = positionMatch ? Number(positionMatch[1]) : null
  pipelineDebug('warn', 'llm', 'extraction-validation-failed', {
    reason,
    contentLength: content.length,
    contentHead: content.slice(0, 500),
    contentTail: content.length > 500 ? content.slice(-300) : undefined,
    ...(errorPosition !== null ? { contentAroundError: content.slice(Math.max(0, errorPosition - 150), errorPosition + 150) } : {}),
  })
}

function isValidMeasurementLine(value: Record<string, unknown>): value is { name: string; value_numeric: number; unit: string; date: string | null } {
  return typeof value.name === 'string' && typeof value.value_numeric === 'number' && typeof value.unit === 'string' && isNullableString(value.date)
}

// NDJSON: one JSON object per line, dispatched by a "type" field. A single
// malformed or unrecognized line is skipped, not fatal to the rest — the
// whole point of this format over one big JSON object/array is that one
// model slip (or a truncated final line) doesn't discard everything else.
export function parseExtractionStepResponse(content: string): ExtractionStepResult | null {
  const cleaned = content.replace(/```(?:json|ndjson)?\n?|\n?```/g, '').trim()
  const lines = cleaned.split('\n').map((line) => line.trim()).filter(Boolean)

  const rawConditions: { name_medical: string; earliest_date: string | null; notes: string | null; provider?: unknown; facility?: unknown }[] = []
  const measurements: MeasurementInput[] = []
  const reportProviders: ProviderInput[] = []
  const reportFacilities: FacilityInput[] = []
  let skippedLines = 0

  for (const line of lines) {
    let value: unknown
    try {
      value = JSON.parse(line)
    } catch {
      skippedLines += 1
      continue
    }
    if (!isRecord(value) || typeof value.type !== 'string') {
      skippedLines += 1
      continue
    }
    switch (value.type) {
      case 'condition':
        if (isValidConditionSummaryShape(value)) rawConditions.push(value)
        else skippedLines += 1
        break
      case 'measurement':
        if (isValidMeasurementLine(value)) measurements.push(value)
        else skippedLines += 1
        break
      case 'report_provider':
        if (isValidProviderInput(value)) reportProviders.push(value)
        else skippedLines += 1
        break
      case 'report_facility':
        if (isValidFacilityInput(value)) reportFacilities.push(value)
        else skippedLines += 1
        break
      default:
        skippedLines += 1
    }
  }

  if (rawConditions.length === 0 && measurements.length === 0) {
    logExtractionValidationFailure(
      `no usable NDJSON lines (${lines.length} total lines, ${skippedLines} malformed/unrecognized)`,
      content,
    )
    return null
  }

  if (skippedLines > 0) {
    pipelineDebug('warn', 'llm', 'extraction-lines-skipped', {
      skippedLines,
      totalLines: lines.length,
      usableConditions: rawConditions.length,
      usableMeasurements: measurements.length,
    })
  }

  const reportProvider = reportProviders[0] ?? null
  const reportFacility = reportFacilities[0] ?? null

  const conditions = rawConditions.map((raw) => {
    const ownProvider = isValidProviderInput(raw.provider) ? raw.provider : null
    const ownFacility = isValidFacilityInput(raw.facility) ? raw.facility : null
    return {
      name_medical: raw.name_medical,
      earliest_date: raw.earliest_date,
      notes: raw.notes,
      provider: ownProvider ?? reportProvider,
      facility: ownFacility ?? reportFacility,
    }
  })
  return { conditions, measurements }
}

// A single whole-document call (tens of thousands of characters in, a long
// NDJSON completion out) turned out to be genuinely too much for the
// free-tier model pool to handle reliably — not a formatting problem (NDJSON
// already fixed that class of failure), but real timeouts, rate limits, and
// degenerate output on the input size itself. Splitting into chunks and
// extracting each independently (then merging) is the fix: each call is
// small enough that even weak/throttled free models handle it, and one
// chunk's total failure no longer takes the whole record down with it.
const EXTRACTION_TIMEOUT_MS = 180_000
const CHUNK_MAX_CHARS = 20_000
// Sequential, not concurrent — free-tier per-minute rate limits are what we
// were actually hitting (a shared, module-level cooldown ledger means
// several chunks firing at once can drive every model into cooldown
// simultaneously), so one chunk at a time trades some wall-clock time for
// meaningfully fewer 429s in the first place.
const CHUNK_POOL_SIZE = 1

async function extractConditionSummariesFromChunk(chunkText: string, apiKey: string, models: string[], routing: EnrichRoutingOptions): Promise<ExtractionStepResult | null> {
  const result = await callLLMWithFallback<ExtractionStepResult>({
    messages: [{ role: 'system', content: P09_WHOLE_DOCUMENT_EXTRACTION_PROMPT }, { role: 'user', content: chunkText }],
    apiKey,
    models,
    label: 'extraction-condition-list',
    db: routing.db,
    profile: routing.profile,
    keys: routing.keys,
    // No 180s floor here — a ~20K-character chunk doesn't need it, and
    // forcing it would just make a genuinely-stuck chunk block longer.
    timeoutMs: routing.timeoutMs,
    onTrace: routing.onTrace,
    // NDJSON, not a single JSON object — the provider's strict JSON mode
    // (the default for a validate()-backed call) forbids that shape.
    responseFormat: 'text',
    // A chunked document fires several of these calls close together —
    // worth waiting out a shared cooldown rather than failing immediately.
    waitForCooldown: true,
    validate: parseExtractionStepResponse,
  })
  return result.ok ? result.value : null
}

// Prepended to every chunk (including the first) — patient demographics, the
// primary ordering clinician, and the facility almost always appear once, up
// front, in a real medical record. Without this, a chunk from later in the
// document that never restates them would silently lose that attribution
// entirely, even though a human reader would infer it from the document's
// hierarchy. This is a heuristic, not a full fix for every kind of
// cross-section inheritance — but it covers the dominant real-world case for
// near-zero cost (no extra LLM call).
const DOCUMENT_HEADER_CHARS = 1500

function withDocumentHeader(chunkText: string, header: string): string {
  if (!header) return chunkText
  return `Document opening, for context only (the overall patient/provider/facility a real record usually states once, not necessarily restated in the section below):\n${header}\n\n---\n\nSection to extract from:\n${chunkText}`
}

// Chunking splits a hierarchical record (chronological visits, nested
// sub-sections under a visit, etc.) into independently-processed pieces —
// this line is the only signal a chunk retains of where it sits in that
// hierarchy. Without it, a sub-section separated from its parent heading
// loses the date/context a human reader would infer, and repeat mentions of
// the same condition across chronological visits are more likely to drift in
// naming (weakening the merge in mergeConditions below) since each call has
// no sense of "this is one visit among several," just isolated text.
function withSectionContext(chunkText: string, chunk: TextChunk): string {
  const heading = chunk.sectionHeading || '(untitled section)'
  const dated = chunk.inferredDate ? `, dated ${chunk.inferredDate}` : ''
  return `Section: "${heading}" (type: ${chunk.sectionType}${dated})\n\n${chunkText}`
}

async function extractConditionSummaries(text: string, apiKey: string, models: string[], routing: EnrichRoutingOptions): Promise<ExtractionStepResult | null> {
  // Section-aware chunking (respects the document's actual structure, so a
  // chunk boundary lands between sections, not mid-hierarchy) when structure
  // analysis succeeds. analyzeRecordStructure already degrades to a single
  // full-text section on failure (see structure.ts's singleSectionFallback),
  // which chunkRecordBySections then splits by pure size/paragraph boundary
  // the same way it always did — no separate fallback path needed here.
  const structure = await analyzeRecordStructure(
    text, apiKey, models,
    { ...routing, timeoutMs: Math.max(routing.timeoutMs ?? 0, EXTRACTION_TIMEOUT_MS), waitForCooldown: true },
  )
  const chunks = chunkRecordBySections(text, structure, CHUNK_MAX_CHARS)
  const documentHeader = text.slice(0, DOCUMENT_HEADER_CHARS)

  const settled = await runWithConcurrency(chunks, CHUNK_POOL_SIZE, (chunk) => (
    extractConditionSummariesFromChunk(
      withDocumentHeader(withSectionContext(chunk.text, chunk), documentHeader),
      apiKey, models, routing,
    )
  ))

  const conditions: ConditionSummary[] = []
  const measurements: MeasurementInput[] = []
  let succeededChunks = 0
  settled.forEach((outcome) => {
    if (outcome.status === 'fulfilled' && outcome.value) {
      succeededChunks += 1
      conditions.push(...outcome.value.conditions)
      measurements.push(...outcome.value.measurements)
    }
  })

  // Every chunk failed — nothing usable came out of the whole record, same
  // "total wipeout" semantics the single-call version had.
  if (succeededChunks === 0) return null
  const dedupedConditions = await dedupeConditionSummaries(conditions, apiKey, models, routing)
  return { conditions: dedupedConditions, measurements }
}

// ── Post-extraction dedupe (safety net for cross-chunk name drift) ─────────────
// Alias canonicalization (conditionKey below) catches the common-abbreviation
// case cheaply and deterministically. This pass catches everything else a
// chronological record's repeated mentions can produce (paraphrasing,
// language drift, a name spelled out fully in one visit and abbreviated
// differently in another) by asking the model directly whether two entries
// are the same diagnosis — one extra call, only when there's more than one
// condition to compare, and never fatal: any failure just skips the pass and
// leaves the un-deduped list for conditionKey/mergeConditions downstream.

function isValidDedupeLine(value: unknown): value is { index: number; group: number } {
  return isRecord(value) && typeof value.index === 'number' && typeof value.group === 'number'
}

function parseDedupeGroups(content: string): Map<number, number> | null {
  const cleaned = content.replace(/```(?:json|ndjson)?\n?|\n?```/g, '').trim()
  const groups = new Map<number, number>()
  for (const line of cleaned.split('\n').map((l) => l.trim()).filter(Boolean)) {
    try {
      const value = JSON.parse(line)
      if (isValidDedupeLine(value)) groups.set(value.index, value.group)
    } catch { /* skip malformed line, same tolerance as parseExtractionStepResponse */ }
  }
  return groups.size > 0 ? groups : null
}

function mergeConditionSummaryGroup(items: ConditionSummary[]): ConditionSummary {
  return items.slice(1).reduce((a, b) => ({
    name_medical: a.name_medical,
    earliest_date: earlierDate(a.earliest_date, b.earliest_date),
    notes: [a.notes, b.notes].filter(Boolean).join(' | ') || null,
    provider: a.provider ?? b.provider,
    facility: a.facility ?? b.facility,
  }), items[0])
}

async function dedupeConditionSummaries(
  summaries: ConditionSummary[], apiKey: string, models: string[], routing: EnrichRoutingOptions,
): Promise<ConditionSummary[]> {
  if (summaries.length < 2) return summaries

  const input = summaries.map((s, index) => JSON.stringify({ index, name_medical: s.name_medical })).join('\n')
  const result = await callLLMWithFallback<Map<number, number>>({
    messages: [{ role: 'system', content: CONDITION_DEDUPE_PROMPT }, { role: 'user', content: input }],
    apiKey,
    models,
    label: 'extraction-dedupe',
    db: routing.db,
    profile: routing.profile,
    keys: routing.keys,
    timeoutMs: routing.timeoutMs,
    onTrace: routing.onTrace,
    responseFormat: 'text',
    waitForCooldown: true,
    validate: parseDedupeGroups,
  })
  if (!result.ok || !result.value) return summaries

  const groups = result.value
  const byGroup = new Map<number | string, ConditionSummary[]>()
  summaries.forEach((summary, index) => {
    const group = groups.get(index) ?? `ungrouped-${index}`
    byGroup.set(group, [...(byGroup.get(group) ?? []), summary])
  })
  return Array.from(byGroup.values()).map(mergeConditionSummaryGroup)
}

// ── Step 3: enrichment (batched — one call for every condition) ────────────────
// Takes Step 2's {name, earliest_date, notes} list and fills out the full
// ConditionInput per condition. Almost none of this needs the LLM — only
// normalized organ/system/anatomical_location/laterality, since that requires
// medical-terminology understanding the name/notes alone don't give us
// heuristically. Everything else is a direct, local mapping from the summary.
// One call for every condition (not one call each) — with up to a few dozen
// conditions, N separate calls hammers the free-tier per-minute rate limit
// hard (each one is small, but the LLM-call *count* is what's throttled).

type ConditionAnatomy = {
  system: string
  organ: string | null
  anatomical_location: string | null
  laterality: string | null
}

function isValidIndexedAnatomyLine(value: unknown): value is ConditionAnatomy & { index: number } {
  if (!isRecord(value)) return false
  return typeof value.index === 'number'
    && typeof value.system === 'string'
    && isNullableString(value.organ)
    && isNullableString(value.anatomical_location)
    && isNullableString(value.laterality)
}

// NDJSON, same reasoning as parseExtractionStepResponse: one malformed/missing
// line just leaves that one condition unplaced, not the whole batch.
function parseConditionAnatomyBatch(content: string): Map<number, ConditionAnatomy> | null {
  const cleaned = content.replace(/```(?:json|ndjson)?\n?|\n?```/g, '').trim()
  const lines = cleaned.split('\n').map((line) => line.trim()).filter(Boolean)
  const results = new Map<number, ConditionAnatomy>()
  for (const line of lines) {
    let value: unknown
    try {
      value = JSON.parse(line)
    } catch {
      continue
    }
    if (isValidIndexedAnatomyLine(value)) {
      results.set(value.index, {
        system: value.system,
        organ: value.organ,
        anatomical_location: value.anatomical_location,
        laterality: value.laterality,
      })
    }
  }
  return results.size > 0 ? results : null
}

// Never throws — a failed/unavailable anatomy call degrades to every
// condition being unplaced rather than failing the whole record; anatomy is
// an enhancement on top of the already-captured name/date/notes, not a hard
// requirement.
async function enrichConditionAnatomyBatch(summaries: ConditionSummary[], apiKey: string, models: string[], routing: EnrichRoutingOptions): Promise<Map<number, ConditionAnatomy>> {
  try {
    const userMessage = summaries
      .map((summary, index) => JSON.stringify({ index, name_medical: summary.name_medical, notes: summary.notes }))
      .join('\n')
    const result = await callLLMWithFallback<Map<number, ConditionAnatomy>>({
      messages: [{ role: 'system', content: CONDITION_ENRICHMENT_PROMPT }, { role: 'user', content: userMessage }],
      apiKey,
      models,
      temperature: 0,
      label: 'enrichment-anatomy',
      db: routing.db,
      profile: routing.profile,
      keys: routing.keys,
      timeoutMs: Math.max(routing.timeoutMs ?? 0, EXTRACTION_TIMEOUT_MS),
      onTrace: routing.onTrace,
      responseFormat: 'text',
      waitForCooldown: true,
      validate: parseConditionAnatomyBatch,
    })
    return result.ok && result.value ? result.value : new Map()
  } catch {
    return new Map()
  }
}

// The non-LLM part of enrichment: local defaults filled directly from the
// extraction summary, with only anatomy coming from enrichConditionAnatomy.
function buildConditionFromSummary(summary: ConditionSummary, anatomy: ConditionAnatomy | null): ConditionInput {
  return {
    name_medical: summary.name_medical,
    name_common: null,
    system: anatomy?.system ?? 'other',
    organ: anatomy?.organ ?? null,
    anatomical_location: anatomy?.anatomical_location ?? null,
    status: 'documented',
    severity: null,
    certainty: null,
    date_onset: null,
    date_diagnosed: summary.earliest_date,
    evidence: null,
    notes: summary.notes,
    provider: summary.provider,
    // Facility only reaches persistence via a care event (see indexedDb.ts's
    // persistEnrichmentResult), same as the report-context inheritance path
    // parseLongitudinalResponse already used — carry it through the same way.
    care_events: summary.provider && summary.earliest_date
      ? [{ event_type: 'other', date: summary.earliest_date, provider: summary.provider, facility: summary.facility, evidence: null }]
      : [],
    locations: anatomy?.laterality ? [{ anatomical_location: anatomy.anatomical_location, laterality: anatomy.laterality, evidence: null }] : [],
  }
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

// ── Cross-chunk merge ─────────────────────────────────────────────────────────

function normalizedKey(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, ' ').trim()
}

// A chronological record mentions the same condition at every visit — each
// mention comes from a separate chunk call (possibly a different fallback
// model), so exact-string drift between calls ("HTN" vs "essential
// hypertension") is the dominant reason two occurrences of one real condition
// fail to collapse in mergeConditions below. This table only needs to cover
// common abbreviations landing on the same canonical form normalizedKey()
// would already produce for the spelled-out name.
const CONDITION_NAME_ALIASES: Record<string, string> = {
  'htn': 'hypertension',
  'essential htn': 'essential hypertension',
  't2dm': 'type 2 diabetes mellitus',
  't1dm': 'type 1 diabetes mellitus',
  'dm2': 'type 2 diabetes mellitus',
  'dm type 2': 'type 2 diabetes mellitus',
  'dm type 1': 'type 1 diabetes mellitus',
  'gerd': 'gastroesophageal reflux disease',
  'copd': 'chronic obstructive pulmonary disease',
  'cad': 'coronary artery disease',
  'chf': 'congestive heart failure',
  'ckd': 'chronic kidney disease',
  'afib': 'atrial fibrillation',
  'a fib': 'atrial fibrillation',
  'osa': 'obstructive sleep apnea',
  'uti': 'urinary tract infection',
  'hld': 'hyperlipidemia',
  'ibs': 'irritable bowel syndrome',
  'ra': 'rheumatoid arthritis',
  'oa': 'osteoarthritis',
  'mi': 'myocardial infarction',
}

function canonicalizeConditionName(name: string): string {
  const normalized = normalizedKey(name)
  return CONDITION_NAME_ALIASES[normalized] ?? normalized
}

export function conditionKey(c: ConditionInput): string {
  // An explicit locations array represents one condition with multiple sites
  // (for example left and right kidneys). Do not split those occurrences into
  // separate conditions based on their section-level location labels.
  const locationKey = c.locations && c.locations.length > 0 ? '' : normalizedKey(c.anatomical_location ?? '')
  return [canonicalizeConditionName(c.name_medical), normalizedKey(c.organ ?? ''), locationKey].join('|')
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

// ── Main export ───────────────────────────────────────────────────────────────
// Two-step orchestration:
//   Step 2 (extraction): one whole-document LLM call -> {name, earliest_date,
//     notes} per unique condition, plus measurements.
//   Step 3 (enrichment): per condition, fill the full ConditionInput locally
//     (no LLM) except normalized anatomy, which is the one LLM call per
//     condition. `onConditionProgress` reports real per-condition progress
//     (not a chunk count) as each one finishes enrichment.

export async function enrichFromText(
  text: string,
  apiKey: string,
  models?: string[],
  routing?: EnrichRoutingOptions,
  onConditionProgress?: (completed: number, total: number, name: string) => void,
): Promise<EnrichmentResult> {
  const modelChain = models && models.length > 0 ? models : DEFAULT_MODELS
  // pageBreaks isn't a callLLMWithFallback option — strip it before `llmRouting`
  // gets spread into the LLM call options below.
  const { pageBreaks: _pageBreaks, ...llmRouting } = routing ?? {}

  const extracted = await extractConditionSummaries(text, apiKey, modelChain, llmRouting)
  if (!extracted) {
    throw new EnrichmentFailedError(['condition-list extraction unavailable or context-rejected'])
  }
  const { conditions: summaries, measurements } = extracted
  const total = summaries.length

  if (total === 0) {
    onConditionProgress?.(0, 0, '')
    return { conditions: [], measurements, providers: [], facilities: [] }
  }

  // One call for every condition's anatomy, not one call each — see
  // enrichConditionAnatomyBatch's comment for why (free-tier per-minute rate
  // limits are keyed on call count, not per-call size).
  const anatomyByIndex = await enrichConditionAnatomyBatch(summaries, apiKey, modelChain, llmRouting)
  const conditions = summaries.map((summary, index) => {
    const condition = buildConditionFromSummary(summary, anatomyByIndex.get(index) ?? null)
    onConditionProgress?.(index + 1, total, summary.name_medical)
    return condition
  })

  const mergedConditions = mergeConditions(conditions)
  const providers = mergedConditions
    .map((c) => c.provider)
    .filter((p): p is ProviderInput => Boolean(p))
  const facilities = mergedConditions
    .flatMap((c) => (c.care_events ?? []).map((event) => event.facility))
    .filter((facility): facility is FacilityInput => Boolean(facility))

  return {
    conditions: mergedConditions,
    measurements,
    providers,
    facilities,
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
