import type { SQLiteDatabase } from 'expo-sqlite'
import { CONDITIONS, CONDITION_RECORDS } from '@/model/conditions'
import { getSetting, upsertSetting } from './queries'
import type { SupportedLang } from '@/model/conditions'

export const DEMO_RECORD_ID = 'demo-00000000-0000-0000-0000-000000000000'

export async function isDemoDataPresent(db: SQLiteDatabase): Promise<boolean> {
  const val = await getSetting(db, 'demo_seeded')
  return val === '1'
}

// Maps the short organ-system codes used before the rename to the full names
// that now match the anatomy layer filenames. Runs on every startup so DBs
// seeded with the old codes migrate in place; idempotent once migrated.
const SYSTEM_CODE_RENAME: Record<string, string> = {
  integ: 'integumentary', muscle: 'muscular', cardio: 'cardiovascular',
  lymph: 'lymphatic', neuro: 'nervous', pulm: 'respiratory',
  gi: 'digestive', endo: 'endocrine', repro: 'reproductive',
}

async function migrateSystemCodes(db: SQLiteDatabase): Promise<void> {
  for (const [oldCode, newCode] of Object.entries(SYSTEM_CODE_RENAME)) {
    await db.runAsync('UPDATE conditions SET system = ? WHERE system = ?', [newCode, oldCode])
  }
}

// Runs on every startup so existing seeded DBs pick up repositioned condition dots.
// Only updates cx/cy — these are guaranteed by ALTER_COLUMNS_SQL. render_x/render_y
// are handled separately via ALTER_COLUMNS_SQL so they may not exist in very old DBs.
async function migrateConditionPositions(db: SQLiteDatabase): Promise<void> {
  for (const c of CONDITIONS) {
    await db.runAsync(
      'UPDATE conditions SET cx = ?, cy = ? WHERE id = ? AND (cx IS NULL OR cy IS NULL)',
      [c.cx, c.cy, c.id],
    )
  }
}

export async function seedDemoData(db: SQLiteDatabase): Promise<void> {
  await migrateSystemCodes(db)
  await migrateConditionPositions(db)
  if (await isDemoDataPresent(db)) return

  await db.runAsync(
    `INSERT OR IGNORE INTO health_records
       (id, filename, record_type, uploaded_at, processed_at)
     VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
    [DEMO_RECORD_ID, 'Demo Patient — Sample Health History', 'demo'],
  )

  for (const c of CONDITIONS) {
    const icdCode = c.medName.match(/ICD-10:\s*([A-Z]\d+[\d.]*)/)?.[1] ?? null

    // Use the design id as the primary key so getConditions / getConditionRecords
    // are addressable by 'htn', 'eczema', … and re-seeding is idempotent.
    await db.runAsync(
      `INSERT OR IGNORE INTO conditions (
         id, record_id, name_medical, name_common, icd_code, system,
         render_x, render_y, cx, cy, year_frac,
         status, certainty, date_diagnosed, evidence, notes
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        c.id, DEMO_RECORD_ID, c.medName, c.label, icdCode, c.system,
        c.cx, c.cy, c.cx, c.cy, c.yearFrac,
        'documented', 'confirmed', c.date, c.evidence, c.note,
      ],
    )

    // Local names: English (from label) + each translation.
    await db.runAsync(
      'INSERT OR IGNORE INTO condition_localnames (condition_id, lang, name) VALUES (?, ?, ?)',
      [c.id, 'en', c.label],
    )
    for (const [lang, name] of Object.entries(c.localNames) as [SupportedLang, string][]) {
      if (name) {
        await db.runAsync(
          'INSERT OR IGNORE INTO condition_localnames (condition_id, lang, name) VALUES (?, ?, ?)',
          [c.id, lang, name],
        )
      }
    }

    // Attached records (charts/scans) for the carousel.
    for (const r of CONDITION_RECORDS[c.id] ?? []) {
      await db.runAsync(
        `INSERT OR IGNORE INTO condition_records
           (id, condition_id, record_type, title, color, date)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [r.id, c.id, r.type, r.label, r.color, r.date],
      )
    }
  }

  await upsertSetting(db, 'demo_seeded', '1')
}

export async function clearDemoData(db: SQLiteDatabase): Promise<void> {
  // Delete child rows first (no ON DELETE CASCADE in schema).
  await db.runAsync(
    `DELETE FROM condition_localnames WHERE condition_id IN
       (SELECT id FROM conditions WHERE record_id = ?)`,
    [DEMO_RECORD_ID],
  )
  await db.runAsync(
    `DELETE FROM condition_records WHERE condition_id IN
       (SELECT id FROM conditions WHERE record_id = ?)`,
    [DEMO_RECORD_ID],
  )
  await db.runAsync('DELETE FROM conditions WHERE record_id = ?', [DEMO_RECORD_ID])
  await db.runAsync('DELETE FROM health_records WHERE id = ?', [DEMO_RECORD_ID])
  await db.runAsync("DELETE FROM settings WHERE key = 'demo_seeded'")
}
