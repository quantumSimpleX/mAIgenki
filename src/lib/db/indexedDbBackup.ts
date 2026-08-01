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
    if (rows.some((row) => typeof row !== 'object' || row === null || Array.isArray(row))) {
      throw new Error(`Invalid backup: store "${storeName}" contains a malformed row`)
    }
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
