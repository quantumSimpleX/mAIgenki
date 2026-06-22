import { extractTextFromPDF, MIN_CHARS_PER_PAGE } from '@/lib/pdf/extract'

// ── Mock expo-pdf-text-extract ────────────────────────────────────────────────

const mockExtractTextWithInfo = jest.fn()

jest.mock('expo-pdf-text-extract', () => ({
  extractTextWithInfo: (...args: unknown[]) => mockExtractTextWithInfo(...args),
  isAvailable: () => true,
}))

beforeEach(() => jest.clearAllMocks())

// ── MIN_CHARS_PER_PAGE ────────────────────────────────────────────────────────

describe('MIN_CHARS_PER_PAGE', () => {
  it('is a positive number', () => {
    expect(MIN_CHARS_PER_PAGE).toBeGreaterThan(0)
  })
})

// ── Text-based PDFs ───────────────────────────────────────────────────────────

describe('extractTextFromPDF — text-based PDF', () => {
  it('returns extracted text, page count, and method:text', async () => {
    // Realistic text density: a typical lab report page has hundreds of chars
    const reportText = [
      'Patient: John Smith  DOB: 1958-03-22  MRN: 123456',
      'Ordering Physician: Dr. Sarah Lee MD  Facility: Mass General Hospital',
      'Diagnosis: Essential Hypertension (I10)  Status: Chronic  Severity: Moderate',
      'Blood Pressure: 145/92 mmHg (elevated)  Heart Rate: 78 bpm',
      'Prescribed: Lisinopril 10mg once daily  Started: 2022-06-01',
    ].join('\n')
    mockExtractTextWithInfo.mockResolvedValueOnce({
      success: true,
      text: reportText + '\n' + reportText, // two pages worth
      pageCount: 2,
    })
    const result = await extractTextFromPDF('file:///documents/checkup.pdf')
    expect(result.text).toContain('Hypertension')
    expect(result.pageCount).toBe(2)
    expect(result.method).toBe('text')
  })

  it('passes the URI directly to expo-pdf-text-extract', async () => {
    mockExtractTextWithInfo.mockResolvedValueOnce({
      success: true,
      text: 'some text content that is long enough per page to not trigger scanned detection',
      pageCount: 1,
    })
    await extractTextFromPDF('file:///path/to/lab-report.pdf')
    expect(mockExtractTextWithInfo).toHaveBeenCalledWith('file:///path/to/lab-report.pdf')
  })

  it('handles multi-page PDFs with substantial text', async () => {
    const longText = 'Medical Report '.repeat(100)
    mockExtractTextWithInfo.mockResolvedValueOnce({
      success: true,
      text: longText,
      pageCount: 5,
    })
    const result = await extractTextFromPDF('file:///documents/history.pdf')
    expect(result.method).toBe('text')
    expect(result.pageCount).toBe(5)
  })
})

// ── Scanned PDF detection ─────────────────────────────────────────────────────

describe('extractTextFromPDF — scanned PDF detection', () => {
  it('returns method:ocr when text density is below threshold', async () => {
    // 2 pages, only 10 chars of text — clearly a scanned PDF
    mockExtractTextWithInfo.mockResolvedValueOnce({
      success: true,
      text: 'Page 1',
      pageCount: 2,
    })
    const result = await extractTextFromPDF('file:///documents/scanned.pdf')
    expect(result.method).toBe('ocr')
  })

  it('returns method:ocr when text is completely empty', async () => {
    mockExtractTextWithInfo.mockResolvedValueOnce({
      success: true,
      text: '',
      pageCount: 3,
    })
    const result = await extractTextFromPDF('file:///documents/image-only.pdf')
    expect(result.method).toBe('ocr')
    expect(result.pageCount).toBe(3)
  })

  it('returns method:text when text meets the per-page threshold', async () => {
    // Exactly at threshold: MIN_CHARS_PER_PAGE chars per page
    const text = 'A'.repeat(MIN_CHARS_PER_PAGE * 2) // 2 pages worth
    mockExtractTextWithInfo.mockResolvedValueOnce({
      success: true,
      text,
      pageCount: 2,
    })
    const result = await extractTextFromPDF('file:///documents/borderline.pdf')
    expect(result.method).toBe('text')
  })
})

// ── Error handling ────────────────────────────────────────────────────────────

describe('extractTextFromPDF — error handling', () => {
  it('throws a clear error when the file is not found', async () => {
    mockExtractTextWithInfo.mockResolvedValueOnce({
      success: false,
      text: '',
      pageCount: 0,
      error: 'File not found',
      errorCode: 'FILE_NOT_FOUND',
    })
    await expect(extractTextFromPDF('file:///missing.pdf'))
      .rejects.toThrow('FILE_NOT_FOUND')
  })

  it('throws a clear error for password-protected PDFs', async () => {
    mockExtractTextWithInfo.mockResolvedValueOnce({
      success: false,
      text: '',
      pageCount: 0,
      isEncrypted: true,
      passwordRequired: true,
      errorCode: 'PASSWORD_REQUIRED',
    })
    await expect(extractTextFromPDF('file:///protected.pdf'))
      .rejects.toThrow('PASSWORD_REQUIRED')
  })

  it('throws when the native module itself throws', async () => {
    mockExtractTextWithInfo.mockRejectedValueOnce(new Error('Native module crashed'))
    await expect(extractTextFromPDF('file:///crash.pdf'))
      .rejects.toThrow('Native module crashed')
  })
})
