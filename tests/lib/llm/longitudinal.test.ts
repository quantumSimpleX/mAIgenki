import { earliestDate, mergeLongitudinalConditions, repairPixelCoordinate, yearFrac } from '@/lib/llm/longitudinal'
import type { ConditionInput } from '@/lib/llm/enrich'

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
})
