import 'fake-indexeddb/auto'
import {
  getIndexedConditionDots, getProvidersForRecord, openIndexedDb, persistEnrichmentResult, seedIndexedDbDemoData,
  putIndexedCondition, putIndexedConditionLocation, getConditionLocations, deleteConditionLocation,
} from '@/lib/db/indexedDb'
import { CONDITIONS, CONDITION_RECORDS } from '@/model/conditions'

describe('IndexedDB vertical slice', () => {
  it('seeds demo data and returns one dot per location, including the bilateral kidney-stones example', async () => {
    const db = await openIndexedDb(`maigenki-test-${Date.now()}`)
    await seedIndexedDbDemoData(db)
    const dots = await getIndexedConditionDots(db)
    expect(dots).toHaveLength(CONDITIONS.length + 5) // stones +1, rotator +1, fractures +3 secondary locations
    const stonesDots = dots.filter((d) => d.conditionId === 'stones')
    expect(stonesDots).toEqual([
      expect.objectContaining({ conditionId: 'stones', cx_percent: 44.36, cy_percent: 34 }),
      expect.objectContaining({ conditionId: 'stones', cx_percent: 55.92, cy_percent: 37.57 }),
    ])
    expect(dots.filter((d) => d.conditionId === 'rotator')).toHaveLength(2)
    expect(dots.filter((d) => d.conditionId === 'fractures')).toHaveLength(4)
    db.close()
  })

  // Regression for a Codex review finding on PR #1: secondary locations were
  // given a fresh random id on every persistEnrichmentResult call, so
  // re-seeding the same condition (e.g. reloading demo data) accumulated
  // duplicate overlapping dots instead of overwriting the prior ones.
  it('does not duplicate secondary-location dots when demo data is seeded twice', async () => {
    const db = await openIndexedDb(`maigenki-reseed-${Date.now()}`)
    await seedIndexedDbDemoData(db)
    await seedIndexedDbDemoData(db)
    const dots = await getIndexedConditionDots(db)
    expect(dots).toHaveLength(CONDITIONS.length + 5) // unchanged from a single seed
    db.close()
  })

  it('creates the versioned stores and relationship indexes', async () => {
    const db = await openIndexedDb(`maigenki-schema-${Date.now()}`)
    expect(Array.from(db.objectStoreNames)).toEqual(expect.arrayContaining([
      'health_records', 'conditions', 'condition_locations', 'record_images', 'condition_records',
      'measurements', 'providers', 'settings',
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

  // Regression for a Codex review finding on PR #1: real uploads were silently
  // discarding `EnrichedInput.providers` because IndexedDB had no store for it.
  // persistEnrichmentResult trusts its caller to have already evidence-gated
  // the list (see pipeline.ts) — it just needs to persist whatever it's given.
  it('persists EnrichedInput.providers to the record-scoped providers store', async () => {
    const db = await openIndexedDb(`maigenki-provider-${Date.now()}`)
    const attributedProvider = { name: 'Dr. Kim', specialty: null, email: null, phone: null, evidence: 'seen by Dr. Kim' }

    const { recordId } = await persistEnrichmentResult(db, {
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

    expect(Array.from(db.objectStoreNames)).toEqual(expect.arrayContaining(['providers']))

    const stored = await getProvidersForRecord(db, recordId)
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject(attributedProvider)

    db.close()
  })

  // Regression for a Codex review finding on PR #1: an LLM-detected inferred
  // condition's status was computed but never written, so bodymap.tsx had no
  // way to distinguish it from a documented one (AGENTS.md hard constraint).
  it('persists and reads back condition status, including inferred', async () => {
    const db = await openIndexedDb(`maigenki-status-${Date.now()}`)

    await persistEnrichmentResult(db, {
      filename: 'report.pdf',
      pageCount: 1,
      extractionMethod: 'text',
      conditions: [
        {
          id: 'documented-1', name_medical: 'Essential hypertension', name_common: null, system: 'cardiovascular',
          organ: null, anatomical_location: null, status: 'documented', severity: null, certainty: null,
          date_onset: null, date_diagnosed: '2022-06-01', evidence: 'BP 145/92',
        },
        {
          id: 'inferred-1', name_medical: 'Hypertension', name_common: null, system: 'cardiovascular',
          organ: null, anatomical_location: null, status: 'inferred', severity: null, certainty: null,
          date_onset: null, date_diagnosed: '2022-06-01', evidence: 'Inferred from repeated BP readings',
        },
      ],
      measurements: [],
    })

    const dots = await getIndexedConditionDots(db)
    expect(dots.find((d) => d.conditionId === 'documented-1')?.status).toBe('documented')
    expect(dots.find((d) => d.conditionId === 'inferred-1')?.status).toBe('inferred')

    db.close()
  })

  // Regression for a Codex review finding on PR #1: getIndexedConditionDots
  // had no demo/user visibility filter, unlike getIndexedConditions — so demo
  // hotspots kept rendering on the body map after a real upload existed.
  it('hides demo dots once a real record exists, in auto mode', async () => {
    const db = await openIndexedDb(`maigenki-dot-filter-${Date.now()}`)
    await seedIndexedDbDemoData(db)

    await persistEnrichmentResult(db, {
      filename: 'report.pdf',
      pageCount: 1,
      extractionMethod: 'text',
      conditions: [{
        id: 'user-1', name_medical: 'Essential hypertension', name_common: null, system: 'cardiovascular',
        organ: null, anatomical_location: null, status: 'documented', severity: null, certainty: null,
        date_onset: null, date_diagnosed: '2022-06-01', evidence: 'BP 145/92',
      }],
      measurements: [],
    })

    const autoDots = await getIndexedConditionDots(db, 'auto')
    expect(autoDots.every((d) => d.conditionId === 'user-1')).toBe(true)

    const demoDots = await getIndexedConditionDots(db, 'demo')
    expect(demoDots.some((d) => d.conditionId === 'stones')).toBe(true)
    expect(demoDots.every((d) => d.conditionId !== 'user-1')).toBe(true)

    db.close()
  })

  // Task 7.1: locationId lets the Remove tool know exactly which
  // condition_locations row to delete, and distinguishes real rows from the
  // synthesized fallback dot.
  it('locationId is non-null and distinct for each real condition_locations row', async () => {
    const db = await openIndexedDb(`maigenki-locationid-real-${Date.now()}`)
    await seedIndexedDbDemoData(db)

    const dots = await getIndexedConditionDots(db)
    const stonesDots = dots.filter((d) => d.conditionId === 'stones')
    expect(stonesDots).toHaveLength(2)
    for (const dot of stonesDots) expect(dot.locationId).not.toBeNull()
    expect(new Set(stonesDots.map((d) => d.locationId)).size).toBe(2)

    db.close()
  })

  it('locationId is null for the synthesized fallback dot of a condition with zero location rows', async () => {
    const db = await openIndexedDb(`maigenki-locationid-fallback-${Date.now()}`)
    await putIndexedCondition(db, {
      id: 'no-locations', record_id: null, name_medical: 'Legacy condition', name_common: null,
      system: 'cardiovascular', organ: null, anatomical_location: null, status: 'documented',
      severity: null, certainty: null, year_frac: 2020, date: null, date_onset: null,
      date_diagnosed: null, note: null, evidence: null, local_names: null, inferred_fields: null,
      cx: 50, cy: 50,
    })

    const dots = await getIndexedConditionDots(db)
    const fallbackDots = dots.filter((d) => d.conditionId === 'no-locations')
    expect(fallbackDots).toHaveLength(1)
    expect(fallbackDots[0].locationId).toBeNull()

    db.close()
  })

  // Task 7.6 removal guard: bodymap.tsx's handleLocationRemoveAttempt rejects
  // removing a condition's last location, checked via getConditionLocations's
  // row count before ever calling deleteConditionLocation. This exercises the
  // underlying data-layer mechanics that guard relies on (bodymap.tsx itself
  // isn't rendered in tests — see __tests__/screens/bodymap.test.tsx's own
  // note on the SVG/Animated render cost — so the guard's branching is
  // covered by Task 7.9 manual verification instead).
  it('deleteConditionLocation removes exactly one row, leaving the last location intact', async () => {
    const db = await openIndexedDb(`maigenki-removal-guard-${Date.now()}`)
    await putIndexedCondition(db, {
      id: 'two-loc', record_id: null, name_medical: 'Bilateral condition', name_common: null,
      system: 'skeletal', organ: null, anatomical_location: null, status: 'documented',
      severity: null, certainty: null, year_frac: 2020, date: null, date_onset: null,
      date_diagnosed: null, note: null, evidence: null, local_names: null, inferred_fields: null,
      cx: 40, cy: 40,
    })
    await putIndexedConditionLocation(db, { id: 'loc-a', condition_id: 'two-loc', cx: 40, cy: 40, is_primary: true })
    await putIndexedConditionLocation(db, { id: 'loc-b', condition_id: 'two-loc', cx: 60, cy: 40, is_primary: false })

    expect(await getConditionLocations(db, 'two-loc')).toHaveLength(2)

    // 2 locations → removing one down to 1 succeeds.
    await deleteConditionLocation(db, 'loc-b')
    const remaining = await getConditionLocations(db, 'two-loc')
    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe('loc-a')

    // 1 location remaining → the guard (existingLocations.length <= 1) blocks
    // any further removal before calling deleteConditionLocation again.
    expect(remaining.length).toBeLessThanOrEqual(1)

    db.close()
  })
})
