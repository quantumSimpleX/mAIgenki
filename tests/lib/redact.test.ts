import { redactPII } from '@/lib/privacy/redact'

// ── Patient name ──────────────────────────────────────────────────────────────

describe('redactPII — patient name', () => {
  it('redacts EN "Patient: <name>"', () => {
    expect(redactPII('Patient: John Smith\nDiagnosis: Hypertension')).toContain('[PATIENT NAME]')
    expect(redactPII('Patient: John Smith\nDiagnosis: Hypertension')).toContain('Hypertension')
  })

  it('redacts EN "Name: <name>"', () => {
    expect(redactPII('Name: Jane Doe\nBP: 145/92')).toContain('[PATIENT NAME]')
    expect(redactPII('Name: Jane Doe\nBP: 145/92')).toContain('145/92')
  })

  it('redacts zh-TW "姓名：<name>"', () => {
    const result = redactPII('姓名：王大明\n診斷：高血壓')
    expect(result).toContain('[PATIENT NAME]')
    expect(result).toContain('高血壓')
  })

  it('redacts JA "氏名：<name>"', () => {
    const result = redactPII('氏名：山田太郎\n診断：糖尿病')
    expect(result).toContain('[PATIENT NAME]')
    expect(result).toContain('糖尿病')
  })
})

// ── Date of birth ─────────────────────────────────────────────────────────────

describe('redactPII — date of birth', () => {
  it('redacts EN "DOB: <date>"', () => {
    const result = redactPII('DOB: 1958-03-22\nDiagnosis: Type 2 Diabetes')
    expect(result).toContain('[DATE OF BIRTH]')
    expect(result).toContain('Type 2 Diabetes')
  })

  it('redacts EN "Date of Birth: <date>"', () => {
    expect(redactPII('Date of Birth: 03/22/1958')).toContain('[DATE OF BIRTH]')
  })

  it('redacts zh-TW "出生日期：<date>"', () => {
    const result = redactPII('出生日期：1958年3月22日\nHbA1c: 7.2%')
    expect(result).toContain('[DATE OF BIRTH]')
    expect(result).toContain('HbA1c: 7.2%')
  })

  it('redacts JA "生年月日：<date>"', () => {
    const result = redactPII('生年月日：1958年3月22日\nHbA1c: 7.2%')
    expect(result).toContain('[DATE OF BIRTH]')
    expect(result).toContain('HbA1c: 7.2%')
  })

  it('does NOT redact diagnosis/lab dates that are not labeled as DOB', () => {
    const result = redactPII('Diagnosis date: 2022-06-01\nEGFR measured: 2023-01-15')
    expect(result).not.toContain('[DATE OF BIRTH]')
    expect(result).toContain('2022-06-01')
  })
})

// ── MRN ───────────────────────────────────────────────────────────────────────

describe('redactPII — MRN', () => {
  it('redacts "MRN: <value>"', () => {
    const result = redactPII('MRN: 123456\nCondition: Hypertension')
    expect(result).toContain('[MRN]')
    expect(result).toContain('Hypertension')
  })

  it('redacts "Medical Record Number: <value>"', () => {
    expect(redactPII('Medical Record Number: ABC-789')).toContain('[MRN]')
  })
})

// ── Phone ─────────────────────────────────────────────────────────────────────

describe('redactPII — phone', () => {
  it('redacts EN "Phone: <number>"', () => {
    const result = redactPII('Phone: (617) 555-1234\nLDL: 165 mg/dL')
    expect(result).toContain('[PHONE]')
    expect(result).toContain('165 mg/dL')
  })

  it('redacts zh-TW "電話：<number>"', () => {
    expect(redactPII('電話：02-1234-5678')).toContain('[PHONE]')
  })

  it('redacts JA "電話番号：<number>"', () => {
    expect(redactPII('電話番号：03-1234-5678')).toContain('[PHONE]')
  })
})

// ── Email ─────────────────────────────────────────────────────────────────────

describe('redactPII — email', () => {
  it('redacts standalone email addresses', () => {
    const result = redactPII('Contact: john.doe@hospital.com\nBP: 130/85')
    expect(result).toContain('[EMAIL]')
    expect(result).toContain('130/85')
  })

  it('redacts email in any context without requiring a label', () => {
    expect(redactPII('Please email results to patient@gmail.com')).toContain('[EMAIL]')
  })
})

// ── SSN ───────────────────────────────────────────────────────────────────────

describe('redactPII — SSN', () => {
  it('redacts US SSN pattern XXX-XX-XXXX', () => {
    const result = redactPII('SSN: 123-45-6789\nHbA1c: 6.8%')
    expect(result).toContain('[SSN]')
    expect(result).toContain('HbA1c: 6.8%')
  })

  it('redacts standalone SSN pattern', () => {
    expect(redactPII('ID: 987-65-4321')).toContain('[SSN]')
  })
})

// ── National ID ───────────────────────────────────────────────────────────────

describe('redactPII — national ID', () => {
  it('redacts zh-TW labeled national ID "身份證字號：A123456789"', () => {
    const result = redactPII('身份證字號：A123456789\n血壓：148/96')
    expect(result).toContain('[NATIONAL ID]')
    expect(result).toContain('148/96')
  })

  it('redacts JA labeled My Number "マイナンバー：123456789012"', () => {
    const result = redactPII('マイナンバー：123456789012\n診断：高血圧')
    expect(result).toContain('[NATIONAL ID]')
    expect(result).toContain('高血圧')
  })
})

// ── Full-document name sweep ──────────────────────────────────────────────────

describe('redactPII — full-document name sweep', () => {
  it('redacts all occurrences of the patient name found in the labeled field', () => {
    const text = [
      'Patient: John Smith',
      'John Smith was seen on 2022-06-01.',
      'BP for John Smith: 145/92 mmHg.',
      'Diagnosis: Hypertension',
    ].join('\n')
    const result = redactPII(text)
    expect(result).not.toContain('John Smith')
    expect(result).toContain('Hypertension')
    expect(result).toContain('145/92 mmHg')
  })

  it('redacts name occurrences in zh-TW documents', () => {
    const text = [
      '姓名：王大明',
      '王大明於2022年6月1日就診。',
      '診斷：高血壓',
    ].join('\n')
    const result = redactPII(text)
    expect(result).not.toContain('王大明')
    expect(result).toContain('高血壓')
  })

  it('redacts name occurrences in JA documents', () => {
    const text = [
      '氏名：山田太郎',
      '山田太郎は2022年6月1日に受診しました。',
      '診断：高血圧',
    ].join('\n')
    const result = redactPII(text)
    expect(result).not.toContain('山田太郎')
    expect(result).toContain('高血圧')
  })

  it('does not redact unrelated text that happens to match short name fragments', () => {
    // "Li" extracted as name would be too short and cause false positives
    // Only names with 2+ characters (EN) or 2+ CJK chars are swept
    const text = 'Patient: Li\nLipid panel results: LDL 165 mg/dL'
    const result = redactPII(text)
    // "Li" at the start of "Lipid" and "LDL" should not be affected
    expect(result).toContain('Lipid panel')
    expect(result).toContain('LDL')
  })
})

// ── Medical content preserved ─────────────────────────────────────────────────

describe('redactPII — medical content preserved', () => {
  it('preserves lab values and conditions in a realistic record', () => {
    const report = [
      'Patient: John Smith',
      'DOB: 1965-07-14',
      'MRN: 987654',
      'Diagnosis: Essential Hypertension (I10)',
      'Blood Pressure: 145/92 mmHg',
      'HbA1c: 7.2%',
      'LDL Cholesterol: 172 mg/dL',
      'eGFR: 58 mL/min/1.73m²',
      'Date diagnosed: 2020-03-15',
    ].join('\n')

    const result = redactPII(report)
    expect(result).toContain('[PATIENT NAME]')
    expect(result).toContain('[DATE OF BIRTH]')
    expect(result).toContain('[MRN]')
    expect(result).toContain('Hypertension')
    expect(result).toContain('145/92 mmHg')
    expect(result).toContain('HbA1c: 7.2%')
    expect(result).toContain('172 mg/dL')
    expect(result).toContain('eGFR: 58')
    expect(result).toContain('2020-03-15')
  })
})
