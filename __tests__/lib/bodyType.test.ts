import { inferBodyType } from '@/lib/inference/bodyType'
import type { DesignCondition } from '@/model/conditions'

// Minimal condition factory — inferBodyType only reads id/label/medName.
function cond(id: string, label: string, medName = ''): DesignCondition {
  return { id, label, medName } as unknown as DesignCondition
}

describe('inferBodyType', () => {
  it('returns "male" on a male-specific diagnosis', () => {
    expect(inferBodyType([cond('bph', 'Benign prostatic hyperplasia', 'Prostate enlargement')])).toBe('male')
    expect(inferBodyType([cond('x', 'Testicular cyst')])).toBe('male')
  })

  it('returns "female" on a female-specific diagnosis', () => {
    expect(inferBodyType([cond('pcos', 'PCOS')])).toBe('female')
    expect(inferBodyType([cond('y', 'Uterine fibroid', 'Endometrial biopsy')])).toBe('female')
  })

  it('returns "unknown" when there is no gendered signal', () => {
    expect(inferBodyType([cond('htn', 'Hypertension'), cond('ecz', 'Eczema')])).toBe('unknown')
  })

  it('returns "unknown" for an empty list', () => {
    expect(inferBodyType([])).toBe('unknown')
  })

  it('prefers the first-matched male signal when both appear (male regex first)', () => {
    // Mixed signals: the male branch is evaluated first, so it wins.
    expect(inferBodyType([cond('bph', 'BPH'), cond('pcos', 'PCOS')])).toBe('male')
  })
})
