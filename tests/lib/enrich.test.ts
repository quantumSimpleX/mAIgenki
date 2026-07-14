import { enrichFromText, EnrichmentFailedError, type EnrichmentResult } from '@/lib/llm/enrich'
import { callLLMWithFallback } from '@/lib/llm/client'

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/lib/llm/client', () => ({
  callLLMWithFallback: jest.fn(),
  DEFAULT_MODELS: ['test-model:free'],
}))

const mockCallLLM = callLLMWithFallback as jest.MockedFunction<typeof callLLMWithFallback>

function llmSuccess(value: EnrichmentResult) {
  return Promise.resolve({ ok: true, model: 'test-model:free', content: JSON.stringify(value), value, failures: [] })
}

function llmFailure() {
  return Promise.resolve({ ok: false, model: null, content: null, value: null, failures: ['test-model:free: network error'] })
}

beforeEach(() => jest.clearAllMocks())

// ── Return shape ──────────────────────────────────────────────────────────────

describe('enrichFromText — return shape', () => {
  it('returns conditions and measurements arrays on success', async () => {
    const payload: EnrichmentResult = {
      conditions: [
        {
          name_medical: 'Essential hypertension',
          name_common: 'High blood pressure',
          system: 'cardiovascular',
          organ: 'heart',
          anatomical_location: null,
          status: 'documented',
          severity: 'moderate',
          certainty: null,
          date_onset: null,
          date_diagnosed: '2022-06-01',
          evidence: 'BP 145/92 mmHg on 2022-06-01',
        },
      ],
      measurements: [
        {
          name: 'Blood Pressure Systolic',
          value_numeric: 145,
          unit: 'mmHg',
          reference_low: null,
          reference_high: 120,
          flag: 'high',
          date: '2022-06-01',
        },
      ],
    }
    mockCallLLM.mockReturnValueOnce(llmSuccess(payload) as any)

    const result = await enrichFromText('Patient has hypertension.', '', [])
    expect(result.conditions).toHaveLength(1)
    expect(result.conditions[0].name_medical).toBe('Essential hypertension')
    expect(result.measurements).toHaveLength(1)
    expect(result.measurements[0].value_numeric).toBe(145)
  })

  it('throws EnrichmentFailedError when all models fail', async () => {
    mockCallLLM.mockReturnValueOnce(llmFailure() as any)
    await expect(enrichFromText('some text', '', [])).rejects.toThrow(EnrichmentFailedError)
  })

  it('EnrichmentFailedError carries the underlying failures', async () => {
    mockCallLLM.mockReturnValueOnce(llmFailure() as any)
    await expect(enrichFromText('some text', '', [])).rejects.toMatchObject({
      failures: ['test-model:free: network error'],
    })
  })

  it('returns empty arrays without throwing when the LLM genuinely finds nothing', async () => {
    mockCallLLM.mockReturnValueOnce(llmSuccess({ conditions: [], measurements: [] }) as any)
    const result = await enrichFromText('Nothing clinical here.', '', [])
    expect(result.conditions).toEqual([])
    expect(result.measurements).toEqual([])
  })
})

// ── Prompt structure ──────────────────────────────────────────────────────────

describe('enrichFromText — prompt', () => {
  it('includes the source text in the prompt', async () => {
    mockCallLLM.mockReturnValueOnce(llmSuccess({ conditions: [], measurements: [] }) as any)
    await enrichFromText('診斷：高血壓', '', [])

    const call = mockCallLLM.mock.calls[0][0]
    const userMessage = call.messages.find((m: any) => m.role === 'user')
    expect(userMessage?.content).toContain('診斷：高血壓')
  })

  it('asks for both conditions and measurements in the prompt', async () => {
    mockCallLLM.mockReturnValueOnce(llmSuccess({ conditions: [], measurements: [] }) as any)
    await enrichFromText('HbA1c: 7.2%', '', [])

    const call = mockCallLLM.mock.calls[0][0]
    const allContent = call.messages.map((m: any) => m.content).join(' ')
    expect(allContent).toMatch(/condition/i)
    expect(allContent).toMatch(/measurement/i)
  })

  it('uses temperature 0 for deterministic output', async () => {
    mockCallLLM.mockReturnValueOnce(llmSuccess({ conditions: [], measurements: [] }) as any)
    await enrichFromText('test', '', [])

    const call = mockCallLLM.mock.calls[0][0]
    expect(call.temperature).toBe(0)
  })

  it('passes through the model chain and api key', async () => {
    mockCallLLM.mockReturnValueOnce(llmSuccess({ conditions: [], measurements: [] }) as any)
    const models = ['model-a:free', 'model-b:free']
    await enrichFromText('test', 'sk-test-key', models)

    const call = mockCallLLM.mock.calls[0][0]
    expect(call.apiKey).toBe('sk-test-key')
    expect(call.models).toEqual(models)
  })
})

// ── JSON parsing robustness ───────────────────────────────────────────────────

describe('enrichFromText — validate callback', () => {
  it('strips markdown code fences before parsing', async () => {
    // The validate callback is invoked by callLLMWithFallback internally.
    // Here we test it by passing raw content through a real validate invocation.
    // We call the real callLLMWithFallback via a spy that applies the validate fn.
    const wrapped = jest.fn().mockImplementation(async (opts: any) => {
      const fencedJSON = '```json\n{"conditions":[],"measurements":[]}\n```'
      const value = opts.validate?.(fencedJSON)
      return { ok: value != null, model: 'x', content: fencedJSON, value, failures: [] }
    })
    mockCallLLM.mockImplementation(wrapped as any)

    const result = await enrichFromText('test', '', [])
    expect(result.conditions).toEqual([])
    expect(result.measurements).toEqual([])
  })

  it('throws EnrichmentFailedError when validate returns null (bad JSON)', async () => {
    const wrapped = jest.fn().mockImplementation(async (opts: any) => {
      const value = opts.validate?.('not json at all')
      return { ok: false, model: null, content: 'not json', value: null, failures: [] }
    })
    mockCallLLM.mockImplementation(wrapped as any)

    await expect(enrichFromText('test', '', [])).rejects.toThrow(EnrichmentFailedError)
  })

  it('throws EnrichmentFailedError when response is missing required keys', async () => {
    const wrapped = jest.fn().mockImplementation(async (opts: any) => {
      const value = opts.validate?.('{"something": "else"}')
      return { ok: false, model: null, content: '{"something":"else"}', value: null, failures: [] }
    })
    mockCallLLM.mockImplementation(wrapped as any)

    await expect(enrichFromText('test', '', [])).rejects.toThrow(EnrichmentFailedError)
  })
})

// ── Multilingual ──────────────────────────────────────────────────────────────

describe('enrichFromText — multilingual', () => {
  it('handles Traditional Chinese (zh-TW) medical records', async () => {
    const zhTW = '病患：王大明 診斷：高血壓（I10）血壓：148/96 mmHg'
    const payload: EnrichmentResult = {
      conditions: [{
        name_medical: 'Essential hypertension',
        name_common: 'High blood pressure',
        system: 'cardiovascular',
        organ: 'heart',
        anatomical_location: null,
        status: 'documented',
        severity: null,
        certainty: null,
        date_onset: null,
        date_diagnosed: null,
        evidence: '血壓：148/96 mmHg',
      }],
      measurements: [{
        name: 'Blood Pressure Systolic',
        value_numeric: 148,
        unit: 'mmHg',
        reference_low: null,
        reference_high: 120,
        flag: 'high',
        date: null,
      }],
    }
    mockCallLLM.mockReturnValueOnce(llmSuccess(payload) as any)

    const result = await enrichFromText(zhTW, '', [])
    expect(result.conditions[0].name_medical).toBe('Essential hypertension')
    expect(result.measurements[0].value_numeric).toBe(148)
  })

  it('handles Japanese medical records', async () => {
    const ja = '患者：山田太郎 診断：2型糖尿病 HbA1c：7.8%'
    const payload: EnrichmentResult = {
      conditions: [{
        name_medical: 'Type 2 diabetes mellitus',
        name_common: 'Type 2 diabetes',
        system: 'endocrine',
        organ: 'pancreas',
        anatomical_location: null,
        status: 'documented',
        severity: null,
        certainty: null,
        date_onset: null,
        date_diagnosed: null,
        evidence: 'HbA1c：7.8%',
      }],
      measurements: [{
        name: 'HbA1c',
        value_numeric: 7.8,
        unit: '%',
        reference_low: null,
        reference_high: 5.6,
        flag: 'high',
        date: null,
      }],
    }
    mockCallLLM.mockReturnValueOnce(llmSuccess(payload) as any)

    const result = await enrichFromText(ja, '', [])
    expect(result.conditions[0].system).toBe('endocrine')
    expect(result.measurements[0].name).toBe('HbA1c')
  })
})
