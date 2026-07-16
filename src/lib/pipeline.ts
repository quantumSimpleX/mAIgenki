import type { SQLiteDatabase } from 'expo-sqlite'
import { extractTextFromPDF } from './pdf/extract'
import { extractTextFromImage } from './ocr/extract'
import { enrichFromText } from './llm/enrich'
import { applyInferenceRules } from './inference/rules'
import { getModelChain } from './llm/client'
import { loadProfile } from './llm/profile'
import { makeKeyStore } from './llm/keystore'
import { insertHealthRecord, insertCondition, insertMeasurement, findOrCreateProvider, insertConditionProvider, getSetting } from './db/queries'
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
  const localProviderContacts = extractProviderContacts(text)

  // Step 3 — get model chain + API key, enrich with LLM
  const models = opts.models ?? await getModelChain(db)
  const apiKey = opts.apiKey ?? (await getSetting(db, 'openrouter_api_key')) ?? ''
  // Explicit pipeline API keys are used by callers/tests that intentionally
  // bypass the persisted profile. The app upload flow leaves this unset and
  // therefore uses the saved provider profile below.
  const profile = opts.apiKey ? null : await loadProfile(db)
  const enrichment = profile && profile.tier > 0 && profile.activeProviderId && profile.model
    ? await enrichFromText(safeText, apiKey, models, {
      db,
      profile,
      keys: await makeKeyStore(),
      timeoutMs: profile.activeProviderId === 'gemini' ? 180_000 : undefined,
    }, (completed, total) => report(1, 0.4 + (total > 0 ? 0.35 * completed / total : 0.35)))
    : await enrichFromText(safeText, apiKey, models)
  const { conditions: llmConditions, measurements, providers: llmProviders = [] } = enrichment
  const providers = llmProviders.map((provider, index) => {
    const providerName = String(provider.name ?? '').trim()
    const normalizedProviderName = normalizedName(providerName)
    const local = contactForProvider(providerName, index, localProviderContacts)
    return {
      ...provider,
      name: providerName,
      email: provider.email ?? local?.email ?? null,
      phone: provider.phone ?? local?.phone ?? null,
    }
  })

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
      }]
      : providers
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
