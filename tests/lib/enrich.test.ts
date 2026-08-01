import { enrichFromText, EnrichmentFailedError, coalesceImageSections } from '@/lib/llm/enrich'
import { callLLMWithFallback } from '@/lib/llm/client'

// ── Mocks ─────────────────────────────────────────────────────────────────────
// enrichFromText's new orchestration (Task 3.5) makes at least two
// callLLMWithFallback calls per record: one structure-analysis call
// (src/lib/llm/structure.ts), then one call per resulting chunk
// (src/lib/llm/chunk.ts + this file's extractConditionsFromChunk). Every test
// below queues mock return values in that call order.

jest.mock('@/lib/llm/client', () => ({
  callLLMWithFallback: jest.fn(),
  DEFAULT_MODELS: ['test-model:free'],
}))

const mockCallLLM = callLLMWithFallback as jest.MockedFunction<typeof callLLMWithFallback>

function llmOk(value: unknown) {
  return Promise.resolve({ ok: true, model: 'test-model:free', content: JSON.stringify(value), value, failures: [] })
}

function llmFailure(msg = 'network error') {
  return Promise.resolve({ ok: false, model: null, content: null, value: null, failures: [`test-model:free: ${msg}`] })
}

// A structure-analysis success covering the whole text as a single section —
// the shape most tests need, since they only care about chunk-level behavior.
function structureOk(sections?: unknown[]) {
  return llmOk({
    organization: 'mixed',
    sections: sections ?? [{
      heading: 'Full record', startOffset: 0, endOffset: 99_999,
      inferredDate: null, sectionType: 'other', imageWorthy: false,
    }],
  })
}

beforeEach(() => jest.clearAllMocks())

// ── Return shape ──────────────────────────────────────────────────────────────

describe('enrichFromText — return shape', () => {
  it('returns conditions and measurements arrays on success', async () => {
    mockCallLLM
      .mockReturnValueOnce(structureOk() as any)
      .mockReturnValueOnce(llmOk({
        conditions: [{
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
        }],
        measurements: [{
          name: 'Blood Pressure Systolic',
          value_numeric: 145,
          unit: 'mmHg',
          date: '2022-06-01',
        }],
      }) as any)

    const result = await enrichFromText('Patient has hypertension.', '', [])
    expect(result.conditions).toHaveLength(1)
    expect(result.conditions[0].name_medical).toBe('Essential hypertension')
    expect(result.measurements).toHaveLength(1)
    expect(result.measurements[0].value_numeric).toBe(145)
  })

  it('throws EnrichmentFailedError when the only chunk fails', async () => {
    mockCallLLM
      .mockReturnValueOnce(structureOk() as any)
      .mockReturnValueOnce(llmFailure() as any)
    await expect(enrichFromText('some text', '', [])).rejects.toThrow(EnrichmentFailedError)
  })

  it('EnrichmentFailedError carries the underlying failures', async () => {
    mockCallLLM
      .mockReturnValueOnce(structureOk() as any)
      .mockReturnValueOnce(llmFailure() as any)
    await expect(enrichFromText('some text', '', [])).rejects.toMatchObject({
      failures: ['test-model:free: network error'],
    })
  })

  it('returns empty arrays without throwing when the LLM genuinely finds nothing', async () => {
    mockCallLLM
      .mockReturnValueOnce(structureOk() as any)
      .mockReturnValueOnce(llmOk({ conditions: [], measurements: [] }) as any)
    const result = await enrichFromText('Nothing clinical here.', '', [])
    expect(result.conditions).toEqual([])
    expect(result.measurements).toEqual([])
  })
})

// ── Prompt structure ──────────────────────────────────────────────────────────

describe('enrichFromText — prompt', () => {
  it('includes the source text in the prompt', async () => {
    mockCallLLM
      .mockReturnValueOnce(structureOk() as any)
      .mockReturnValueOnce(llmOk({ conditions: [], measurements: [] }) as any)
    await enrichFromText('診斷：高血壓', '', [])

    const allContent = mockCallLLM.mock.calls.flatMap((call: any) => call[0].messages.map((m: any) => m.content)).join(' ')
    expect(allContent).toContain('診斷：高血壓')
  })

  it('asks for both conditions and measurements in the prompt', async () => {
    mockCallLLM
      .mockReturnValueOnce(structureOk() as any)
      .mockReturnValueOnce(llmOk({ conditions: [], measurements: [] }) as any)
    await enrichFromText('HbA1c: 7.2%', '', [])

    const allContent = mockCallLLM.mock.calls.flatMap((call: any) => call[0].messages.map((m: any) => m.content)).join(' ')
    expect(allContent).toMatch(/condition/i)
    expect(allContent).toMatch(/measurement/i)
  })

  it('uses temperature 0 for deterministic output', async () => {
    mockCallLLM
      .mockReturnValueOnce(structureOk() as any)
      .mockReturnValueOnce(llmOk({ conditions: [], measurements: [] }) as any)
    await enrichFromText('test', '', [])

    for (const call of mockCallLLM.mock.calls) expect((call[0] as any).temperature).toBe(0)
  })

  it('passes through the model chain and api key', async () => {
    mockCallLLM
      .mockReturnValueOnce(structureOk() as any)
      .mockReturnValueOnce(llmOk({ conditions: [], measurements: [] }) as any)
    const models = ['model-a:free', 'model-b:free']
    await enrichFromText('test', 'sk-test-key', models)

    for (const call of mockCallLLM.mock.calls) {
      expect((call[0] as any).apiKey).toBe('sk-test-key')
      expect((call[0] as any).models).toEqual(models)
    }
  })
})

// ── JSON parsing robustness ───────────────────────────────────────────────────

describe('enrichFromText — validate callback', () => {
  it('strips markdown code fences before parsing', async () => {
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
      opts.validate?.('not json at all')
      return { ok: false, model: null, content: 'not json', value: null, failures: [] }
    })
    mockCallLLM.mockImplementation(wrapped as any)

    await expect(enrichFromText('test', '', [])).rejects.toThrow(EnrichmentFailedError)
  })

  it('throws EnrichmentFailedError when response is missing required keys', async () => {
    const wrapped = jest.fn().mockImplementation(async (opts: any) => {
      opts.validate?.('{"something": "else"}')
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
    mockCallLLM
      .mockReturnValueOnce(structureOk() as any)
      .mockReturnValueOnce(llmOk({
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
          date: null,
        }],
      }) as any)

    const result = await enrichFromText(zhTW, '', [])
    expect(result.conditions[0].name_medical).toBe('Essential hypertension')
    expect(result.measurements[0].value_numeric).toBe(148)
  })

  it('handles Japanese medical records', async () => {
    const ja = '患者：山田太郎 診断：2型糖尿病 HbA1c：7.8%'
    mockCallLLM
      .mockReturnValueOnce(structureOk() as any)
      .mockReturnValueOnce(llmOk({
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
          date: null,
        }],
      }) as any)

    const result = await enrichFromText(ja, '', [])
    expect(result.conditions[0].system).toBe('endocrine')
    expect(result.measurements[0].name).toBe('HbA1c')
  })
})

// ── Structure/chunk/pool orchestration (Task 3.7) ─────────────────────────────

describe('enrichFromText — structure-analysis resilience', () => {
  it('falls back to single-chunk mode when structure analysis fails, without throwing', async () => {
    mockCallLLM
      .mockReturnValueOnce(llmFailure('structure model down') as any)
      .mockReturnValueOnce(llmOk({
        conditions: [{
          name_medical: 'Essential hypertension', name_common: null, system: 'cardiovascular',
          organ: 'heart', anatomical_location: null, status: 'documented', severity: null,
          certainty: null, date_onset: null, date_diagnosed: '2022-06-01', evidence: 'BP 145/92',
        }],
        measurements: [],
      }) as any)

    const result = await enrichFromText('Unstructured record text with hypertension.', '', [])
    expect(result.conditions).toHaveLength(1)
    // Exactly 2 calls total — 1 structure attempt + 1 chunk (the whole record
    // treated as a single synthetic section), proving single-chunk mode.
    expect(mockCallLLM).toHaveBeenCalledTimes(2)
  })
})

describe('enrichFromText — partial chunk failures', () => {
  // Each section must be at least MIN_SECTION_CHARS (200) or chunk.ts merges
  // it into its neighbor instead of keeping it as its own chunk — pad both
  // sections well past that so this test genuinely exercises two chunks.
  const twoSectionText =
    `Visit One\n${'Patient reports symptom A. '.repeat(15)}\n\n` +
    `Visit Two\n${'Patient reports symptom B. '.repeat(15)}`

  it('one failing chunk among several still returns partial results without throwing', async () => {
    mockCallLLM
      .mockReturnValueOnce(structureOk([
        { heading: 'Visit One', startOffset: 0, endOffset: 0, inferredDate: null, sectionType: 'visit', imageWorthy: false },
        { heading: 'Visit Two', startOffset: 0, endOffset: 0, inferredDate: null, sectionType: 'visit', imageWorthy: false },
      ]) as any)
      .mockReturnValueOnce(llmOk({
        conditions: [{
          name_medical: 'Condition A', name_common: null, system: 'digestive', organ: null,
          anatomical_location: null, status: 'documented', severity: null, certainty: null,
          date_onset: null, date_diagnosed: '2023-01-01', evidence: 'symptom A',
        }],
        measurements: [],
      }) as any)
      .mockReturnValueOnce(llmFailure('chunk 2 model down') as any)

    const result = await enrichFromText(twoSectionText, '', [])
    expect(result.conditions).toHaveLength(1)
    expect(result.conditions[0].name_medical).toBe('Condition A')
    expect(result.partialFailures).toHaveLength(1)
    expect(result.partialFailures?.[0].section).toBe('Visit Two')
    expect(result.partialFailures?.[0].reason).toContain('chunk 2 model down')
  })

  it('all chunks failing still throws EnrichmentFailedError', async () => {
    mockCallLLM
      .mockReturnValueOnce(structureOk([
        { heading: 'Visit One', startOffset: 0, endOffset: 0, inferredDate: null, sectionType: 'visit', imageWorthy: false },
        { heading: 'Visit Two', startOffset: 0, endOffset: 0, inferredDate: null, sectionType: 'visit', imageWorthy: false },
      ]) as any)
      .mockReturnValueOnce(llmFailure('model down 1') as any)
      .mockReturnValueOnce(llmFailure('model down 2') as any)

    await expect(enrichFromText(twoSectionText, '', [])).rejects.toThrow(EnrichmentFailedError)
  })

  it('cross-chunk dedup picks the earliest date and merges evidence for the same condition in two chunks', async () => {
    mockCallLLM
      .mockReturnValueOnce(structureOk([
        { heading: 'Visit One', startOffset: 0, endOffset: 0, inferredDate: null, sectionType: 'visit', imageWorthy: false },
        { heading: 'Visit Two', startOffset: 0, endOffset: 0, inferredDate: null, sectionType: 'visit', imageWorthy: false },
      ]) as any)
      .mockReturnValueOnce(llmOk({
        conditions: [{
          name_medical: 'Essential hypertension', name_common: 'High blood pressure', system: 'cardiovascular',
          organ: 'heart', anatomical_location: null, status: 'documented', severity: null, certainty: null,
          date_onset: null, date_diagnosed: '2023-06-01', evidence: 'BP elevated at visit one',
        }],
        measurements: [],
      }) as any)
      .mockReturnValueOnce(llmOk({
        conditions: [{
          name_medical: 'Essential hypertension', name_common: 'High blood pressure', system: 'cardiovascular',
          organ: 'heart', anatomical_location: null, status: 'documented', severity: null, certainty: null,
          date_onset: null, date_diagnosed: '2022-01-15', evidence: 'BP elevated at visit two',
        }],
        measurements: [],
      }) as any)

    const result = await enrichFromText(twoSectionText, '', [])
    expect(result.conditions).toHaveLength(1)
    expect(result.conditions[0].date_diagnosed).toBe('2022-01-15')
    expect(result.conditions[0].evidence).toContain('BP elevated at visit one')
    expect(result.conditions[0].evidence).toContain('BP elevated at visit two')
  })
})

// ── Image sections (Task 4.3 support) ─────────────────────────────────────────

describe('enrichFromText — imageSections', () => {
  it('returns imageSections for an imageWorthy chunk with a resolved page range and its own conditionKeys', async () => {
    mockCallLLM
      .mockReturnValueOnce(llmOk({
        organization: 'mixed',
        sections: [{
          heading: 'Imaging', startOffset: 0, endOffset: 20,
          inferredDate: '2023-01-01', sectionType: 'imaging', imageWorthy: true,
        }],
      }) as any)
      .mockReturnValueOnce(llmOk({
        conditions: [{
          name_medical: 'Kidney stone', name_common: null, system: 'renal', organ: 'kidney',
          anatomical_location: null, status: 'documented', severity: null, certainty: null,
          date_onset: null, date_diagnosed: null, evidence: 'CT shows a stone',
        }],
        measurements: [],
      }) as any)

    const result = await enrichFromText(
      'Imaging\nCT scan shows a kidney stone.', '', [], { pageBreaks: [0, 20] },
    )
    expect(result.imageSections).toHaveLength(1)
    expect(result.imageSections?.[0]).toMatchObject({ heading: 'Imaging', pageStart: 1, pageEnd: 2 })
    expect(result.imageSections?.[0].conditionKeys).toHaveLength(1)
  })

  it('omits imageSections when no chunk is imageWorthy', async () => {
    mockCallLLM
      .mockReturnValueOnce(structureOk() as any)
      .mockReturnValueOnce(llmOk({ conditions: [], measurements: [] }) as any)

    const result = await enrichFromText('plain text', '', [])
    expect(result.imageSections).toBeUndefined()
  })

  it('omits an imageWorthy chunk from imageSections when it has no resolved page range', async () => {
    // No pageBreaks passed — analyzeRecordStructure can't resolve a page
    // number, so this imageWorthy section must not appear in imageSections.
    mockCallLLM
      .mockReturnValueOnce(llmOk({
        organization: 'mixed',
        sections: [{
          heading: 'Imaging', startOffset: 0, endOffset: 20,
          inferredDate: null, sectionType: 'imaging', imageWorthy: true,
        }],
      }) as any)
      .mockReturnValueOnce(llmOk({ conditions: [], measurements: [] }) as any)

    const result = await enrichFromText('Imaging\nCT scan shows a kidney stone.', '', [])
    expect(result.imageSections).toBeUndefined()
  })
})

// Regression for a Codex review finding on PR #1: a section longer than the
// chunk char limit splits into multiple chunks that all inherit the same
// pageStart/pageEnd, and each was pushing its own imageSections entry —
// producing duplicate image captures/timeline entries for one page range.
describe('coalesceImageSections', () => {
  it('merges entries sharing a page range and unions their conditionKeys', () => {
    const merged = coalesceImageSections([
      { heading: 'Imaging', pageStart: 1, pageEnd: 3, inferredDate: '2023-01-01', conditionKeys: ['a', 'b'] },
      { heading: 'Imaging', pageStart: 1, pageEnd: 3, inferredDate: '2023-01-01', conditionKeys: ['b', 'c'] },
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0].conditionKeys.sort()).toEqual(['a', 'b', 'c'])
  })

  it('keeps distinct page ranges as separate entries', () => {
    const merged = coalesceImageSections([
      { heading: 'Imaging', pageStart: 1, pageEnd: 1, inferredDate: null, conditionKeys: ['a'] },
      { heading: 'Labs', pageStart: 2, pageEnd: 2, inferredDate: null, conditionKeys: ['b'] },
    ])
    expect(merged).toHaveLength(2)
  })
})
