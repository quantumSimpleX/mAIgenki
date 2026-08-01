// Pipeline integration tests (Phase 9.8.1, updated for Task 2.15's IndexedDB
// cutover). The extract + LLM boundaries are mocked, but persistence runs the
// REAL persistEnrichmentResult against a real (fake-indexeddb-backed) IndexedDB
// database, so this validates that rows actually land and that onProgress fires
// the expected phase/progress sequence.

import 'fake-indexeddb/auto'

jest.mock('@/lib/pdf/extract', () => ({ extractTextFromPDF: jest.fn() }))
jest.mock('@/lib/ocr/extract', () => ({ extractTextFromImage: jest.fn() }))
jest.mock('@/lib/llm/enrich', () => ({
  ...jest.requireActual('@/lib/llm/enrich'),
  enrichFromText: jest.fn(),
}))

import { processHealthRecord, OcrRequiredError, type ProgressPhase } from '@/lib/pipeline'
import { openIndexedDb, putIndexedSetting } from '@/lib/db/indexedDb'
import { extractTextFromPDF } from '@/lib/pdf/extract'
import { extractTextFromImage } from '@/lib/ocr/extract'
import { enrichFromText, EnrichmentFailedError } from '@/lib/llm/enrich'
import type { EnrichmentResult } from '@/lib/llm/enrich'
import { redactPII } from '@/lib/privacy/redact'

const mockPdf = extractTextFromPDF as jest.MockedFunction<typeof extractTextFromPDF>
const mockImage = extractTextFromImage as jest.MockedFunction<typeof extractTextFromImage>
const mockEnrich = enrichFromText as jest.MockedFunction<typeof enrichFromText>

const EMPTY: EnrichmentResult = { conditions: [], measurements: [] }

const CONDITION = {
  name_medical: 'Essential hypertension',
  name_common: 'High blood pressure',
  system: 'cardiovascular',
  organ: 'heart',
  anatomical_location: null,
  status: 'documented' as const,
  severity: null,
  certainty: 'confirmed',
  date_onset: null,
  date_diagnosed: '2022-06-01',
  evidence: 'BP 150/95',
}

const MEASUREMENT = {
  name: 'Blood Pressure Systolic',
  value_numeric: 150,
  unit: 'mmHg',
  reference_low: null,
  reference_high: 120,
  flag: 'high' as const,
  date: '2022-06-01',
}

async function freshIdb(): Promise<IDBDatabase> {
  return openIndexedDb(`maigenki-pipeline-${Date.now()}-${Math.random()}`)
}

function countIndexedRows(idb: IDBDatabase, store: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = idb.transaction(store, 'readonly').objectStore(store).getAll()
    request.onsuccess = () => resolve(request.result.length)
    request.onerror = () => reject(request.error)
  })
}

beforeEach(() => jest.clearAllMocks())

describe('processHealthRecord — persistence (real fake DB)', () => {
  it('persists health record, conditions and measurements; returns counts', async () => {
    mockPdf.mockResolvedValue({ text: 'Hypertension. BP 150/95.', pageCount: 1, method: 'text' })
    mockEnrich.mockResolvedValue({ conditions: [CONDITION], measurements: [MEASUREMENT] })

    const idb = await freshIdb()
    const result = await processHealthRecord({ uri: 'file:///r.pdf', idb, apiKey: 'sk-test' })

    expect(await countIndexedRows(idb, 'health_records')).toBe(1)
    expect(await countIndexedRows(idb, 'conditions')).toBe(result.conditionCount)
    expect(await countIndexedRows(idb, 'measurements')).toBe(1)
    expect(result.conditionCount).toBeGreaterThanOrEqual(1)
    expect(result.measurementCount).toBe(1)
    idb.close()
  })

  it('fires onProgress with a monotonic phase/progress sequence', async () => {
    mockPdf.mockResolvedValue({ text: 'Some records with text.', pageCount: 1, method: 'text' })
    mockEnrich.mockResolvedValue(EMPTY)

    const idb = await freshIdb()
    const calls: [ProgressPhase, number][] = []
    await processHealthRecord({
      uri: 'file:///r.pdf', idb, apiKey: '',
      onProgress: (phase, progress) => calls.push([phase, progress]),
    })

    const phases = calls.map((c) => c[0])
    expect(phases).toEqual([0, 1, 2, 3, 3])
    // Progress fractions are non-decreasing and end at 1.
    const progresses = calls.map((c) => c[1])
    for (let i = 1; i < progresses.length; i++) {
      expect(progresses[i]).toBeGreaterThanOrEqual(progresses[i - 1])
    }
    expect(progresses[progresses.length - 1]).toBe(1)
    idb.close()
  })

  it('empty enrichment yields a 0-condition record', async () => {
    mockPdf.mockResolvedValue({ text: 'Nothing clinical here at all.', pageCount: 1, method: 'text' })
    mockEnrich.mockResolvedValue(EMPTY)

    const idb = await freshIdb()
    const result = await processHealthRecord({ uri: 'file:///r.pdf', idb, apiKey: '' })

    expect(result.conditionCount).toBe(0)
    expect(await countIndexedRows(idb, 'health_records')).toBe(1)
    expect(await countIndexedRows(idb, 'conditions')).toBe(0)
    idb.close()
  })

  it('resolves the stored openrouter_api_key setting when apiKey is omitted', async () => {
    mockPdf.mockResolvedValue({ text: 'Some records with text.', pageCount: 1, method: 'text' })
    mockEnrich.mockResolvedValue(EMPTY)

    const idb = await freshIdb()
    await putIndexedSetting(idb, 'openrouter_api_key', 'sk-or-stored')
    await processHealthRecord({ uri: 'file:///r.pdf', idb })

    // enrichFromText also receives routing options (db/profile/onTrace/pageBreaks)
    // and an onChunkProgress callback once a resolved profile exists (pipeline.ts) —
    // match the full argument list rather than the first 3.
    expect(mockEnrich).toHaveBeenCalledWith(
      expect.any(String), 'sk-or-stored', expect.any(Array), expect.any(Object), expect.any(Function),
    )
    idb.close()
  })

  it('falls back to an empty key when apiKey is omitted and no setting is stored', async () => {
    mockPdf.mockResolvedValue({ text: 'Some records with text.', pageCount: 1, method: 'text' })
    mockEnrich.mockResolvedValue(EMPTY)

    const idb = await freshIdb()
    await processHealthRecord({ uri: 'file:///r.pdf', idb })

    expect(mockEnrich).toHaveBeenCalledWith(
      expect.any(String), '', expect.any(Array), expect.any(Object), expect.any(Function),
    )
    idb.close()
  })
})

describe('processHealthRecord — hard constraint: redact before enrich', () => {
  it('sends only redacted text to the LLM (never raw PII)', async () => {
    const raw = 'Patient has hypertension. SSN 123-45-6789. BP 150/95.'
    mockPdf.mockResolvedValue({ text: raw, pageCount: 1, method: 'text' })
    mockEnrich.mockResolvedValue(EMPTY)

    const idb = await freshIdb()
    await processHealthRecord({ uri: 'file:///r.pdf', idb, apiKey: '' })

    const sentText = mockEnrich.mock.calls[0][0]
    // The exact string handed to enrich must be the redacted form...
    expect(sentText).toBe(redactPII(raw))
    // ...and the raw SSN must never reach the network boundary.
    expect(sentText).not.toContain('123-45-6789')
    idb.close()
  })
})

describe('processHealthRecord — input routing', () => {
  it('throws OcrRequiredError for an image-based PDF (no rows persisted)', async () => {
    mockPdf.mockResolvedValue({ text: 'x', pageCount: 3, method: 'ocr' })

    const idb = await freshIdb()
    await expect(processHealthRecord({ uri: 'file:///scan.pdf', idb, apiKey: '' }))
      .rejects.toThrow(OcrRequiredError)
    expect(await countIndexedRows(idb, 'health_records')).toBe(0)
    idb.close()
  })

  it('propagates EnrichmentFailedError from a total LLM failure (no rows persisted)', async () => {
    mockPdf.mockResolvedValue({ text: 'Some records text.', pageCount: 1, method: 'text' })
    mockEnrich.mockRejectedValue(new EnrichmentFailedError(['model-a:free: network error']))

    const idb = await freshIdb()
    await expect(processHealthRecord({ uri: 'file:///r.pdf', idb, apiKey: '' }))
      .rejects.toThrow(EnrichmentFailedError)
    expect(await countIndexedRows(idb, 'health_records')).toBe(0)
    idb.close()
  })

  it('routes image input through OCR extraction', async () => {
    mockImage.mockResolvedValue('HbA1c 7.1%')
    mockEnrich.mockResolvedValue(EMPTY)

    const idb = await freshIdb()
    await processHealthRecord({ uri: 'file:///lab.jpg', idb, apiKey: '' })
    expect(mockImage).toHaveBeenCalledWith('file:///lab.jpg')
    expect(mockPdf).not.toHaveBeenCalled()
    idb.close()
  })

  it('honours an explicit kind override for a suffixless web blob URI', async () => {
    mockPdf.mockResolvedValue({ text: 'Text-based PDF content here.', pageCount: 1, method: 'text' })
    mockEnrich.mockResolvedValue(EMPTY)

    const idb = await freshIdb()
    await processHealthRecord({ uri: 'blob:https://app/abc-123', idb, apiKey: '', kind: 'pdf' })
    expect(mockPdf).toHaveBeenCalledWith('blob:https://app/abc-123')
    expect(mockImage).not.toHaveBeenCalled()
    idb.close()
  })
})
