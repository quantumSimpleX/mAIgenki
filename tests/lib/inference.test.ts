import { applyInferenceRules } from '@/lib/inference/rules'
import type { MeasurementInput, ConditionInput } from '@/lib/llm/enrich'

// ── Helpers ───────────────────────────────────────────────────────────────────

function m(name: string, value: number, unit: string): MeasurementInput {
  return { name, value_numeric: value, unit, reference_low: null, reference_high: null, flag: null, date: null }
}

function hasCondition(results: ConditionInput[], termInName: string): boolean {
  return results.some((c) => c.name_medical.toLowerCase().includes(termInName.toLowerCase()))
}

// ── HbA1c rules ──────────────────────────────────────────────────────────────

describe('applyInferenceRules — HbA1c', () => {
  it('infers Type 2 Diabetes when HbA1c ≥ 6.5%', () => {
    const results = applyInferenceRules([m('HbA1c', 6.5, '%')], [])
    expect(hasCondition(results, 'diabetes')).toBe(true)
  })

  it('infers Pre-diabetes when HbA1c is 5.7–6.4%', () => {
    const results = applyInferenceRules([m('HbA1c', 6.0, '%')], [])
    expect(hasCondition(results, 'pre-diabet')).toBe(true)
  })

  it('does not infer anything when HbA1c < 5.7%', () => {
    const results = applyInferenceRules([m('HbA1c', 5.5, '%')], [])
    expect(results).toHaveLength(0)
  })

  it('matches case-insensitive HbA1c name variations', () => {
    expect(applyInferenceRules([m('Hemoglobin A1c', 7.0, '%')], [])).toHaveLength(1)
    expect(applyInferenceRules([m('GLYCATED HEMOGLOBIN', 7.0, '%')], [])).toHaveLength(1)
  })
})

// ── Fasting glucose rules ─────────────────────────────────────────────────────

describe('applyInferenceRules — fasting glucose', () => {
  it('infers Type 2 Diabetes when fasting glucose ≥ 126 mg/dL', () => {
    const results = applyInferenceRules([m('Fasting Glucose', 126, 'mg/dL')], [])
    expect(hasCondition(results, 'diabetes')).toBe(true)
  })

  it('infers Pre-diabetes when fasting glucose is 100–125 mg/dL', () => {
    const results = applyInferenceRules([m('Fasting Blood Glucose', 110, 'mg/dL')], [])
    expect(hasCondition(results, 'pre-diabet')).toBe(true)
  })

  it('converts mmol/L: ≥ 7.0 → Type 2 Diabetes', () => {
    const results = applyInferenceRules([m('Fasting Glucose', 7.0, 'mmol/L')], [])
    expect(hasCondition(results, 'diabetes')).toBe(true)
  })

  it('converts mmol/L: 5.6–6.9 → Pre-diabetes', () => {
    const results = applyInferenceRules([m('Fasting Glucose', 6.0, 'mmol/L')], [])
    expect(hasCondition(results, 'pre-diabet')).toBe(true)
  })
})

// ── Blood pressure rules ──────────────────────────────────────────────────────

describe('applyInferenceRules — blood pressure', () => {
  it('infers Hypertension when systolic ≥ 140', () => {
    const results = applyInferenceRules([m('Blood Pressure Systolic', 140, 'mmHg')], [])
    expect(hasCondition(results, 'hypertension')).toBe(true)
  })

  it('infers Hypertension when diastolic ≥ 90', () => {
    const results = applyInferenceRules([m('Blood Pressure Diastolic', 90, 'mmHg')], [])
    expect(hasCondition(results, 'hypertension')).toBe(true)
  })

  it('does not infer Hypertension when both values are normal', () => {
    const results = applyInferenceRules([
      m('Blood Pressure Systolic', 118, 'mmHg'),
      m('Blood Pressure Diastolic', 78, 'mmHg'),
    ], [])
    expect(hasCondition(results, 'hypertension')).toBe(false)
  })

  it('deduplicates: only one Hypertension condition when both systolic and diastolic are elevated', () => {
    const results = applyInferenceRules([
      m('Blood Pressure Systolic', 150, 'mmHg'),
      m('Blood Pressure Diastolic', 95, 'mmHg'),
    ], [])
    expect(results.filter((c) => c.name_medical.toLowerCase().includes('hypertension'))).toHaveLength(1)
  })
})

// ── Lipid rules ───────────────────────────────────────────────────────────────

describe('applyInferenceRules — lipids', () => {
  it('infers Hyperlipidaemia when LDL ≥ 160 mg/dL', () => {
    const results = applyInferenceRules([m('LDL Cholesterol', 160, 'mg/dL')], [])
    expect(hasCondition(results, 'hyperlipid')).toBe(true)
  })

  it('infers Hyperlipidaemia when total cholesterol ≥ 240 mg/dL', () => {
    const results = applyInferenceRules([m('Total Cholesterol', 240, 'mg/dL')], [])
    expect(hasCondition(results, 'hyperlipid')).toBe(true)
  })

  it('does not infer when LDL < 160 and total cholesterol < 240', () => {
    const results = applyInferenceRules([
      m('LDL Cholesterol', 130, 'mg/dL'),
      m('Total Cholesterol', 200, 'mg/dL'),
    ], [])
    expect(hasCondition(results, 'hyperlipid')).toBe(false)
  })
})

// ── Haemoglobin / anaemia rules ───────────────────────────────────────────────

describe('applyInferenceRules — haemoglobin', () => {
  it('infers Anaemia when Hgb < 13 g/dL (male)', () => {
    const results = applyInferenceRules([m('Hemoglobin', 12.5, 'g/dL')], [], 'male')
    expect(hasCondition(results, 'anaemia')).toBe(true)
  })

  it('infers Anaemia when Hgb < 12 g/dL (female)', () => {
    const results = applyInferenceRules([m('Hemoglobin', 11.5, 'g/dL')], [], 'female')
    expect(hasCondition(results, 'anaemia')).toBe(true)
  })

  it('does not infer Anaemia when Hgb is normal for male', () => {
    const results = applyInferenceRules([m('Hemoglobin', 14.0, 'g/dL')], [], 'male')
    expect(hasCondition(results, 'anaemia')).toBe(false)
  })

  it('uses conservative threshold (< 12) when sex is unknown', () => {
    const elevated = applyInferenceRules([m('Hemoglobin', 11.0, 'g/dL')], [])
    expect(hasCondition(elevated, 'anaemia')).toBe(true)
    const normal = applyInferenceRules([m('Hemoglobin', 12.5, 'g/dL')], [])
    expect(hasCondition(normal, 'anaemia')).toBe(false)
  })

  it('matches Hgb and Hb abbreviations', () => {
    expect(applyInferenceRules([m('Hgb', 11.0, 'g/dL')], [])).toHaveLength(1)
    expect(applyInferenceRules([m('Hb', 11.0, 'g/dL')], [])).toHaveLength(1)
  })
})

// ── eGFR / CKD rules ─────────────────────────────────────────────────────────

describe('applyInferenceRules — eGFR', () => {
  it('infers CKD when eGFR < 60', () => {
    const results = applyInferenceRules([m('eGFR', 55, 'mL/min/1.73m²')], [])
    expect(hasCondition(results, 'kidney')).toBe(true)
  })

  it('does not infer CKD when eGFR ≥ 60', () => {
    const results = applyInferenceRules([m('eGFR', 60, 'mL/min/1.73m²')], [])
    expect(hasCondition(results, 'kidney')).toBe(false)
  })

  it('matches GFR name variation', () => {
    const results = applyInferenceRules([m('Estimated GFR', 45, 'mL/min/1.73m²')], [])
    expect(hasCondition(results, 'kidney')).toBe(true)
  })
})

// ── Deduplication ─────────────────────────────────────────────────────────────

describe('applyInferenceRules — deduplication', () => {
  it('skips inference when condition already documented by LLM', () => {
    const existing: ConditionInput[] = [{
      name_medical: 'Essential hypertension',
      name_common: 'High blood pressure',
      system: 'cardiovascular',
      organ: 'heart',
      anatomical_location: null,
      status: 'documented',
      severity: null,
      certainty: null,
      date_onset: null,
      date_diagnosed: null,
      evidence: null,
    }]
    const results = applyInferenceRules([m('Blood Pressure Systolic', 150, 'mmHg')], existing)
    expect(results).toHaveLength(0)
  })

  it('skips inference when diabetes already documented', () => {
    const existing: ConditionInput[] = [{
      name_medical: 'Type 2 diabetes mellitus',
      name_common: 'Type 2 diabetes',
      system: 'endocrine',
      organ: 'pancreas',
      anatomical_location: null,
      status: 'documented',
      severity: null,
      certainty: null,
      date_onset: null,
      date_diagnosed: null,
      evidence: null,
    }]
    const results = applyInferenceRules([m('HbA1c', 8.0, '%')], existing)
    expect(results).toHaveLength(0)
  })
})

// ── Output shape ──────────────────────────────────────────────────────────────

describe('applyInferenceRules — output shape', () => {
  it('returns conditions with status inferred and certainty suspected', () => {
    const results = applyInferenceRules([m('HbA1c', 7.0, '%')], [])
    expect(results[0].status).toBe('inferred')
    expect(results[0].certainty).toBe('suspected')
  })

  it('returns conditions with required fields populated', () => {
    const results = applyInferenceRules([m('eGFR', 45, 'mL/min/1.73m²')], [])
    expect(results[0].name_medical).toBeTruthy()
    expect(results[0].system).toBeTruthy()
    expect(results[0].evidence).toBeTruthy()
  })

  it('returns empty array when no measurements trigger any rule', () => {
    const results = applyInferenceRules([m('Sodium', 140, 'mEq/L')], [])
    expect(results).toEqual([])
  })

  it('returns empty array for empty measurements', () => {
    expect(applyInferenceRules([], [])).toEqual([])
  })
})
