import {
  DEFAULT_MODELS,
  callLLMWithFallback,
  getModelChain,
  updateModelChain,
} from '@/lib/llm/client'

// ── Mock fetch ────────────────────────────────────────────────────────────────

const mockFetch = jest.fn()
;(globalThis as any).fetch = mockFetch

function okResponse(content: string) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ choices: [{ message: { content } }] }),
  })
}

function errorResponse(message: string) {
  return Promise.resolve({
    ok: false,
    json: () => Promise.resolve({ error: { message } }),
  })
}

// ── Mock expo-sqlite (for getModelChain / updateModelChain) ───────────────────

const mockDb = {
  runAsync: jest.fn().mockResolvedValue(undefined),
  getFirstAsync: jest.fn().mockResolvedValue(null),
}

beforeEach(() => jest.clearAllMocks())

// ── DEFAULT_MODELS ────────────────────────────────────────────────────────────

describe('DEFAULT_MODELS', () => {
  it('starts with hermes 405B (best structured-output model)', () => {
    expect(DEFAULT_MODELS[0]).toBe('nousresearch/hermes-3-llama-3.1-405b:free')
  })

  it('ends with a small emergency fallback', () => {
    const last = DEFAULT_MODELS[DEFAULT_MODELS.length - 1]
    expect(last).toBe('meta-llama/llama-3.2-3b-instruct:free')
  })

  it('has at least 4 models in the chain', () => {
    expect(DEFAULT_MODELS.length).toBeGreaterThanOrEqual(4)
  })

  it('all model IDs end with :free', () => {
    for (const m of DEFAULT_MODELS) {
      expect(m).toMatch(/:free$/)
    }
  })
})

// ── callLLMWithFallback ───────────────────────────────────────────────────────

describe('callLLMWithFallback', () => {
  const models = ['model-a:free', 'model-b:free', 'model-c:free']

  it('returns the first model response when it succeeds', async () => {
    mockFetch.mockReturnValueOnce(okResponse('hello'))
    const result = await callLLMWithFallback({
      messages: [{ role: 'user', content: 'hi' }],
      apiKey: 'test-key',
      models,
    })
    expect(result.ok).toBe(true)
    expect(result.model).toBe('model-a:free')
    expect(result.content).toBe('hello')
    expect(result.failures).toHaveLength(0)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('falls back to second model when first returns an error response', async () => {
    mockFetch
      .mockReturnValueOnce(errorResponse('rate limited'))
      .mockReturnValueOnce(okResponse('fallback answer'))
    const result = await callLLMWithFallback({
      messages: [{ role: 'user', content: 'hi' }],
      apiKey: 'test-key',
      models,
    })
    expect(result.ok).toBe(true)
    expect(result.model).toBe('model-b:free')
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0]).toContain('model-a:free')
  })

  it('falls back when fetch throws (network error)', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('network timeout'))
      .mockReturnValueOnce(okResponse('recovered'))
    const result = await callLLMWithFallback({
      messages: [{ role: 'user', content: 'hi' }],
      apiKey: 'test-key',
      models,
    })
    expect(result.ok).toBe(true)
    expect(result.model).toBe('model-b:free')
    expect(result.failures[0]).toContain('network timeout')
  })

  it('falls back when validate rejects the content', async () => {
    mockFetch
      .mockReturnValueOnce(okResponse('not valid json'))
      .mockReturnValueOnce(okResponse('{"conditions":[]}'))
    const result = await callLLMWithFallback({
      messages: [{ role: 'user', content: 'extract' }],
      apiKey: 'test-key',
      models,
      validate: (content) => {
        try { return JSON.parse(content) } catch { return null }
      },
    })
    expect(result.ok).toBe(true)
    expect(result.model).toBe('model-b:free')
    expect(result.value).toEqual({ conditions: [] })
    expect(result.failures[0]).toContain('failed validation')
  })

  it('returns ok:false with all failures when every model fails', async () => {
    mockFetch
      .mockReturnValueOnce(errorResponse('down'))
      .mockReturnValueOnce(errorResponse('overloaded'))
      .mockReturnValueOnce(errorResponse('unavailable'))
    const result = await callLLMWithFallback({
      messages: [{ role: 'user', content: 'hi' }],
      apiKey: 'test-key',
      models,
    })
    expect(result.ok).toBe(false)
    expect(result.model).toBeNull()
    expect(result.value).toBeNull()
    expect(result.failures).toHaveLength(3)
  })

  it('sends the API key in the Authorization header', async () => {
    mockFetch.mockReturnValueOnce(okResponse('ok'))
    await callLLMWithFallback({
      messages: [{ role: 'user', content: 'hi' }],
      apiKey: 'sk-or-mykey',
      models,
    })
    const [, init] = mockFetch.mock.calls[0]
    const headers = init.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer sk-or-mykey')
  })

  it('sends empty Bearer token when apiKey is empty (free tier)', async () => {
    mockFetch.mockReturnValueOnce(okResponse('ok'))
    await callLLMWithFallback({
      messages: [{ role: 'user', content: 'hi' }],
      apiKey: '',
      models,
    })
    const [, init] = mockFetch.mock.calls[0]
    const headers = init.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer ')
  })

  it('passes temperature when provided', async () => {
    mockFetch.mockReturnValueOnce(okResponse('ok'))
    await callLLMWithFallback({
      messages: [{ role: 'user', content: 'hi' }],
      apiKey: '',
      models,
      temperature: 0,
    })
    const [, init] = mockFetch.mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.temperature).toBe(0)
  })
})

// ── getModelChain ─────────────────────────────────────────────────────────────

describe('getModelChain', () => {
  it('returns DEFAULT_MODELS when no chain is stored in settings', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce(null)
    const chain = await getModelChain(mockDb as any)
    expect(chain).toEqual(DEFAULT_MODELS)
  })

  it('returns the stored chain when one exists in settings', async () => {
    const custom = ['model-x:free', 'model-y:free']
    mockDb.getFirstAsync.mockResolvedValueOnce({ value: JSON.stringify(custom) })
    const chain = await getModelChain(mockDb as any)
    expect(chain).toEqual(custom)
  })

  it('falls back to DEFAULT_MODELS if stored value is invalid JSON', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ value: 'not-json' })
    const chain = await getModelChain(mockDb as any)
    expect(chain).toEqual(DEFAULT_MODELS)
  })
})

// ── updateModelChain ──────────────────────────────────────────────────────────

describe('updateModelChain', () => {
  it('persists the chain to the settings table as JSON', async () => {
    const newChain = ['model-new:free', 'model-fallback:free']
    await updateModelChain(mockDb as any, newChain)
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR REPLACE INTO settings'),
      ['llm_model_chain', JSON.stringify(newChain)],
    )
  })
})
