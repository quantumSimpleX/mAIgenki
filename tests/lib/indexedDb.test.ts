import 'fake-indexeddb/auto'
import {
  getIndexedConditionDots, getProvidersForRecord, getFacilitiesForRecord, openIndexedDb, persistEnrichmentResult, seedIndexedDbDemoData,
  putIndexedCondition, putIndexedConditionLocation, getConditionLocations, deleteConditionLocation,
} from '@/lib/db/indexedDb'
import { CONDITIONS, CONDITION_RECORDS } from '@/model/conditions'
import type { AlphaMask } from '@/lib/llm/longitudinal'

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

  it('persists report-scoped facilities when provider is unavailable', async () => {
    const db = await openIndexedDb(`maigenki-facility-${Date.now()}`)
    const { recordId } = await persistEnrichmentResult(db, {
      filename: 'report.pdf', pageCount: 1, extractionMethod: 'text', conditions: [], measurements: [],
      facilities: [{ name: 'Community Clinic', address: null, city: 'Seattle', state: 'WA', country: 'US' }],
    })
    const request = db.transaction('facilities', 'readonly').objectStore('facilities').index('record_id').getAll(recordId)
    const rows = await new Promise<unknown[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as unknown[])
      request.onerror = () => reject(request.error)
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ name: 'Community Clinic', record_id: recordId })
    db.close()
  })

  // P10-02/P10-06: enrich.ts's merge step now dedupes every unique
  // provider/facility for a condition into `providers`/`facilities` arrays
  // (not just the single `provider` field) — this checks persistEnrichmentResult
  // actually writes the full set as condition-scoped rows, not just the primary
  // one, without duplicating the provider that's already linked via `provider`.
  it('persists every unique provider/facility on a condition, not just the primary one', async () => {
    const db = await openIndexedDb(`maigenki-multi-provider-${Date.now()}`)
    const providerA = { name: 'Dr. Kim', specialty: 'Cardiology', email: null, phone: null, evidence: null }
    const providerB = { name: 'Dr. Patel', specialty: null, email: null, phone: null, evidence: null }
    const facilityA = { name: 'City Hospital', address: null, city: 'Seattle', state: 'WA', country: 'US' }
    const facilityB = { name: 'County Clinic', address: null, city: 'Tacoma', state: 'WA', country: 'US' }

    const { recordId } = await persistEnrichmentResult(db, {
      filename: 'report.pdf',
      pageCount: 1,
      extractionMethod: 'text',
      conditions: [{
        id: 'multi-provider', name_medical: 'Essential hypertension', name_common: null, system: 'cardiovascular',
        organ: null, anatomical_location: null, status: 'documented', severity: null, certainty: null,
        date_onset: null, date_diagnosed: '2022-06-01', evidence: null,
        provider: providerA,
        providers: [providerA, providerB],
        facilities: [facilityA, facilityB],
      }],
      measurements: [],
    })

    const providers = await getProvidersForRecord(db, recordId)
    expect(providers.map((p) => p.name).sort()).toEqual(['Dr. Kim', 'Dr. Patel'])
    // providerA must not be duplicated (already linked via the primary `provider` field).
    expect(providers.filter((p) => p.name === 'Dr. Kim')).toHaveLength(1)

    const facilities = await getFacilitiesForRecord(db, recordId)
    expect(facilities.map((f) => f.name).sort()).toEqual(['City Hospital', 'County Clinic'])
    expect(facilities.every((f) => f.condition_id === 'multi-provider')).toBe(true)

    db.close()
  })

  // Defect 1 regression (P10 QA retest, 2026-08-17): linkedProviderKeys was
  // record-scoped, so a provider attributed to two different conditions in
  // the same document only got a condition-scoped row on the first condition
  // processed — the second condition's own `providers` array was silently
  // ignored. Both conditions must get their own row.
  it('persists a condition-scoped provider row for every condition that cites that provider, even when shared across conditions', async () => {
    const db = await openIndexedDb(`maigenki-shared-provider-${Date.now()}`)
    const drKim = { name: 'Dr. Kim', specialty: 'Cardiology', email: null, phone: null, evidence: null }

    const { recordId } = await persistEnrichmentResult(db, {
      filename: 'report.pdf',
      pageCount: 1,
      extractionMethod: 'text',
      conditions: [
        {
          id: 'cond-A', name_medical: 'Essential hypertension', name_common: null, system: 'cardiovascular',
          organ: null, anatomical_location: null, status: 'documented', severity: null, certainty: null,
          date_onset: null, date_diagnosed: '2022-06-01', evidence: null,
          provider: drKim, providers: [drKim], facilities: [],
        },
        {
          id: 'cond-B', name_medical: 'Type 2 diabetes', name_common: null, system: 'endocrine',
          organ: null, anatomical_location: null, status: 'documented', severity: null, certainty: null,
          date_onset: null, date_diagnosed: '2022-07-01', evidence: null,
          provider: null, providers: [drKim], facilities: [],
        },
      ],
      measurements: [],
    })

    const providers = await getProvidersForRecord(db, recordId)
    const kimConditionIds = providers.filter((p) => p.name === 'Dr. Kim').map((p) => p.condition_id).sort()
    expect(kimConditionIds).toEqual(['cond-A', 'cond-B'])

    db.close()
  })

  // Defect 4 regression (found in the same live run as the P10-07 acceptance
  // pass, before this card reached kb4-DONE): a laterality-bearing condition's
  // secondary condition_locations row must use the anatomy call's own cx/cy
  // (now carried through by enrich.ts's buildConditionFromSummary) rather than
  // defaultConditionPosition's hash-jitter fallback.
  it('uses the location\'s own cx/cy for a laterality-bearing secondary location, not the hash-jitter default', async () => {
    const db = await openIndexedDb(`maigenki-laterality-location-${Date.now()}`)
    await persistEnrichmentResult(db, {
      filename: 'report.pdf',
      pageCount: 1,
      extractionMethod: 'text',
      conditions: [{
        id: 'wart', name_medical: 'Verruca vulgaris', name_common: 'Common wart', system: 'integumentary',
        organ: null, anatomical_location: 'hands', status: 'documented', severity: null, certainty: null,
        date_onset: null, date_diagnosed: '2022-06-01', evidence: null,
        cx: 20, cy: 90,
        locations: [{ anatomical_location: 'hands', laterality: 'bilateral', evidence: null, cx: 62, cy: 45 }],
      }],
      measurements: [],
    })

    const dots = await getIndexedConditionDots(db)
    const wartDots = dots.filter((d) => d.conditionId === 'wart')
    expect(wartDots).toHaveLength(2)
    const secondary = wartDots.find((d) => d.cx_percent !== 20 || d.cy_percent !== 90)
    expect(secondary).toEqual(expect.objectContaining({ cx_percent: 62, cy_percent: 45 }))

    db.close()
  })

  // P10-04/P10-06: a model-proposed cx/cy that lands on a transparent pixel
  // must be repaired onto the nearest opaque one, exactly as an
  // already-correct condition would be (repairConditionCoordinates, unchanged
  // by P10-04) — this exercises that interaction through the real
  // persistEnrichmentResult write path with a coordinateMask supplied.
  it('repairs a model-proposed coordinate landing on a transparent pixel, rather than rejecting it', async () => {
    const db = await openIndexedDb(`maigenki-coordinate-repair-${Date.now()}`)
    // 3x3 mask, only the center pixel (50%, 50%) is opaque.
    const mask: AlphaMask = { width: 3, height: 3, alpha: new Uint8Array([0, 0, 0, 0, 255, 0, 0, 0, 0]) }

    const { conditionCount } = await persistEnrichmentResult(db, {
      filename: 'report.pdf',
      pageCount: 1,
      extractionMethod: 'text',
      conditions: [{
        id: 'model-proposed-coordinate', name_medical: 'Migraine', name_common: null, system: 'nervous',
        organ: 'brain', anatomical_location: 'head', status: 'documented', severity: null, certainty: null,
        date_onset: null, date_diagnosed: '2022-06-01', evidence: null,
        // Model-proposed point, deliberately off the mask's only opaque pixel.
        cx: 0, cy: 0,
      }],
      measurements: [],
      coordinateMask: mask,
    })
    expect(conditionCount).toBe(1)

    const dots = await getIndexedConditionDots(db)
    const dot = dots.find((d) => d.conditionId === 'model-proposed-coordinate')
    expect(dot).toBeDefined()
    expect(dot).toEqual(expect.objectContaining({ cx_percent: 50, cy_percent: 50 }))

    db.close()
  })

  // Defect 5 regression: a condition whose anatomy call produced no cx/cy
  // falls through to defaultConditionPosition's hash-jitter default in
  // putIndexedCondition — that fallback previously bypassed alpha-mask
  // repair entirely (repairConditionCoordinates only ever saw the earlier,
  // absent LLM value). The final stored position must still land on a
  // non-transparent pixel, exactly like a model-proposed coordinate does.
  it('repairs the hash-jitter fallback position onto the mask when the anatomy call produced no coordinate', async () => {
    const db = await openIndexedDb(`maigenki-fallback-coordinate-repair-${Date.now()}`)
    // 3x3 mask, only the top-left pixel (0%, 0%) is opaque — far from where
    // defaultConditionPosition's system-anchor-based jitter would land, so
    // this only passes if the fallback path is actually repaired.
    const mask: AlphaMask = { width: 3, height: 3, alpha: new Uint8Array([255, 0, 0, 0, 0, 0, 0, 0, 0]) }

    const { conditionCount } = await persistEnrichmentResult(db, {
      filename: 'report.pdf',
      pageCount: 1,
      extractionMethod: 'text',
      conditions: [{
        id: 'no-llm-coordinate', name_medical: 'Migraine', name_common: null, system: 'nervous',
        organ: 'brain', anatomical_location: 'head', status: 'documented', severity: null, certainty: null,
        date_onset: null, date_diagnosed: '2022-06-01', evidence: null,
        // No cx/cy at all — forces putIndexedCondition's defaultConditionPosition fallback.
      }],
      measurements: [],
      coordinateMask: mask,
    })
    expect(conditionCount).toBe(1)

    const dots = await getIndexedConditionDots(db)
    const dot = dots.find((d) => d.conditionId === 'no-llm-coordinate')
    expect(dot).toBeDefined()
    expect(dot).toEqual(expect.objectContaining({ cx_percent: 0, cy_percent: 0 }))

    db.close()
  })
})
