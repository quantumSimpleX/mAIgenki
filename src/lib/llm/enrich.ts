import { callLLMWithFallback, DEFAULT_MODELS } from './client'
import { analyzeRecordStructure, type EnrichRoutingOptions } from './structure'
import { chunkRecordBySections, type TextChunk } from './chunk'
import { runWithConcurrency } from './pool'
import { P09_WHOLE_DOCUMENT_EXTRACTION_PROMPT, CONDITION_ENRICHMENT_PROMPT, CONDITION_DEDUPE_PROMPT } from './prompts'
import { pipelineDebug } from '../debug/pipelineDebug'
import type { ConditionStatus, OrgSystem } from '@/model/health'
import { ALL_SYSTEMS } from '@/model/conditions'

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
  // Condition tier (most granular): this condition's own explicit date,
  // extracted directly from its own text. Never backfilled — stays null when
  // the condition's own text states no date.
  earliest_date: string | null
  // Section tier (P11-02): the enclosing chunk/section's own date (the
  // nearest preceding structural section date, carried forward — see
  // carriedChunkDates in extractConditionSummaries), tracked separately from
  // `earliest_date` so merge-time tier resolution (resolveConditionDateTiers)
  // can tell the two apart instead of collapsing them before merge.
  section_date: string | null
  notes: string | null
  // Resolved per condition: the condition's own explicit attribution if the
  // text names one, otherwise inherited from the document/report-level
  // provider or facility (a record often states the clinician/institution
  // once rather than repeating it for every condition) — inheritance is
  // resolved here in the parser, not left for Step 3 to figure out.
  provider: ProviderInput | null
  facility: FacilityInput | null
  // True when the final resolved `earliest_date` came from the section or
  // document tier rather than this condition's own text — set only by
  // resolveConditionDateTiers, at merge finalization.
  earliest_date_inherited?: boolean
}

type ExtractionStepResult = {
  conditions: ConditionSummary[]
  measurements: MeasurementInput[]
  // The report-level provider/facility this chunk's own response named (if
  // any), kept alongside the already-per-condition-resolved `conditions`
  // above so extractConditionSummaries can look document-wide, not just
  // within this one chunk, for an unambiguous attribution to backfill onto
  // conditions that still have none (P10-01).
  reportProvider: ProviderInput | null
  reportFacility: FacilityInput | null
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
      // Section tier is attached per-chunk in extractConditionSummaries
      // (from carriedChunkDates), not known at this per-line parse stage.
      section_date: null,
      notes: raw.notes,
      provider: ownProvider ?? reportProvider,
      facility: ownFacility ?? reportFacility,
    }
  })
  return { conditions, measurements, reportProvider, reportFacility }
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

async function extractConditionSummaries(text: string, apiKey: string, models: string[], routing: EnrichRoutingOptions): Promise<{ conditions: ConditionSummary[]; measurements: MeasurementInput[] } | null> {
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

  // Carries each chunk's own section date forward onto every following chunk
  // that has none of its own — chunks are in document order (chunkRecordBySections
  // walks sections start-to-end), so this is "the nearest non-null date above
  // this chunk in the record's hierarchy," matching how a human reader would
  // infer an undated entry's date from the last dated heading above it.
  const carriedChunkDates: (string | null)[] = []
  let lastKnownDate: string | null = null
  for (const chunk of chunks) {
    if (chunk.inferredDate) lastKnownDate = chunk.inferredDate
    carriedChunkDates.push(lastKnownDate)
  }

  const settled = await runWithConcurrency(chunks, CHUNK_POOL_SIZE, (chunk) => (
    extractConditionSummariesFromChunk(
      withDocumentHeader(withSectionContext(chunk.text, chunk), documentHeader),
      apiKey, models, routing,
    )
  ))

  const conditions: ConditionSummary[] = []
  const measurements: MeasurementInput[] = []
  let succeededChunks = 0
  settled.forEach((outcome, index) => {
    if (outcome.status === 'fulfilled' && outcome.value) {
      succeededChunks += 1
      // P11-02/P11-04: attach this chunk's carried section date as a
      // separate tier alongside whatever condition-tier date the chunk
      // itself extracted — no longer collapsed into `earliest_date` here.
      // Merge-time resolution (resolveConditionDateTiers, after dedupe)
      // decides which tier wins.
      const sectionDate = carriedChunkDates[index]
      const taggedConditions = outcome.value.conditions.map((condition) => ({ ...condition, section_date: sectionDate }))
      conditions.push(...taggedConditions)
      measurements.push(...outcome.value.measurements)
    }
  })

  // Every chunk failed — nothing usable came out of the whole record, same
  // "total wipeout" semantics the single-call version had.
  if (succeededChunks === 0) return null
  const attributed = backfillDocumentWideAttribution(conditions, settled)
  const dedupedConditions = await dedupeConditionSummaries(attributed, apiKey, models, routing)
  const finalConditions = resolveConditionDateTiers(dedupedConditions, structure.documentDate)
  return { conditions: finalConditions, measurements }
}

// P10-01: a condition often carries its clinician/institution once, at the
// document or a single section level, rather than restating it beside every
// condition — per-chunk resolution above (parseExtractionStepResponse) only
// catches that when the mention is in the *same* chunk as the condition.
// This extends the same inheritance document-wide, but only when doing so is
// unambiguous: if the whole document names exactly one distinct
// provider/facility anywhere (its own conditions' explicit attribution, or
// any chunk's report-level one), any condition still missing that field
// inherits it. More than one distinct provider/facility anywhere leaves
// unattributed conditions null rather than guessing which one applies.
export function backfillDocumentWideAttribution(
  conditions: ConditionSummary[],
  chunkResults: PromiseSettledResult<ExtractionStepResult | null>[],
): ConditionSummary[] {
  const providers: ProviderInput[] = []
  const facilities: FacilityInput[] = []
  for (const outcome of chunkResults) {
    if (outcome.status !== 'fulfilled' || !outcome.value) continue
    if (outcome.value.reportProvider) providers.push(outcome.value.reportProvider)
    if (outcome.value.reportFacility) facilities.push(outcome.value.reportFacility)
    for (const condition of outcome.value.conditions) {
      if (condition.provider) providers.push(condition.provider)
      if (condition.facility) facilities.push(condition.facility)
    }
  }
  const uniqueProviders = dedupeProviders(providers)
  const uniqueFacilities = dedupeFacilities(facilities)
  const documentProvider = uniqueProviders.length === 1 ? uniqueProviders[0] : null
  const documentFacility = uniqueFacilities.length === 1 ? uniqueFacilities[0] : null
  if (!documentProvider && !documentFacility) return conditions
  return conditions.map((condition) => ({
    ...condition,
    provider: condition.provider ?? documentProvider,
    facility: condition.facility ?? documentFacility,
  }))
}

// P11-03: replaces the old backfillDocumentWideDate's single-global-minimum
// backfill entirely. Resolves each (already merged-across-occurrences)
// condition's final date across the three tracked tiers, most granular
// non-null wins: its own condition-tier date first, its section-tier date
// second, the document's single genuinely-extracted date third, else null
// (the honest terminal case — never a computed substitute).
export function resolveConditionDateTiers(
  conditions: ConditionSummary[],
  documentDate: string | null,
): ConditionSummary[] {
  return conditions.map((condition) => {
    if (condition.earliest_date) return { ...condition, earliest_date_inherited: false }
    if (condition.section_date) return { ...condition, earliest_date: condition.section_date, earliest_date_inherited: true }
    if (documentDate) return { ...condition, earliest_date: documentDate, earliest_date_inherited: true }
    return condition
  })
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

// P11-03: merges each tier independently across a condition's occurrences —
// earliest non-null condition-tier date across occurrences, earliest non-null
// section-tier date across occurrences — keeping the two tiers distinguishable
// for resolveConditionDateTiers, which runs after dedupe and picks whichever
// tier applies (most granular non-null wins), not decided here.
function mergeConditionSummaryGroup(items: ConditionSummary[]): ConditionSummary {
  return items.slice(1).reduce((a, b) => ({
    name_medical: a.name_medical,
    earliest_date: earlierDate(a.earliest_date, b.earliest_date),
    section_date: earlierDate(a.section_date, b.section_date),
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
  system: OrgSystem
  // Confirmation status — 'documented'/'resolved' mean the condition is an
  // actual diagnosis/finding the patient has (or had); 'suspected' means the
  // record only supports a risk factor, screening result, or item being
  // monitored, not a confirmed diagnosis. 'inferred' is reserved for
  // clinical-rule-derived conditions (applyInferenceRules) and never
  // produced by this LLM classification.
  status: ConditionStatus
  organ: string | null
  anatomical_location: string | null
  laterality: string | null
  // P10-03: common-language display name, distinct from name_medical, and
  // its localized variants (a subset of SupportedLang, keyed the same way).
  name_common: string | null
  local_names: Record<string, string> | null
  // P10-04: model-proposed body-map position (0-100 percent), derived from
  // the condition's own notes/anatomical_location/laterality first, the
  // model's general anatomical knowledge second. Null when the model
  // couldn't propose a usable point — buildConditionFromSummary leaves cx/cy
  // unset in that case, so defaultConditionPosition's hash-jitter (the
  // last-resort fallback) applies, same as if this whole call had failed.
  cx: number | null
  cy: number | null
}

function isValidLocalNames(value: unknown): value is Record<string, string> | null {
  if (value == null) return true
  if (!isRecord(value)) return false
  return Object.values(value).every((v) => typeof v === 'string')
}

// A malformed/out-of-range cx or cy degrades to "no proposed position" for
// that one field, rather than invalidating the whole anatomy line — the
// anatomy/name fields are independently useful even without a coordinate.
function sanitizeCoordinate(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null
}

// The real 11-value OrgSystem enum, checked at runtime — a set, not just
// `typeof === 'string'`, so a hallucinated/malformed value from a weak
// free-tier model (or the app's own former `'other'` fallback) is treated
// exactly like a missing system: the whole anatomy line is rejected below,
// not silently accepted and later mis-rendered (Defect 3, P10-08).
const VALID_SYSTEMS = new Set<string>(ALL_SYSTEMS)

function isValidSystem(value: unknown): value is OrgSystem {
  return typeof value === 'string' && VALID_SYSTEMS.has(value)
}

// Only the two extraction-producible statuses — 'inferred' is reserved for
// clinical-rule-derived conditions and never accepted from the LLM here.
const VALID_ANATOMY_STATUSES = new Set<string>(['documented', 'resolved', 'suspected'])

function isValidAnatomyStatus(value: unknown): value is ConditionStatus {
  return typeof value === 'string' && VALID_ANATOMY_STATUSES.has(value)
}

function isValidIndexedAnatomyLine(value: unknown): value is { index: number; system: OrgSystem; status: ConditionStatus; organ: string | null; anatomical_location: string | null; laterality: string | null; name_common: string | null; local_names: unknown } {
  if (!isRecord(value)) return false
  return typeof value.index === 'number'
    && isValidSystem(value.system)
    && isValidAnatomyStatus(value.status)
    && isNullableString(value.organ)
    && isNullableString(value.anatomical_location)
    && isNullableString(value.laterality)
    && isNullableString(value.name_common)
    && isValidLocalNames(value.local_names)
}

// NDJSON, same reasoning as parseExtractionStepResponse: one malformed/missing
// line just leaves that one condition unplaced, not the whole batch. An
// out-of-enum "system" value (including the app's own former `'other'`
// fallback) is treated the same as a missing one — the line is dropped, not
// passed through — see isValidIndexedAnatomyLine/isValidSystem above.
export function parseConditionAnatomyBatch(content: string): Map<number, ConditionAnatomy> | null {
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
        status: value.status,
        organ: value.organ,
        anatomical_location: value.anatomical_location,
        laterality: value.laterality,
        name_common: value.name_common,
        local_names: (value.local_names as Record<string, string> | null | undefined) ?? null,
        cx: sanitizeCoordinate((value as Record<string, unknown>).cx),
        cy: sanitizeCoordinate((value as Record<string, unknown>).cy),
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

// P10-08 (Defect 3): last-resort deterministic classifier — only reached when
// the LLM anatomy call has already failed for this condition, both in the
// batch and after individual retry (see resolveConditionAnatomies below).
// Keyword/substring matching on the condition name (notes as a weaker
// secondary signal) covering common condition-name patterns. This is a safety
// net for total LLM unavailability, not the primary classification path, and
// it must still always return one of the 11 real systems — never 'other'/null
// — per the locked product decision in P10-08's card entry. The per-pattern
// mappings below are a pragmatic, non-exhaustive judgment call (flagged for
// ArchAgent/QA): anything unmatched defaults to 'skeletal' as the broadest,
// most common catch-all category in real records, not an arbitrary choice.
const LOCAL_SYSTEM_KEYWORDS: [RegExp, OrgSystem][] = [
  [/diabet|thyro|hormon|endocrin|adrenal|pituitary|hypoglyc|hyperglyc|glucose|obesity/i, 'endocrine'],
  [/depress|anxiety|seizure|epilep|migraine|headache|stroke|neuro|dementia|parkinson|alzheimer|mental|psychiat|bipolar|nerve|cognit/i, 'nervous'],
  [/skin|derma|rash|eczema|psoriasis|acne|melanoma|\bmole\b|wart|verruca|follicul/i, 'integumentary'],
  [/heart|cardiac|cardio|hypertension|blood pressure|arrhythmia|coronary|artery|arterial|vascular|aort/i, 'cardiovascular'],
  [/lung|respirat|asthma|copd|pneumonia|bronch|pulmonary|throat|pharyn|larynx|nasopharyn|sinus/i, 'respiratory'],
  [/kidney|renal|urinary|bladder|nephro|ureter|proteinuria|hematuria/i, 'renal'],
  [/stomach|intestin|bowel|liver|gastro|gastric|esophag|digest|colon|pancrea|hepat|polyp|hemorrhoid|diarrhea|dysphagia|lactose|alpha-fetoprotein|\bafp\b/i, 'digestive'],
  [/lymph|spleen|immune|allerg|epstein.?barr|\bebv\b/i, 'lymphatic'],
  [/muscle|muscular|myopath|fibromyalgia/i, 'muscular'],
  [/bone|joint|fracture|arthritis|skeletal|spine|disc|osteo/i, 'skeletal'],
  [/prostate|ovary|ovarian|uterus|testic|reproduct|menstru|pregnan|erectile/i, 'reproductive'],
]

export function classifyConditionSystemLocally(name: string, notes: string | null): OrgSystem {
  const haystack = `${name} ${notes ?? ''}`.toLowerCase()
  for (const [pattern, system] of LOCAL_SYSTEM_KEYWORDS) {
    if (pattern.test(haystack)) return system
  }
  return 'skeletal'
}

// P10-08 (Defect 3): the batched anatomy call (enrichConditionAnatomyBatch)
// already treats an out-of-enum/missing system as "unplaced" for that index
// (isValidIndexedAnatomyLine). This wraps it with a bounded per-condition
// retry for whichever indices came back unplaced — mirroring the model-
// fallback-chain retry shape callLLMWithFallback already uses, just applied
// once more at the condition level — before falling back to the local
// classifier. Deliberately not one LLM call per missing condition every time
// (that would reintroduce the free-tier call-count pressure the batched call
// exists to avoid) — this only fires for the (expected to be rare) subset the
// batch call left unplaced, not the whole condition list.
const ANATOMY_RETRY_ATTEMPTS = 2

async function resolveConditionAnatomies(
  summaries: ConditionSummary[], apiKey: string, models: string[], routing: EnrichRoutingOptions,
): Promise<Map<number, ConditionAnatomy>> {
  const anatomyByIndex = await enrichConditionAnatomyBatch(summaries, apiKey, models, routing)
  const missingIndices = summaries.map((_, index) => index).filter((index) => !anatomyByIndex.has(index))
  if (missingIndices.length === 0) return anatomyByIndex

  pipelineDebug('warn', 'llm', 'anatomy-batch-incomplete', {
    missingCount: missingIndices.length,
    total: summaries.length,
  })

  for (const index of missingIndices) {
    const summary = summaries[index]
    let resolved: ConditionAnatomy | null = null
    for (let attempt = 0; attempt < ANATOMY_RETRY_ATTEMPTS && !resolved; attempt++) {
      const retryResult = await enrichConditionAnatomyBatch([summary], apiKey, models, routing)
      resolved = retryResult.get(0) ?? null
    }
    anatomyByIndex.set(index, resolved ?? {
      system: classifyConditionSystemLocally(summary.name_medical, summary.notes),
      // Conservative default when the LLM call fails outright: treat as a
      // confirmed finding rather than guessing at "suspected" with no
      // classification signal at all — matches this app's prior behavior
      // before confirmation-status existed.
      status: 'documented',
      organ: null,
      anatomical_location: null,
      laterality: null,
      name_common: null,
      local_names: null,
      cx: null,
      cy: null,
    })
  }
  return anatomyByIndex
}

// The non-LLM part of enrichment: local defaults filled directly from the
// extraction summary, with only anatomy coming from enrichConditionAnatomy.
// `anatomy` is guaranteed non-null with a valid `system` by
// resolveConditionAnatomies above (batch call -> individual retry -> local
// classifier) for every real call path; the `?? classifyConditionSystemLocally(...)`
// fallback below is defense-in-depth only, never reached in practice.
function buildConditionFromSummary(summary: ConditionSummary, anatomy: ConditionAnatomy | null): ConditionInput {
  return {
    name_medical: summary.name_medical,
    name_common: anatomy?.name_common ?? null,
    system: anatomy?.system ?? classifyConditionSystemLocally(summary.name_medical, summary.notes),
    organ: anatomy?.organ ?? null,
    anatomical_location: anatomy?.anatomical_location ?? null,
    status: anatomy?.status ?? 'documented',
    severity: null,
    certainty: null,
    date_onset: null,
    date_diagnosed: summary.earliest_date,
    evidence: null,
    notes: summary.notes,
    local_names: anatomy?.local_names ?? null,
    provider: summary.provider,
    // P10-02: the summary's own provider/facility, kept as a single-entry
    // list here so mergeTwoConditions can dedupe every occurrence's
    // attribution into one list rather than keeping only the first non-null.
    providers: summary.provider ? [summary.provider] : [],
    facilities: summary.facility ? [summary.facility] : [],
    // Facility only reaches persistence via a care event (see indexedDb.ts's
    // persistEnrichmentResult), same as the report-context inheritance path
    // parseLongitudinalResponse already used — carry it through the same way.
    care_events: summary.provider && summary.earliest_date
      ? [{ event_type: 'other', date: summary.earliest_date, provider: summary.provider, facility: summary.facility, evidence: null }]
      : [],
    // Defect 4 fix: carry the anatomy call's own cx/cy onto this location entry
    // too, not just the top-level condition fields below — otherwise
    // persistEnrichmentResult's secondary-location loop had no real point to
    // prefer and fell back to defaultConditionPosition's hash-jitter, landing
    // the labeled (laterality) dot away from the LLM's actual derived position.
    locations: anatomy?.laterality
      ? [{ anatomical_location: anatomy.anatomical_location, laterality: anatomy.laterality, evidence: null, cx: anatomy?.cx ?? null, cy: anatomy?.cy ?? null }]
      : [],
    // P10-04: model-proposed position; null/absent leaves cx/cy unset, so
    // putIndexedCondition's defaultConditionPosition hash-jitter fallback
    // applies — last resort only, not the primary path.
    cx: anatomy?.cx ?? null,
    cy: anatomy?.cy ?? null,
    inferred_from_structure: summary.earliest_date_inherited ? ['date_diagnosed'] : undefined,
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
  // P10-02: every unique provider/facility attributed to this condition
  // across all its occurrences (deduped) — `provider` above remains the
  // single "primary" attribution used for the condition-linked provider
  // row; these full lists are what persistEnrichmentResult now also
  // persists as additional condition-scoped rows, and what the condition
  // detail UI reads to show every attributed provider/facility, not just one.
  providers?: ProviderInput[]
  facilities?: FacilityInput[]
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
  const date = (values: (string | null | undefined)[]): string | null => values.filter((v): v is string => Boolean(v && /^\d{4}(-\d{2}-\d{2})?$/.test(v))).sort()[0] ?? null
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

// P10-02: dedupe keys for collapsing every unique provider/facility seen
// across a condition's occurrences (and their care events) into one list —
// same identity rule persistEnrichmentResult already used for record-scoped
// provider dedup (indexedDb.ts's providerKey), reused here so the two stay
// in agreement about what counts as "the same" provider/facility.
function providerDedupeKey(provider: ProviderInput): string {
  return `${provider.name}|${provider.email ?? ''}|${provider.phone ?? ''}`.toLowerCase()
}

function facilityDedupeKey(facility: FacilityInput): string {
  return `${facility.name}|${facility.address ?? ''}|${facility.city ?? ''}|${facility.state ?? ''}|${facility.country ?? ''}`.toLowerCase()
}

function dedupeProviders(providers: ProviderInput[]): ProviderInput[] {
  const byKey = new Map<string, ProviderInput>()
  for (const provider of providers) {
    const key = providerDedupeKey(provider)
    if (!byKey.has(key)) byKey.set(key, provider)
  }
  return [...byKey.values()]
}

function dedupeFacilities(facilities: FacilityInput[]): FacilityInput[] {
  const byKey = new Map<string, FacilityInput>()
  for (const facility of facilities) {
    const key = facilityDedupeKey(facility)
    if (!byKey.has(key)) byKey.set(key, facility)
  }
  return [...byKey.values()]
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

// Defect 1 fix (P11 retest, 2026-08-18): tier-aware date merge for the
// second (conditionKey-based) merge pass. `resolveConditionDateTiers` (run
// once, earlier, after `dedupeConditionSummaries`) already picks the most
// granular tier per occurrence and records whether the result was
// tier-inherited (section/document) via `inferred_from_structure` including
// the field name — see `buildConditionFromSummary`'s
// `earliest_date_inherited` -> `inferred_from_structure` mapping. When the
// semantic-dedupe LLM call fails, same-condition occurrences reach this
// merge pass still tier-resolved independently, and a plain
// `earlierDate` comparison (numerically-earliest-wins) can let a
// less-granular-but-earlier inherited date beat a more-granular-but-later
// condition-tier date — silently undoing tier resolution one merge stage
// later. This picks the more granular (non-inherited) occurrence's date
// regardless of numeric ordering, only falling back to earliest-within-the-
// same-tier when both occurrences' dates are at the same tier.
function mergeTieredDate(
  field: 'date_onset' | 'date_diagnosed',
  a: ConditionInput,
  b: ConditionInput,
): { value: string | null; inherited: boolean } {
  const aDate = a[field]
  const bDate = b[field]
  const aInherited = a.inferred_from_structure?.includes(field) ?? false
  const bInherited = b.inferred_from_structure?.includes(field) ?? false
  if (!aDate) return { value: bDate ?? null, inherited: bInherited }
  if (!bDate) return { value: aDate, inherited: aInherited }
  if (aInherited !== bInherited) return aInherited ? { value: bDate, inherited: false } : { value: aDate, inherited: false }
  return { value: earlierDate(aDate, bDate), inherited: aInherited }
}

// Merges two occurrences of "the same" condition found in different chunks:
// tier-aware date resolution (see mergeTieredDate above), evidence/care_events/
// locations concatenate, other scalar fields prefer whichever occurrence
// already has a non-null value.
function mergeTwoConditions(a: ConditionInput, b: ConditionInput): ConditionInput {
  const dateOnset = mergeTieredDate('date_onset', a, b)
  const dateDiagnosed = mergeTieredDate('date_diagnosed', a, b)
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
    date_onset: dateOnset.value,
    date_diagnosed: dateDiagnosed.value,
    evidence: [a.evidence, b.evidence].filter(Boolean).join(' | ') || null,
    notes: firstNonNull(a.notes, b.notes),
    local_names: a.local_names ?? b.local_names,
    provider: a.provider ?? b.provider,
    // P10-02: every unique provider/facility from both occurrences' own
    // lists plus their care events — the fix for the prior behavior, which
    // kept only the first non-null `provider` and dropped facilities outside
    // concatenated care_events.
    providers: dedupeProviders([
      ...(a.providers ?? []), ...(b.providers ?? []),
      ...(a.care_events ?? []).map((event) => event.provider),
      ...(b.care_events ?? []).map((event) => event.provider),
    ]),
    facilities: dedupeFacilities([
      ...(a.facilities ?? []), ...(b.facilities ?? []),
      ...(a.care_events ?? []).flatMap((event) => (event.facility ? [event.facility] : [])),
      ...(b.care_events ?? []).flatMap((event) => (event.facility ? [event.facility] : [])),
    ]),
    care_events: [...(a.care_events ?? []), ...(b.care_events ?? [])],
    cx: a.cx ?? b.cx,
    cy: a.cy ?? b.cy,
    locations: mergeConditionLocations([...(a.locations ?? []), ...(b.locations ?? [])]),
    // Union of both occurrences' flags for any non-date field, but for
    // date_onset/date_diagnosed specifically, reflect the *winning* value's
    // actual tier (mergeTieredDate above) rather than a blind union — a
    // condition-tier date that won over an inherited one from the other
    // occurrence must not still be flagged "inferred".
    inferred_from_structure: Array.from(new Set([
      ...(a.inferred_from_structure ?? []).filter((field) => field !== 'date_onset' && field !== 'date_diagnosed'),
      ...(b.inferred_from_structure ?? []).filter((field) => field !== 'date_onset' && field !== 'date_diagnosed'),
      ...(dateOnset.inherited ? ['date_onset'] : []),
      ...(dateDiagnosed.inherited ? ['date_diagnosed'] : []),
    ])),
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
  // limits are keyed on call count, not per-call size). resolveConditionAnatomies
  // guarantees every index ends up with a valid `system` (individual retry,
  // then a local classifier last resort) so buildConditionFromSummary never
  // sees a missing/invalid one — P10-08 (Defect 3).
  const anatomyByIndex = await resolveConditionAnatomies(summaries, apiKey, modelChain, llmRouting)
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
