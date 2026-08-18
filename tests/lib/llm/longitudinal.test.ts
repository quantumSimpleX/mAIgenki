import { earliestDate, mergeLongitudinalConditions, repairPixelCoordinate, yearFrac } from '@/lib/llm/longitudinal'
import { isValidFacilityInput, parseLongitudinalResponse, type ConditionInput } from '@/lib/llm/enrich'

const condition = (overrides: Partial<ConditionInput> = {}): ConditionInput => ({
  name_medical: 'Hypertension', name_common: null, system: 'cardiovascular', organ: 'heart', anatomical_location: null,
  status: 'documented', severity: null, certainty: null, date_onset: null, date_diagnosed: null, evidence: null,
  ...overrides,
})

describe('longitudinal extraction utilities', () => {
  it('selects the earliest valid diagnosis date and computes an analytical year fraction', () => {
    expect(earliestDate(['2024-01-02', null, '2020-03-01'])).toBe('2020-03-01')
    expect(yearFrac('2020-07-01')).toBeGreaterThan(2020.49)
    expect(yearFrac('2020-07-01')).toBeLessThan(2020.51)
  })

  it('merges repeated mentions without inventing missing fields', () => {
    const merged = mergeLongitudinalConditions([
      condition({ date_diagnosed: '2022-01-01', evidence: 'A' }),
      condition({ date_diagnosed: '2020-01-01', evidence: 'B', inferred_from_structure: ['date_diagnosed'] }),
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0].date_diagnosed).toBe('2020-01-01')
    expect(merged[0].evidence).toContain('A')
    expect(merged[0].evidence).toContain('B')
  })

  it('repairs transparent coordinates to nearest opaque pixel and reports empty masks unresolved', () => {
    const mask = { width: 3, height: 3, alpha: new Uint8Array([0, 0, 0, 0, 0, 255, 0, 0, 0]) }
    expect(repairPixelCoordinate(mask, 0, 0)).toEqual({ cx: 100, cy: 50 })
    expect(repairPixelCoordinate({ ...mask, alpha: new Uint8Array(9) }, 50, 50)).toBeNull()
  })

  // Defect 4 issue 2 regression: within a single search ring, the geometrically
  // nearest opaque pixel must win, not whichever one raster (row-major) order
  // happens to hit first. Both opaque pixels below sit at Chebyshev radius 2
  // from the origin (2,2) — same ring — but (0,0) is a far corner (Euclidean
  // ~2.83) while (2,4) is axis-aligned and nearer (Euclidean 2). The pre-fix
  // algorithm scanned the ring in raster order and returned whichever it hit
  // first, regardless of distance.
  it('picks the Euclidean-nearest opaque pixel within a ring, not the first found in raster (scan-order) order', () => {
    const width = 5
    const height = 5
    const alpha = new Uint8Array(width * height)
    alpha[0 * width + 0] = 255 // (x=0, y=0): farther euclidean (~2.83), hit first by raster order
    alpha[4 * width + 2] = 255 // (x=2, y=4): nearer euclidean (2), hit later by raster order
    const mask = { width, height, alpha }

    // Reference: the pre-fix behavior — first opaque pixel hit while scanning
    // each expanding square in raster (row-major) order, not the nearest one.
    const scanOrderFirstFound = (() => {
      const originX = 2
      const originY = 2
      for (let radius = 1; radius <= 4; radius += 1) {
        for (let y = Math.max(0, originY - radius); y <= Math.min(height - 1, originY + radius); y += 1) {
          for (let x = Math.max(0, originX - radius); x <= Math.min(width - 1, originX + radius); x += 1) {
            if (alpha[y * width + x] > 0) return { cx: (x / (width - 1)) * 100, cy: (y / (height - 1)) * 100 }
          }
        }
      }
      return null
    })()
    expect(scanOrderFirstFound).toEqual({ cx: 0, cy: 0 }) // the farther pixel — the pre-fix bug

    const actualNearest = repairPixelCoordinate(mask, 50, 50) // origin (2,2) is transparent
    expect(actualNearest).toEqual({ cx: 50, cy: 100 }) // the nearer pixel — this fix
  })

  it('clamps out-of-range coordinates and handles one-pixel masks', () => {
    expect(repairPixelCoordinate({ width: 2, height: 2, alpha: new Uint8Array([0, 0, 0, 255]) }, 150, 150)).toEqual({ cx: 100, cy: 100 })
    expect(repairPixelCoordinate({ width: 1, height: 1, alpha: new Uint8Array([255]) }, 50, 50)).toEqual({ cx: 50, cy: 50 })
  })

  it('inherits report-scoped provider/facility and preserves source attribution', () => {
    const result = parseLongitudinalResponse(JSON.stringify({
      schema_version: 1,
      conditions: [condition({ date_diagnosed: '2020-01-01' })],
      measurements: [],
      report_context: {
        providers: [{ name: 'Dr Lee', specialty: null, email: null, phone: null, evidence: 'header' }],
        facilities: [{ name: 'General Hospital', address: null, city: 'Seattle', state: 'WA', country: 'US' }],
      },
    }))
    expect(result?.providers).toHaveLength(1)
    expect(result?.conditions[0].provider?.name).toBe('Dr Lee')
    expect(result?.conditions[0].provenance).toContain('provider:report_context')
    expect(result?.conditions[0].care_events?.[0].facility?.name).toBe('General Hospital')
  })

  it('rejects malformed facilities rather than persisting invented structure', () => {
    expect(isValidFacilityInput({ name: 'Clinic', city: 42 })).toBe(false)
  })

  it('retains facility-only report context without requiring a provider', () => {
    const result = parseLongitudinalResponse(JSON.stringify({
      schema_version: 1,
      organization: 'chronological',
      report_context: { providers: [], facilities: [{ name: 'Community Clinic', address: null, city: 'Seattle', state: 'WA', country: 'US' }] },
      conditions: [{ ...condition({ date_diagnosed: null }) }],
      measurements: [],
    }))
    expect(result?.facilities?.[0].name).toBe('Community Clinic')
    expect(result?.conditions[0].care_events ?? []).toHaveLength(0)
  })

  it('retains report facility when condition supplies an explicit provider', () => {
    const result = parseLongitudinalResponse(JSON.stringify({
      schema_version: 1,
      conditions: [condition({
        date_diagnosed: '2021-04-01',
        provider: { name: 'Dr Explicit', specialty: null, email: null, phone: null, evidence: null },
      })],
      measurements: [],
      report_context: {
        providers: [],
        facilities: [{ name: 'Report Clinic', address: '1 Main', city: 'Seattle', state: 'WA', country: 'US' }],
      },
    }))

    expect(result?.conditions[0].provider?.name).toBe('Dr Explicit')
    expect(result?.conditions[0].care_events?.[0].facility?.name).toBe('Report Clinic')
    expect(result?.conditions[0].provenance).toContain('facility:report_context')
    expect(result?.facilities?.[0].name).toBe('Report Clinic')
  })
})
