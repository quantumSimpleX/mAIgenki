import type { SQLiteDatabase } from 'expo-sqlite'
import * as DocumentPicker from 'expo-document-picker'
import { Platform } from 'react-native'
import { base64ToUint8Array, uint8ArrayToBase64 } from './blob'

// Tables in foreign-key-safe parent → child order. buildBackup reads in this
// order; restoreBackup deletes in reverse (children first) then inserts in this
// order (parents first), mirroring the child-first delete ordering in seed.ts.
export const BACKUP_TABLES = [
  'facilities',
  'providers',
  'health_records',
  'conditions',
  'condition_locations',
  'record_images',
  'condition_providers',
  'measurements',
  'medications',
  'condition_localnames',
  'condition_records',
  'settings',
] as const

const BLOB_COLUMNS: Record<string, readonly string[]> = {
  record_images: ['image_blob', 'thumbnail_blob'],
}

function encodeBlobs(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const result = { ...row }
  for (const column of BLOB_COLUMNS[table] ?? []) {
    const value = result[column]
    if (value instanceof Uint8Array) result[column] = uint8ArrayToBase64(value)
  }
  return result
}

function decodeBlobs(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const result = { ...row }
  for (const column of BLOB_COLUMNS[table] ?? []) {
    const value = result[column]
    if (typeof value === 'string') result[column] = base64ToUint8Array(value)
  }
  return result
}

export type BackupFile = {
  app: 'maigenki'
  formatVersion: 1
  exportedAt: string
  tables: Record<string, unknown[]>
}

// ── Secret settings ─────────────────────────────────────────────────────────

// Exact `settings.key` values that must never appear in a backup export and
// must never be written to live settings on restore. Currently the LLM
// keystore (src/lib/llm/keystore.ts) stores provider keys in expo-secure-store
// / localStorage, not in this table — but keep this denylist as the guard in
// case a secret ever lands in `settings` (e.g. legacy `openrouter_api_key`).
const SECRET_SETTING_KEYS: readonly string[] = ['openrouter_api_key']

// Prefixes that mark a settings key as secret regardless of exact match, e.g.
// a future `lmf.key.<providerId>` convention if that ever moves into this
// table. Add new prefixes here rather than one-off exact keys.
const SECRET_SETTING_KEY_PREFIXES: readonly string[] = ['lmf.key.']

function isSecretSettingKey(key: unknown): boolean {
  if (typeof key !== 'string') return false
  if (SECRET_SETTING_KEYS.includes(key)) return true
  return SECRET_SETTING_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
}

// Filters out rows in the `settings` table whose `key` is denylisted. Used on
// both export (never write secrets to backup JSON) and restore (never let a
// backup reintroduce a secret into live settings).
function stripSecretSettings(rows: unknown[]): unknown[] {
  return rows.filter((row) => {
    if (!row || typeof row !== 'object') return true
    const key = (row as Record<string, unknown>).key
    return !isSecretSettingKey(key)
  })
}

// ── Build ───────────────────────────────────────────────────────────────────

export async function buildBackup(db: SQLiteDatabase): Promise<BackupFile> {
  const tables: Record<string, unknown[]> = {}
  for (const t of BACKUP_TABLES) {
    const rows: Record<string, unknown>[] = []
    if (t === 'record_images') {
      // Read BLOB rows one-at-a-time; multi-row BLOB reads are unreliable on
      // the web wa-sqlite/OPFS backend.
      for await (const row of db.getEachAsync<Record<string, unknown>>(`SELECT * FROM ${t}`)) rows.push(row)
    } else {
      rows.push(...await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${t}`))
    }
    const encoded = rows.map((row) => encodeBlobs(t, row))
    tables[t] = t === 'settings' ? stripSecretSettings(encoded) : encoded
  }
  return {
    app: 'maigenki',
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    tables,
  }
}

// ── Restore ─────────────────────────────────────────────────────────────────

// Replaces all data in BACKUP_TABLES with the backup's contents. Transactional:
// on any error the transaction rolls back and the live DB is untouched.
// Schema-drift tolerant: only columns that exist in BOTH the live table
// (PRAGMA table_info) and the backup row are inserted; unknown columns in the
// backup are skipped, missing ones fall back to their column defaults.
export async function restoreBackup(db: SQLiteDatabase, backup: BackupFile): Promise<void> {
  if (backup.app !== 'maigenki') {
    throw new Error(`Not a mAIgenki backup (app="${String(backup.app)}")`)
  }
  if (backup.formatVersion !== 1) {
    throw new Error(`Unsupported backup formatVersion: ${String(backup.formatVersion)}`)
  }

  await db.withTransactionAsync(async () => {
    // Children first.
    for (const t of [...BACKUP_TABLES].reverse()) {
      await db.runAsync(`DELETE FROM ${t}`)
    }
    // Parents first.
    for (const t of BACKUP_TABLES) {
      let rows = backup.tables[t]
      if (!Array.isArray(rows) || rows.length === 0) continue
      if (t === 'settings') rows = stripSecretSettings(rows)
      if (rows.length === 0) continue

      const info = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${t})`)
      const liveColumns = info.map((c) => c.name)

      for (const row of rows) {
        if (!row || typeof row !== 'object') continue
        const r = decodeBlobs(t, row as Record<string, unknown>)
        const cols = liveColumns.filter((c) => Object.prototype.hasOwnProperty.call(r, c))
        if (cols.length === 0) continue
        const placeholders = cols.map(() => '?').join(', ')
        const values = cols.map((c) => r[c])
        await db.runAsync(
          `INSERT INTO ${t} (${cols.join(', ')}) VALUES (${placeholders})`,
          values as (string | number | null)[],
        )
      }
    }
  })
}

// ── Web export (download) ─────────────────────────────────────────────────────

// Web-only: serialises the backup and triggers a browser download. No-op with a
// thrown Error on native — the Settings UI only calls this behind a web guard.
export async function exportBackupToFile(db: SQLiteDatabase): Promise<void> {
  if (Platform.OS !== 'web') {
    throw new Error('Backup export is only available on web')
  }
  const backup = await buildBackup(db)
  const json = JSON.stringify(backup, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const filename = `maigenki-backup-${backup.exportedAt.slice(0, 10)}.json`
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── Pick + read ────────────────────────────────────────────────────────────

function isBackupFile(value: unknown): value is BackupFile {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    v.app === 'maigenki' &&
    v.formatVersion === 1 &&
    typeof v.exportedAt === 'string' &&
    !!v.tables &&
    typeof v.tables === 'object'
  )
}

// Prompts the user to pick a backup JSON file, parses and validates it.
// Returns null if the user cancels. Throws a descriptive Error on malformed
// JSON or a file that isn't a valid mAIgenki backup envelope.
export async function pickAndReadBackup(): Promise<BackupFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
    copyToCacheDirectory: true,
  })
  if (result.canceled) return null

  const asset = result.assets[0]
  if (!asset) return null

  const text = await fetch(asset.uri).then((r) => r.text())

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Selected file is not valid JSON')
  }

  if (!isBackupFile(parsed)) {
    throw new Error('Selected file is not a valid mAIgenki backup')
  }
  return parsed
}
