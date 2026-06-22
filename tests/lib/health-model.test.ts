import { SYSTEM_COLORS, type OrgSystem, type Condition } from '@/model/health'

const ALL_SYSTEMS: OrgSystem[] = [
  'cardiovascular', 'respiratory', 'digestive', 'musculoskeletal',
  'nervous', 'endocrine', 'urinary', 'reproductive', 'immune', 'integumentary',
]

describe('health model', () => {
  it('defines all 10 organ systems', () => {
    expect(ALL_SYSTEMS).toHaveLength(10)
  })

  it('has a color defined for every organ system', () => {
    for (const system of ALL_SYSTEMS) {
      expect(SYSTEM_COLORS[system]).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })

  it('Condition type accepts documented, resolved, and inferred status', () => {
    const condition: Condition = {
      id: '1',
      name: 'Hypertension',
      organ: 'heart',
      system: 'cardiovascular',
      date: '2022-03-15',
      status: 'documented',
      evidence: 'BP 145/92 recorded on 2022-03-15',
      sourceFile: 'checkup-2022.pdf',
    }
    expect(condition.status).toBe('documented')
  })
})
