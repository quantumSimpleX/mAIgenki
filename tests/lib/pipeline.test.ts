import { processHealthRecord, OcrRequiredError } from '@/lib/pipeline'
import type { EnrichmentResult } from '@/lib/llm/enrich'

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/lib/pdf/extract', () => ({
  extractTextFromPDF: jest.fn(),
}))
jest.mock('@/lib/ocr/extract', () => ({
  extractTextFromImage: jest.fn(),
}))
jest.mock('@/lib/llm/enrich', () => ({
  enrichFromText: jest.fn(),
}))
jest.mock('@/lib/inference/rules', () => ({
  applyInferenceRules: jest.fn(),
}))
jest.mock('@/lib/llm/client', () => ({
  getModelChain: jest.fn(),
  DEFAULT_MODELS: ['test-model:free'],
}))
jest.mock('@/lib/db/queries', () => ({
  insertHealthRecord: jest.fn(),
  insertCondition: jest.fn(),
  insertMeasurement: jest.fn(),
  getSetting: jest.fn(),
}))

import { extractTextFromPDF } from '@/lib/pdf/extract'
import { extractTextFromImage } from '@/lib/ocr/extract'
import { enrichFromText } from '@/lib/llm/enrich'
import { applyInferenceRules } from '@/lib/inference/rules'
import { getModelChain } from '@/lib/llm/client'
import { insertHealthRecord, insertCondition, insertMeasurement, getSetting } from '@/lib/db/queries'

const mockExtractPDF   = extractTextFromPDF   as jest.MockedFunction<typeof extractTextFromPDF>
const mockExtractImage = extractTextFromImage  as jest.MockedFunction<typeof extractTextFromImage>
const mockEnrich       = enrichFromText        as jest.MockedFunction<typeof enrichFromText>
const mockRules        = applyInferenceRules   as jest.MockedFunction<typeof applyInferenceRules>
const mockGetChain     = getModelChain         as jest.MockedFunction<typeof getModelChain>
const mockInsertRecord = insertHealthRecord    as jest.MockedFunction<typeof insertHealthRecord>
const mockInsertCond   = insertCondition       as jest.MockedFunction<typeof insertCondition>
const mockInsertMeas   = insertMeasurement     as jest.MockedFunction<typeof insertMeasurement>
const mockGetSetting   = getSetting            as jest.MockedFunction<typeof getSetting>

const mockDb = {} as any

const EMPTY_ENRICHMENT: EnrichmentResult = { conditions: [], measurements: [] }

const SAMPLE_CONDITION = {
  name_medical: 'Essential hypertension',
  name_common: 'High blood pressure',
  system: 'cardiovascular',
  organ: 'heart',
  anatomical_location: null,
  status: 'documented' as const,
  severity: null,
  certainty: null,
  date_onset: null,
  date_diagnosed: '2022-06-01',
  evidence: 'BP 145/92',
}

const SAMPLE_MEASUREMENT = {
  name: 'Blood Pressure Systolic',
  value_numeric: 145,
  unit: 'mmHg',
  reference_low: null,
  reference_high: 120,
  flag: 'high' as const,
  date: '2022-06-01',
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetChain.mockResolvedValue(['test-model:free'])
  mockInsertRecord.mockResolvedValue('record-id-1')
  mockInsertCond.mockResolvedValue('cond-id-1')
  mockInsertMeas.mockResolvedValue('meas-id-1')
  mockRules.mockReturnValue([])
  mockGetSetting.mockResolvedValue(null)
})

// ── PDF path ──────────────────────────────────────────────────────────────────

describe('processHealthRecord — PDF input', () => {
  it('extracts text from a PDF and returns a result', async () => {
    mockExtractPDF.mockResolvedValue({ text: 'BP: 145/92', pageCount: 1, method: 'text' })
    mockEnrich.mockResolvedValue(EMPTY_ENRICHMENT)

    const result = await processHealthRecord({ uri: 'file:///docs/report.pdf', db: mockDb, apiKey: '' })
    expect(result.recordId).toBe('record-id-1')
    expect(mockExtractPDF).toHaveBeenCalledWith('file:///docs/report.pdf')
  })

  it('throws OcrRequiredError when PDF is image-based', async () => {
    mockExtractPDF.mockResolvedValue({ text: 'pg1', pageCount: 2, method: 'ocr' })

    await expect(processHealthRecord({ uri: 'file:///docs/scanned.pdf', db: mockDb, apiKey: '' }))
      .rejects.toThrow(OcrRequiredError)
  })

  it('passes extracted text to enrichFromText', async () => {
    mockExtractPDF.mockResolvedValue({ text: 'Patient has hypertension', pageCount: 1, method: 'text' })
    mockEnrich.mockResolvedValue(EMPTY_ENRICHMENT)

    await processHealthRecord({ uri: 'file:///docs/report.pdf', db: mockDb, apiKey: 'sk-key' })
    expect(mockEnrich).toHaveBeenCalledWith('Patient has hypertension', 'sk-key', expect.any(Array))
    expect(mockGetSetting).not.toHaveBeenCalled()
  })

  it('falls back to the stored openrouter_api_key setting when apiKey is omitted', async () => {
    mockExtractPDF.mockResolvedValue({ text: 'Patient has hypertension', pageCount: 1, method: 'text' })
    mockEnrich.mockResolvedValue(EMPTY_ENRICHMENT)
    mockGetSetting.mockResolvedValue('sk-stored')

    await processHealthRecord({ uri: 'file:///docs/report.pdf', db: mockDb })
    expect(mockGetSetting).toHaveBeenCalledWith(mockDb, 'openrouter_api_key')
    expect(mockEnrich).toHaveBeenCalledWith('Patient has hypertension', 'sk-stored', expect.any(Array), expect.any(Object), expect.any(Function))
  })

  it('falls back to an empty key (free tier) when apiKey is omitted and no setting is stored', async () => {
    mockExtractPDF.mockResolvedValue({ text: 'Patient has hypertension', pageCount: 1, method: 'text' })
    mockEnrich.mockResolvedValue(EMPTY_ENRICHMENT)
    mockGetSetting.mockResolvedValue(null)

    await processHealthRecord({ uri: 'file:///docs/report.pdf', db: mockDb })
    expect(mockEnrich).toHaveBeenCalledWith('Patient has hypertension', '', expect.any(Array), expect.any(Object), expect.any(Function))
  })
})

// ── Image path ────────────────────────────────────────────────────────────────

describe('processHealthRecord — image input', () => {
  it('routes .jpg files through image extraction', async () => {
    mockExtractImage.mockResolvedValue('HbA1c 7.2%')
    mockEnrich.mockResolvedValue(EMPTY_ENRICHMENT)

    await processHealthRecord({ uri: 'file:///photos/lab.jpg', db: mockDb, apiKey: '' })
    expect(mockExtractImage).toHaveBeenCalledWith('file:///photos/lab.jpg')
    expect(mockExtractPDF).not.toHaveBeenCalled()
  })

  it('routes .png files through image extraction', async () => {
    mockExtractImage.mockResolvedValue('Glucose: 110')
    mockEnrich.mockResolvedValue(EMPTY_ENRICHMENT)

    await processHealthRecord({ uri: 'file:///photos/result.png', db: mockDb, apiKey: '' })
    expect(mockExtractImage).toHaveBeenCalled()
  })

  it('passes OCR text to enrichFromText', async () => {
    mockExtractImage.mockResolvedValue('Sodium: 140 mEq/L')
    mockEnrich.mockResolvedValue(EMPTY_ENRICHMENT)

    await processHealthRecord({ uri: 'file:///photos/lab.jpg', db: mockDb, apiKey: 'sk-key' })
    expect(mockEnrich).toHaveBeenCalledWith('Sodium: 140 mEq/L', 'sk-key', expect.any(Array))
  })
})

// ── Conditions pipeline ───────────────────────────────────────────────────────

describe('processHealthRecord — conditions', () => {
  it('saves LLM-extracted conditions to the database', async () => {
    mockExtractPDF.mockResolvedValue({ text: 'hypertension', pageCount: 1, method: 'text' })
    mockEnrich.mockResolvedValue({ conditions: [SAMPLE_CONDITION], measurements: [] })

    await processHealthRecord({ uri: 'file:///docs/report.pdf', db: mockDb, apiKey: '' })
    expect(mockInsertCond).toHaveBeenCalledTimes(1)
    expect(mockInsertCond).toHaveBeenCalledWith(mockDb, expect.objectContaining({
      nameMedical: 'Essential hypertension',
      status: 'documented',
    }))
  })

  it('saves inferred conditions from rules', async () => {
    mockExtractPDF.mockResolvedValue({ text: 'HbA1c 7.2%', pageCount: 1, method: 'text' })
    mockEnrich.mockResolvedValue({ conditions: [], measurements: [SAMPLE_MEASUREMENT] })
    mockRules.mockReturnValue([{
      name_medical: 'Hypertension',
      name_common: 'High blood pressure',
      system: 'cardiovascular',
      organ: 'heart',
      anatomical_location: null,
      status: 'inferred' as const,
      severity: null,
      certainty: 'suspected',
      date_onset: null,
      date_diagnosed: null,
      evidence: 'Systolic 145 mmHg',
    }])

    await processHealthRecord({ uri: 'file:///docs/report.pdf', db: mockDb, apiKey: '' })
    expect(mockInsertCond).toHaveBeenCalledTimes(1)
    expect(mockInsertCond).toHaveBeenCalledWith(mockDb, expect.objectContaining({
      status: 'inferred',
      certainty: 'suspected',
    }))
  })

  it('saves both LLM and inferred conditions when both are present', async () => {
    mockExtractPDF.mockResolvedValue({ text: 'report text', pageCount: 1, method: 'text' })
    mockEnrich.mockResolvedValue({ conditions: [SAMPLE_CONDITION], measurements: [SAMPLE_MEASUREMENT] })
    mockRules.mockReturnValue([{
      name_medical: 'Pre-diabetes', name_common: null,
      system: 'endocrine', organ: 'pancreas', anatomical_location: null,
      status: 'inferred' as const, severity: null, certainty: 'suspected',
      date_onset: null, date_diagnosed: null, evidence: 'HbA1c 6.1%',
    }])

    await processHealthRecord({ uri: 'file:///docs/report.pdf', db: mockDb, apiKey: '' })
    expect(mockInsertCond).toHaveBeenCalledTimes(2)
  })

  it('passes sex to applyInferenceRules', async () => {
    mockExtractPDF.mockResolvedValue({ text: 'report', pageCount: 1, method: 'text' })
    mockEnrich.mockResolvedValue(EMPTY_ENRICHMENT)

    await processHealthRecord({ uri: 'file:///docs/report.pdf', db: mockDb, apiKey: '', sex: 'female' })
    expect(mockRules).toHaveBeenCalledWith([], [], 'female')
  })

  it('links conditions to the health record', async () => {
    mockExtractPDF.mockResolvedValue({ text: 'hypertension', pageCount: 1, method: 'text' })
    mockEnrich.mockResolvedValue({ conditions: [SAMPLE_CONDITION], measurements: [] })

    await processHealthRecord({ uri: 'file:///docs/report.pdf', db: mockDb, apiKey: '' })
    expect(mockInsertCond).toHaveBeenCalledWith(mockDb, expect.objectContaining({
      recordId: 'record-id-1',
    }))
  })
})

// ── Measurements pipeline ─────────────────────────────────────────────────────

describe('processHealthRecord — measurements', () => {
  it('saves measurements to the database', async () => {
    mockExtractPDF.mockResolvedValue({ text: 'BP 145/92', pageCount: 1, method: 'text' })
    mockEnrich.mockResolvedValue({ conditions: [], measurements: [SAMPLE_MEASUREMENT] })

    await processHealthRecord({ uri: 'file:///docs/report.pdf', db: mockDb, apiKey: '' })
    expect(mockInsertMeas).toHaveBeenCalledTimes(1)
    expect(mockInsertMeas).toHaveBeenCalledWith(mockDb, expect.objectContaining({
      name: 'Blood Pressure Systolic',
      valueNumeric: 145,
    }))
  })

  it('links measurements to the health record', async () => {
    mockExtractPDF.mockResolvedValue({ text: 'BP 145', pageCount: 1, method: 'text' })
    mockEnrich.mockResolvedValue({ conditions: [], measurements: [SAMPLE_MEASUREMENT] })

    await processHealthRecord({ uri: 'file:///docs/report.pdf', db: mockDb, apiKey: '' })
    expect(mockInsertMeas).toHaveBeenCalledWith(mockDb, expect.objectContaining({
      recordId: 'record-id-1',
    }))
  })
})

// ── Return value ──────────────────────────────────────────────────────────────

describe('processHealthRecord — return value', () => {
  it('returns recordId, conditionCount, measurementCount', async () => {
    mockExtractPDF.mockResolvedValue({ text: 'report', pageCount: 2, method: 'text' })
    mockEnrich.mockResolvedValue({ conditions: [SAMPLE_CONDITION], measurements: [SAMPLE_MEASUREMENT] })

    const result = await processHealthRecord({ uri: 'file:///docs/report.pdf', db: mockDb, apiKey: '' })
    expect(result.recordId).toBe('record-id-1')
    expect(result.conditionCount).toBe(1)
    expect(result.measurementCount).toBe(1)
  })

  it('counts inferred conditions in conditionCount', async () => {
    mockExtractPDF.mockResolvedValue({ text: 'report', pageCount: 1, method: 'text' })
    mockEnrich.mockResolvedValue({ conditions: [SAMPLE_CONDITION], measurements: [] })
    mockRules.mockReturnValue([{
      name_medical: 'Pre-diabetes', name_common: null, system: 'endocrine', organ: null,
      anatomical_location: null, status: 'inferred' as const, severity: null,
      certainty: 'suspected', date_onset: null, date_diagnosed: null, evidence: 'HbA1c 6.0%',
    }])

    const result = await processHealthRecord({ uri: 'file:///docs/report.pdf', db: mockDb, apiKey: '' })
    expect(result.conditionCount).toBe(2)
  })
})
