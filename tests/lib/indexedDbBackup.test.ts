import 'fake-indexeddb/auto'
import { openIndexedDb, seedIndexedDbDemoData, getIndexedConditionDots } from '@/lib/db/indexedDb'
import { buildIndexedDbBackup, restoreIndexedDbBackup } from '@/lib/db/indexedDbBackup'
import { CONDITIONS } from '@/model/conditions'

describe('IndexedDB backup adapter', () => {
  it('round-trips seeded conditions and locations', async () => {
    const db = await openIndexedDb(`maigenki-backup-${Date.now()}`)
    await seedIndexedDbDemoData(db)
    const backup = await buildIndexedDbBackup(db)
    db.transaction('conditions', 'readwrite').objectStore('conditions').clear()
    await restoreIndexedDbBackup(db, backup)

    const dots = await getIndexedConditionDots(db)
    expect(dots).toHaveLength(CONDITIONS.length + 1) // +1 for the bilateral 'stones' condition's second location
    const stonesDots = dots.filter((d) => d.conditionId === 'stones')
    expect(stonesDots).toEqual([
      expect.objectContaining({ conditionId: 'stones', cx_percent: 40.32, cy_percent: 37.12 }),
      expect.objectContaining({ conditionId: 'stones', cx_percent: 48.32, cy_percent: 37.12 }),
    ])
    db.close()
  })

  it('rejects an invalid backup envelope before writing', async () => {
    const db = await openIndexedDb(`maigenki-backup-invalid-${Date.now()}`)
    await expect(restoreIndexedDbBackup(db, {
      app: 'other' as 'maigenki',
      formatVersion: 1,
      database: db.name,
      exportedAt: new Date().toISOString(),
      stores: {},
    })).rejects.toThrow(/mAIgenki IndexedDB backup/)
    db.close()
  })
})
