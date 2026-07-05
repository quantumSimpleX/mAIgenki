// Shared in-memory fake SQLiteDatabase for db tests. expo-sqlite is a native
// module and cannot load under jest-expo's node environment, so — as in
// backup.test.ts / pipeline.test.ts — these run the REAL seed/query/backup logic
// against a small generic fake implementing the subset of the SQLiteDatabase API
// our code uses (INSERT [OR IGNORE|REPLACE], UPDATE, DELETE, SELECT *,
// PRAGMA table_info, withTransactionAsync).

import type { SQLiteDatabase } from 'expo-sqlite'
import { initDatabase } from '@/lib/db/queries'
import { seedDemoData } from '@/lib/db/seed'

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

export function makeFakeDb(): SQLiteDatabase {
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
        return rows.map((r) => ({ ...r }))
      }
      return []
    },

    async closeAsync() { /* no-op for the fake */ },
  }
  return db as SQLiteDatabase
}

export async function seededFakeDb(): Promise<SQLiteDatabase> {
  const db = makeFakeDb()
  await initDatabase(db)
  await seedDemoData(db)
  return db
}
