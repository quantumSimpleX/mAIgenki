import { INDEXED_DB_NAME } from './indexedDb'
import { base64ToUint8Array, uint8ArrayToBase64 } from './blob'
import { loadProfile } from '../llm/profile'
import { makeKeyStore } from '../llm/keystore'

// `settings` (which includes the user's OpenRouter API key) is included on
// purpose — see CLAUDE.md/AGENTS.md Hard Constraints. A portable backup is
// meant to fully restore a user's working setup, key included; it's the
// user's own exported file, same trust boundary as any file they create.
// Do not add secret-filtering here.
export const INDEXED_DB_BACKUP_STORES = [
  'health_records',
  'conditions',
  'condition_locations',
  'record_images',
  'condition_records',
  'measurements',
  'providers',
  'condition_care_events',
  'settings',
] as const

export type IndexedDbBackup = {
  app: 'maigenki'
  formatVersion: 1
  database: string
  exportedAt: string
  stores: Record<string, unknown[]>
  // The active provider's credential, e.g. from LocalStorageKeyStore — lives
  // outside IndexedDB entirely, so it isn't captured by `stores` and must be
  // serialized separately for a restore to leave a fully working setup
  // (matching the `settings`/profile data, which already round-trips).
  providerKey?: { providerId: string; key: string } | null
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

export async function buildIndexedDbBackup(db: IDBDatabase): Promise<IndexedDbBackup> {
  const transaction = db.transaction([...INDEXED_DB_BACKUP_STORES], 'readonly')
  const stores: Record<string, unknown[]> = {}
  await Promise.all(INDEXED_DB_BACKUP_STORES.map(async (storeName) => {
    stores[storeName] = await requestToPromise(transaction.objectStore(storeName).getAll()) as unknown[]
  }))
  return {
    app: 'maigenki',
    formatVersion: 1,
    database: db.name || INDEXED_DB_NAME,
    exportedAt: new Date().toISOString(),
    stores,
  }
}

// Rejects a malformed/incomplete backup before any destructive work starts —
// every expected store must be present as an array (even if empty), and every
// row must be a plain object. Without this, a truncated or hand-edited backup
// file would still pass the envelope check, clear every live store, and then
// restore only whatever partial data it did contain, silently wiping the rest.
type BackupRow = Record<string, unknown>

function isRecord(value: unknown): value is BackupRow {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === 'string'
}

function isNullableNumber(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isFinite(value))
}

function isStringArray(value: unknown): boolean {
  return value === null || (Array.isArray(value) && value.every((item) => typeof item === 'string'))
}

function isBlob(value: unknown): boolean {
  // IndexedDB can return Blob objects from a different VM realm (notably in
  // fake-indexeddb/Jest), so `instanceof Blob` alone is not reliable.
  if (typeof Blob !== 'undefined' && value instanceof Blob) return true
  if (typeof value !== 'object' || value === null) return false
  if (Object.prototype.toString.call(value) === '[object Blob]') return true
  const candidate = value as { arrayBuffer?: unknown; type?: unknown; size?: unknown }
  return typeof candidate.type === 'string' && (
    typeof candidate.arrayBuffer === 'function' ||
    typeof candidate.size === 'number'
  )
}

function isImageBlobValue(value: unknown): boolean {
  return isBlob(value) || (typeof value === 'object' && value !== null)
}

function requireField(
  row: BackupRow,
  storeName: string,
  field: string,
  predicate: (value: unknown) => boolean,
): void {
  if (!Object.prototype.hasOwnProperty.call(row, field) || !predicate(row[field])) {
    throw new Error(`Invalid backup: store "${storeName}" has an invalid "${field}" field`)
  }
}

function optionalField(
  row: BackupRow,
  storeName: string,
  field: string,
  predicate: (value: unknown) => boolean,
): void {
  if (Object.prototype.hasOwnProperty.call(row, field) && !predicate(row[field])) {
    throw new Error(`Invalid backup: store "${storeName}" has an invalid "${field}" field`)
  }
}

function validateBackupStores(stores: unknown): asserts stores is Record<string, unknown[]> {
  if (typeof stores !== 'object' || stores === null || Array.isArray(stores)) {
    throw new Error('Invalid backup: "stores" is missing or not an object')
  }
  const record = stores as Record<string, unknown>
  for (const storeName of INDEXED_DB_BACKUP_STORES) {
    const rows = record[storeName]
    if (!Array.isArray(rows)) {
      throw new Error(`Invalid backup: store "${storeName}" is missing or not an array`)
    }
    if (rows.some((row) => !isRecord(row))) {
      throw new Error(`Invalid backup: store "${storeName}" contains a malformed row`)
    }
  }

  const rows = (storeName: string): BackupRow[] => record[storeName] as BackupRow[]
  const healthRecordIds = new Set<string>()
  const conditionIds = new Set<string>()
  const imageIds = new Set<string>()

  for (const row of rows('health_records')) {
    requireField(row, 'health_records', 'id', (value) => typeof value === 'string')
    requireField(row, 'health_records', 'filename', (value) => typeof value === 'string')
    requireField(row, 'health_records', 'record_type', isNullableString)
    optionalField(row, 'health_records', 'page_count', isNullableNumber)
    optionalField(row, 'health_records', 'extraction_method', isNullableString)
    healthRecordIds.add(row.id as string)
  }

  for (const row of rows('conditions')) {
    requireField(row, 'conditions', 'id', (value) => typeof value === 'string')
    requireField(row, 'conditions', 'record_id', (value) => value === null || (typeof value === 'string' && healthRecordIds.has(value)))
    requireField(row, 'conditions', 'name_medical', (value) => typeof value === 'string')
    requireField(row, 'conditions', 'name_common', isNullableString)
    requireField(row, 'conditions', 'system', (value) => typeof value === 'string')
    requireField(row, 'conditions', 'organ', isNullableString)
    requireField(row, 'conditions', 'anatomical_location', isNullableString)
    requireField(row, 'conditions', 'status', (value) => value === 'documented' || value === 'resolved' || value === 'suspected' || value === 'inferred')
    requireField(row, 'conditions', 'severity', isNullableString)
    requireField(row, 'conditions', 'certainty', isNullableString)
    requireField(row, 'conditions', 'cx', (value) => typeof value === 'number' && Number.isFinite(value))
    requireField(row, 'conditions', 'cy', (value) => typeof value === 'number' && Number.isFinite(value))
    requireField(row, 'conditions', 'year_frac', (value) => typeof value === 'number' && Number.isFinite(value))
    requireField(row, 'conditions', 'date', isNullableString)
    requireField(row, 'conditions', 'date_onset', isNullableString)
    requireField(row, 'conditions', 'date_diagnosed', isNullableString)
    requireField(row, 'conditions', 'note', isNullableString)
    requireField(row, 'conditions', 'evidence', isNullableString)
    requireField(row, 'conditions', 'local_names', (value) => value === null || isRecord(value))
    requireField(row, 'conditions', 'inferred_fields', isStringArray)
    conditionIds.add(row.id as string)
  }

  for (const row of rows('condition_locations')) {
    requireField(row, 'condition_locations', 'id', (value) => typeof value === 'string')
    requireField(row, 'condition_locations', 'condition_id', (value) => typeof value === 'string' && conditionIds.has(value))
    requireField(row, 'condition_locations', 'cx', (value) => typeof value === 'number' && Number.isFinite(value))
    requireField(row, 'condition_locations', 'cy', (value) => typeof value === 'number' && Number.isFinite(value))
    requireField(row, 'condition_locations', 'is_primary', (value) => typeof value === 'boolean')
    optionalField(row, 'condition_locations', 'anatomical_location', isNullableString)
    optionalField(row, 'condition_locations', 'laterality', isNullableString)
    optionalField(row, 'condition_locations', 'evidence', isNullableString)
  }

  for (const row of rows('record_images')) {
    requireField(row, 'record_images', 'id', (value) => typeof value === 'string')
    requireField(row, 'record_images', 'record_id', (value) => typeof value === 'string')
    requireField(row, 'record_images', 'page_number', isNullableNumber)
    requireField(row, 'record_images', 'source_file', isNullableString)
    requireField(row, 'record_images', 'title', isNullableString)
    requireField(row, 'record_images', 'mime_type', (value) => typeof value === 'string')
    requireField(row, 'record_images', 'width', isNullableNumber)
    requireField(row, 'record_images', 'height', isNullableNumber)
    requireField(row, 'record_images', 'byte_size', isNullableNumber)
    requireField(row, 'record_images', 'image_blob', isImageBlobValue)
    requireField(row, 'record_images', 'thumbnail_blob', (value) => value === null || isImageBlobValue(value))
    requireField(row, 'record_images', 'date', isNullableString)
    requireField(row, 'record_images', 'notes', isNullableString)
    requireField(row, 'record_images', 'created_at', (value) => typeof value === 'string')
    imageIds.add(row.id as string)
  }

  for (const row of rows('condition_records')) {
    requireField(row, 'condition_records', 'id', (value) => typeof value === 'string')
    requireField(row, 'condition_records', 'condition_id', (value) => typeof value === 'string' && conditionIds.has(value))
    requireField(row, 'condition_records', 'record_type', (value) => typeof value === 'string')
    requireField(row, 'condition_records', 'title', isNullableString)
    requireField(row, 'condition_records', 'image_id', (value) => value === null || (typeof value === 'string' && imageIds.has(value)))
    requireField(row, 'condition_records', 'chart_json', isNullableString)
    requireField(row, 'condition_records', 'table_json', isNullableString)
    requireField(row, 'condition_records', 'color', isNullableString)
    requireField(row, 'condition_records', 'date', isNullableString)
    requireField(row, 'condition_records', 'source_file', isNullableString)
    requireField(row, 'condition_records', 'notes', isNullableString)
    requireField(row, 'condition_records', 'created_at', (value) => typeof value === 'string')
  }

  for (const row of rows('measurements')) {
    requireField(row, 'measurements', 'id', (value) => typeof value === 'string')
    requireField(row, 'measurements', 'record_id', (value) => value === null || typeof value === 'string')
    requireField(row, 'measurements', 'name', (value) => typeof value === 'string')
    requireField(row, 'measurements', 'value_numeric', isNullableNumber)
    requireField(row, 'measurements', 'unit', isNullableString)
    requireField(row, 'measurements', 'date', (value) => typeof value === 'string')
    requireField(row, 'measurements', 'inferred_fields', isStringArray)
  }

  for (const row of rows('providers')) {
    requireField(row, 'providers', 'id', (value) => typeof value === 'string')
    requireField(row, 'providers', 'record_id', (value) => typeof value === 'string')
    optionalField(row, 'providers', 'condition_id', (value) => value === null || (typeof value === 'string' && conditionIds.has(value)))
    requireField(row, 'providers', 'name', (value) => typeof value === 'string')
    requireField(row, 'providers', 'specialty', isNullableString)
    requireField(row, 'providers', 'email', isNullableString)
    requireField(row, 'providers', 'phone', isNullableString)
    requireField(row, 'providers', 'evidence', isNullableString)
  }

  for (const row of rows('condition_care_events')) {
    requireField(row, 'condition_care_events', 'id', (value) => typeof value === 'string')
    requireField(row, 'condition_care_events', 'condition_id', (value) => typeof value === 'string' && conditionIds.has(value))
    requireField(row, 'condition_care_events', 'event_type', (value) => value === 'diagnosed' || value === 'revisited' || value === 'treated' || value === 'monitored' || value === 'referred' || value === 'other')
    requireField(row, 'condition_care_events', 'date', (value) => typeof value === 'string')
    requireField(row, 'condition_care_events', 'provider_name', (value) => typeof value === 'string')
    requireField(row, 'condition_care_events', 'provider_specialty', isNullableString)
    requireField(row, 'condition_care_events', 'provider_email', isNullableString)
    requireField(row, 'condition_care_events', 'provider_phone', isNullableString)
    requireField(row, 'condition_care_events', 'provider_evidence', isNullableString)
    requireField(row, 'condition_care_events', 'facility_name', isNullableString)
    requireField(row, 'condition_care_events', 'facility_address', isNullableString)
    requireField(row, 'condition_care_events', 'facility_city', isNullableString)
    requireField(row, 'condition_care_events', 'facility_state', isNullableString)
    requireField(row, 'condition_care_events', 'facility_country', isNullableString)
    requireField(row, 'condition_care_events', 'evidence', isNullableString)
  }

  for (const row of rows('settings')) {
    requireField(row, 'settings', 'key', (value) => typeof value === 'string')
    requireField(row, 'settings', 'value', (value) => typeof value === 'string')
  }
}

export async function restoreIndexedDbBackup(db: IDBDatabase, backup: IndexedDbBackup): Promise<void> {
  if (backup.app !== 'maigenki') throw new Error(`Not a mAIgenki IndexedDB backup (app="${String(backup.app)}")`)
  if (backup.formatVersion !== 1) throw new Error(`Unsupported IndexedDB backup formatVersion: ${String(backup.formatVersion)}`)
  validateBackupStores(backup.stores)
  const transaction = db.transaction([...INDEXED_DB_BACKUP_STORES], 'readwrite')
  for (const storeName of [...INDEXED_DB_BACKUP_STORES].reverse()) transaction.objectStore(storeName).clear()
  for (const storeName of INDEXED_DB_BACKUP_STORES) {
    const rows = backup.stores[storeName] ?? []
    const store = transaction.objectStore(storeName)
    for (const row of rows) store.put(row)
  }
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB restore failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB restore aborted'))
  })
}

// Stores whose records hold Blob fields — IndexedDB-to-IndexedDB round trips
// (buildIndexedDbBackup/restoreIndexedDbBackup above) move Blobs natively via
// structured clone, but a user-facing JSON file export needs each Blob
// explicitly base64-encoded (JSON has no binary type).
export const BLOB_FIELDS: Record<string, string[]> = {
  record_images: ['image_blob', 'thumbnail_blob'],
}

type EncodedBlob = { __blob: true; data: string; mimeType: string }

function isEncodedBlob(value: unknown): value is EncodedBlob {
  return typeof value === 'object' && value !== null && (value as { __blob?: unknown }).__blob === true
}

async function encodeBlobFields(rows: unknown[], fields: string[]): Promise<unknown[]> {
  return Promise.all(rows.map(async (row) => {
    const record = { ...(row as Record<string, unknown>) }
    for (const field of fields) {
      const value = record[field]
      if (value instanceof Blob) {
        const bytes = new Uint8Array(await value.arrayBuffer())
        record[field] = { __blob: true, data: uint8ArrayToBase64(bytes), mimeType: value.type } satisfies EncodedBlob
      }
    }
    return record
  }))
}

function decodeBlobFields(rows: unknown[], fields: string[]): unknown[] {
  return rows.map((row) => {
    const record = { ...(row as Record<string, unknown>) }
    for (const field of fields) {
      const value = record[field]
      if (isEncodedBlob(value)) {
        const bytes = base64ToUint8Array(value.data)
        record[field] = new Blob([bytes.buffer as ArrayBuffer], { type: value.mimeType })
      }
    }
    return record
  })
}

// Builds a portable JSON string of the whole database, with every Blob field
// (per BLOB_FIELDS) base64-encoded so the result survives JSON.stringify and
// a round trip through a downloaded file.
export async function exportIndexedDbBackupToJson(db: IDBDatabase): Promise<string> {
  const backup = await buildIndexedDbBackup(db)
  const stores = { ...backup.stores }
  for (const [storeName, fields] of Object.entries(BLOB_FIELDS)) {
    if (stores[storeName]) stores[storeName] = await encodeBlobFields(stores[storeName], fields)
  }

  let providerKey: IndexedDbBackup['providerKey'] = null
  const profile = await loadProfile(db)
  if (profile.activeProviderId) {
    const keyStore = await makeKeyStore()
    const key = await keyStore.get(profile.activeProviderId)
    if (key) providerKey = { providerId: profile.activeProviderId, key }
  }

  return JSON.stringify({ ...backup, stores, providerKey })
}

// Reverses exportIndexedDbBackupToJson's Blob encoding and restores the result
// into `db` via restoreIndexedDbBackup (which validates the envelope), then
// restores the active provider credential (if any) into the live KeyStore.
export async function importIndexedDbBackupFromJson(db: IDBDatabase, json: string): Promise<void> {
  const parsed = JSON.parse(json) as IndexedDbBackup
  const stores = { ...parsed.stores }
  for (const [storeName, fields] of Object.entries(BLOB_FIELDS)) {
    if (stores[storeName]) stores[storeName] = decodeBlobFields(stores[storeName], fields)
  }
  await restoreIndexedDbBackup(db, { ...parsed, stores })

  if (parsed.providerKey) {
    const keyStore = await makeKeyStore()
    await keyStore.set(parsed.providerKey.providerId, parsed.providerKey.key)
  }
}
