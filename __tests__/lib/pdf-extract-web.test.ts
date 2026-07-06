// Web-branch PDF extraction (Phase 9.8.3). Forces Platform.OS = 'web', mocks
// pdfjs-dist (and its worker) plus fetch, and asserts the per-page text join and
// the density → method classification.

import { Platform } from 'react-native'

const mockGetDocument = jest.fn()

jest.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  getDocument: (...args: unknown[]) => mockGetDocument(...args),
  GlobalWorkerOptions: { workerSrc: '' },
}))
jest.mock('pdfjs-dist/legacy/build/pdf.worker.mjs', () => ({ WorkerMessageHandler: {} }))

import { extractTextFromPDF, MIN_CHARS_PER_PAGE } from '@/lib/pdf/extract'

function makeDoc(pages: { items: { str?: string; type?: string }[] }[]) {
  return {
    numPages: pages.length,
    getPage: async (i: number) => ({
      getTextContent: async () => ({ items: pages[i - 1].items }),
    }),
  }
}

beforeAll(() => {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'web' })
  ;(globalThis as unknown as { fetch: unknown }).fetch = jest.fn().mockResolvedValue({
    arrayBuffer: async () => new ArrayBuffer(16),
  })
})

beforeEach(() => jest.clearAllMocks())

describe('extractTextFromPDF — web branch', () => {
  it('joins per-page text items and marks a dense PDF as method:text', async () => {
    const line = 'Patient John Smith diagnosed with essential hypertension BP 150/95 mmHg'
    mockGetDocument.mockReturnValue({
      promise: Promise.resolve(makeDoc([
        { items: [{ str: line }, { type: 'beginMarkedContent' }, { str: 'HbA1c 7.1%' }] },
      ])),
      destroy: jest.fn(),
    })

    const result = await extractTextFromPDF('blob:https://app/x')
    expect(result.text).toContain('hypertension')
    expect(result.text).toContain('HbA1c 7.1%')
    expect(result.pageCount).toBe(1)
    expect(result.method).toBe('text')
  })

  it('marks a sparse (scanned) PDF as method:ocr', async () => {
    mockGetDocument.mockReturnValue({
      promise: Promise.resolve(makeDoc([
        { items: [{ str: 'pg1' }] },
        { items: [{ str: 'pg2' }] },
      ])),
      destroy: jest.fn(),
    })

    const result = await extractTextFromPDF('blob:https://app/scan')
    expect(result.pageCount).toBe(2)
    expect(result.method).toBe('ocr')
  })

  it('threshold constant is positive', () => {
    expect(MIN_CHARS_PER_PAGE).toBeGreaterThan(0)
  })
})
