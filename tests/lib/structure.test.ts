import { analyzeRecordStructure } from '@/lib/llm/structure'
import { callLLMWithFallback } from '@/lib/llm/client'

jest.mock('@/lib/llm/client', () => ({ callLLMWithFallback: jest.fn(), DEFAULT_MODELS: ['test-model:free'] }))
const mockCall = callLLMWithFallback as jest.MockedFunction<typeof callLLMWithFallback>

beforeEach(() => jest.clearAllMocks())

// ── P11-01: document-level date extraction ────────────────────────────────────
// analyzeRecordStructure must surface a genuinely-stated document-level date
// when the model reports one, and null (never a computed substitute) when it
// doesn't — this is the document tier that resolveConditionDateTiers
// (enrich.ts) falls back to only after condition- and section-tier dates are
// both absent.

describe('analyzeRecordStructure — documentDate', () => {
  it('extracts a stated document-level date from a successful structure analysis', async () => {
    mockCall.mockResolvedValue({
      ok: true, model: 'm', content: '',
      value: {
        organization: 'chronological',
        documentDate: '2022-01-10',
        sections: [{ heading: 'Full record', startOffset: 0, endOffset: 50, inferredDate: null, sectionType: 'other', imageWorthy: false }],
      },
      failures: [],
    })

    const structure = await analyzeRecordStructure('some record text', '', [])
    expect(structure.documentDate).toBe('2022-01-10')
  })

  it('returns null (not a computed substitute) when the model reports no document-level date', async () => {
    mockCall.mockResolvedValue({
      ok: true, model: 'm', content: '',
      value: {
        organization: 'chronological',
        documentDate: null,
        sections: [{ heading: 'Full record', startOffset: 0, endOffset: 50, inferredDate: '2022-03-01', sectionType: 'other', imageWorthy: false }],
      },
      failures: [],
    })

    const structure = await analyzeRecordStructure('some record text', '', [])
    expect(structure.documentDate).toBeNull()
    // A section date existing elsewhere must not leak into documentDate.
    expect(structure.sections[0].inferredDate).toBe('2022-03-01')
  })

  it('degrades to null documentDate (single-section fallback) when structure analysis fails outright', async () => {
    mockCall.mockResolvedValue({ ok: false, model: null, content: null, value: null, failures: ['unavailable'] })

    const structure = await analyzeRecordStructure('some record text', '', [])
    expect(structure.documentDate).toBeNull()
    expect(structure.sections).toHaveLength(1)
  })
})
