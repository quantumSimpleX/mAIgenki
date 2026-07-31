// Backup / restore tests.
//
// expo-sqlite is a native module and cannot load under jest-expo's node
// environment, so — like pipeline.test.ts — these run the REAL backup/seed/query
// logic against a small generic in-memory fake implementing the subset of the
// SQLiteDatabase API our code uses (INSERT [OR IGNORE|REPLACE], UPDATE, DELETE,
// SELECT *, PRAGMA table_info, withTransactionAsync).

import type { SQLiteDatabase } from 'expo-sqlite'
import { initDatabase, getConditions, updateConditionPosition } from '@/lib/db/queries'
import { seedDemoData } from '@/lib/db/seed'
import { buildBackup, restoreBackup, BACKUP_TABLES, type BackupFile } from '@/lib/db/backup'

// Fixed live column schema per table (drives PRAGMA table_info). Deliberately
// does NOT include any drift columns, so unknown backup columns are skipped.
const SCHEMA: Record<string, string[]> = {
  facilities: ['id', 'name', 'facility_type', 'address', 'city', 'state', 'country', 'created_at'],
  providers: ['id', 'name', 'specialty', 'primary_facility_id', 'created_at'],
  health_records: ['id', 'filename', 'file_hash', 'record_type', 'record_date', 'page_count', 'extraction_method', 'facility_id', 'uploaded_at', 'processed_at'],
  conditions: ['id', 'record_id', 'name_medical', 'name_common', 'icd_code', 'system', 'organ', 'tissue', 'cell_type', 'anatomical_location', 'anatomical_region', 'laterality', 'render_x', 'render_y', 'cx', 'cy', 'year_frac', 'status', 'severity', 'chronicity', 'certainty', 'date_onset', 'date_diagnosed', 'date_resolved', 'evidence', 'notes', 'created_at'],
  condition_providers: ['condition_id', 'provider_id', 'role', 'facility_id'],
  measurements: ['id', 'record_id', 'name', 'value_numeric', 'value_text', 'unit', 'reference_low', 'reference_high', 'flag', 'date', 'provider_id', 'facility_id', 'evidence', 'created_at'],
  medications: ['id', 'record_id', 'condition_id', 'name', 'generic_name', 'dosage', 'frequency', 'route', 'date_prescribed', 'date_discontinued', 'provider_id', 'facility_id', 'evidence', 'created_at'],
  condition_localnames: ['condition_id', 'lang', 'name'],
  condition_records: ['id', 'condition_id', 'record_type', 'title', 'image_uri', 'chart_json', 'table_json', 'color', 'date', 'source_file', 'notes', 'created_at'],
  settings: ['key', 'value'],
}

const PK: Record<string, string[]> = {
  facilities: ['id'], providers: ['id'], health_records: ['id'], conditions: ['id'],
  condition_providers: ['condition_id', 'provider_id', 'role'], measurements: ['id'],
  medications: ['id'], condition_localnames: ['condition_id', 'lang'],
  condition_records: ['id'], settings: ['key'],
}

const TABLES = Object.keys(SCHEMA)

function makeFakeDb(): SQLiteDatabase {
  const data: Record<string, any[]> = {}
  for (const t of TABLES) data[t] = []

  const pkOf = (table: string, row: any) => (PK[table] ?? ['id']).map((k) => row[k]).join(' ')

  const db: any = {
    async execAsync() { /* DDL — schema is fixed in the fake */ },

    async withTransactionAsync(cb: () => Promise<void>) { await cb() },

    async runAsync(sql: string, params: any[] = []) {
      const ins = /INSERT (OR IGNORE |OR REPLACE )?INTO (\w+)\s*\(([\s\S]*?)\)\s*VALUES/i.exec(sql)
      if (ins) {
        const table = ins[2]
        const cols = ins[3].split(',').map((c) => c.trim())
        const row: any = {}
        cols.forEach((c, i) => { row[c] = params[i] })
        const isIgnore = /OR IGNORE/i.test(sql)
        const key = pkOf(table, row)
        const idx = data[table].findIndex((r) => pkOf(table, r) === key)
        if (idx >= 0) {
          if (!isIgnore) data[table][idx] = row
        } else {
          data[table].push(row)
        }
        return { changes: 1, lastInsertRowId: 0 }
      }

      const upd = /UPDATE (\w+) SET ([\s\S]*?) WHERE ([\s\S]*)/i.exec(sql)
      if (upd) {
        const table = upd[1]
        const setCols = [...upd[2].matchAll(/(\w+)\s*=\s*\?/g)].map((m) => m[1])
        const whereCols = [...upd[3].matchAll(/(\w+)\s*=\s*\?/g)].map((m) => m[1])
        const setParams = params.slice(0, setCols.length)
        const whereParams = params.slice(setCols.length)
        for (const r of data[table]) {
          const match = whereCols.every((c, i) => r[c] === whereParams[i])
          if (match) setCols.forEach((c, i) => { r[c] = setParams[i] })
        }
        return { changes: 1, lastInsertRowId: 0 }
      }

      const del = /DELETE FROM (\w+)(?:\s+WHERE (\w+)\s*=\s*\?)?/i.exec(sql)
      if (del) {
        const table = del[1]
        if (del[2]) data[table] = data[table].filter((r) => r[del[2]] !== params[0])
        else data[table] = []
        return { changes: 1, lastInsertRowId: 0 }
      }
      return { changes: 0, lastInsertRowId: 0 }
    },

    async getFirstAsync(sql: string, params: any[] = []) {
      const rows = await db.getAllAsync(sql, params)
      return rows[0] ?? null
    },

    async getAllAsync(sql: string, params: any[] = []) {
      const pragma = /PRAGMA table_info\((\w+)\)/i.exec(sql)
      if (pragma) return (SCHEMA[pragma[1]] ?? []).map((name) => ({ name }))
      if (/sqlite_master/i.test(sql)) return TABLES.map((name) => ({ name }))

      const sel = /SELECT ([\s\S]*?) FROM (\w+)/i.exec(sql)
      if (sel) {
        const table = sel[2]
        let rows = [...(data[table] ?? [])]
        const where = /WHERE (\w+)\s*=\s*\?/i.exec(sql)
        if (where) rows = rows.filter((r) => r[where[1]] === params[0])
        if (/ORDER BY year_frac/i.test(sql)) rows.sort((a, b) => (a.year_frac ?? 0) - (b.year_frac ?? 0))
        if (/COUNT\(\*\)/i.test(sql)) return [{ c: rows.length, count: rows.length }]
        // Real SQLite returns fresh plain objects — clone so callers can't mutate
        // stored rows (and so a captured backup is insulated from later writes).
        return rows.map((r) => ({ ...r }))
      }
      return []
    },

    async *getEachAsync(sql: string, params: any[] = []) {
      const rows = await db.getAllAsync(sql, params)
      for (const row of rows) yield row
    },
  }
  return db as SQLiteDatabase
}

async function seededDb(): Promise<SQLiteDatabase> {
  const db = makeFakeDb()
  await initDatabase(db)
  await seedDemoData(db)
  return db
}

describe('backup / restore', () => {
  it('buildBackup captures a valid envelope with all 10 tables', async () => {
    const db = await seededDb()
    const backup = await buildBackup(db)
    expect(backup.app).toBe('maigenki')
    expect(backup.formatVersion).toBe(1)
    expect(typeof backup.exportedAt).toBe('string')
    expect(Object.keys(backup.tables).sort()).toEqual([...BACKUP_TABLES].sort())
    expect(backup.tables.conditions.length).toBe(22)
  })

  it('round-trips: mutate then restore returns original values and row counts', async () => {
    const db = await seededDb()
    const backup = await buildBackup(db)

    const htnBackup = (backup.tables.conditions as any[]).find((r) => r.id === 'htn')
    const origCx = htnBackup.cx
    expect(origCx).not.toBe(12.34)

    // Mutate a persisted position.
    await updateConditionPosition(db, 'htn', 12.34, 56.78)
    let conds = await getConditions(db)
    expect(conds.find((c) => c.id === 'htn')!.cx_percent).toBeCloseTo(12.34, 2)

    // Restore should overwrite the mutation.
    await restoreBackup(db, backup)
    conds = await getConditions(db)
    expect(conds.length).toBe(22)
    expect(conds.find((c) => c.id === 'htn')!.cx_percent).toBeCloseTo(origCx, 2)

    // Row counts per table match the backup exactly.
    const after = await buildBackup(db)
    for (const t of BACKUP_TABLES) {
      expect(after.tables[t].length).toBe(backup.tables[t].length)
    }
  })

  it('rejects a backup with the wrong app envelope', async () => {
    const db = await seededDb()
    const bad = { app: 'someOtherApp', formatVersion: 1, exportedAt: '', tables: {} } as unknown as BackupFile
    await expect(restoreBackup(db, bad)).rejects.toThrow(/mAIgenki backup/)
  })

  it('rejects an unsupported formatVersion', async () => {
    const db = await seededDb()
    const bad = { app: 'maigenki', formatVersion: 2, exportedAt: '', tables: {} } as unknown as BackupFile
    await expect(restoreBackup(db, bad)).rejects.toThrow(/formatVersion/)
  })

  it('leaves the DB untouched when envelope validation rejects the backup', async () => {
    const db = await seededDb()
    const before = await buildBackup(db)
    const bad = { app: 'someOtherApp', formatVersion: 1, exportedAt: '', tables: {} } as unknown as BackupFile
    await expect(restoreBackup(db, bad)).rejects.toThrow()
    const after = await buildBackup(db)
    for (const t of BACKUP_TABLES) {
      expect(after.tables[t].length).toBe(before.tables[t].length)
    }
    const conds = await getConditions(db)
    expect(conds.length).toBe(22)
  })

  it('tolerates schema drift: unknown columns in a backup row are skipped', async () => {
    const db = await seededDb()
    const backup = await buildBackup(db)

    // Inject a column that does not exist in the live schema.
    ;(backup.tables.conditions[0] as any).bogus_column = 'should be ignored'

    await expect(restoreBackup(db, backup)).resolves.toBeUndefined()

    const conds = await getConditions(db)
    expect(conds.length).toBe(22)
    // The known columns still restored correctly.
    expect(conds.find((c) => c.id === 'htn')).toBeDefined()
  })
})
