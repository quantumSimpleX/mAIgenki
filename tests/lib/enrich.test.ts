import {
  enrichFromText, EnrichmentFailedError, parseExtractionStepResponse,
  backfillDocumentWideAttribution, backfillDocumentWideDate,
  parseConditionAnatomyBatch, classifyConditionSystemLocally,
  type ConditionSummary, type MeasurementInput,
} from '@/lib/llm/enrich'
import { ALL_SYSTEMS } from '@/model/conditions'
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

  // P10-08 (Defect 3): the anatomy call (and its individual per-condition
  // retry) failing outright must never leave system as 'other'/null — it
  // falls through to the local keyword classifier, which always returns one
  // of the 11 real systems.
  it('falls back to the local classifier (never "other"/null) when the anatomy call fails outright, even after retry', async () => {
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
    expect(ALL_SYSTEMS).toContain(result.conditions[0].system)
    expect(result.conditions[0].system).not.toBe('other')
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

  // ── P10-03: name_common / local_names derivation ──────────────────────────

  it('derives name_common and local_names from the anatomy/enrichment call', async () => {
    mockByLabel({
      'structure-analysis': structureFails,
      'extraction-condition-list': () => ({
        ok: true, model: 'm', content: '',
        value: {
          conditions: [{ name_medical: 'Essential hypertension', earliest_date: '2022-06-01', notes: 'BP 150/95', provider: null, facility: null }],
          measurements: [],
        },
        failures: [],
      }),
      'enrichment-anatomy': () => ({
        ok: true, model: 'm', content: '',
        value: new Map([[0, {
          system: 'cardiovascular', organ: 'heart', anatomical_location: null, laterality: null,
          name_common: 'High blood pressure', local_names: { 'zh-TW': '高血壓', ja: '高血圧症' }, cx: 51, cy: 30,
        }]]),
        failures: [],
      }),
    })

    const result = await enrichFromText('Complete report text', '', [])
    expect(result.conditions[0].name_common).toBe('High blood pressure')
    expect(result.conditions[0].local_names).toEqual({ 'zh-TW': '高血壓', ja: '高血圧症' })
  })

  // ── P10-04: LLM-assisted coordinate derivation ────────────────────────────

  it('carries a model-proposed cx/cy from the anatomy call onto the condition', async () => {
    mockByLabel({
      'structure-analysis': structureFails,
      'extraction-condition-list': () => ({
        ok: true, model: 'm', content: '',
        value: { conditions: [{ name_medical: 'Migraine', earliest_date: null, notes: null, provider: null, facility: null }], measurements: [] },
        failures: [],
      }),
      'enrichment-anatomy': () => ({
        ok: true, model: 'm', content: '',
        value: new Map([[0, { system: 'nervous', organ: 'brain', anatomical_location: 'head', laterality: null, name_common: null, local_names: null, cx: 44, cy: 7 }]]),
        failures: [],
      }),
    })

    const result = await enrichFromText('report', '', [])
    expect(result.conditions[0].cx).toBe(44)
    expect(result.conditions[0].cy).toBe(7)
  })

  it('leaves cx/cy unset (not a random default) when the anatomy call has no usable position, so the DB-layer hash-jitter fallback applies', async () => {
    mockByLabel({
      'structure-analysis': structureFails,
      'extraction-condition-list': () => ({
        ok: true, model: 'm', content: '',
        value: { conditions: [{ name_medical: 'Unclear finding', earliest_date: null, notes: null, provider: null, facility: null }], measurements: [] },
        failures: [],
      }),
      'enrichment-anatomy': () => ({
        ok: true, model: 'm', content: '',
        value: new Map([[0, { system: 'nervous', organ: null, anatomical_location: null, laterality: null, name_common: null, local_names: null, cx: null, cy: null }]]),
        failures: [],
      }),
    })

    const result = await enrichFromText('report', '', [])
    expect(result.conditions[0].cx).toBeNull()
    expect(result.conditions[0].cy).toBeNull()
  })

  // ── P10-02: multi-provider/facility merge ─────────────────────────────────

  it('merges providers/facilities from every occurrence of the same condition, not just the first', async () => {
    const providerA = { name: 'Dr. Kim', specialty: null, email: null, phone: null, evidence: null }
    const providerB = { name: 'Dr. Patel', specialty: null, email: null, phone: null, evidence: null }
    const facilityA = { name: 'City Hospital', address: null, city: 'Seattle', state: 'WA', country: 'US' }
    const facilityB = { name: 'County Clinic', address: null, city: 'Tacoma', state: 'WA', country: 'US' }

    mockByLabel({
      'structure-analysis': structureFails,
      'extraction-condition-list': () => ({
        ok: true, model: 'm', content: '',
        value: {
          conditions: [
            { name_medical: 'Essential hypertension', earliest_date: '2022-06-01', notes: 'first visit', provider: providerA, facility: facilityA },
            { name_medical: 'Essential hypertension', earliest_date: '2023-01-01', notes: 'follow-up', provider: providerB, facility: facilityB },
          ],
          measurements: [],
        },
        failures: [],
      }),
      'enrichment-anatomy': () => ({
        ok: true, model: 'm', content: '',
        value: new Map([
          [0, { system: 'cardiovascular', organ: 'heart', anatomical_location: null, laterality: null, name_common: null, local_names: null, cx: null, cy: null }],
          [1, { system: 'cardiovascular', organ: 'heart', anatomical_location: null, laterality: null, name_common: null, local_names: null, cx: null, cy: null }],
        ]),
        failures: [],
      }),
    })

    const result = await enrichFromText('Complete report text', '', [])
    expect(result.conditions).toHaveLength(1)
    const merged = result.conditions[0]
    expect(merged.providers?.map((p) => p.name).sort()).toEqual(['Dr. Kim', 'Dr. Patel'])
    expect(merged.facilities?.map((f) => f.name).sort()).toEqual(['City Hospital', 'County Clinic'])
    // Earliest date still wins, unchanged from prior merge behavior.
    expect(merged.date_diagnosed).toBe('2022-06-01')
  })
})

// ── P10-01: document-wide provider/facility/date backfill ────────────────────

describe('backfillDocumentWideAttribution', () => {
  const provider = { name: 'Dr. Kim', specialty: null, email: null, phone: null, evidence: null }
  const otherProvider = { name: 'Dr. Patel', specialty: null, email: null, phone: null, evidence: null }
  const summary = (overrides: Partial<ConditionSummary> = {}): ConditionSummary => ({
    name_medical: 'Eczema', earliest_date: null, notes: null, provider: null, facility: null, ...overrides,
  })
  type ChunkExtractionResult = {
    conditions: ConditionSummary[]
    measurements: MeasurementInput[]
    reportProvider: typeof provider | null
    reportFacility: null
  }
  const fulfilled = (value: ChunkExtractionResult): PromiseFulfilledResult<ChunkExtractionResult> => ({ status: 'fulfilled', value })

  it('backfills a condition with no attribution when exactly one provider is named anywhere in the document', () => {
    const conditions = [summary(), summary({ name_medical: 'Gout' })]
    const chunkResults = [
      fulfilled({ conditions: [conditions[0]], measurements: [], reportProvider: provider, reportFacility: null }),
      fulfilled({ conditions: [conditions[1]], measurements: [], reportProvider: null, reportFacility: null }),
    ]
    const result = backfillDocumentWideAttribution(conditions, chunkResults)
    expect(result.every((c) => c.provider?.name === 'Dr. Kim')).toBe(true)
  })

  it('does not guess when more than one distinct provider appears anywhere in the document', () => {
    const conditions = [summary()]
    const chunkResults = [
      fulfilled({ conditions: [{ ...conditions[0], provider }], measurements: [], reportProvider: null, reportFacility: null }),
      fulfilled({ conditions: [summary({ name_medical: 'Gout', provider: otherProvider })], measurements: [], reportProvider: null, reportFacility: null }),
    ]
    // The second condition (Gout) already has an explicit provider — but the
    // first has none, and two distinct providers exist document-wide, so it
    // must stay unattributed rather than guessing.
    const result = backfillDocumentWideAttribution([conditions[0], summary({ name_medical: 'Gout', provider: otherProvider })], chunkResults)
    expect(result[0].provider).toBeNull()
  })
})

describe('backfillDocumentWideDate', () => {
  const summary = (overrides: Partial<ConditionSummary> = {}): ConditionSummary => ({
    name_medical: 'Eczema', earliest_date: null, notes: null, provider: null, facility: null, ...overrides,
  })

  it('backfills an undated condition from the earliest date known anywhere in the document', () => {
    const conditions = [summary(), summary({ name_medical: 'Gout', earliest_date: '2021-05-01' })]
    const result = backfillDocumentWideDate(conditions, [null, '2019-01-01'])
    expect(result[0].earliest_date).toBe('2019-01-01')
    expect(result[0].earliest_date_inherited).toBe(true)
    // A condition with its own explicit date is left untouched.
    expect(result[1].earliest_date).toBe('2021-05-01')
    expect(result[1].earliest_date_inherited).toBeUndefined()
  })

  it('leaves earliest_date null when the document genuinely has no date anywhere', () => {
    const conditions = [summary()]
    const result = backfillDocumentWideDate(conditions, [null, null])
    expect(result[0].earliest_date).toBeNull()
  })
})

// ── P10-08 (Defect 3): guaranteed-valid system, never 'other'/null ──────────

describe('parseConditionAnatomyBatch', () => {
  it('rejects an out-of-enum system value, same as a missing one', () => {
    const content = [
      JSON.stringify({ index: 0, system: 'other', organ: null, anatomical_location: null, laterality: null, name_common: null, local_names: null }),
      JSON.stringify({ index: 1, system: 'not-a-real-system', organ: null, anatomical_location: null, laterality: null, name_common: null, local_names: null }),
      JSON.stringify({ index: 2, system: 'cardiovascular', organ: 'heart', anatomical_location: null, laterality: null, name_common: null, local_names: null }),
    ].join('\n')

    const result = parseConditionAnatomyBatch(content)
    expect(result?.has(0)).toBe(false)
    expect(result?.has(1)).toBe(false)
    expect(result?.get(2)?.system).toBe('cardiovascular')
  })

  it('accepts every one of the 11 real systems', () => {
    const content = ALL_SYSTEMS
      .map((system, index) => JSON.stringify({ index, system, organ: null, anatomical_location: null, laterality: null, name_common: null, local_names: null }))
      .join('\n')

    const result = parseConditionAnatomyBatch(content)
    ALL_SYSTEMS.forEach((system, index) => {
      expect(result?.get(index)?.system).toBe(system)
    })
  })
})

describe('classifyConditionSystemLocally', () => {
  it('always returns one of the 11 valid systems, for both recognized and unrecognized inputs', () => {
    const inputs: [string, string | null][] = [
      ['Type 2 diabetes', null],
      ['Major depressive disorder', 'patient reports low mood'],
      ['Atopic dermatitis', null],
      ['Essential hypertension', null],
      ['Asthma', null],
      ['Chronic kidney disease', null],
      ['Irritable bowel syndrome', null],
      ['Reactive lymphadenopathy', null],
      ['Rotator cuff tear', null],
      ['Osteoarthritis', null],
      ['Benign prostatic hyperplasia', null],
      // Deliberately unrecognized — must still resolve to a valid system,
      // not throw or return an empty/invalid value.
      ['Xyzzy syndrome', null],
      ['', null],
    ]
    for (const [name, notes] of inputs) {
      expect(ALL_SYSTEMS).toContain(classifyConditionSystemLocally(name, notes))
    }
  })

  it('defaults to skeletal for a name with no keyword match', () => {
    expect(classifyConditionSystemLocally('Completely unrecognized condition name', null)).toBe('skeletal')
  })
})

describe('enrichFromText anatomy retry/fallback (P10-08)', () => {
  it('uses an individual retry result when the batch call omits a condition but the retry succeeds', async () => {
    let anatomyCallCount = 0
    mockByLabel({
      'structure-analysis': structureFails,
      'extraction-condition-list': () => ({
        ok: true, model: 'm', content: '',
        value: { conditions: [{ name_medical: 'Essential hypertension', earliest_date: null, notes: null, provider: null, facility: null }], measurements: [] },
        failures: [],
      }),
      'enrichment-anatomy': () => {
        anatomyCallCount += 1
        // First call (the batch) returns nothing usable for this condition;
        // the individual retry (second call) succeeds.
        if (anatomyCallCount === 1) return { ok: true, model: 'm', content: '', value: new Map(), failures: [] }
        return {
          ok: true, model: 'm', content: '',
          value: new Map([[0, { system: 'cardiovascular', organ: 'heart', anatomical_location: null, laterality: null, name_common: null, local_names: null, cx: null, cy: null }]]),
          failures: [],
        }
      },
    })

    const result = await enrichFromText('report', '', [])
    expect(result.conditions[0].system).toBe('cardiovascular')
  })

  it('never leaves system as "other"/invalid across a batch where some conditions succeed and others exhaust retries', async () => {
    let anatomyCallCount = 0
    mockByLabel({
      'structure-analysis': structureFails,
      'extraction-condition-list': () => ({
        ok: true, model: 'm', content: '',
        value: {
          conditions: [
            { name_medical: 'Essential hypertension', earliest_date: null, notes: null, provider: null, facility: null },
            { name_medical: 'Some ambiguous finding', earliest_date: null, notes: null, provider: null, facility: null },
          ],
          measurements: [],
        },
        failures: [],
      }),
      'enrichment-anatomy': () => {
        anatomyCallCount += 1
        // Call 1 is the batch call: places index 0 only, leaving index 1
        // unplaced. Calls 2+ are the individual retries for index 1 — both
        // exhaust without ever placing it, forcing the local classifier.
        if (anatomyCallCount === 1) {
          return {
            ok: true, model: 'm', content: '',
            value: new Map([[0, { system: 'cardiovascular', organ: 'heart', anatomical_location: null, laterality: null, name_common: null, local_names: null, cx: null, cy: null }]]),
            failures: [],
          }
        }
        return { ok: true, model: 'm', content: '', value: new Map(), failures: [] }
      },
    })

    const result = await enrichFromText('report', '', [])
    expect(result.conditions).toHaveLength(2)
    for (const condition of result.conditions) {
      expect(ALL_SYSTEMS).toContain(condition.system)
      expect(condition.system).not.toBe('other')
    }
    // Batch call + 2 bounded individual retries for the one unplaced condition.
    expect(anatomyCallCount).toBe(3)
  })
})
