import type { SQLiteDatabase } from 'expo-sqlite'
import { extractTextFromPDF } from './pdf/extract'
import { extractTextFromImage } from './ocr/extract'
import { enrichFromText } from './llm/enrich'
import { applyInferenceRules } from './inference/rules'
import { getModelChain } from './llm/client'
import type { LLMTraceEvent } from './llm/client'
import { loadProfile } from './llm/profile'
import { makeKeyStore } from './llm/keystore'
import {
  insertHealthRecord, insertCondition, insertMeasurement, findOrCreateFacility,
  findOrCreateProvider, insertProviderAffiliation, insertConditionProvider,
  insertConditionCareEvent, getSetting,
} from './db/queries'
import { scheduleSnapshot } from './db/snapshot'
import { redactPII, extractProviderContacts } from './privacy/redact'

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

function normalizedName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
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

// ── Pipeline ──────────────────────────────────────────────────────────────────

export async function processHealthRecord(opts: PipelineOptions): Promise<PipelineResult> {
  const { uri, db, sex, kind, onProgress } = opts
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

  // Step 2 — redact PII before any text leaves the device
  report(1, 0.4)
  const safeText = redactPII(text)
  const localProviderContacts = extractProviderContacts(text)
  trace('redaction-completed', {
    originalCharacters: text.length,
    redactedCharacters: safeText.length,
    changed: text !== safeText,
    localProviderContacts: localProviderContacts.length,
  })

  // Step 3 — get model chain + API key, enrich with LLM
  const models = opts.models ?? await getModelChain(db)
  const apiKey = opts.apiKey ?? (await getSetting(db, 'openrouter_api_key')) ?? ''
  // Explicit pipeline API keys are used by callers/tests that intentionally
  // bypass the persisted profile. The app upload flow leaves this unset and
  // therefore uses the saved provider profile below.
  const profile = opts.apiKey ? null : await loadProfile(db)
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
      db,
      profile,
      keys: await makeKeyStore(),
      timeoutMs: profile.activeProviderId === 'gemini' ? 180_000 : undefined,
      onTrace: traceLlm,
    }, (completed, total) => {
      trace('condition-enrichment-progress', { completed, total })
      report(1, 0.4 + (total > 0 ? 0.35 * completed / total : 0.35))
    })
    : profile
      ? await enrichFromText(safeText, apiKey, models, {
        db,
        profile,
        onTrace: traceLlm,
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
  const providers = llmProviders.map((provider, index) => {
    const providerName = String(provider.name ?? '').trim()
    const normalizedProviderName = normalizedName(providerName)
    const local = contactForProvider(providerName, index, localProviderContacts)
    return {
      ...provider,
      name: providerName,
      email: provider.email ?? local?.email ?? null,
      phone: provider.phone ?? local?.phone ?? null,
      evidence: provider.evidence ?? local?.evidence ?? null,
    }
  })

  // Step 4 — apply threshold inference rules
  report(2, 0.75)
  const inferredConditions = applyInferenceRules(measurements, llmConditions, sex)
  const allConditions = [...llmConditions, ...inferredConditions]
  trace('inference-completed', { llmConditions: llmConditions.length, inferredConditions: inferredConditions.length })

  // Step 5 — persist health record
  report(3, 0.9)
  const recordId = await insertHealthRecord(db, {
    filename: filenameFromUri(uri),
    pageCount,
    extractionMethod,
  })
  trace('health-record-persisted', { recordId, extractionMethod, pageCount })

  // Step 6 — persist conditions
  for (const c of allConditions) {
    const conditionId = await insertCondition(db, {
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
    const conditionProviders = c.provider
      ? [{
        ...c.provider,
        email: c.provider.email ?? contactForProvider(c.provider.name, 0, localProviderContacts)?.email ?? null,
        phone: c.provider.phone ?? contactForProvider(c.provider.name, 0, localProviderContacts)?.phone ?? null,
        evidence: c.provider.evidence ?? contactForProvider(c.provider.name, 0, localProviderContacts)?.evidence ?? null,
      }]
      : providers
    const careEvents = c.care_events ?? []
    for (const event of careEvents) {
      if (!event.date || !event.provider?.name) continue
      const localContact = contactForProvider(event.provider.name, 0, localProviderContacts)
      const providerEvidence = event.evidence ?? event.provider.evidence ?? localContact?.evidence ?? null
      const facilityId = event.facility?.name
        ? await findOrCreateFacility(db, {
          name: event.facility.name,
          address: event.facility.address,
          city: event.facility.city,
          state: event.facility.state,
          country: event.facility.country,
        })
        : null
      const providerId = await findOrCreateProvider(db, {
        name: event.provider.name,
        specialty: event.provider.specialty,
        email: event.provider.email ?? localContact?.email ?? null,
        phone: event.provider.phone ?? localContact?.phone ?? null,
        primaryFacilityId: facilityId,
      })
      if (facilityId) {
        await insertProviderAffiliation(db, {
          providerId,
          facilityId,
          role: event.event_type,
          evidence: providerEvidence,
        })
      }
      await insertConditionCareEvent(db, {
        conditionId,
        providerId,
        facilityId,
        eventType: event.event_type,
        eventDate: event.date,
        evidence: providerEvidence,
      })
    }
    for (const provider of conditionProviders) {
      if (!provider.name) continue
      const providerId = await findOrCreateProvider(db, {
        name: provider.name,
        specialty: provider.specialty,
        email: provider.email,
        phone: provider.phone,
      })
      await insertConditionProvider(db, {
        conditionId,
        providerId,
        role: 'source',
      })
    }
  }

  // Step 7 — persist measurements
  for (const m of measurements) {
    await insertMeasurement(db, {
      recordId,
      name: m.name,
      valueNumeric: m.value_numeric,
      unit: m.unit,
      date: m.date ?? today(),
    })
  }

  trace('persistence-completed', {
    recordId,
    conditions: allConditions.length,
    measurements: measurements.length,
    durationMs: Date.now() - pipelineStartedAt,
  })

  scheduleSnapshot(db)
  report(3, 1)
  trace('completed', { recordId, durationMs: Date.now() - pipelineStartedAt })

  return {
    recordId,
    conditionCount: allConditions.length,
    measurementCount: measurements.length,
  }
}
