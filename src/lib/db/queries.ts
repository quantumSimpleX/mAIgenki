import type { SQLiteDatabase } from 'expo-sqlite'
import {
  CREATE_TABLES_SQL,
  ALTER_COLUMNS_SQL,
  type ConditionRow,
  type ConditionLocalNameRow,
} from './schema'
import {
  CONDITIONS,
  type ConditionRecord, type DesignCondition, type SupportedLang, type SystemId,
} from '@/model/conditions'

// ── UUID ──────────────────────────────────────────────────────────────────────

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

// ── Init ──────────────────────────────────────────────────────────────────────

export async function initDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(CREATE_TABLES_SQL)
  // Backfill columns on databases created before these were added. SQLite throws
  // "duplicate column name" if the column already exists — swallow it per-statement.
  for (const stmt of ALTER_COLUMNS_SQL) {
    try {
      await db.execAsync(stmt)
    } catch {
      // column already present — safe to ignore
    }
  }
}

// ── Facilities ────────────────────────────────────────────────────────────────

type FacilityInput = {
  name: string
  facilityType?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
}

export async function findOrCreateFacility(
  db: SQLiteDatabase,
  input: FacilityInput,
): Promise<string> {
  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM facilities WHERE name = ? LIMIT 1',
    [input.name],
  )
  if (existing) return existing.id

  const id = uuid()
  await db.runAsync(
    `INSERT INTO facilities (id, name, facility_type, address, city, state, country)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, input.name, input.facilityType ?? null, input.address ?? null,
     input.city ?? null, input.state ?? null, input.country ?? null],
  )
  return id
}

// ── Providers ─────────────────────────────────────────────────────────────────

type ProviderInput = {
  name: string
  specialty?: string | null
  primaryFacilityId?: string | null
}

export async function findOrCreateProvider(
  db: SQLiteDatabase,
  input: ProviderInput,
): Promise<string> {
  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM providers WHERE name = ? AND (specialty = ? OR (specialty IS NULL AND ? IS NULL)) LIMIT 1',
    [input.name, input.specialty ?? null, input.specialty ?? null],
  )
  if (existing) return existing.id

  const id = uuid()
  await db.runAsync(
    `INSERT INTO providers (id, name, specialty, primary_facility_id) VALUES (?, ?, ?, ?)`,
    [id, input.name, input.specialty ?? null, input.primaryFacilityId ?? null],
  )
  return id
}

// ── Health Records ────────────────────────────────────────────────────────────

type HealthRecordInput = {
  filename: string
  fileHash?: string | null
  recordType?: string | null
  recordDate?: string | null
  pageCount?: number | null
  extractionMethod?: string | null
  facilityId?: string | null
}

export async function insertHealthRecord(
  db: SQLiteDatabase,
  input: HealthRecordInput,
): Promise<string> {
  const id = uuid()
  await db.runAsync(
    `INSERT INTO health_records (id, filename, file_hash, record_type, record_date, page_count, extraction_method, facility_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.filename, input.fileHash ?? null, input.recordType ?? null,
     input.recordDate ?? null, input.pageCount ?? null,
     input.extractionMethod ?? null, input.facilityId ?? null],
  )
  return id
}

// ── Conditions ────────────────────────────────────────────────────────────────

type ConditionInput = {
  recordId?: string | null
  nameMedical: string
  nameCommon?: string | null
  icdCode?: string | null
  system: string
  organ?: string | null
  tissue?: string | null
  cellType?: string | null
  anatomicalLocation?: string | null
  anatomicalRegion?: string | null
  laterality?: string | null
  renderX?: number | null
  renderY?: number | null
  status?: string
  severity?: string | null
  chronicity?: string | null
  certainty?: string | null
  dateOnset?: string | null
  dateDiagnosed?: string | null
  dateResolved?: string | null
  evidence?: string | null
  notes?: string | null
}

export async function insertCondition(
  db: SQLiteDatabase,
  input: ConditionInput,
): Promise<string> {
  const id = uuid()
  await db.runAsync(
    `INSERT INTO conditions (
       id, record_id, name_medical, name_common, icd_code,
       system, organ, tissue, cell_type,
       anatomical_location, anatomical_region, laterality,
       render_x, render_y,
       status, severity, chronicity, certainty,
       date_onset, date_diagnosed, date_resolved,
       evidence, notes
     ) VALUES (
       ?, ?, ?, ?, ?,
       ?, ?, ?, ?,
       ?, ?, ?,
       ?, ?,
       ?, ?, ?, ?,
       ?, ?, ?,
       ?, ?
     )`,
    [
      id, input.recordId ?? null, input.nameMedical, input.nameCommon ?? null, input.icdCode ?? null,
      input.system, input.organ ?? null, input.tissue ?? null, input.cellType ?? null,
      input.anatomicalLocation ?? null, input.anatomicalRegion ?? null, input.laterality ?? null,
      input.renderX ?? null, input.renderY ?? null,
      input.status ?? 'documented', input.severity ?? null, input.chronicity ?? null, input.certainty ?? 'confirmed',
      input.dateOnset ?? null, input.dateDiagnosed ?? null, input.dateResolved ?? null,
      input.evidence ?? null, input.notes ?? null,
    ],
  )
  return id
}

// ── Condition Providers ───────────────────────────────────────────────────────

type ConditionProviderInput = {
  conditionId: string
  providerId: string
  role: string
  facilityId?: string | null
}

export async function insertConditionProvider(
  db: SQLiteDatabase,
  input: ConditionProviderInput,
): Promise<void> {
  await db.runAsync(
    `INSERT OR IGNORE INTO condition_providers (condition_id, provider_id, role, facility_id)
     VALUES (?, ?, ?, ?)`,
    [input.conditionId, input.providerId, input.role, input.facilityId ?? null],
  )
}

// ── Measurements ──────────────────────────────────────────────────────────────

type MeasurementInput = {
  recordId?: string | null
  name: string
  valueNumeric?: number | null
  valueText?: string | null
  unit?: string | null
  referenceLow?: number | null
  referenceHigh?: number | null
  flag?: string | null
  date: string
  providerId?: string | null
  facilityId?: string | null
  evidence?: string | null
}

export async function insertMeasurement(
  db: SQLiteDatabase,
  input: MeasurementInput,
): Promise<string> {
  const id = uuid()
  await db.runAsync(
    `INSERT INTO measurements (
       id, record_id, name, value_numeric, value_text,
       unit, reference_low, reference_high, flag,
       date, provider_id, facility_id, evidence
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, input.recordId ?? null, input.name, input.valueNumeric ?? null, input.valueText ?? null,
      input.unit ?? null, input.referenceLow ?? null, input.referenceHigh ?? null, input.flag ?? null,
      input.date, input.providerId ?? null, input.facilityId ?? null, input.evidence ?? null,
    ],
  )
  return id
}

// ── Medications ───────────────────────────────────────────────────────────────

type MedicationInput = {
  recordId?: string | null
  conditionId?: string | null
  name: string
  genericName?: string | null
  dosage?: string | null
  frequency?: string | null
  route?: string | null
  datePrescribed?: string | null
  dateDiscontinued?: string | null
  providerId?: string | null
  facilityId?: string | null
  evidence?: string | null
}

export async function insertMedication(
  db: SQLiteDatabase,
  input: MedicationInput,
): Promise<string> {
  const id = uuid()
  await db.runAsync(
    `INSERT INTO medications (
       id, record_id, condition_id, name, generic_name,
       dosage, frequency, route,
       date_prescribed, date_discontinued,
       provider_id, facility_id, evidence
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, input.recordId ?? null, input.conditionId ?? null,
      input.name, input.genericName ?? null,
      input.dosage ?? null, input.frequency ?? null, input.route ?? null,
      input.datePrescribed ?? null, input.dateDiscontinued ?? null,
      input.providerId ?? null, input.facilityId ?? null, input.evidence ?? null,
    ],
  )
  return id
}

// ── Settings ──────────────────────────────────────────────────────────────────

export async function upsertSetting(
  db: SQLiteDatabase,
  key: string,
  value: string,
): Promise<void> {
  await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value])
}

export async function getSetting(
  db: SQLiteDatabase,
  key: string,
): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key])
  return row?.value ?? null
}

// ── Queries ───────────────────────────────────────────────────────────────────

export async function getAllConditions(db: SQLiteDatabase): Promise<ConditionRow[]> {
  return db.getAllAsync<ConditionRow>(
    `SELECT * FROM conditions ORDER BY COALESCE(date_diagnosed, date_onset) ASC`,
  )
}

export async function getConditionsByRecord(
  db: SQLiteDatabase,
  recordId: string,
): Promise<ConditionRow[]> {
  return db.getAllAsync<ConditionRow>(
    `SELECT * FROM conditions WHERE record_id = ? ORDER BY COALESCE(date_diagnosed, date_onset) ASC`,
    [recordId],
  )
}

// ── Condition Local Names ─────────────────────────────────────────────────────

export async function upsertConditionLocalName(
  db: SQLiteDatabase,
  conditionId: string,
  lang: string,
  name: string,
): Promise<void> {
  await db.runAsync(
    'INSERT OR REPLACE INTO condition_localnames (condition_id, lang, name) VALUES (?, ?, ?)',
    [conditionId, lang, name],
  )
}

export async function getConditionLocalNames(
  db: SQLiteDatabase,
  conditionId: string,
): Promise<ConditionLocalNameRow[]> {
  return db.getAllAsync<ConditionLocalNameRow>(
    'SELECT * FROM condition_localnames WHERE condition_id = ?',
    [conditionId],
  )
}

// ── Condition Records ─────────────────────────────────────────────────────────

type ConditionRecordInput = {
  conditionId: string
  recordType: string
  title?: string | null
  imageUri?: string | null
  chartJson?: string | null
  tableJson?: string | null
  date?: string | null
  sourceFile?: string | null
  notes?: string | null
}

export async function insertConditionRecord(
  db: SQLiteDatabase,
  input: ConditionRecordInput,
): Promise<string> {
  const id = uuid()
  await db.runAsync(
    `INSERT INTO condition_records
       (id, condition_id, record_type, title, image_uri, chart_json, table_json, date, source_file, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, input.conditionId, input.recordType,
      input.title ?? null, input.imageUri ?? null,
      input.chartJson ?? null, input.tableJson ?? null,
      input.date ?? null, input.sourceFile ?? null, input.notes ?? null,
    ],
  )
  return id
}

// Design-layer read: maps the stored row onto the ConditionRecord shape used by
// the body-map records carousel (record_type → type, title → label, color, date).
export async function getConditionRecords(
  db: SQLiteDatabase,
  conditionId: string,
): Promise<ConditionRecord[]> {
  const rows = await db.getAllAsync<{
    id: string
    record_type: string
    title: string | null
    date: string | null
    color: string | null
  }>(
    'SELECT id, record_type, title, color, date FROM condition_records WHERE condition_id = ? ORDER BY created_at ASC',
    [conditionId],
  )
  return rows.map((r) => ({
    id: r.id,
    type: r.record_type as ConditionRecord['type'],
    label: r.title ?? '',
    date: r.date ?? '',
    color: r.color ?? '#FFFFFF',
  }))
}

// ── Design-layer Conditions ───────────────────────────────────────────────────

// Returns localized condition names keyed by language for one condition.
// Empty object when the condition is unknown.
export async function getLocalNamesForCondition(
  db: SQLiteDatabase,
  condId: string,
): Promise<Partial<Record<SupportedLang, string>>> {
  const rows = await db.getAllAsync<ConditionLocalNameRow>(
    'SELECT condition_id, lang, name FROM condition_localnames WHERE condition_id = ?',
    [condId],
  )
  const out: Partial<Record<SupportedLang, string>> = {}
  for (const r of rows) out[r.lang as SupportedLang] = r.name
  return out
}

// Returns all seeded conditions mapped onto the DesignCondition shape the body
// map renders. English label comes from name_common; medName from name_medical.
export async function getConditions(db: SQLiteDatabase): Promise<DesignCondition[]> {
  const rows = await db.getAllAsync<ConditionRow & {
    cx: number | null
    cy: number | null
    year_frac: number | null
  }>('SELECT * FROM conditions ORDER BY year_frac ASC')

  const result: DesignCondition[] = []
  for (const row of rows) {
    const localNames = await getLocalNamesForCondition(db, row.id)
    // Fall back to hardcoded positions when null — covers old DBs where cx/cy
    // columns were added via ALTER TABLE and migration hasn't populated them yet.
    const hardcoded = CONDITIONS.find((c) => c.id === row.id)
    result.push({
      id: row.id,
      system: row.system as SystemId,
      label: row.name_common ?? row.name_medical,
      medName: row.name_medical,
      localNames,
      date: row.date_diagnosed ?? row.date_onset ?? '',
      yearFrac: row.year_frac ?? 0,
      // Use != null (not ??) so explicit 0 values from a broken migration also fall back.
      cx_percent: row.cx != null && row.cx !== 0 ? row.cx : (hardcoded?.cx_percent ?? 0),
      cy_percent: row.cy != null && row.cy !== 0 ? row.cy : (hardcoded?.cy_percent ?? 0),
      note: row.notes ?? '',
      evidence: row.evidence ?? '',
    })
  }
  return result
}

export async function updateConditionPosition(
  db: SQLiteDatabase, id: string, cxPercent: number, cyPercent: number,
): Promise<void> {
  await db.runAsync(
    'UPDATE conditions SET cx = ?, cy = ? WHERE id = ?',
    [cxPercent, cyPercent, id],
  )
}

export async function getConditionsByDateRange(
  db: SQLiteDatabase,
  startDate: string,
  endDate: string,
): Promise<ConditionRow[]> {
  return db.getAllAsync<ConditionRow>(
    `SELECT * FROM conditions
     WHERE (date_diagnosed >= ? OR date_onset >= ?)
       AND (date_diagnosed <= ? OR date_onset <= ?)
     ORDER BY COALESCE(date_diagnosed, date_onset) ASC`,
    [startDate, startDate, endDate, endDate],
  )
}
