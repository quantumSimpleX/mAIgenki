import 'fake-indexeddb/auto'
import {
  scoreModel,
  normaliseElo,
  compositeScore,
  refreshModelChain,
  shouldRefresh,
  SCORE_WEIGHTS,
} from '@/lib/llm/refresh'
import { openIndexedDb, getIndexedSetting, putIndexedSetting } from '@/lib/db/indexedDb'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockFetch = jest.fn()
;(globalThis as any).fetch = mockFetch

function freshDb(): Promise<IDBDatabase> {
  return openIndexedDb(`maigenki-refresh-${Date.now()}-${Math.random()}`)
}

// Minimal OpenRouter model shape
function makeModel(id: string, overrides: Record<string, unknown> = {}) {
  return { id, context_length: 131072, benchmarks: null, ...overrides }
}

beforeEach(() => jest.clearAllMocks())

// ── SCORE_WEIGHTS ─────────────────────────────────────────────────────────────

describe('SCORE_WEIGHTS', () => {
  it('sum to 1.0', () => {
    const total = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(1.0)
  })
})

// ── scoreModel ────────────────────────────────────────────────────────────────

describe('scoreModel', () => {
  it('returns -1 for a model with no benchmark data', () => {
    expect(scoreModel(makeModel('x:free'))).toBe(-1)
  })

  it('computes weighted score from artificial_analysis indices', () => {
    const model = makeModel('x:free', {
      benchmarks: {
        artificial_analysis: {
          intelligence_index: 80,
          agentic_index: 70,
          coding_index: 60,
        },
      },
    })
    // With no arena data: redistribute arena weights onto OR weights proportionally
    const score = scoreModel(model)
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThanOrEqual(100)
  })

  it('Nemotron Ultra scores lower than Hermes 405B on same benchmark set', () => {
    const nemotron = makeModel('nvidia/nemotron-3-ultra-550b-a55b:free', {
      benchmarks: { artificial_analysis: { intelligence_index: 37.8, agentic_index: 27.4, coding_index: 49.3 } },
    })
    const hermes = makeModel('nousresearch/hermes-3-llama-3.1-405b:free', {
      benchmarks: { artificial_analysis: { intelligence_index: 78, agentic_index: 72, coding_index: 65 } },
    })
    expect(scoreModel(hermes)).toBeGreaterThan(scoreModel(nemotron))
  })
})

// ── normaliseElo ──────────────────────────────────────────────────────────────

describe('normaliseElo', () => {
  it('maps ELO range to 0–100', () => {
    expect(normaliseElo(1200, 1100, 1600)).toBeCloseTo(20)
    expect(normaliseElo(1600, 1100, 1600)).toBeCloseTo(100)
    expect(normaliseElo(1100, 1100, 1600)).toBeCloseTo(0)
  })

  it('clamps values outside the range', () => {
    expect(normaliseElo(900, 1100, 1600)).toBe(0)
    expect(normaliseElo(1700, 1100, 1600)).toBe(100)
  })
})

// ── compositeScore ────────────────────────────────────────────────────────────

describe('compositeScore', () => {
  it('redistributes arena weights when arena data is absent', () => {
    const orOnly = compositeScore(
      { intelligence: 80, agentic: 70, coding: 60 },
      null,
    )
    const withArena = compositeScore(
      { intelligence: 80, agentic: 70, coding: 60 },
      { document: 75, instruction: 65 },
    )
    // Both should be valid numbers; redistribution means orOnly is still meaningful
    expect(orOnly).toBeGreaterThan(0)
    expect(withArena).toBeGreaterThan(0)
  })

  it('two models with equal OR scores but better arena data ranks higher', () => {
    const or = { intelligence: 70, agentic: 65, coding: 60 }
    const goodArena = compositeScore(or, { document: 90, instruction: 85 })
    const badArena = compositeScore(or, { document: 40, instruction: 35 })
    expect(goodArena).toBeGreaterThan(badArena)
  })
})

// ── shouldRefresh ─────────────────────────────────────────────────────────────

describe('shouldRefresh', () => {
  it('returns true when no timestamp is stored', () => {
    expect(shouldRefresh(null)).toBe(true)
  })

  it('returns true when last check was more than 30 days ago', () => {
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()
    expect(shouldRefresh(old)).toBe(true)
  })

  it('returns false when last check was within 30 days', () => {
    const recent = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
    expect(shouldRefresh(recent)).toBe(false)
  })
})

// ── refreshModelChain ─────────────────────────────────────────────────────────

describe('refreshModelChain', () => {
  const freeModels = [
    makeModel('nousresearch/hermes-3-llama-3.1-405b:free', {
      context_length: 131072,
      benchmarks: { artificial_analysis: { intelligence_index: 78, agentic_index: 72, coding_index: 65 } },
    }),
    makeModel('openai/gpt-oss-120b:free', {
      context_length: 131072,
      benchmarks: { artificial_analysis: { intelligence_index: 72, agentic_index: 68, coding_index: 70 } },
    }),
    makeModel('nvidia/nemotron-3-ultra-550b-a55b:free', {
      context_length: 1000000,
      benchmarks: { artificial_analysis: { intelligence_index: 37.8, agentic_index: 27.4, coding_index: 49.3 } },
    }),
    makeModel('meta-llama/llama-3.3-70b-instruct:free', {
      context_length: 131072,
      benchmarks: { artificial_analysis: { intelligence_index: 65, agentic_index: 60, coding_index: 55 } },
    }),
    makeModel('meta-llama/llama-3.2-3b-instruct:free', {
      context_length: 131072,
      benchmarks: null,
    }),
  ]

  function orApiResponse() {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ data: freeModels }),
    })
  }

  it('ranks hermes above nemotron ultra based on benchmark scores', async () => {
    mockFetch.mockReturnValueOnce(orApiResponse())

    const db = await freshDb()
    const chain = await refreshModelChain(db, '')
    const hermesIdx = chain.indexOf('nousresearch/hermes-3-llama-3.1-405b:free')
    const nemotronIdx = chain.indexOf('nvidia/nemotron-3-ultra-550b-a55b:free')
    expect(hermesIdx).toBeGreaterThanOrEqual(0)
    // Nemotron should rank lower (higher index) or not appear in top 5
    if (nemotronIdx >= 0) expect(hermesIdx).toBeLessThan(nemotronIdx)
    db.close()
  })

  it('stores the refreshed chain in settings', async () => {
    mockFetch.mockReturnValueOnce(orApiResponse())

    const db = await freshDb()
    await refreshModelChain(db, '')
    const stored = await getIndexedSetting(db, 'llm_model_chain')
    expect(stored).not.toBeNull()
    expect(JSON.parse(stored!)).toEqual(expect.arrayContaining(['nousresearch/hermes-3-llama-3.1-405b:free']))
    db.close()
  })

  it('stores llm_chain_last_checked timestamp after refresh', async () => {
    mockFetch.mockReturnValueOnce(orApiResponse())

    const db = await freshDb()
    await refreshModelChain(db, '')
    const timestamp = await getIndexedSetting(db, 'llm_chain_last_checked')
    expect(timestamp).not.toBeNull()
    db.close()
  })

  it('falls back to DEFAULT_MODELS if OpenRouter API fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network error'))
    const db = await freshDb()
    const chain = await refreshModelChain(db, '')
    // Should return something — the default chain
    expect(Array.isArray(chain)).toBe(true)
    expect(chain.length).toBeGreaterThan(0)
    db.close()
  })

  it('excludes models with no benchmarks from top positions', async () => {
    mockFetch.mockReturnValueOnce(orApiResponse())

    const db = await freshDb()
    const chain = await refreshModelChain(db, '')
    // llama-3.2-3b has no benchmarks — should be last if it appears at all
    const smallIdx = chain.indexOf('meta-llama/llama-3.2-3b-instruct:free')
    if (smallIdx >= 0) {
      expect(smallIdx).toBe(chain.length - 1)
    }
    db.close()
  })
})

// ── service.ts wiring (pB07-T02) ───────────────────────────────────────────────
// service.ts's `refreshTriggered` flag is module-scoped, so each test below
// resets the module registry and re-requires `lmfChat` fresh to isolate it.

describe('service.ts refresh wiring', () => {
  async function makeWiringDb(lastChecked: string | null): Promise<IDBDatabase> {
    const db = await freshDb()
    if (lastChecked) await putIndexedSetting(db, 'llm_chain_last_checked', lastChecked)
    return db
  }

  function chatResponse() {
    const body = { choices: [{ message: { content: 'reply' } }] }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    })
  }

  function modelsListResponse() {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    })
  }

  beforeEach(() => {
    jest.resetModules()
    mockFetch.mockReset()
    delete process.env.EXPO_PUBLIC_MAIGENKI_OPENROUTER_API_KEY
    delete process.env.EXPO_PUBLIC_OPENROUTER_API_KEY
  })

  it('skips the refresh fetch when last checked was recent (shouldRefresh gate)', async () => {
    const recent = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
    const db = await makeWiringDb(recent)
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/chat/completions')) return chatResponse()
      return modelsListResponse()
    })

    const { lmfChat } = await import('@/lib/llm/service')
    const result = await lmfChat('sys', 'hi', { apiKey: 'key', db })
    expect(result.ok).toBe(true)

    // Let any fire-and-forget microtask work settle.
    await new Promise((resolve) => setTimeout(resolve, 0))
    const modelsListCalled = mockFetch.mock.calls.some((c: unknown[]) =>
      String(c[0]).includes('/models?max_price=0'),
    )
    expect(modelsListCalled).toBe(false)
  })

  it('does not block or delay the calling lmfChat when a refresh is due', async () => {
    const db = await makeWiringDb(null) // no timestamp stored → shouldRefresh gate is due
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/chat/completions')) return chatResponse()
      // Never-resolving models-list fetch simulates a slow/hung refresh.
      return new Promise(() => {})
    })

    const { lmfChat } = await import('@/lib/llm/service')
    const result = await lmfChat('sys', 'hi', { apiKey: 'key', db })
    expect(result).toEqual({ ok: true, content: 'reply' })
  })

  it('leaves the existing model chain untouched when the refresh fetch fails', async () => {
    const db = await makeWiringDb(null)
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/chat/completions')) return chatResponse()
      return Promise.reject(new Error('network error'))
    })

    const { lmfChat } = await import('@/lib/llm/service')
    const result = await lmfChat('sys', 'hi', { apiKey: 'key', db })
    expect(result.ok).toBe(true)

    await new Promise((resolve) => setTimeout(resolve, 0))
    // refreshModelChain swallows the fetch failure and never calls updateModelChain —
    // no write to the llm_model_chain setting.
    expect(await getIndexedSetting(db, 'llm_model_chain')).toBeNull()
  })

  it('only triggers the refresh check once per process even across repeated calls', async () => {
    const db = await makeWiringDb(null)
    let modelsListCalls = 0
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/chat/completions')) return chatResponse()
      modelsListCalls += 1
      return modelsListResponse()
    })

    const { lmfChat } = await import('@/lib/llm/service')
    await lmfChat('sys', 'hi', { apiKey: 'key', db })
    await lmfChat('sys', 'hi again', { apiKey: 'key', db })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(modelsListCalls).toBe(1)
  })
})
