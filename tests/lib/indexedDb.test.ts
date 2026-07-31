import 'fake-indexeddb/auto'
import { getIndexedConditionDots, openIndexedDb, seedIndexedDbDemoData } from '@/lib/db/indexedDb'
import { CONDITIONS } from '@/model/conditions'

describe('IndexedDB vertical slice', () => {
  it('seeds demo data and returns one dot per location, including the bilateral kidney-stones example', async () => {
    const db = await openIndexedDb(`maigenki-test-${Date.now()}`)
    await seedIndexedDbDemoData(db)
    const dots = await getIndexedConditionDots(db)
    expect(dots).toHaveLength(CONDITIONS.length + 1) // +1 for the bilateral 'stones' condition's second location
    const stonesDots = dots.filter((d) => d.conditionId === 'stones')
    expect(stonesDots).toEqual([
      expect.objectContaining({ conditionId: 'stones', cx_percent: 40.32, cy_percent: 37.12 }),
      expect.objectContaining({ conditionId: 'stones', cx_percent: 48.32, cy_percent: 37.12 }),
    ])
    db.close()
  })

  it('creates the versioned stores and relationship indexes', async () => {
    const db = await openIndexedDb(`maigenki-schema-${Date.now()}`)
    expect(Array.from(db.objectStoreNames)).toEqual(expect.arrayContaining([
      'health_records', 'conditions', 'condition_locations', 'record_images', 'condition_records', 'settings',
    ]))
    const transaction = db.transaction('condition_locations', 'readonly')
    expect(transaction.objectStore('condition_locations').indexNames.contains('condition_id')).toBe(true)
    db.close()
  })
})
