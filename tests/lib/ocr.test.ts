import { extractTextFromImage } from '@/lib/ocr/extract'

// ── Mock expo-text-extractor ──────────────────────────────────────────────────
// Real API: extractTextFromImage(uri): Promise<string[]>

const mockExtract = jest.fn()

jest.mock('expo-text-extractor', () => ({
  extractTextFromImage: (...args: unknown[]) => mockExtract(...args),
  isSupported: true,
}))

beforeEach(() => jest.clearAllMocks())

// ── Success cases ─────────────────────────────────────────────────────────────

describe('extractTextFromImage — success', () => {
  it('joins returned lines into a single string', async () => {
    mockExtract.mockResolvedValueOnce(['HbA1c: 7.2%', 'Blood Pressure: 145/92 mmHg'])
    const result = await extractTextFromImage('file:///photos/lab.jpg')
    expect(result).toBe('HbA1c: 7.2%\nBlood Pressure: 145/92 mmHg')
  })

  it('passes the URI to expo-text-extractor', async () => {
    mockExtract.mockResolvedValueOnce(['some text'])
    await extractTextFromImage('file:///path/to/scan.png')
    expect(mockExtract).toHaveBeenCalledWith('file:///path/to/scan.png')
  })

  it('returns empty string when no lines are returned', async () => {
    mockExtract.mockResolvedValueOnce([])
    const result = await extractTextFromImage('file:///blank.jpg')
    expect(result).toBe('')
  })

  it('handles a single-line result', async () => {
    mockExtract.mockResolvedValueOnce(['Sodium: 140 mEq/L'])
    const result = await extractTextFromImage('file:///lab.jpg')
    expect(result).toBe('Sodium: 140 mEq/L')
  })
})

// ── Error handling ────────────────────────────────────────────────────────────

describe('extractTextFromImage — errors', () => {
  it('throws when the native module throws', async () => {
    mockExtract.mockRejectedValueOnce(new Error('Native module crashed'))
    await expect(extractTextFromImage('file:///bad.jpg'))
      .rejects.toThrow('Native module crashed')
  })
})
