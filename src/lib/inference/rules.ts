import type { ConditionInput, MeasurementInput } from '../llm/enrich'

// ── Name matching helpers ─────────────────────────────────────────────────────

function nameIncludes(m: MeasurementInput, ...terms: string[]): boolean {
  const n = m.name.toLowerCase()
  return terms.some((t) => n.includes(t.toLowerCase()))
}

// Convert mmol/L glucose to mg/dL
function toMgDl(m: MeasurementInput): number {
  const unit = m.unit.toLowerCase()
  if (unit === 'mmol/l') return m.value_numeric * 18.018
  return m.value_numeric
}

// ── Deduplication ─────────────────────────────────────────────────────────────
// Terms that indicate a condition class is already documented.
// Checked against existing condition name_medical (case-insensitive).

const DEDUP_TERMS: Record<string, string[]> = {
  hypertension: ['hypertension', 'high blood pressure'],
  diabetes:     ['diabetes', 'diabetic', 'hyperglycaemia', 'hyperglycemia'],
  prediabetes:  ['pre-diabet', 'prediabet', 'impaired fasting'],
  hyperlipid:   ['hyperlipid', 'dyslipid', 'hypercholesterol'],
  anaemia:      ['anaemia', 'anemia'],
  ckd:          ['chronic kidney', 'ckd', 'renal failure', 'renal insufficiency'],
}

function alreadyDocumented(key: keyof typeof DEDUP_TERMS, existing: ConditionInput[]): boolean {
  const terms = DEDUP_TERMS[key]
  return existing.some((c) =>
    terms.some((t) => c.name_medical.toLowerCase().includes(t)),
  )
}

// ── Condition builder ─────────────────────────────────────────────────────────

function inferred(
  name_medical: string,
  name_common: string,
  system: string,
  organ: string,
  evidence: string,
): ConditionInput {
  return {
    name_medical,
    name_common,
    system,
    organ,
    anatomical_location: null,
    status: 'inferred',
    severity: null,
    certainty: 'suspected',
    date_onset: null,
    date_diagnosed: null,
    evidence,
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export function applyInferenceRules(
  measurements: MeasurementInput[],
  existingConditions: ConditionInput[],
  sex?: 'male' | 'female',
): ConditionInput[] {
  const results: ConditionInput[] = []
  let hypertensionAdded = false

  for (const m of measurements) {
    // ── HbA1c ────────────────────────────────────────────────────────────────
    if (nameIncludes(m, 'hba1c', 'hemoglobin a1c', 'haemoglobin a1c', 'glycated hemoglobin', 'glycated haemoglobin', 'a1c')) {
      if (m.value_numeric >= 6.5) {
        if (!alreadyDocumented('diabetes', existingConditions)) {
          results.push(inferred(
            'Type 2 diabetes mellitus',
            'Type 2 diabetes',
            'endo',
            'pancreas',
            `HbA1c ${m.value_numeric}${m.unit} (≥6.5% threshold)`,
          ))
        }
      } else if (m.value_numeric >= 5.7) {
        if (!alreadyDocumented('prediabetes', existingConditions) && !alreadyDocumented('diabetes', existingConditions)) {
          results.push(inferred(
            'Pre-diabetes',
            'Pre-diabetes',
            'endo',
            'pancreas',
            `HbA1c ${m.value_numeric}${m.unit} (5.7–6.4% range)`,
          ))
        }
      }
    }

    // ── Fasting glucose ───────────────────────────────────────────────────────
    else if (nameIncludes(m, 'fasting glucose', 'fasting blood glucose', 'fbg', 'fpg', 'fasting plasma glucose')) {
      const mgdl = toMgDl(m)
      if (mgdl >= 126) {
        if (!alreadyDocumented('diabetes', existingConditions)) {
          results.push(inferred(
            'Type 2 diabetes mellitus',
            'Type 2 diabetes',
            'endo',
            'pancreas',
            `Fasting glucose ${m.value_numeric} ${m.unit} (≥126 mg/dL threshold)`,
          ))
        }
      } else if (mgdl >= 100) {
        if (!alreadyDocumented('prediabetes', existingConditions) && !alreadyDocumented('diabetes', existingConditions)) {
          results.push(inferred(
            'Pre-diabetes',
            'Pre-diabetes',
            'endo',
            'pancreas',
            `Fasting glucose ${m.value_numeric} ${m.unit} (100–125 mg/dL range)`,
          ))
        }
      }
    }

    // ── Blood pressure ────────────────────────────────────────────────────────
    else if (nameIncludes(m, 'systolic') && m.value_numeric >= 140) {
      if (!hypertensionAdded && !alreadyDocumented('hypertension', existingConditions)) {
        results.push(inferred(
          'Hypertension',
          'High blood pressure',
          'cardio',
          'heart',
          `Systolic BP ${m.value_numeric} ${m.unit} (≥140 mmHg threshold)`,
        ))
        hypertensionAdded = true
      }
    } else if (nameIncludes(m, 'diastolic') && m.value_numeric >= 90) {
      if (!hypertensionAdded && !alreadyDocumented('hypertension', existingConditions)) {
        results.push(inferred(
          'Hypertension',
          'High blood pressure',
          'cardio',
          'heart',
          `Diastolic BP ${m.value_numeric} ${m.unit} (≥90 mmHg threshold)`,
        ))
        hypertensionAdded = true
      }
    }

    // ── LDL cholesterol ───────────────────────────────────────────────────────
    else if (nameIncludes(m, 'ldl') && m.value_numeric >= 160) {
      if (!alreadyDocumented('hyperlipid', existingConditions)) {
        results.push(inferred(
          'Hyperlipidaemia',
          'High cholesterol',
          'cardio',
          'blood vessels',
          `LDL ${m.value_numeric} ${m.unit} (≥160 mg/dL threshold)`,
        ))
      }
    }

    // ── Total cholesterol ─────────────────────────────────────────────────────
    else if (nameIncludes(m, 'total cholesterol') && m.value_numeric >= 240) {
      if (!alreadyDocumented('hyperlipid', existingConditions)) {
        results.push(inferred(
          'Hyperlipidaemia',
          'High cholesterol',
          'cardio',
          'blood vessels',
          `Total cholesterol ${m.value_numeric} ${m.unit} (≥240 mg/dL threshold)`,
        ))
      }
    }

    // ── Haemoglobin / Anaemia ─────────────────────────────────────────────────
    // Exclude HbA1c matches by requiring the name not to contain 'a1c' or 'glycat'
    else if (
      nameIncludes(m, 'hemoglobin', 'haemoglobin', 'hgb', 'hb') &&
      !nameIncludes(m, 'a1c', 'glycat')
    ) {
      const threshold = sex === 'male' ? 13 : 12
      if (m.value_numeric < threshold) {
        if (!alreadyDocumented('anaemia', existingConditions)) {
          results.push(inferred(
            'Anaemia',
            'Anaemia',
            'lymph',
            'blood',
            `Hemoglobin ${m.value_numeric} ${m.unit} (below ${threshold} g/dL threshold)`,
          ))
        }
      }
    }

    // ── eGFR / CKD ────────────────────────────────────────────────────────────
    else if (nameIncludes(m, 'egfr', 'gfr') && m.value_numeric < 60) {
      if (!alreadyDocumented('ckd', existingConditions)) {
        results.push(inferred(
          'Chronic kidney disease',
          'Chronic kidney disease',
          'renal',
          'kidney',
          `eGFR ${m.value_numeric} ${m.unit} (<60 mL/min/1.73m² threshold)`,
        ))
      }
    }
  }

  return results
}
