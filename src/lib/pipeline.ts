import { extractTextFromPDF } from './pdf/extract'
import { extractTextFromImage } from './ocr/extract'
import {
  enrichFromText,
  conditionKey,
  type ConditionInput,
  type CareEventInput,
  type ProviderInput,
} from './llm/enrich'
import { applyInferenceRules } from './inference/rules'
import { getModelChain, type LLMTraceEvent } from './llm/client'
import { loadProfile } from './llm/profile'
import { makeKeyStore } from './llm/keystore'
import {
  persistEnrichmentResult, putRecordImage, putConditionRecord, getIndexedSetting,
  type EnrichedInput, type PersistEnrichmentResult,
} from './db/indexedDb'
import { redactPIIWithOffsetMap, extractProviderContacts } from './privacy/redact'
import { renderPagesToCanvas } from './pdf/renderPage'
import { compressToTarget } from './media/compress'

export type { EnrichedInput }

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
  // Health-data persistence target — conditions/measurements/locations write
  // here via persistEnrichmentResult (Task 2.15), the same path demo seeding
  // uses (src/lib/db/indexedDb.ts's seedIndexedDbDemoData).
  idb: IDBDatabase
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

export type PipelineResult = PersistEnrichmentResult

// ── Helpers ───────────────────────────────────────────────────────────────────

function isPdf(uri: string): boolean {
  return uri.toLowerCase().split('?')[0].endsWith('.pdf')
}

function filenameFromUri(uri: string): string {
  return uri.split('/').pop()?.split('?')[0] ?? 'unknown'
}

function normalizedName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

// Same generator pattern as src/lib/db/indexedDb.ts's private `uuid()` —
// duplicated rather than exported/imported so this file's condition ids can
// be assigned *before* persistEnrichmentResult runs (Task 4.3 needs a stable
// condition_id to link a captured image to, and persistEnrichmentResult only
// generates one internally when the input `id` is absent).
function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

// "Hundreds of KB, not multi-MB" per the card's acceptance criteria.
const MAX_IMAGE_BYTES = 500_000
const MAX_THUMBNAIL_DIMENSION = 320

function createThumbnailBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  if (typeof document === 'undefined') return Promise.resolve(null)
  const scale = Math.min(1, MAX_THUMBNAIL_DIMENSION / Math.max(canvas.width, canvas.height))
  const thumbnail = document.createElement('canvas')
  thumbnail.width = Math.max(1, Math.round(canvas.width * scale))
  thumbnail.height = Math.max(1, Math.round(canvas.height * scale))
  const context = thumbnail.getContext('2d')
  if (!context) return Promise.resolve(null)
  context.drawImage(canvas, 0, 0, thumbnail.width, thumbnail.height)
  return new Promise((resolve) => thumbnail.toBlob(resolve, 'image/jpeg', 0.7))
}

function contactForProvider(
  name: string,
  index: number,
  contacts: ReturnType<typeof extractProviderContacts>,
): ReturnType<typeof extractProviderContacts>[number] | undefined {
  const normalized = normalizedName(name)
  return contacts.find((contact) => {
    if (!contact.name) return false
    const candidate = normalizedName(contact.name)
    return normalized.includes(candidate) || candidate.includes(normalized)
  }) ?? (contacts.length === 1 ? contacts[0] : contacts[index])
}

// Task 4.3 — for each imageWorthy section (enrichment.imageSections), render
// + compress every page in its range and store it, linking a condition_records
// row to whichever already-persisted condition(s) that section's chunk
// extraction produced (matched via conditionKey — see enrich.ts's
// ImageWorthySection doc comment). A rendering/compression failure for one
// page is caught and skipped — it must never fail the whole record.
async function captureRecordImages(
  idb: IDBDatabase,
  uri: string,
  recordId: string,
  filename: string,
  imageSections: import('./llm/enrich').ImageWorthySection[] | undefined,
  imageOnlyPages: number[] | undefined,
  conditionsWithKeys: { id: string; key: string }[],
  trace: (event: string, details?: Record<string, unknown>) => void,
): Promise<void> {
  if ((!imageSections || imageSections.length === 0) && (!imageOnlyPages || imageOnlyPages.length === 0)) return

  type PageCapture = {
    pageNumber: number
    heading: string | null
    inferredDate: string | null
    conditionIds: Set<string>
  }
  const pages = new Map<number, PageCapture>()
  for (const section of imageSections ?? []) {
    const matchedConditionIds = conditionsWithKeys
      .filter((c) => section.conditionKeys.includes(c.key))
      .map((c) => c.id)
    for (let pageNumber = section.pageStart; pageNumber <= section.pageEnd; pageNumber += 1) {
      const existing = pages.get(pageNumber) ?? {
        pageNumber,
        heading: section.heading || null,
        inferredDate: section.inferredDate,
        conditionIds: new Set<string>(),
      }
      for (const conditionId of matchedConditionIds) existing.conditionIds.add(conditionId)
      if (!existing.heading && section.heading) existing.heading = section.heading
      if (!existing.inferredDate) existing.inferredDate = section.inferredDate
      pages.set(pageNumber, existing)
    }
  }
  for (const pageNumber of imageOnlyPages ?? []) {
    if (!pages.has(pageNumber)) {
      pages.set(pageNumber, {
        pageNumber,
        heading: 'Image-only page',
        inferredDate: null,
        conditionIds: new Set<string>(),
      })
    }
  }

  const pageNumbers = [...pages.keys()].sort((a, b) => a - b)
  try {
    const canvases = await renderPagesToCanvas(uri, pageNumbers)
    for (const [pageNumber, canvas] of canvases) {
      const capture = pages.get(pageNumber)
      if (!capture) continue
      try {
        const { blob, byteSize } = await compressToTarget(canvas, MAX_IMAGE_BYTES)
        const thumbnailBlob = await createThumbnailBlob(canvas)
        const imageId = uuid()
        const createdAt = new Date().toISOString()
        await putRecordImage(idb, {
          id: imageId,
          record_id: recordId,
          page_number: pageNumber,
          source_file: filename,
          title: capture.heading,
          mime_type: 'image/jpeg',
          width: canvas.width,
          height: canvas.height,
          byte_size: byteSize,
          image_blob: blob,
          thumbnail_blob: thumbnailBlob,
          date: capture.inferredDate,
          notes: null,
          created_at: createdAt,
        })
        for (const conditionId of capture.conditionIds) {
          await putConditionRecord(idb, {
            id: uuid(),
            condition_id: conditionId,
            record_type: 'image',
            title: capture.heading,
            image_id: imageId,
            chart_json: null,
            table_json: null,
            color: null,
            date: capture.inferredDate,
            source_file: filename,
            notes: null,
            created_at: createdAt,
          })
        }
        trace('image-captured', {
          page: pageNumber, section: capture.heading, byteSize, linkedConditions: capture.conditionIds.size,
        })
      } catch (err) {
        trace('image-capture-failed', {
          page: pageNumber, section: capture.heading, error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  } catch (err) {
    trace('image-capture-failed', {
      pages: pageNumbers,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

function hasProviderShape(value: unknown): value is ProviderInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const provider = value as Record<string, unknown>
  const nullableString = (field: unknown): boolean => field === null || typeof field === 'string'
  return typeof provider.name === 'string'
    && nullableString(provider.specialty)
    && nullableString(provider.email)
    && nullableString(provider.phone)
    && nullableString(provider.evidence)
}

function hasCareEventShape(value: unknown): value is CareEventInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const event = value as Record<string, unknown>
  const eventTypes = ['diagnosed', 'revisited', 'treated', 'monitored', 'referred', 'other']
  const nullableString = (field: unknown): boolean => field === null || typeof field === 'string'
  return typeof event.event_type === 'string'
    && eventTypes.includes(event.event_type)
    && typeof event.date === 'string'
    && hasProviderShape(event.provider)
    && (event.facility === null || (typeof event.facility === 'object' && event.facility !== null
      && !Array.isArray(event.facility)
      && typeof (event.facility as Record<string, unknown>).name === 'string'
      && nullableString((event.facility as Record<string, unknown>).address)
      && nullableString((event.facility as Record<string, unknown>).city)
      && nullableString((event.facility as Record<string, unknown>).state)
      && nullableString((event.facility as Record<string, unknown>).country)))
    && nullableString(event.evidence)
}

function rehydrateProviderContact(
  provider: ProviderInput,
  index: number,
  contacts: ReturnType<typeof extractProviderContacts>,
): ProviderInput {
  const normalizedName = String(provider.name ?? '').trim()
  const local = contactForProvider(normalizedName, index, contacts)
  return {
    ...provider,
    name: normalizedName,
    email: provider.email ?? local?.email ?? null,
    phone: provider.phone ?? local?.phone ?? null,
    evidence: provider.evidence ?? local?.evidence ?? null,
  }
}

function rehydrateConditionContacts(
  condition: ConditionInput,
  conditionIndex: number,
  contacts: ReturnType<typeof extractProviderContacts>,
): ConditionInput {
  const provider = condition.provider && hasProviderShape(condition.provider)
    ? rehydrateProviderContact(condition.provider, conditionIndex, contacts)
    : condition.provider
  const care_events = (condition.care_events ?? [])
    .filter(hasCareEventShape)
    .map((event, eventIndex) => ({
      ...event,
      provider: rehydrateProviderContact(event.provider, conditionIndex + eventIndex, contacts),
    }))
  return { ...condition, provider, care_events }
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

export async function processHealthRecord(opts: PipelineOptions): Promise<PipelineResult> {
  const {
    uri, idb, sex, kind, onProgress,
  } = opts
  const pipelineStartedAt = Date.now()
  const trace = (event: string, details: Record<string, unknown> = {}): void => {
    console.info('[health-pipeline]', event, { elapsedMs: Date.now() - pipelineStartedAt, ...details })
  }
  const traceLlm = (event: LLMTraceEvent): void => {
    if (event.type === 'attempt') {
      trace('llm-attempt', { label: event.label, provider: event.candidate.providerId, model: event.candidate.model })
    } else if (event.type === 'failure') {
      trace('llm-failure', {
        label: event.label,
        provider: event.failure.providerId,
        model: event.failure.model,
        kind: event.failure.kind,
        status: event.failure.status,
        retryAfterMs: event.failure.retryAfterMs,
        message: event.failure.message,
      })
    } else if (event.type === 'success') {
      trace('llm-success', {
        label: event.label,
        provider: event.result.providerId,
        model: event.result.model,
        attemptCount: event.attemptCount,
        promptTokens: event.result.usage?.promptTokens ?? null,
        completionTokens: event.result.usage?.completionTokens ?? null,
      })
    } else {
      trace('llm-exhausted', {
        label: event.label,
        failureCount: event.failures.length,
        failures: event.failures.map((failure) => ({
          provider: failure.providerId,
          model: failure.model,
          kind: failure.kind,
          status: failure.status,
          retryAfterMs: failure.retryAfterMs,
          message: failure.message,
        })),
      })
    }
  }
  const report = (phase: ProgressPhase, progress: number): void => onProgress?.(phase, progress)
  trace('started', { inputKind: kind ?? 'auto', sexProvided: sex != null })

  // Step 1 — extract text
  let text: string
  let extractionMethod: string
  let pageCount: number | null = null
  // Task 3.1's per-page offsets — only available for PDF/text extraction (the
  // image/OCR path has no page structure to report); undefined here just
  // means analyzeRecordStructure falls back to page-less sections.
  let pageBreaks: number[] | undefined
  let imageOnlyPages: number[] | undefined

  report(0, 0.05)
  const extractionStartedAt = Date.now()
  trace('extraction-started', { inputKind: isPdf(uri) ? 'pdf' : 'image' })
  const isPdfInput = kind ? kind === 'pdf' : isPdf(uri)
  if (isPdfInput) {
    const extracted = await extractTextFromPDF(uri)
    if (extracted.method === 'ocr') {
      trace('extraction-failed', { reason: 'ocr-required' })
      throw new OcrRequiredError()
    }
    text = extracted.text
    pageCount = extracted.pageCount
    pageBreaks = extracted.pageBreaks
    imageOnlyPages = extracted.imageOnlyPages
    extractionMethod = 'text'
  } else {
    text = await extractTextFromImage(uri)
    extractionMethod = 'image'
  }
  trace('extraction-completed', {
    method: extractionMethod,
    pageCount,
    textCharacters: text.length,
    durationMs: Date.now() - extractionStartedAt,
  })

  // Step 2 — redact PII before any text leaves the device. `pageBreaks` was
  // computed against the original (pre-redaction) `text`, but downstream
  // page-resolution (structure.ts, via enrichFromText below) runs against
  // `safeText` — a redaction like `[PATIENT NAME]` changes the surrounding
  // text's length, so pageBreaks must be rebased onto safeText's offsets or
  // an image-worthy section can resolve to the wrong page.
  report(1, 0.4)
  const { text: safeText, mapOffset: mapToSafeTextOffset } = redactPIIWithOffsetMap(text)
  if (pageBreaks) pageBreaks = pageBreaks.map(mapToSafeTextOffset)
  const localProviderContacts = extractProviderContacts(text)
  trace('redaction-completed', {
    originalCharacters: text.length,
    redactedCharacters: safeText.length,
    changed: text !== safeText,
    localProviderContacts: localProviderContacts.length,
  })

  // Step 3 — get model chain + API key, enrich with LLM
  const models = opts.models ?? await getModelChain(idb)
  const apiKey = opts.apiKey ?? (await getIndexedSetting(idb, 'openrouter_api_key')) ?? ''
  // Explicit pipeline API keys are used by callers/tests that intentionally
  // bypass the persisted profile. The app upload flow leaves this unset and
  // therefore uses the saved provider profile below.
  const profile = opts.apiKey ? null : await loadProfile(idb)
  trace('routing-selected', {
    profileTier: profile?.tier ?? 0,
    provider: profile?.activeProviderId ?? 'openrouter-tier-0',
    model: profile?.model ?? null,
    fallbackToFree: profile?.fallbackToFree ?? true,
    configuredApiKey: Boolean(opts.apiKey || apiKey || (profile && profile.activeProviderId)),
    modelChainLength: models.length,
    timeoutMs: profile?.activeProviderId === 'gemini' ? 180_000 : 90_000,
  })
  const enrichmentStartedAt = Date.now()
  const enrichment = profile && profile.tier > 0 && profile.activeProviderId && profile.model
    ? await enrichFromText(safeText, apiKey, models, {
      db: idb,
      profile,
      keys: await makeKeyStore(),
      timeoutMs: profile.activeProviderId === 'gemini' ? 180_000 : undefined,
      onTrace: traceLlm,
      pageBreaks,
    }, (completed, total) => {
      trace('condition-enrichment-progress', { completed, total })
      report(1, 0.4 + (total > 0 ? 0.35 * completed / total : 0.35))
    })
    : profile
      ? await enrichFromText(safeText, apiKey, models, {
        db: idb,
        profile,
        onTrace: traceLlm,
        pageBreaks,
      }, (completed, total) => {
        trace('condition-enrichment-progress', { completed, total })
        report(1, 0.4 + (total > 0 ? 0.35 * completed / total : 0.35))
      })
      : await enrichFromText(safeText, apiKey, models)
  const { conditions: llmConditions, measurements, providers: llmProviders = [] } = enrichment
  trace('enrichment-completed', {
    conditions: llmConditions.length,
    measurements: measurements.length,
    providers: llmProviders.length,
    durationMs: Date.now() - enrichmentStartedAt,
  })
  // A record with one failing chunk (Task 3.5's partial-failure tolerance)
  // still produces a usable result — surface which sections were dropped for
  // diagnostics rather than silently losing them.
  if (enrichment.partialFailures && enrichment.partialFailures.length > 0) {
    trace('enrichment-partial-failures', {
      failedSections: enrichment.partialFailures.length,
      failures: enrichment.partialFailures,
    })
  }
  const providers = llmProviders.map((provider, index) => {
    const providerName = String(provider.name ?? '').trim()
    const local = contactForProvider(providerName, index, localProviderContacts)
    return {
      ...provider,
      name: providerName,
      email: provider.email ?? local?.email ?? null,
      phone: provider.phone ?? local?.phone ?? null,
      evidence: provider.evidence ?? local?.evidence ?? null,
    }
  })
  const hydratedConditions = llmConditions.map((condition, index) => (
    rehydrateConditionContacts(condition, index, localProviderContacts)
  ))

  // Step 4 — apply threshold inference rules
  report(2, 0.75)
  const inferredConditions = applyInferenceRules(measurements, hydratedConditions, sex)
  // Assign a stable id to every LLM-extracted condition up front (Task 4.3):
  // persistEnrichmentResult reuses `c.id` verbatim when present, so fixing it
  // here means the image-capture step below can link a condition_records row
  // to the exact id that ends up stored, without persistEnrichmentResult
  // having to return per-condition ids itself. Inferred conditions never
  // originate from a chunk, so they're never image-linked and don't need this.
  const llmConditionsWithIds = hydratedConditions.map((c) => ({ ...c, id: c.id ?? uuid() }))
  const allConditions = [...llmConditionsWithIds, ...inferredConditions]
  trace('inference-completed', { llmConditions: llmConditions.length, inferredConditions: inferredConditions.length })

  // Step 5 — persist through the shared IndexedDB write path (Task 2.15): the
  // same persistEnrichmentResult function seedIndexedDbDemoData uses, so demo
  // and real uploads share one persistence codepath from here on (userDataReq.md
  // §2a). Record-scoped providers and condition-specific care events are
  // persisted by `persistEnrichmentResult`. Providers must only ever be surfaced
  // when a condition carries direct evidence — never attach every provider
  // found elsewhere in the record, which would create false clinical
  // attribution for otherwise unrelated care (local contact info is already
  // merged into `providers` above).
  report(3, 0.9)
  const result = await persistEnrichmentResult(idb, {
    filename: filenameFromUri(uri),
    pageCount,
    extractionMethod,
    conditions: allConditions,
    measurements,
    providers,
  })
  trace('persistence-completed', {
    recordId: result.recordId,
    conditions: result.conditionCount,
    measurements: result.measurementCount,
    durationMs: Date.now() - pipelineStartedAt,
  })

  // Step 6 — capture imageWorthy pages (Task 4.3). Runs after persistence so
  // condition_records can reference the same condition ids just written;
  // failures for individual pages are caught inside captureRecordImages and
  // never surface here — this step must never fail the overall record.
  if ((enrichment.imageSections && enrichment.imageSections.length > 0) || (imageOnlyPages && imageOnlyPages.length > 0)) {
    const conditionsWithKeys = llmConditionsWithIds.map((c) => ({ id: c.id as string, key: conditionKey(c) }))
    await captureRecordImages(
      idb, uri, result.recordId, filenameFromUri(uri), enrichment.imageSections, imageOnlyPages, conditionsWithKeys, trace,
    )
  }

  report(3, 1)
  trace('completed', { recordId: result.recordId, durationMs: Date.now() - pipelineStartedAt })

  return result
}
