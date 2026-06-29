import { applyInferenceRules } from '@/lib/inference/rules'
import type { ConditionInput, MeasurementInput } from '@/lib/llm/enrich'

function m(name: string, value_numeric: number, unit = ''): MeasurementInput {
  return { name, value_numeric, unit, reference_low: null, reference_high: null, flag: null, date: null }
}

describe('applyInferenceRules', () => {
  it('HbA1c ≥ 6.5 infers diabetes', () => {
    const out = applyInferenceRules([m('HbA1c', 6.8, '%')], [])
    expect(out.some((c) => c.name_medical.toLowerCase().includes('diabetes'))).toBe(true)
  })

  it('HbA1c 5.7–6.4 infers pre-diabetes, not diabetes', () => {
    const out = applyInferenceRules([m('HbA1c', 5.9, '%')], [])
    expect(out.some((c) => c.name_medical.toLowerCase().includes('pre-diabetes'))).toBe(true)
    expect(out.some((c) => c.name_medical === 'Type 2 diabetes mellitus')).toBe(false)
  })

  it('HbA1c < 5.7 infers nothing', () => {
    expect(applyInferenceRules([m('HbA1c', 5.2, '%')], [])).toEqual([])
  })

  it('systolic ≥ 140 infers hypertension', () => {
    const out = applyInferenceRules([m('Systolic BP', 145, 'mmHg'), m('Diastolic BP', 92, 'mmHg')], [])
    expect(out.some((c) => c.name_medical === 'Hypertension')).toBe(true)
  })

  it('does not duplicate already-documented hypertension', () => {
    const existing: ConditionInput[] = [{
      name_medical: 'Essential hypertension', name_common: 'High blood pressure', system: 'cardiovascular',
      organ: 'heart', anatomical_location: null, status: 'documented', severity: null,
      certainty: 'confirmed', date_onset: null, date_diagnosed: null, evidence: null,
    }]
    const out = applyInferenceRules([m('Systolic BP', 150, 'mmHg')], existing)
    expect(out.some((c) => c.name_medical === 'Hypertension')).toBe(false)
  })

  it('no measurements infers nothing', () => {
    expect(applyInferenceRules([], [])).toEqual([])
  })
})
