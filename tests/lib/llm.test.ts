import {
  DEFAULT_MODELS,
  callLLMWithFallback,
  getModelChain,
  resolveOpenRouterApiKey,
  updateModelChain,
} from '@/lib/llm/client'

// ── Mock fetch ────────────────────────────────────────────────────────────────
// Calls now flow through the lmf engine (service.ts -> lmfChat/lmfEnrich ->
// buildRoute/callWithFallback), which dispatches via the openai-compat adapter —
// same wire shape (POST .../chat/completions, OpenAI-style body/response) as the
// old hand-rolled fetch loop, so the mock shape below is unchanged.

const mockFetch = jest.fn()
;(globalThis as any).fetch = mockFetch

function okResponse(content: string) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ choices: [{ message: { content } }] }),
  })
}

// status/headers matter now: the engine classifies failures by HTTP status
// (401/403 -> auth, 429 -> rate_limit, 400 -> invalid_request, 5xx -> server).
// Only 'timeout'/'network'/'server' trigger the engine's one-shot transient
// retry, so tests that expect an immediate move to the next model use a
// non-retryable status (400) rather than 5xx.
function errorResponse(status: number, message: string) {
  return Promise.resolve({
    ok: false,
    status,
    headers: new Map(),
    json: () => Promise.resolve({ error: { message } }),
  })
}

// ── Mock expo-sqlite (for getModelChain / updateModelChain) ───────────────────

const mockDb = {
  runAsync: jest.fn().mockResolvedValue(undefined),
  getFirstAsync: jest.fn().mockResolvedValue(null),
}

beforeEach(() => {
  jest.clearAllMocks()
  delete process.env.EXPO_PUBLIC_MAIGENKI_OPENROUTER_API_KEY
  delete process.env.EXPO_PUBLIC_OPENROUTER_API_KEY
})

// ── DEFAULT_MODELS ────────────────────────────────────────────────────────────

describe('DEFAULT_MODELS', () => {
  it('uses the Simfolio-style four-vendor fallback order', () => {
    expect(DEFAULT_MODELS).toEqual([
      'google/gemma-4-31b-it:free',
      'openai/gpt-oss-20b:free',
      'meta-llama/llama-3.3-70b-instruct:free',
      'nvidia/nemotron-3-ultra-550b-a55b:free',
    ])
  })

  it('ends with the NVIDIA final fallback', () => {
    const last = DEFAULT_MODELS[DEFAULT_MODELS.length - 1]
    expect(last).toBe('nvidia/nemotron-3-ultra-550b-a55b:free')
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

// ── API key resolution ────────────────────────────────────────────────────────
// BYOK precedence flip (pB02-T02): a user-supplied key now always wins when
// present. The local/env app key is only used as the tier-0 fallback when the
// user hasn't configured one.

describe('resolveOpenRouterApiKey', () => {
  it('prefers the user key over the local app key when both are configured', () => {
    process.env.EXPO_PUBLIC_MAIGENKI_OPENROUTER_API_KEY = ' sk-local '
    expect(resolveOpenRouterApiKey('sk-user')).toBe('sk-user')
  })

  it('falls back to the local app key when no user key is provided', () => {
    process.env.EXPO_PUBLIC_MAIGENKI_OPENROUTER_API_KEY = ' sk-local '
    expect(resolveOpenRouterApiKey()).toBe('sk-local')
  })

  it('falls back to the generic Expo public key when no user key or MAIGENKI key exists', () => {
    process.env.EXPO_PUBLIC_OPENROUTER_API_KEY = 'sk-public'
    expect(resolveOpenRouterApiKey()).toBe('sk-public')
  })

  it('uses a provided user key when no local app key exists', () => {
    expect(resolveOpenRouterApiKey(' sk-user ')).toBe('sk-user')
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
      .mockReturnValueOnce(errorResponse(400, 'rate limited'))
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
    // 'network' failures trigger the engine's one-shot transient retry, so
    // model-a fails twice (initial attempt + retry) before the walk moves on.
    mockFetch
      .mockRejectedValueOnce(new Error('network timeout'))
      .mockRejectedValueOnce(new Error('network timeout'))
      .mockReturnValueOnce(okResponse('recovered'))
    const result = await callLLMWithFallback({
      messages: [{ role: 'user', content: 'hi' }],
      apiKey: 'test-key',
      models,
    })
    expect(result.ok).toBe(true)
    expect(result.model).toBe('model-b:free')
    expect(result.failures).toHaveLength(1)
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
      .mockReturnValueOnce(errorResponse(500, 'down'))
      .mockReturnValueOnce(errorResponse(500, 'overloaded'))
      .mockReturnValueOnce(errorResponse(500, 'unavailable'))
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

  it('sends the request with no Authorization header when apiKey is empty (free tier)', async () => {
    mockFetch.mockReturnValueOnce(okResponse('ok'))
    await callLLMWithFallback({
      messages: [{ role: 'user', content: 'hi' }],
      apiKey: '',
      models,
    })
    const [, init] = mockFetch.mock.calls[0]
    const headers = init.headers as Record<string, string>
    // No local/env key configured either (cleared in beforeEach) — the engine's
    // auth gate treats an empty-string key as "attempt anonymously" (only a
    // `null` key, i.e. genuinely unconfigured, skips the candidate), and the
    // openai-compat adapter omits the Authorization header for a falsy key
    // rather than sending an empty `Bearer `.
    expect(headers['Authorization']).toBeUndefined()
  })

  it('sends the user key over the local app key when both are configured', async () => {
    process.env.EXPO_PUBLIC_MAIGENKI_OPENROUTER_API_KEY = 'sk-local'
    mockFetch.mockReturnValueOnce(okResponse('ok'))
    await callLLMWithFallback({
      messages: [{ role: 'user', content: 'hi' }],
      apiKey: 'sk-user',
      models,
    })
    const [, init] = mockFetch.mock.calls[0]
    const headers = init.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer sk-user')
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
