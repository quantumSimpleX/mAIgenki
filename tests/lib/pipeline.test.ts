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
  // Simplified stand-in for the real conditionKey() (enrich.ts) — pipeline.ts
  // imports this to match a condition against an ImageWorthySection's
  // conditionKeys, and test fixtures below construct those keys with this
  // same shape so the two agree; it doesn't need to be byte-identical to
  // production since the real conditionKey() is covered in enrich.test.ts.
  conditionKey: jest.fn((c: any) => `${c.name_medical}|${c.organ ?? ''}|${c.anatomical_location ?? ''}`.toLowerCase()),
}))
jest.mock('@/lib/inference/rules', () => ({
  applyInferenceRules: jest.fn(),
}))
jest.mock('@/lib/llm/client', () => ({
  getModelChain: jest.fn(),
  DEFAULT_MODELS: ['test-model:free'],
}))
// Persistence now goes through the shared IndexedDB write path (Task 2.15) —
// pipeline.ts's job is to assemble conditions/measurements and hand them to
// persistEnrichmentResult; the actual write/counting logic is covered directly
// in tests/lib/indexedDb.test.ts, not re-tested here via a fake db.
jest.mock('@/lib/db/indexedDb', () => ({
  persistEnrichmentResult: jest.fn(),
  putRecordImage: jest.fn(),
  putConditionRecord: jest.fn(),
  getIndexedSetting: jest.fn(),
  putPendingExtractionText: jest.fn(),
  deletePendingExtractionText: jest.fn(),
}))
// Task 4.3's image-capture step — mocked so pipeline.ts's wiring (which
// pages it renders, how it handles a per-page failure) can be asserted
// without a real <canvas>/pdfjs-dist, which this project's Jest environment
// cannot provide (Task 0.1's spike).
jest.mock('@/lib/pdf/renderPage', () => ({
  renderPagesToCanvas: jest.fn(),
}))
jest.mock('@/lib/media/compress', () => ({
  compressToTarget: jest.fn(),
}))

import { extractTextFromPDF } from '@/lib/pdf/extract'
import { extractTextFromImage } from '@/lib/ocr/extract'
import { enrichFromText } from '@/lib/llm/enrich'
import { applyInferenceRules } from '@/lib/inference/rules'
import { getModelChain } from '@/lib/llm/client'
import { persistEnrichmentResult, putRecordImage, putConditionRecord, getIndexedSetting } from '@/lib/db/indexedDb'
import { renderPagesToCanvas } from '@/lib/pdf/renderPage'
import { compressToTarget } from '@/lib/media/compress'

const mockExtractPDF   = extractTextFromPDF   as jest.MockedFunction<typeof extractTextFromPDF>
const mockExtractImage = extractTextFromImage  as jest.MockedFunction<typeof extractTextFromImage>
const mockEnrich       = enrichFromText        as jest.MockedFunction<typeof enrichFromText>
const mockRules        = applyInferenceRules   as jest.MockedFunction<typeof applyInferenceRules>
const mockGetChain     = getModelChain         as jest.MockedFunction<typeof getModelChain>
const mockGetSetting   = getIndexedSetting     as jest.MockedFunction<typeof getIndexedSetting>
const mockPersist      = persistEnrichmentResult as jest.MockedFunction<typeof persistEnrichmentResult>
const mockPutImage     = putRecordImage        as jest.MockedFunction<typeof putRecordImage>
const mockPutConditionRecord = putConditionRecord as jest.MockedFunction<typeof putConditionRecord>
const mockRenderPages  = renderPagesToCanvas   as jest.MockedFunction<typeof renderPagesToCanvas>
const mockCompress     = compressToTarget      as jest.MockedFunction<typeof compressToTarget>

const mockIdb = { version: 6, objectStoreNames: { contains: () => true } } as any

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
  mockRules.mockReturnValue([])
  mockGetSetting.mockResolvedValue(null)
  mockPersist.mockResolvedValue({ recordId: 'record-id-1', conditionCount: 0, measurementCount: 0 })
})

// ── PDF path ──────────────────────────────────────────────────────────────────

describe('processHealthRecord — PDF input', () => {
  it('extracts text from a PDF and returns a result', async () => {
    mockExtractPDF.mockResolvedValue({ text: 'BP: 145/92', pageCount: 1, method: 'text' })
    mockEnrich.mockResolvedValue(EMPTY_ENRICHMENT)

    const result = await processHealthRecord({ uri: 'file:///docs/report.pdf', idb: mockIdb, apiKey: '' })
    expect(result.recordId).toBe('record-id-1')
    expect(mockExtractPDF).toHaveBeenCalledWith('file:///docs/report.pdf')
  })

  it('throws OcrRequiredError when PDF is image-based', async () => {
    mockExtractPDF.mockResolvedValue({ text: 'pg1', pageCount: 2, method: 'ocr' })

    await expect(processHealthRecord({ uri: 'file:///docs/scanned.pdf', idb: mockIdb, apiKey: '' }))
      .rejects.toThrow(OcrRequiredError)
  })

  it('passes extracted text to enrichFromText', async () => {
    mockExtractPDF.mockResolvedValue({ text: 'Patient has hypertension', pageCount: 1, method: 'text' })
    mockEnrich.mockResolvedValue(EMPTY_ENRICHMENT)

    await processHealthRecord({ uri: 'file:///docs/report.pdf', idb: mockIdb, apiKey: 'sk-key' })
    expect(mockEnrich).toHaveBeenCalledWith('Patient has hypertension', 'sk-key', expect.any(Array))
    expect(mockGetSetting).not.toHaveBeenCalled()
  })

  it('falls back to the stored openrouter_api_key setting when apiKey is omitted', async () => {
    mockExtractPDF.mockResolvedValue({ text: 'Patient has hypertension', pageCount: 1, method: 'text' })
    mockEnrich.mockResolvedValue(EMPTY_ENRICHMENT)
    mockGetSetting.mockResolvedValue('sk-stored')

    await processHealthRecord({ uri: 'file:///docs/report.pdf', idb: mockIdb })
    expect(mockGetSetting).toHaveBeenCalledWith(mockIdb, 'openrouter_api_key')
    expect(mockEnrich).toHaveBeenCalledWith('Patient has hypertension', 'sk-stored', expect.any(Array), expect.any(Object), expect.any(Function))
  })

  it('falls back to an empty key (free tier) when apiKey is omitted and no setting is stored', async () => {
    mockExtractPDF.mockResolvedValue({ text: 'Patient has hypertension', pageCount: 1, method: 'text' })
    mockEnrich.mockResolvedValue(EMPTY_ENRICHMENT)
    mockGetSetting.mockResolvedValue(null)

    await processHealthRecord({ uri: 'file:///docs/report.pdf', idb: mockIdb })
    expect(mockEnrich).toHaveBeenCalledWith('Patient has hypertension', '', expect.any(Array), expect.any(Object), expect.any(Function))
  })
})

// ── Image path ────────────────────────────────────────────────────────────────

describe('processHealthRecord — image input', () => {
  it('routes .jpg files through image extraction', async () => {
    mockExtractImage.mockResolvedValue('HbA1c 7.2%')
    mockEnrich.mockResolvedValue(EMPTY_ENRICHMENT)

    await processHealthRecord({ uri: 'file:///photos/lab.jpg', idb: mockIdb, apiKey: '' })
    expect(mockExtractImage).toHaveBeenCalledWith('file:///photos/lab.jpg')
    expect(mockExtractPDF).not.toHaveBeenCalled()
  })

  it('routes .png files through image extraction', async () => {
    mockExtractImage.mockResolvedValue('Glucose: 110')
    mockEnrich.mockResolvedValue(EMPTY_ENRICHMENT)

    await processHealthRecord({ uri: 'file:///photos/result.png', idb: mockIdb, apiKey: '' })
    expect(mockExtractImage).toHaveBeenCalled()
  })

  it('passes OCR text to enrichFromText', async () => {
    mockExtractImage.mockResolvedValue('Sodium: 140 mEq/L')
    mockEnrich.mockResolvedValue(EMPTY_ENRICHMENT)

    await processHealthRecord({ uri: 'file:///photos/lab.jpg', idb: mockIdb, apiKey: 'sk-key' })
    expect(mockEnrich).toHaveBeenCalledWith('Sodium: 140 mEq/L', 'sk-key', expect.any(Array))
  })
})

// ── Conditions pipeline ───────────────────────────────────────────────────────

describe('processHealthRecord — conditions', () => {
  it('passes LLM-extracted conditions through to persistEnrichmentResult', async () => {
    mockExtractPDF.mockResolvedValue({ text: 'hypertension', pageCount: 1, method: 'text' })
    mockEnrich.mockResolvedValue({ conditions: [SAMPLE_CONDITION], measurements: [] })

    await processHealthRecord({ uri: 'file:///docs/report.pdf', idb: mockIdb, apiKey: '' })
    expect(mockPersist).toHaveBeenCalledTimes(1)
    expect(mockPersist).toHaveBeenCalledWith(mockIdb, expect.objectContaining({
      conditions: [expect.objectContaining({ name_medical: 'Essential hypertension', status: 'documented' })],
    }))
  })

  it('passes inferred conditions from rules through to persistEnrichmentResult', async () => {
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

    await processHealthRecord({ uri: 'file:///docs/report.pdf', idb: mockIdb, apiKey: '' })
    expect(mockPersist).toHaveBeenCalledWith(mockIdb, expect.objectContaining({
      conditions: [expect.objectContaining({ status: 'inferred', certainty: 'suspected' })],
    }))
  })

  it('passes both LLM and inferred conditions when both are present', async () => {
    mockExtractPDF.mockResolvedValue({ text: 'report text', pageCount: 1, method: 'text' })
    mockEnrich.mockResolvedValue({ conditions: [SAMPLE_CONDITION], measurements: [SAMPLE_MEASUREMENT] })
    mockRules.mockReturnValue([{
      name_medical: 'Pre-diabetes', name_common: null,
      system: 'endocrine', organ: 'pancreas', anatomical_location: null,
      status: 'inferred' as const, severity: null, certainty: 'suspected',
      date_onset: null, date_diagnosed: null, evidence: 'HbA1c 6.1%',
    }])

    await processHealthRecord({ uri: 'file:///docs/report.pdf', idb: mockIdb, apiKey: '' })
    const call = mockPersist.mock.calls[0][1]
    expect(call.conditions).toHaveLength(2)
  })

  it('passes sex to applyInferenceRules', async () => {
    mockExtractPDF.mockResolvedValue({ text: 'report', pageCount: 1, method: 'text' })
    mockEnrich.mockResolvedValue(EMPTY_ENRICHMENT)

    await processHealthRecord({ uri: 'file:///docs/report.pdf', idb: mockIdb, apiKey: '', sex: 'female' })
    expect(mockRules).toHaveBeenCalledWith([], [], 'female')
  })

  // Regression for kb2-CODE/p01-provider-Phase-attribution-fix.md: a condition
  // must never be attributed to a provider found elsewhere in the same
  // document unless that condition carries its own direct evidence (its own
  // `provider` field, set per-condition by enrichFromText). pipeline.ts must
  // pass conditions through to persistEnrichmentResult unmodified — it must
  // never backfill an unattributed condition's `provider` from the
  // document-level `providers` array.
  it('does not attach a document-level provider to a condition with no direct provider evidence', async () => {
    mockExtractPDF.mockResolvedValue({ text: 'multi-provider report', pageCount: 1, method: 'text' })
    const attributedProvider = { name: 'Dr. Kim', specialty: null, email: null, phone: null, evidence: 'seen by Dr. Kim' }
    const conditionWithProvider = { ...SAMPLE_CONDITION, provider: attributedProvider }
    const conditionWithoutProvider = { ...SAMPLE_CONDITION, name_medical: 'Unrelated finding', provider: null }
    mockEnrich.mockResolvedValue({
      conditions: [conditionWithProvider, conditionWithoutProvider],
      measurements: [],
      providers: [attributedProvider],
    })

    await processHealthRecord({ uri: 'file:///docs/report.pdf', idb: mockIdb, apiKey: '' })

    const call = mockPersist.mock.calls[0][1]
    const unattributed = call.conditions.find((c: any) => c.name_medical === 'Unrelated finding')
    expect(unattributed?.provider).toBeFalsy()
    const attributed = call.conditions.find((c: any) => c.name_medical === 'Essential hypertension')
    expect(attributed?.provider).toEqual(attributedProvider)
  })

  it('derives the filename from the upload uri', async () => {
    mockExtractPDF.mockResolvedValue({ text: 'hypertension', pageCount: 1, method: 'text' })
    mockEnrich.mockResolvedValue({ conditions: [SAMPLE_CONDITION], measurements: [] })

    await processHealthRecord({ uri: 'file:///docs/report.pdf', idb: mockIdb, apiKey: '' })
    expect(mockPersist).toHaveBeenCalledWith(mockIdb, expect.objectContaining({
      filename: 'report.pdf',
    }))
  })
})

// ── Measurements pipeline ─────────────────────────────────────────────────────

describe('processHealthRecord — measurements', () => {
  it('passes measurements through to persistEnrichmentResult', async () => {
    mockExtractPDF.mockResolvedValue({ text: 'BP 145/92', pageCount: 1, method: 'text' })
    mockEnrich.mockResolvedValue({ conditions: [], measurements: [SAMPLE_MEASUREMENT] })

    await processHealthRecord({ uri: 'file:///docs/report.pdf', idb: mockIdb, apiKey: '' })
    expect(mockPersist).toHaveBeenCalledWith(mockIdb, expect.objectContaining({
      measurements: [expect.objectContaining({ name: 'Blood Pressure Systolic', value_numeric: 145 })],
    }))
  })
})

// ── Return value ──────────────────────────────────────────────────────────────

describe('processHealthRecord — return value', () => {
  it('returns whatever persistEnrichmentResult resolves to', async () => {
    mockExtractPDF.mockResolvedValue({ text: 'report', pageCount: 2, method: 'text' })
    mockEnrich.mockResolvedValue({ conditions: [SAMPLE_CONDITION], measurements: [SAMPLE_MEASUREMENT] })
    mockPersist.mockResolvedValue({ recordId: 'record-id-1', conditionCount: 1, measurementCount: 1 })

    const result = await processHealthRecord({ uri: 'file:///docs/report.pdf', idb: mockIdb, apiKey: '' })
    expect(result).toEqual({ recordId: 'record-id-1', conditionCount: 1, measurementCount: 1 })
  })

  it('reports a conditionCount that includes inferred conditions', async () => {
    mockExtractPDF.mockResolvedValue({ text: 'report', pageCount: 1, method: 'text' })
    mockEnrich.mockResolvedValue({ conditions: [SAMPLE_CONDITION], measurements: [] })
    mockRules.mockReturnValue([{
      name_medical: 'Pre-diabetes', name_common: null, system: 'endocrine', organ: null,
      anatomical_location: null, status: 'inferred' as const, severity: null,
      certainty: 'suspected', date_onset: null, date_diagnosed: null, evidence: 'HbA1c 6.0%',
    }])
    mockPersist.mockResolvedValue({ recordId: 'record-id-1', conditionCount: 2, measurementCount: 0 })

    const result = await processHealthRecord({ uri: 'file:///docs/report.pdf', idb: mockIdb, apiKey: '' })
    expect(result.conditionCount).toBe(2)
    // The 2-condition count reflects what pipeline.ts actually assembled and
    // handed to persistEnrichmentResult (LLM + inferred), not just the mock.
    const call = mockPersist.mock.calls[0][1]
    expect(call.conditions).toHaveLength(2)
  })
})

// ── Image capture (Task 4.3) ─────────────────────────────────────────────────

describe('processHealthRecord — image capture', () => {
  const FAKE_CANVAS = { width: 800, height: 1000 } as any

  beforeEach(() => {
    mockPersist.mockResolvedValue({ recordId: 'record-id-1', conditionCount: 1, measurementCount: 0 })
  })

  it('does nothing when enrichFromText reports no imageSections', async () => {
    mockExtractPDF.mockResolvedValue({ text: 'report', pageCount: 1, method: 'text' })
    mockEnrich.mockResolvedValue({ conditions: [SAMPLE_CONDITION], measurements: [] })

    await processHealthRecord({ uri: 'file:///docs/report.pdf', idb: mockIdb, apiKey: '' })
    expect(mockRenderPages).not.toHaveBeenCalled()
    expect(mockPutImage).not.toHaveBeenCalled()
  })

  it('renders, compresses, and stores every page in an imageWorthy section\'s range', async () => {
    mockExtractPDF.mockResolvedValue({ text: 'report', pageCount: 3, method: 'text' })
    mockEnrich.mockResolvedValue({
      conditions: [SAMPLE_CONDITION],
      measurements: [],
      imageSections: [{
        heading: 'Imaging', pageStart: 2, pageEnd: 3, inferredDate: '2023-01-01',
        conditionKeys: ['essential hypertension|heart|'],
      }],
    })
    mockRenderPages.mockResolvedValue(new Map([[2, FAKE_CANVAS], [3, FAKE_CANVAS]]))
    mockCompress.mockResolvedValue({ blob: { size: 123 } as any, byteSize: 123 })

    await processHealthRecord({ uri: 'file:///docs/report.pdf', idb: mockIdb, apiKey: '' })

    expect(mockRenderPages).toHaveBeenCalledWith('file:///docs/report.pdf', [2, 3])
    expect(mockPutImage).toHaveBeenCalledTimes(2)
    expect(mockPutImage).toHaveBeenCalledWith(mockIdb, expect.objectContaining({
      record_id: 'record-id-1', page_number: 2, byte_size: 123,
    }))
  })

  it('links a condition_records row to the condition matched by the section\'s conditionKeys', async () => {
    mockExtractPDF.mockResolvedValue({ text: 'report', pageCount: 1, method: 'text' })
    mockEnrich.mockResolvedValue({
      conditions: [SAMPLE_CONDITION],
      measurements: [],
      imageSections: [{
        heading: 'Imaging', pageStart: 1, pageEnd: 1, inferredDate: null,
        conditionKeys: ['essential hypertension|heart|'],
      }],
    })
    mockRenderPages.mockResolvedValue(new Map([[1, FAKE_CANVAS]]))
    mockCompress.mockResolvedValue({ blob: { size: 50 } as any, byteSize: 50 })

    await processHealthRecord({ uri: 'file:///docs/report.pdf', idb: mockIdb, apiKey: '' })

    expect(mockPutConditionRecord).toHaveBeenCalledTimes(1)
    const entry = mockPutConditionRecord.mock.calls[0][1]
    expect(entry.record_type).toBe('image')
    expect(entry.image_id).toBe(mockPutImage.mock.calls[0][1].id)
    // condition_id must be the exact id persistEnrichmentResult was handed for
    // this condition, so the two writes reference the same stored record.
    const persistedCondition = mockPersist.mock.calls[0][1].conditions[0]
    expect(entry.condition_id).toBe(persistedCondition.id)
  })

  it('does not write a condition_records row when no condition matches the section\'s conditionKeys', async () => {
    mockExtractPDF.mockResolvedValue({ text: 'report', pageCount: 1, method: 'text' })
    mockEnrich.mockResolvedValue({
      conditions: [SAMPLE_CONDITION],
      measurements: [],
      imageSections: [{
        heading: 'Imaging', pageStart: 1, pageEnd: 1, inferredDate: null,
        conditionKeys: ['some other condition|liver|'],
      }],
    })
    mockRenderPages.mockResolvedValue(new Map([[1, FAKE_CANVAS]]))
    mockCompress.mockResolvedValue({ blob: { size: 50 } as any, byteSize: 50 })

    await processHealthRecord({ uri: 'file:///docs/report.pdf', idb: mockIdb, apiKey: '' })

    expect(mockPutImage).toHaveBeenCalledTimes(1) // image is still stored
    expect(mockPutConditionRecord).not.toHaveBeenCalled() // just unlinked to any condition
  })

  it('skips a page whose render fails and continues with the rest of the record', async () => {
    mockExtractPDF.mockResolvedValue({ text: 'report', pageCount: 2, method: 'text' })
    mockEnrich.mockResolvedValue({
      conditions: [SAMPLE_CONDITION],
      measurements: [],
      imageSections: [{
        heading: 'Imaging', pageStart: 1, pageEnd: 2, inferredDate: null,
        conditionKeys: [],
      }],
    })
    mockRenderPages.mockResolvedValue(new Map([[2, FAKE_CANVAS]]))
    mockCompress.mockResolvedValue({ blob: { size: 50 } as any, byteSize: 50 })

    const result = await processHealthRecord({ uri: 'file:///docs/report.pdf', idb: mockIdb, apiKey: '' })

    // The whole record still completes successfully despite one page failing.
    expect(result.recordId).toBe('record-id-1')
    expect(mockRenderPages).toHaveBeenCalledWith('file:///docs/report.pdf', [1, 2])
    expect(mockPutImage).toHaveBeenCalledTimes(1) // only the second (successful) page
  })

  it('skips a page whose compression fails and continues with the rest of the record', async () => {
    mockExtractPDF.mockResolvedValue({ text: 'report', pageCount: 1, method: 'text' })
    mockEnrich.mockResolvedValue({
      conditions: [SAMPLE_CONDITION],
      measurements: [],
      imageSections: [{
        heading: 'Imaging', pageStart: 1, pageEnd: 1, inferredDate: null,
        conditionKeys: [],
      }],
    })
    mockRenderPages.mockResolvedValue(new Map([[1, FAKE_CANVAS]]))
    mockCompress.mockRejectedValue(new Error('compression failed'))

    const result = await processHealthRecord({ uri: 'file:///docs/report.pdf', idb: mockIdb, apiKey: '' })
    expect(result.recordId).toBe('record-id-1')
    expect(mockPutImage).not.toHaveBeenCalled()
  })
})
