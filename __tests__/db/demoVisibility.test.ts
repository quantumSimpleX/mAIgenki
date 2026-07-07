import type { SQLiteDatabase } from 'expo-sqlite'
import { initDatabase, insertCondition, insertHealthRecord, getConditions } from '@/lib/db/queries'
import { seedDemoData } from '@/lib/db/seed'
import { makeFakeDb } from './fakeDb'

async function freshSeededDb(): Promise<SQLiteDatabase> {
  const db = makeFakeDb()
  await initDatabase(db)
  await seedDemoData(db)
  return db
}

describe('demo condition visibility', () => {
  it('keeps demo rows stored but hides them after user data exists', async () => {
    const db = await freshSeededDb()
    expect((await getConditions(db)).length).toBe(22)

    const recordId = await insertHealthRecord(db, {
      filename: 'user-lab.pdf',
      recordType: 'upload',
      extractionMethod: 'text',
    })
    await insertCondition(db, {
      recordId,
      nameMedical: 'Essential hypertension',
      nameCommon: 'High blood pressure',
      system: 'cardio',
      dateDiagnosed: '2026-07-07',
    })

    const storedRows = await db.getAllAsync('SELECT * FROM conditions')
    const visible = await getConditions(db)
    expect(storedRows.length).toBe(23)
    expect(visible).toHaveLength(1)
    expect(visible[0].system).toBe('cardiovascular')
  })

  it('can explicitly show demo rows without deleting user data', async () => {
    const db = await freshSeededDb()
    const recordId = await insertHealthRecord(db, {
      filename: 'user-lab.pdf',
      recordType: 'upload',
      extractionMethod: 'text',
    })
    await insertCondition(db, {
      recordId,
      nameMedical: 'Essential hypertension',
      nameCommon: 'High blood pressure',
      system: 'cardio',
      dateDiagnosed: '2026-07-07',
    })

    const demoVisible = await getConditions(db, 'demo')
    const storedRows = await db.getAllAsync('SELECT * FROM conditions')
    expect(storedRows.length).toBe(23)
    expect(demoVisible).toHaveLength(22)
    expect(demoVisible.some((c) => c.id === 'htn')).toBe(true)
  })
})
