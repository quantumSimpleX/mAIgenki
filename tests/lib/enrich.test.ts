import { enrichFromText, EnrichmentFailedError, parseExtractionStepResponse } from '@/lib/llm/enrich'
import { callLLMWithFallback } from '@/lib/llm/client'

jest.mock('@/lib/llm/client', () => ({ callLLMWithFallback: jest.fn(), DEFAULT_MODELS: ['test-model:free'] }))
const mockCall = callLLMWithFallback as jest.MockedFunction<typeof callLLMWithFallback>

type MockCallOpts = { label?: string }

beforeEach(() => jest.clearAllMocks())

// ── parseExtractionStepResponse (NDJSON) ────────────────────────────────────────

describe('parseExtractionStepResponse', () => {
  it('parses one condition and one measurement line', () => {
    const content = [
      JSON.stringify({ type: 'condition', name_medical: 'Essential hypertension', earliest_date: '2022-06-01', notes: 'BP 150/95' }),
      JSON.stringify({ type: 'measurement', name: 'Blood Pressure Systolic', value_numeric: 150, unit: 'mmHg', date: '2022-06-01' }),
    ].join('\n')

    const result = parseExtractionStepResponse(content)
    expect(result?.conditions).toHaveLength(1)
    expect(result?.conditions[0].name_medical).toBe('Essential hypertension')
    expect(result?.measurements).toHaveLength(1)
    expect(result?.measurements[0].value_numeric).toBe(150)
  })

  it('skips a malformed line without invalidating the rest', () => {
    const content = [
      'not json at all',
      JSON.stringify({ type: 'condition', name_medical: 'Eczema', earliest_date: null, notes: null }),
    ].join('\n')

    const result = parseExtractionStepResponse(content)
    expect(result?.conditions).toHaveLength(1)
    expect(result?.conditions[0].name_medical).toBe('Eczema')
  })

  it('returns null when every line is unusable', () => {
    const content = 'garbage\nmore garbage'
    expect(parseExtractionStepResponse(content)).toBeNull()
  })

  it('inherits report_provider onto a condition with no explicit provider', () => {
    const provider = { name: 'Dr. Kim', specialty: null, email: null, phone: null, evidence: null }
    const content = [
      JSON.stringify({ type: 'report_provider', ...provider }),
      JSON.stringify({ type: 'condition', name_medical: 'Psoriasis', earliest_date: null, notes: null }),
    ].join('\n')

    const result = parseExtractionStepResponse(content)
    expect(result?.conditions[0].provider).toEqual(expect.objectContaining(provider))
  })

  it('keeps a condition-level provider over the report-level one', () => {
    const reportProvider = { name: 'Dr. Kim', specialty: null, email: null, phone: null, evidence: null }
    const ownProvider = { name: 'Dr. Patel', specialty: null, email: null, phone: null, evidence: null }
    const content = [
      JSON.stringify({ type: 'report_provider', ...reportProvider }),
      JSON.stringify({ type: 'condition', name_medical: 'Tear', earliest_date: null, notes: null, provider: ownProvider }),
    ].join('\n')

    const result = parseExtractionStepResponse(content)
    expect(result?.conditions[0].provider).toEqual(ownProvider)
  })

  it('strips a markdown code fence around the NDJSON', () => {
    const content = '```ndjson\n' + JSON.stringify({ type: 'condition', name_medical: 'Gout', earliest_date: null, notes: null }) + '\n```'
    const result = parseExtractionStepResponse(content)
    expect(result?.conditions).toHaveLength(1)
  })
})

// ── enrichFromText orchestration ─────────────────────────────────────────────────
// callLLMWithFallback is mocked directly, so these tests exercise enrichFromText's
// chunking/anatomy orchestration and error handling, not the real HTTP/parsing
// path (parseExtractionStepResponse above covers that). analyzeRecordStructure's
// call (label "structure-analysis") is left to fail in most tests — it degrades
// to a single full-text chunk on failure, which suits these short test strings.

function mockByLabel(handlers: Record<string, () => unknown>) {
  type MockResult = Awaited<ReturnType<typeof mockCall>>
  mockCall.mockImplementation(async (opts) => {
    const label = (opts as MockCallOpts).label ?? ''
    const handler = handlers[label]
    if (handler) return handler() as MockResult
    return { ok: false, model: null, content: null, value: null, failures: [`unmocked label: ${label}`] } as MockResult
  })
}

const structureFails = () => ({ ok: false, model: null, content: null, value: null, failures: [] })

describe('enrichFromText', () => {
  it('builds a full condition from a summary plus its anatomy', async () => {
    mockByLabel({
      'structure-analysis': structureFails,
      'extraction-condition-list': () => ({
        ok: true,
        model: 'test-model:free',
        content: '',
        value: {
          conditions: [{ name_medical: 'Essential hypertension', earliest_date: '2022-06-01', notes: 'BP 150/95', provider: null, facility: null }],
          measurements: [{ name: 'Blood Pressure Systolic', value_numeric: 150, unit: 'mmHg', date: '2022-06-01' }],
        },
        failures: [],
      }),
      'enrichment-anatomy': () => ({
        ok: true,
        model: 'test-model:free',
        content: '',
        value: new Map([[0, { system: 'cardiovascular', organ: 'heart', anatomical_location: null, laterality: null }]]),
        failures: [],
      }),
    })

    const result = await enrichFromText('Complete report text', '', [])

    expect(result.conditions).toHaveLength(1)
    const condition = result.conditions[0]
    expect(condition.name_medical).toBe('Essential hypertension')
    expect(condition.system).toBe('cardiovascular')
    expect(condition.organ).toBe('heart')
    expect(condition.date_diagnosed).toBe('2022-06-01')
    expect(condition.date_onset).toBeNull()
    expect(condition.notes).toBe('BP 150/95')
    expect(condition.evidence).toBeNull()
    expect(result.measurements[0].value_numeric).toBe(150)
  })

  it('places a condition with no anatomy match under "other" rather than dropping it', async () => {
    mockByLabel({
      'structure-analysis': structureFails,
      'extraction-condition-list': () => ({
        ok: true, model: 'm', content: '',
        value: { conditions: [{ name_medical: 'Unclear finding', earliest_date: null, notes: null, provider: null, facility: null }], measurements: [] },
        failures: [],
      }),
      'enrichment-anatomy': () => ({ ok: false, model: null, content: null, value: null, failures: [] }),
    })

    const result = await enrichFromText('report', '', [])
    expect(result.conditions).toHaveLength(1)
    expect(result.conditions[0].system).toBe('other')
    expect(result.conditions[0].organ).toBeNull()
  })

  it('fails explicitly when every chunk fails to extract anything usable', async () => {
    mockByLabel({
      'structure-analysis': structureFails,
      'extraction-condition-list': () => ({ ok: false, model: null, content: null, value: null, failures: ['context rejected'] }),
    })

    await expect(enrichFromText('report', '', [])).rejects.toBeInstanceOf(EnrichmentFailedError)
  })

  it('reports progress once per condition, with its name', async () => {
    mockByLabel({
      'structure-analysis': structureFails,
      'extraction-condition-list': () => ({
        ok: true, model: 'm', content: '',
        value: {
          conditions: [
            { name_medical: 'Condition A', earliest_date: null, notes: null, provider: null, facility: null },
            { name_medical: 'Condition B', earliest_date: null, notes: null, provider: null, facility: null },
          ],
          measurements: [],
        },
        failures: [],
      }),
      'enrichment-anatomy': () => ({ ok: true, model: 'm', content: '', value: new Map(), failures: [] }),
    })

    const onProgress = jest.fn()
    await enrichFromText('report', '', [], undefined, onProgress)

    expect(onProgress).toHaveBeenCalledWith(1, 2, 'Condition A')
    expect(onProgress).toHaveBeenCalledWith(2, 2, 'Condition B')
  })

  it('forwards onTrace to every underlying call', async () => {
    mockByLabel({
      'structure-analysis': structureFails,
      'extraction-condition-list': () => ({
        ok: true, model: 'm', content: '',
        value: { conditions: [], measurements: [] },
        failures: [],
      }),
    })

    const onTrace = jest.fn()
    await enrichFromText('report', '', [], { onTrace })

    const labelsCalledWithTrace = mockCall.mock.calls
      .filter(([opts]) => (opts as { onTrace?: unknown }).onTrace === onTrace)
      .map(([opts]) => (opts as MockCallOpts).label)
    expect(labelsCalledWithTrace).toContain('extraction-condition-list')
  })

  it('returns an empty result without calling the anatomy step when extraction finds nothing', async () => {
    mockByLabel({
      'structure-analysis': structureFails,
      'extraction-condition-list': () => ({
        ok: true, model: 'm', content: '',
        value: { conditions: [], measurements: [] },
        failures: [],
      }),
    })

    const result = await enrichFromText('report', '', [])
    expect(result.conditions).toEqual([])
    expect(mockCall.mock.calls.some(([opts]) => (opts as MockCallOpts).label === 'enrichment-anatomy')).toBe(false)
  })
})
