import {
  CONDITIONS, CONDITION_RECORDS, defaultConditionPosition, normalizeSystemId, parseDateFrac,
  type DesignCondition, type SupportedLang,
} from '@/model/conditions'
import { applyInferenceRules } from '@/lib/inference/rules'
import type { ConditionInput, MeasurementInput, ProviderInput } from '@/lib/llm/enrich'

/** Browser-only persistence adapter for the web architecture. */
export const INDEXED_DB_NAME = 'maigenki'
// v2 adds the `measurements` store and the `record_images.record_id` index —
// bumped so onupgradeneeded re-fires for databases already created at v1.
// v3 adds the `providers` store, so structured provider data from real
// uploads (previously discarded) is retained.
export const INDEXED_DB_VERSION = 3

export const DEMO_RECORD_ID = 'demo-record'
const DEMO_IMAGE_ID = 'demo-image-stones-kub'

export type IndexedHealthRecord = {
  id: string
  filename: string
  record_type: string | null
  page_count?: number | null
  extraction_method?: string | null
}

export type IndexedCondition = {
  id: string
  record_id: string | null
  name_medical: string
  name_common: string | null
  system: string
  status: ConditionInput['status']
  cx: number
  cy: number
  year_frac: number
  date: string | null
  note: string | null
  evidence: string | null
  local_names: Partial<Record<SupportedLang, string>> | null
  inferred_fields: string[] | null
}

// putIndexedCondition accepts cx/cy as optional so callers that don't already
// know a position can let it compute one (Task 2.7) — the stored/returned
// shape always has concrete numbers.
export type PutIndexedConditionInput = Omit<IndexedCondition, 'cx' | 'cy'> & { cx?: number; cy?: number }

export type IndexedConditionLocation = {
  id: string
  condition_id: string
  cx: number
  cy: number
  is_primary: boolean
  anatomical_location?: string | null
  laterality?: string | null
  evidence?: string | null
}

export type IndexedConditionDot = {
  conditionId: string
  system: string
  cx_percent: number
  cy_percent: number
  yearFrac: number
  status: ConditionInput['status']
}

export type RecordImage = {
  id: string
  record_id: string
  page_number: number | null
  source_file: string | null
  title: string | null
  mime_type: string
  width: number | null
  height: number | null
  byte_size: number | null
  image_blob: Blob
  thumbnail_blob: Blob | null
  date: string | null
  notes: string | null
  created_at: string
}

export type ConditionRecordEntry = {
  id: string
  condition_id: string
  record_type: string
  title: string | null
  image_id: string | null
  chart_json: string | null
  table_json: string | null
  color: string | null
  date: string | null
  source_file: string | null
  notes: string | null
  created_at: string
}

export type IndexedMeasurement = {
  id: string
  record_id: string | null
  name: string
  value_numeric: number | null
  unit: string | null
  date: string
  inferred_fields: string[] | null
}

export type IndexedProvider = {
  id: string
  record_id: string
  name: string
  specialty: string | null
  email: string | null
  phone: string | null
  evidence: string | null
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
  })
}

export async function openIndexedDb(name = INDEXED_DB_NAME): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is unavailable in this runtime')
  const request = indexedDB.open(name, INDEXED_DB_VERSION)
  request.onupgradeneeded = () => {
    const database = request.result
    const stores: [string, IDBObjectStoreParameters][] = [
      ['health_records', { keyPath: 'id' }],
      ['conditions', { keyPath: 'id' }],
      ['condition_locations', { keyPath: 'id' }],
      ['record_images', { keyPath: 'id' }],
      ['condition_records', { keyPath: 'id' }],
      ['measurements', { keyPath: 'id' }],
      ['providers', { keyPath: 'id' }],
      ['settings', { keyPath: 'key' }],
    ]
    for (const [storeName, options] of stores) {
      if (!database.objectStoreNames.contains(storeName)) database.createObjectStore(storeName, options)
    }
    const locations = request.transaction?.objectStore('condition_locations')
    if (locations && !locations.indexNames.contains('condition_id')) locations.createIndex('condition_id', 'condition_id')
    const conditionRecords = request.transaction?.objectStore('condition_records')
    if (conditionRecords && !conditionRecords.indexNames.contains('condition_id')) conditionRecords.createIndex('condition_id', 'condition_id')
    const images = request.transaction?.objectStore('record_images')
    if (images && !images.indexNames.contains('record_id')) images.createIndex('record_id', 'record_id')
    const measurements = request.transaction?.objectStore('measurements')
    if (measurements && !measurements.indexNames.contains('record_id')) measurements.createIndex('record_id', 'record_id')
    const providers = request.transaction?.objectStore('providers')
    if (providers && !providers.indexNames.contains('record_id')) providers.createIndex('record_id', 'record_id')
  }
  return requestToPromise(request)
}

// Computes a position when the caller doesn't already have one (e.g. a fresh
// LLM-extracted condition), so callers can seed the matching `is_primary`
// condition_locations record without recomputing it themselves (Task 2.7).
export async function putIndexedCondition(
  db: IDBDatabase,
  input: PutIndexedConditionInput,
): Promise<{ id: string; cx: number; cy: number }> {
  const system = normalizeSystemId(input.system)
  const pos = defaultConditionPosition(system, `${input.name_medical}:${input.system}`)
  const cx = input.cx ?? pos.cx
  const cy = input.cy ?? pos.cy
  const condition: IndexedCondition = { ...input, cx, cy }
  const transaction = db.transaction('conditions', 'readwrite')
  transaction.objectStore('conditions').put(condition)
  await transactionToPromise(transaction)
  return { id: input.id, cx, cy }
}

export async function putIndexedConditionLocation(db: IDBDatabase, location: IndexedConditionLocation): Promise<void> {
  const transaction = db.transaction('condition_locations', 'readwrite')
  transaction.objectStore('condition_locations').put(location)
  await transactionToPromise(transaction)
}

export async function getConditionLocations(db: IDBDatabase, conditionId: string): Promise<IndexedConditionLocation[]> {
  const transaction = db.transaction('condition_locations', 'readonly')
  const rows = await requestToPromise(
    transaction.objectStore('condition_locations').index('condition_id').getAll(conditionId),
  ) as IndexedConditionLocation[]
  await transactionToPromise(transaction)
  return rows
}

export async function putRecordImage(db: IDBDatabase, image: RecordImage): Promise<void> {
  const transaction = db.transaction('record_images', 'readwrite')
  transaction.objectStore('record_images').put(image)
  await transactionToPromise(transaction)
}

export async function getRecordImageThumbnail(db: IDBDatabase, imageId: string): Promise<Blob | null> {
  const transaction = db.transaction('record_images', 'readonly')
  const row = await requestToPromise(transaction.objectStore('record_images').get(imageId)) as RecordImage | undefined
  await transactionToPromise(transaction)
  return row?.thumbnail_blob ?? row?.image_blob ?? null
}

export async function getRecordImageBlob(db: IDBDatabase, imageId: string): Promise<{ blob: Blob; mimeType: string } | null> {
  const transaction = db.transaction('record_images', 'readonly')
  const row = await requestToPromise(transaction.objectStore('record_images').get(imageId)) as RecordImage | undefined
  await transactionToPromise(transaction)
  return row ? { blob: row.image_blob, mimeType: row.mime_type } : null
}

export async function getConditionRecords(db: IDBDatabase, conditionId: string): Promise<ConditionRecordEntry[]> {
  const transaction = db.transaction('condition_records', 'readonly')
  const rows = await requestToPromise(
    transaction.objectStore('condition_records').index('condition_id').getAll(conditionId),
  ) as ConditionRecordEntry[]
  await transactionToPromise(transaction)
  return rows
}

export async function putConditionRecord(db: IDBDatabase, entry: ConditionRecordEntry): Promise<void> {
  const transaction = db.transaction('condition_records', 'readwrite')
  transaction.objectStore('condition_records').put(entry)
  await transactionToPromise(transaction)
}

export async function deleteConditionLocation(db: IDBDatabase, locationId: string): Promise<void> {
  const transaction = db.transaction('condition_locations', 'readwrite')
  transaction.objectStore('condition_locations').delete(locationId)
  await transactionToPromise(transaction)
}

export type PutIndexedHealthRecordInput = {
  id?: string
  filename: string
  record_type?: string | null
  page_count?: number | null
  extraction_method?: string | null
}

export async function putIndexedHealthRecord(db: IDBDatabase, input: PutIndexedHealthRecordInput): Promise<string> {
  const id = input.id ?? uuid()
  const record: IndexedHealthRecord = {
    id,
    filename: input.filename,
    record_type: input.record_type ?? null,
    page_count: input.page_count ?? null,
    extraction_method: input.extraction_method ?? null,
  }
  const transaction = db.transaction('health_records', 'readwrite')
  transaction.objectStore('health_records').put(record)
  await transactionToPromise(transaction)
  return id
}

export async function putIndexedMeasurement(db: IDBDatabase, measurement: IndexedMeasurement): Promise<void> {
  const transaction = db.transaction('measurements', 'readwrite')
  transaction.objectStore('measurements').put(measurement)
  await transactionToPromise(transaction)
}

export async function putIndexedProvider(db: IDBDatabase, provider: IndexedProvider): Promise<void> {
  const transaction = db.transaction('providers', 'readwrite')
  transaction.objectStore('providers').put(provider)
  await transactionToPromise(transaction)
}

export async function getProvidersForRecord(db: IDBDatabase, recordId: string): Promise<IndexedProvider[]> {
  const transaction = db.transaction('providers', 'readonly')
  const rows = await requestToPromise(
    transaction.objectStore('providers').index('record_id').getAll(recordId),
  ) as IndexedProvider[]
  await transactionToPromise(transaction)
  return rows
}

// Updates a condition's own position and its primary condition_locations
// record together, so getIndexedConditionDots (which prefers stored locations
// over the condition's own cx/cy once any location exists) reflects the move.
// Non-primary locations (e.g. a bilateral condition's second dot) are left
// untouched — relocating those is out of scope (see userDataTask.md Task 5.3).
export async function updateIndexedConditionPosition(
  db: IDBDatabase, conditionId: string, cx: number, cy: number,
): Promise<void> {
  const transaction = db.transaction(['conditions', 'condition_locations'], 'readwrite')
  const conditions = transaction.objectStore('conditions')
  const locations = transaction.objectStore('condition_locations')
  const condition = await requestToPromise(conditions.get(conditionId)) as IndexedCondition | undefined
  if (condition) conditions.put({ ...condition, cx, cy })
  const existingLocations = await requestToPromise(
    locations.index('condition_id').getAll(conditionId),
  ) as IndexedConditionLocation[]
  const primary = existingLocations.find((l) => l.is_primary) ?? existingLocations[0]
  if (primary) {
    locations.put({ ...primary, cx, cy })
  } else {
    locations.put({ id: `${conditionId}-primary`, condition_id: conditionId, cx, cy, is_primary: true })
  }
  await transactionToPromise(transaction)
}

// ── Generic settings KV (Task 2.13 support) ────────────────────────────────────
// Backs app-level settings that don't belong to the SQLite-backed LMF provider
// profile/model-chain (src/lib/llm/profile.ts) — that subsystem is out of
// Phase 2's scope and remains on its existing storage.

export async function getIndexedSetting(db: IDBDatabase, key: string): Promise<string | null> {
  const transaction = db.transaction('settings', 'readonly')
  const row = await requestToPromise(transaction.objectStore('settings').get(key)) as { key: string; value: string } | undefined
  await transactionToPromise(transaction)
  return row?.value ?? null
}

export async function putIndexedSetting(db: IDBDatabase, key: string, value: string): Promise<void> {
  const transaction = db.transaction('settings', 'readwrite')
  transaction.objectStore('settings').put({ key, value })
  await transactionToPromise(transaction)
}

export async function deleteIndexedSetting(db: IDBDatabase, key: string): Promise<void> {
  const transaction = db.transaction('settings', 'readwrite')
  transaction.objectStore('settings').delete(key)
  await transactionToPromise(transaction)
}

// ── Shared persistence path (Task 2.15) ─────────────────────────────────────────
// Single write path for both real uploads (pipeline.ts, via full
// extraction→enrichment) and demo seeding (seedIndexedDbDemoData, below) — per
// userDataReq.md §2a, everything from inference rules onward must be identical
// for demo and real data, not just similar.
//
// Known gap: IndexedDB has no facilities/condition_care_events stores yet
// (Phase 2's task list never defines them), so only the flat `providers` list
// (name/specialty/contact/evidence, record-scoped) is persisted — facility and
// per-condition care-event detail is still discarded, tracked as a follow-up.
export type EnrichedInput = {
  filename: string
  pageCount: number | null
  extractionMethod: string | null
  conditions: ConditionInput[]
  measurements: MeasurementInput[]
  providers?: ProviderInput[]
  recordId?: string
  recordType?: string | null
}

export type PersistEnrichmentResult = { recordId: string; conditionCount: number; measurementCount: number }

export async function persistEnrichmentResult(db: IDBDatabase, input: EnrichedInput): Promise<PersistEnrichmentResult> {
  const recordId = await putIndexedHealthRecord(db, {
    id: input.recordId,
    filename: input.filename,
    record_type: input.recordType ?? null,
    page_count: input.pageCount,
    extraction_method: input.extractionMethod,
  })

  for (const c of input.conditions) {
    const dateForTimeline = c.date_diagnosed ?? c.date_onset
    const { id: conditionId, cx, cy } = await putIndexedCondition(db, {
      id: c.id ?? uuid(),
      record_id: recordId,
      name_medical: c.name_medical,
      name_common: c.name_common,
      system: c.system,
      status: c.status,
      cx: c.cx ?? undefined,
      cy: c.cy ?? undefined,
      year_frac: dateForTimeline ? parseDateFrac(dateForTimeline) : 0,
      date: dateForTimeline,
      note: c.notes ?? null,
      evidence: c.evidence,
      local_names: (c.local_names as Partial<Record<SupportedLang, string>> | null | undefined) ?? null,
      inferred_fields: c.inferred_from_structure && c.inferred_from_structure.length > 0 ? c.inferred_from_structure : null,
    })
    await putIndexedConditionLocation(db, {
      id: `${conditionId}-primary`, condition_id: conditionId, cx, cy, is_primary: true,
    })
    // Deterministic id (not uuid()) so re-seeding the same condition (e.g.
    // demo data reloaded) upserts each secondary location in place instead of
    // accumulating a fresh duplicate row per run.
    for (const [index, loc] of (c.locations ?? []).entries()) {
      const locationPosition = defaultConditionPosition(
        normalizeSystemId(c.system),
        `${c.name_medical}:${loc.anatomical_location ?? ''}:${loc.laterality ?? ''}:${index}`,
      )
      await putIndexedConditionLocation(db, {
        id: `${conditionId}-loc-${index}`, condition_id: conditionId,
        cx: loc.cx ?? locationPosition.cx, cy: loc.cy ?? locationPosition.cy, is_primary: false,
        anatomical_location: loc.anatomical_location ?? null,
        laterality: loc.laterality ?? null,
        evidence: loc.evidence ?? null,
      })
    }
  }

  for (const m of input.measurements) {
    await putIndexedMeasurement(db, {
      id: uuid(),
      record_id: recordId,
      name: m.name,
      value_numeric: m.value_numeric,
      unit: m.unit,
      date: m.date ?? new Date().toISOString().slice(0, 10),
      inferred_fields: m.inferred_from_structure && m.inferred_from_structure.length > 0 ? m.inferred_from_structure : null,
    })
  }

  for (const p of input.providers ?? []) {
    await putIndexedProvider(db, {
      id: uuid(),
      record_id: recordId,
      name: p.name,
      specialty: p.specialty,
      email: p.email,
      phone: p.phone,
      evidence: p.evidence,
    })
  }

  return { recordId, conditionCount: input.conditions.length, measurementCount: input.measurements.length }
}

// Maps a hardcoded demo DesignCondition (src/model/conditions.ts) onto the same
// ConditionInput shape real LLM extraction produces, so seedIndexedDbDemoData
// can run it through the identical persistEnrichmentResult path (Task 2.9).
export function designConditionToConditionInput(c: DesignCondition): ConditionInput {
  return {
    id: c.id,
    name_medical: c.medName,
    name_common: c.label,
    system: c.system,
    organ: null,
    anatomical_location: null,
    status: 'documented',
    severity: null,
    certainty: 'confirmed',
    date_onset: c.date,
    date_diagnosed: c.date,
    evidence: c.evidence,
    notes: c.note,
    local_names: c.localNames,
    cx: c.cx_percent,
    cy: c.cy_percent,
    locations: c.locations?.map((location) => ({
      cx: location.cx_percent,
      cy: location.cy_percent,
      anatomical_location: location.anatomical_location,
      laterality: location.laterality,
    })),
  }
}

type ConditionQueryMode = 'auto' | 'demo'

// Design-layer read: maps stored conditions onto the DesignCondition shape the
// body map renders. Mirrors queries.ts's SQLite getConditions() visibility
// rule — in auto mode, user-upload rows hide demo rows; in demo mode, only
// demo rows are shown.
export async function getIndexedConditions(db: IDBDatabase, mode: ConditionQueryMode = 'auto'): Promise<DesignCondition[]> {
  const transaction = db.transaction(['health_records', 'conditions'], 'readonly')
  const healthRecords = await requestToPromise(transaction.objectStore('health_records').getAll()) as IndexedHealthRecord[]
  const conditions = await requestToPromise(transaction.objectStore('conditions').getAll()) as IndexedCondition[]
  await transactionToPromise(transaction)
  const demoRecordIds = new Set(healthRecords.filter((r) => r.record_type === 'demo').map((r) => r.id))
  const hasUserRecords = healthRecords.some((r) => r.record_type !== 'demo')
  const visible = mode === 'demo'
    ? conditions.filter((c) => c.record_id && demoRecordIds.has(c.record_id))
    : hasUserRecords
      ? conditions.filter((c) => !c.record_id || !demoRecordIds.has(c.record_id))
      : conditions
  return visible
    .slice()
    .sort((a, b) => a.year_frac - b.year_frac)
    .map((c) => ({
      id: c.id,
      system: normalizeSystemId(c.system),
      label: c.name_common ?? c.name_medical,
      medName: c.name_medical,
      localNames: c.local_names ?? {},
      date: c.date ?? '',
      yearFrac: c.year_frac,
      cx_percent: c.cx,
      cy_percent: c.cy,
      note: c.note ?? '',
      evidence: c.evidence ?? '',
      status: c.status,
    }))
}

// Distinguishes an initialized user database with zero extracted conditions
// from a fresh database that should still show the design fallback.
export async function hasIndexedUserRecords(db: IDBDatabase): Promise<boolean> {
  const transaction = db.transaction('health_records', 'readonly')
  const records = await requestToPromise(transaction.objectStore('health_records').getAll()) as IndexedHealthRecord[]
  await transactionToPromise(transaction)
  return records.some((record) => record.record_type !== 'demo')
}

// mode mirrors getIndexedConditions's demo/user visibility rule — without it,
// demo hotspots kept rendering on the body map alongside a user's own
// uploaded conditions once real records existed.
export async function getIndexedConditionDots(db: IDBDatabase, mode: ConditionQueryMode = 'auto'): Promise<IndexedConditionDot[]> {
  const transaction = db.transaction(['health_records', 'conditions', 'condition_locations'], 'readonly')
  const healthRecords = await requestToPromise(transaction.objectStore('health_records').getAll()) as IndexedHealthRecord[]
  const allConditions = await requestToPromise(transaction.objectStore('conditions').getAll()) as IndexedCondition[]
  const locations = await requestToPromise(transaction.objectStore('condition_locations').getAll()) as IndexedConditionLocation[]
  await transactionToPromise(transaction)
  const demoRecordIds = new Set(healthRecords.filter((r) => r.record_type === 'demo').map((r) => r.id))
  const hasUserRecords = healthRecords.some((r) => r.record_type !== 'demo')
  const conditions = mode === 'demo'
    ? allConditions.filter((c) => c.record_id && demoRecordIds.has(c.record_id))
    : hasUserRecords
      ? allConditions.filter((c) => !c.record_id || !demoRecordIds.has(c.record_id))
      : allConditions
  const byCondition = new Map<string, IndexedConditionLocation[]>()
  for (const location of locations) byCondition.set(location.condition_id, [...(byCondition.get(location.condition_id) ?? []), location])
  return conditions.flatMap((condition) => {
    const conditionLocations = byCondition.get(condition.id) ?? []
    const points = conditionLocations.length > 0 ? conditionLocations : [{ cx: condition.cx, cy: condition.cy }]
    return points.map((point) => ({
      conditionId: condition.id, system: condition.system, cx_percent: point.cx, cy_percent: point.cy,
      yearFrac: condition.year_frac, status: condition.status,
    }))
  })
}

// Ports the full hardcoded demo dataset (all CONDITIONS + their
// CONDITION_RECORDS, per model/conditions.ts) into IndexedDB. `put()` is
// already an upsert on a fixed id, so this is safe to call idempotently on
// every demo load.
export async function seedIndexedDbDemoData(db: IDBDatabase): Promise<void> {
  // Per userDataReq.md §2a (Demo Data Principle): convert the hardcoded design
  // dataset into the same ConditionInput/MeasurementInput shapes real
  // extraction produces, run it through the identical inference-rules step,
  // then persist through persistEnrichmentResult — the same function real
  // uploads use. No parallel put() calls into conditions/condition_locations
  // here (Task 2.9).
  const conditionInputs: ConditionInput[] = CONDITIONS.map(designConditionToConditionInput)
  const inferredConditions = applyInferenceRules([], conditionInputs)

  await persistEnrichmentResult(db, {
    filename: 'Demo Patient — Sample Health History',
    pageCount: null,
    extractionMethod: null,
    conditions: [...conditionInputs, ...inferredConditions],
    measurements: [],
    recordId: DEMO_RECORD_ID,
    recordType: 'demo',
  })

  // Placeholder embedded image (a few PNG-signature bytes) so the demo path
  // exercises the real-image record UI (Task 5.5/5.6) rather than only
  // placeholder SVG art — through the same putRecordImage/condition_records
  // write path Task 4.3 will use for real uploads, not a demo-only shortcut.
  await putRecordImage(db, {
    id: DEMO_IMAGE_ID,
    record_id: DEMO_RECORD_ID,
    page_number: 1,
    source_file: 'demo-kub-xray.png',
    title: 'KUB X-ray',
    mime_type: 'image/png',
    width: 4,
    height: 1,
    byte_size: 4,
    image_blob: new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }),
    thumbnail_blob: null,
    date: '2021-SEP',
    notes: null,
    created_at: new Date().toISOString(),
  })

  for (const c of CONDITIONS) {
    for (const r of CONDITION_RECORDS[c.id] ?? []) {
      await putConditionRecord(db, {
        id: r.id,
        condition_id: c.id,
        record_type: r.type,
        title: r.label,
        image_id: r.id === 'r-stone-1' ? DEMO_IMAGE_ID : null,
        chart_json: null,
        table_json: null,
        color: r.color,
        date: r.date,
        source_file: null,
        notes: null,
        created_at: new Date().toISOString(),
      })
    }
  }

}
