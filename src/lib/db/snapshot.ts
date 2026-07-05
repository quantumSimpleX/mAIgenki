import { Platform } from 'react-native'
import type { SQLiteDatabase } from 'expo-sqlite'
import { buildBackup, type BackupFile } from './backup'

// Auto-snapshot of the whole DB into IndexedDB (web only). The payload IS a
// BackupFile — the same versioned envelope as a manual export — so restore reuses
// the tested restoreBackup path unchanged. IndexedDB is a separate storage
// subsystem from OPFS, so a wedged wa-sqlite access-handle pool cannot corrupt or
// block it. Every entry point no-ops off web (native SQLite is already durable).

const META_DB = 'maigenki-meta'
const STORE = 'snapshots'
const KEY = 'latest'
export const SNAPSHOT_DEBOUNCE_MS = 3000

type SnapshotEnvelope = { savedAt: string; backup: BackupFile }

function snapshotAvailable(): boolean {
  return Platform.OS === 'web' && typeof indexedDB !== 'undefined'
}

// ── Raw IndexedDB promise wrappers ─────────────────────────────────────────────

function openMetaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(META_DB, 1)
    req.onupgradeneeded = () => {
      const database = req.result
      if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function idbPut(database: IDBDatabase, value: SnapshotEnvelope): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

function idbGet(database: IDBDatabase): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(KEY)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function idbDelete(database: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

// ── Entry points ───────────────────────────────────────────────────────────────

// Serialise the whole DB and store it under `latest`. Never throws into callers:
// all failures are caught and logged without exposing snapshot contents.
export async function saveSnapshotNow(db: SQLiteDatabase): Promise<void> {
  if (!snapshotAvailable()) return
  try {
    const backup = await buildBackup(db)
    const database = await openMetaDb()
    try {
      await idbPut(database, { savedAt: new Date().toISOString(), backup })
    } finally {
      database.close()
    }
  } catch (e) {
    console.warn('[snapshot] save failed:', (e as Error).message)
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let pendingDb: SQLiteDatabase | null = null
let pagehideRegistered = false

// Register (once) a pagehide flush so quickly closing the tab still persists the
// last pending debounced snapshot best-effort.
function registerPagehideFlush(): void {
  if (pagehideRegistered) return
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return
  pagehideRegistered = true
  window.addEventListener('pagehide', () => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    const target = pendingDb
    pendingDb = null
    if (target) void saveSnapshotNow(target)
  })
}

// Debounced save: collapses rapid writes into a single snapshot after
// SNAPSHOT_DEBOUNCE_MS of quiescence. Each call resets the timer.
export function scheduleSnapshot(db: SQLiteDatabase): void {
  if (!snapshotAvailable()) return
  pendingDb = db
  if (debounceTimer !== null) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    const target = pendingDb
    pendingDb = null
    if (target) void saveSnapshotNow(target)
  }, SNAPSHOT_DEBOUNCE_MS)
  registerPagehideFlush()
}

// Read the latest snapshot, validating the backup envelope. Returns null on a
// missing, invalid, or unreadable snapshot.
export async function loadSnapshot(): Promise<BackupFile | null> {
  if (!snapshotAvailable()) return null
  try {
    const database = await openMetaDb()
    let value: unknown
    try {
      value = await idbGet(database)
    } finally {
      database.close()
    }
    if (!value || typeof value !== 'object') return null
    const backup = (value as { backup?: unknown }).backup
    if (!backup || typeof backup !== 'object') return null
    const b = backup as Record<string, unknown>
    if (b.app !== 'maigenki' || b.formatVersion !== 1 || !b.tables || typeof b.tables !== 'object') {
      return null
    }
    return backup as BackupFile
  } catch (e) {
    console.warn('[snapshot] load failed:', (e as Error).message)
    return null
  }
}

// Delete the stored snapshot. Used by tests and available for future use.
export async function clearSnapshot(): Promise<void> {
  if (!snapshotAvailable()) return
  try {
    const database = await openMetaDb()
    try {
      await idbDelete(database)
    } finally {
      database.close()
    }
  } catch (e) {
    console.warn('[snapshot] clear failed:', (e as Error).message)
  }
}
