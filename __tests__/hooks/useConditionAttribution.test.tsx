// P10-05/P10-06: real (non-demo) conditions must surface every attributed
// provider/facility/care event, not just one — this exercises the actual
// IndexedDB persistence path (persistEnrichmentResult) plus the new
// condition-scoped read hook bodymap.tsx's condition detail sheet uses, via
// fake-indexeddb rather than a full bodymap.tsx render (see
// __tests__/screens/bodymap.test.tsx's note on that render's jest-heap cost).

import 'fake-indexeddb/auto'
import { renderHook, waitFor } from '@testing-library/react-native'

jest.mock('@/lib/db/indexedDbProvider', () => ({ useOptionalIndexedDb: jest.fn() }))

import { useOptionalIndexedDb } from '@/lib/db/indexedDbProvider'
import { useConditionAttribution } from '@/hooks/useConditions'
import { openIndexedDb, persistEnrichmentResult } from '@/lib/db/indexedDb'

describe('useConditionAttribution', () => {
  it('surfaces every provider/facility/care-event persisted for a real condition, not just one', async () => {
    const db = await openIndexedDb(`maigenki-attribution-${Date.now()}`)
    const providerA = { name: 'Dr. Kim', specialty: 'Cardiology', email: null, phone: null, evidence: null }
    const providerB = { name: 'Dr. Patel', specialty: null, email: null, phone: null, evidence: null }
    const facilityA = { name: 'City Hospital', address: null, city: 'Seattle', state: 'WA', country: 'US' }

    const { recordId } = await persistEnrichmentResult(db, {
      filename: 'report.pdf',
      pageCount: 1,
      extractionMethod: 'text',
      conditions: [{
        id: 'multi-provider-condition',
        name_medical: 'Essential hypertension',
        name_common: 'High blood pressure',
        system: 'cardiovascular',
        organ: null,
        anatomical_location: null,
        status: 'documented',
        severity: null,
        certainty: null,
        date_onset: null,
        date_diagnosed: '2022-06-01',
        evidence: null,
        provider: providerA,
        providers: [providerA, providerB],
        facilities: [facilityA],
        care_events: [{ event_type: 'diagnosed', date: '2022-06-01', provider: providerB, facility: facilityA, evidence: null }],
      }],
      measurements: [],
    })

    ;(useOptionalIndexedDb as jest.Mock).mockReturnValue(db)

    const { result } = await renderHook(() => useConditionAttribution('multi-provider-condition', recordId))

    await waitFor(() => expect(result.current.providers.length).toBeGreaterThanOrEqual(2))
    expect(result.current.providers.map((p) => p.name).sort()).toEqual(['Dr. Kim', 'Dr. Patel'])
    expect(result.current.facilities.map((f) => f.name)).toContain('City Hospital')
    expect(result.current.careEvents).toHaveLength(1)
    expect(result.current.careEvents[0].provider_name).toBe('Dr. Patel')

    db.close()
  })

  it('returns empty attribution (no crash) for a demo condition with no provider/facility rows', async () => {
    const db = await openIndexedDb(`maigenki-attribution-demo-${Date.now()}`)
    ;(useOptionalIndexedDb as jest.Mock).mockReturnValue(db)

    const { result } = await renderHook(() => useConditionAttribution('htn', 'demo-record'))

    expect(result.current).toEqual({ providers: [], facilities: [], careEvents: [] })
    db.close()
  })
})
