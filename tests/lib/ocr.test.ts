import { extractTextFromImage } from '@/lib/ocr/extract'

// ── Mock expo-text-extractor ──────────────────────────────────────────────────

const mockRecognize = jest.fn()

jest.mock('expo-text-extractor', () => ({
  recognize: (...args: unknown[]) => mockRecognize(...args),
}))

beforeEach(() => jest.clearAllMocks())

// ── Success cases ─────────────────────────────────────────────────────────────

describe('extractTextFromImage — success', () => {
  it('returns extracted text from an image URI', async () => {
    mockRecognize.mockResolvedValueOnce({ text: 'HbA1c: 7.2%\nBlood Pressure: 145/92 mmHg' })
    const result = await extractTextFromImage('file:///photos/lab.jpg')
    expect(result).toBe('HbA1c: 7.2%\nBlood Pressure: 145/92 mmHg')
  })

  it('passes the URI directly to expo-text-extractor', async () => {
    mockRecognize.mockResolvedValueOnce({ text: 'some text' })
    await extractTextFromImage('file:///path/to/scan.png')
    expect(mockRecognize).toHaveBeenCalledWith('file:///path/to/scan.png')
  })

  it('returns empty string when recognized text is empty', async () => {
    mockRecognize.mockResolvedValueOnce({ text: '' })
    const result = await extractTextFromImage('file:///blank.jpg')
    expect(result).toBe('')
  })

  it('returns empty string when result has no text field', async () => {
    mockRecognize.mockResolvedValueOnce({})
    const result = await extractTextFromImage('file:///blank.jpg')
    expect(result).toBe('')
  })
})

// ── Error handling ────────────────────────────────────────────────────────────

describe('extractTextFromImage — errors', () => {
  it('throws when the native module throws', async () => {
    mockRecognize.mockRejectedValueOnce(new Error('Native module crashed'))
    await expect(extractTextFromImage('file:///bad.jpg'))
      .rejects.toThrow('Native module crashed')
  })
})
