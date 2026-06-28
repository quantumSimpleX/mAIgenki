import type { SQLiteDatabase } from 'expo-sqlite'
import { CONDITIONS } from '@/model/conditions'
import { insertHealthRecord, insertCondition, upsertConditionLocalName, getSetting, upsertSetting } from './queries'
import type { SupportedLang } from '@/model/conditions'

export const DEMO_RECORD_ID = 'demo-00000000-0000-0000-0000-000000000000'

const MONTHS: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
}

function toISODate(d: string): string {
  const [yr, mo, day] = d.split('-')
  return `${yr}-${MONTHS[mo]}-${day.padStart(2, '0')}`
}

export async function isDemoDataPresent(db: SQLiteDatabase): Promise<boolean> {
  const val = await getSetting(db, 'demo_seeded')
  return val === '1'
}

export async function seedDemoData(db: SQLiteDatabase): Promise<void> {
  if (await isDemoDataPresent(db)) return

  await db.runAsync(
    `INSERT OR IGNORE INTO health_records
       (id, filename, record_type, uploaded_at, processed_at)
     VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
    [DEMO_RECORD_ID, 'Demo Patient — Sample Health History', 'demo'],
  )

  for (const c of CONDITIONS) {
    const icdCode = c.medName.match(/ICD-10:\s*([A-Z]\d+[\d.]*)/)?.[1] ?? null
    const nameMedical = c.medName.replace(/\s*\(.*\)\s*$/, '').trim()

    const conditionId = await insertCondition(db, {
      recordId: DEMO_RECORD_ID,
      nameMedical,
      nameCommon: c.label,
      icdCode,
      system: c.system,
      renderX: c.cx,
      renderY: c.cy,
      status: 'documented',
      certainty: 'confirmed',
      dateDiagnosed: toISODate(c.date),
      evidence: c.evidence,
      notes: c.note,
    })

    await upsertConditionLocalName(db, conditionId, 'en', c.label)
    for (const [lang, name] of Object.entries(c.localNames) as [SupportedLang, string][]) {
      if (name) await upsertConditionLocalName(db, conditionId, lang, name)
    }
  }

  await upsertSetting(db, 'demo_seeded', '1')
}

export async function clearDemoData(db: SQLiteDatabase): Promise<void> {
  // Delete child rows first (no ON DELETE CASCADE in schema)
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
