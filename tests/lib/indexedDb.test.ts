import 'fake-indexeddb/auto'
import { getIndexedConditionDots, openIndexedDb, persistEnrichmentResult, seedIndexedDbDemoData } from '@/lib/db/indexedDb'
import { CONDITIONS, CONDITION_RECORDS } from '@/model/conditions'

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

  // Regression check for Task 2.9: seedIndexedDbDemoData must persist through
  // persistEnrichmentResult (the same path real uploads use), not a parallel
  // set of put() calls — this guards against the port silently dropping
  // conditions or condition_records.
  it('seeds exactly one condition per CONDITIONS entry and preserves all condition_records', async () => {
    const db = await openIndexedDb(`maigenki-seed-count-${Date.now()}`)
    await seedIndexedDbDemoData(db)

    const conditionsTx = db.transaction('conditions', 'readonly')
    const conditions = await new Promise<unknown[]>((resolve, reject) => {
      const req = conditionsTx.objectStore('conditions').getAll()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    expect(conditions).toHaveLength(CONDITIONS.length)

    const recordsTx = db.transaction('condition_records', 'readonly')
    const records = await new Promise<{ image_id: string | null }[]>((resolve, reject) => {
      const req = recordsTx.objectStore('condition_records').getAll()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const expectedRecordCount = Object.values(CONDITION_RECORDS).reduce((sum, rows) => sum + rows.length, 0)
    expect(records).toHaveLength(expectedRecordCount)
    // The stones KUB X-ray record_records entry should carry the seeded image_id.
    expect(records.filter((r) => r.image_id != null)).toHaveLength(1)

    db.close()
  })

  // Regression for kb2-CODE/p01-provider-Phase-attribution-fix.md: IndexedDB
  // has no provider/facility/care-event object stores yet (a documented,
  // intentional gap — see p02's Blockers #1), so `EnrichedInput.providers` and
  // a condition's own `provider` field must be accepted for shape-compat only
  // and never silently written anywhere. This guards against a future change
  // reintroducing the original blanket-fallback bug by wiring provider
  // persistence in without the per-condition evidence gate.
  it('does not persist provider data anywhere — no provider store, no provider field on stored conditions', async () => {
    const db = await openIndexedDb(`maigenki-provider-guard-${Date.now()}`)
    const attributedProvider = { name: 'Dr. Kim', specialty: null, email: null, phone: null, evidence: 'seen by Dr. Kim' }

    await persistEnrichmentResult(db, {
      filename: 'report.pdf',
      pageCount: 1,
      extractionMethod: 'text',
      conditions: [{
        name_medical: 'Essential hypertension', name_common: null, system: 'cardiovascular',
        organ: null, anatomical_location: null, status: 'documented', severity: null, certainty: null,
        date_onset: null, date_diagnosed: '2022-06-01', evidence: 'BP 145/92',
        provider: attributedProvider,
      }],
      measurements: [],
      providers: [attributedProvider],
    })

    expect(Array.from(db.objectStoreNames)).not.toEqual(expect.arrayContaining([
      'providers', 'facilities', 'condition_providers', 'condition_care_events',
    ]))

    const conditions = await new Promise<unknown[]>((resolve, reject) => {
      const req = db.transaction('conditions', 'readonly').objectStore('conditions').getAll()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    expect(conditions).toHaveLength(1)
    expect(conditions[0]).not.toHaveProperty('provider')

    db.close()
  })
})
