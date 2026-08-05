import { enrichFromText, EnrichmentFailedError } from '@/lib/llm/enrich'
import { callLLMWithFallback } from '@/lib/llm/client'

jest.mock('@/lib/llm/client', () => ({ callLLMWithFallback: jest.fn(), DEFAULT_MODELS: ['test-model:free'] }))
const mockCall = callLLMWithFallback as jest.MockedFunction<typeof callLLMWithFallback>
const response = (conditions: unknown[] = [], measurements: unknown[] = []) => { const value = { conditions, measurements, providers: [], facilities: [] }; return Promise.resolve({ ok: true, model: 'test-model:free', content: JSON.stringify({ schema_version: 1, organization: 'chronological', conditions, measurements, report_context: { providers: [], facilities: [] } }), value, failures: [] }) }

beforeEach(() => jest.clearAllMocks())

describe('whole-document extraction', () => {
  it('extracts conditions and measurements in one request', async () => {
    mockCall.mockReturnValueOnce(response([{ name_medical: 'Essential hypertension', name_common: null, system: 'cardiovascular', organ: null, anatomical_location: null, status: 'documented', severity: null, certainty: 'confirmed', date_onset: '2022-06-01', date_diagnosed: '2022-06-01', evidence: 'diagnosed', notes: null, provider: null, care_events: [] }], [{ name: 'Blood Pressure Systolic', value_numeric: 145, unit: 'mmHg', date: '2022-06-01', inferred_from_structure: [] }]) as never)
    const result = await enrichFromText('Complete report text', '', [])
    expect(result.conditions).toHaveLength(1)
    expect(result.measurements[0].value_numeric).toBe(145)
    expect(mockCall).toHaveBeenCalledTimes(1)
  })

  it('sends complete source text', async () => {
    mockCall.mockReturnValueOnce(response() as never)
    await enrichFromText('FULL REPORT CONTENT', '', [])
    expect(mockCall.mock.calls[0][0].messages.some((message) => message.content.includes('FULL REPORT CONTENT'))).toBe(true)
  })

  it('fails explicitly when whole-document extraction fails', async () => {
    mockCall.mockReturnValueOnce(Promise.resolve({ ok: false, model: null, content: null, value: null, failures: ['context rejected'] }) as never)
    await expect(enrichFromText('report', '', [])).rejects.toBeInstanceOf(EnrichmentFailedError)
  })
})
