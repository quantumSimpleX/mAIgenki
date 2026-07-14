import { __resetCooldownLedgerForTests, lmfChat, lmfEnrich } from '@/lib/llm/service'
import { useAppStore } from '@/store/useAppStore'
import type { KeyStore, LMFProfile } from '@/lib/lmf'

const mockFetch = jest.fn()
;(globalThis as any).fetch = mockFetch

const initialStoreState = { ...useAppStore.getState() }

function okResponse(content: string) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ choices: [{ message: { content } }] }),
  })
}

function errorResponse(status: number, message: string) {
  return Promise.resolve({
    ok: false,
    status,
    headers: new Map(),
    json: () => Promise.resolve({ error: { message } }),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  delete process.env.EXPO_PUBLIC_MAIGENKI_OPENROUTER_API_KEY
  delete process.env.EXPO_PUBLIC_OPENROUTER_API_KEY
  useAppStore.setState({ ...initialStoreState }, true)
  __resetCooldownLedgerForTests()
})

describe('lmfChat', () => {
  it('routes tier-0 requests through the free OpenRouter chain and returns content', async () => {
    mockFetch.mockResolvedValueOnce(okResponse('hello from the model'))
    const result = await lmfChat('system prompt', 'user question', { apiKey: 'user-key' })
    expect(result).toEqual({ ok: true, content: 'hello from the model' })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(init.headers.Authorization).toBe('Bearer user-key')
  })

  it('falls back through the chain on failure and returns a message on total exhaustion', async () => {
    mockFetch
      .mockResolvedValueOnce(errorResponse(500, 'server error'))
      .mockResolvedValueOnce(errorResponse(500, 'server error'))
    const result = await lmfChat('system prompt', 'user question', {
      apiKey: 'user-key',
      models: ['model-a:free', 'model-b:free'],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message.length).toBeGreaterThan(0)
    }
  })
})

// Two-provider profile/keys so a 429 on the primary candidate cools down only
// that provider (per-provider cooldown, see engine.ts) and the free-chain
// fallback (a different provider, "openrouter") still gets a real fetch call
// rather than being skipped as "on cooldown" like a same-provider retry would be.
function twoProviderSetup(): { profile: LMFProfile; keys: KeyStore } {
  const profile: LMFProfile = {
    tier: 1,
    activeProviderId: 'groq',
    model: 'llama3-70b',
    customBaseURL: null,
    fallbackToFree: true,
    keySource: 'manual',
  }
  const keys: KeyStore = {
    async get(providerId: string) {
      if (providerId === 'groq') return 'groq-key'
      if (providerId === 'openrouter') return 'user-key'
      return null
    },
    async set() {},
    async delete() {},
  }
  return { profile, keys }
}

describe('telemetry -> store status', () => {
  it('marks llmStatus degraded with lastLlmFailureKind after a 429-then-success chain', async () => {
    const { profile, keys } = twoProviderSetup()
    mockFetch
      .mockResolvedValueOnce(errorResponse(429, 'rate limited'))
      .mockResolvedValueOnce(okResponse('recovered'))
    const result = await lmfChat('system prompt', 'user question', {
      profile,
      keys,
      models: ['model-a:free'],
    })
    expect(result).toEqual({ ok: true, content: 'recovered' })
    expect(useAppStore.getState().llmStatus).toBe('degraded')
    expect(useAppStore.getState().lastLlmFailureKind).toBe('rate_limit')
  })

  it('marks llmStatus exhausted when every candidate fails', async () => {
    mockFetch
      .mockResolvedValueOnce(errorResponse(400, 'bad request'))
      .mockResolvedValueOnce(errorResponse(400, 'bad request'))
    const result = await lmfChat('system prompt', 'user question', {
      apiKey: 'user-key',
      models: ['model-a:free', 'model-b:free'],
    })
    expect(result.ok).toBe(false)
    expect(useAppStore.getState().llmStatus).toBe('exhausted')
  })

  it('keeps llmStatus ok on a clean single success', async () => {
    mockFetch.mockResolvedValueOnce(okResponse('hello'))
    const result = await lmfChat('system prompt', 'user question', { apiKey: 'user-key' })
    expect(result).toEqual({ ok: true, content: 'hello' })
    expect(useAppStore.getState().llmStatus).toBe('ok')
  })

  it('does not drop a caller-supplied telemetry override', async () => {
    mockFetch.mockResolvedValueOnce(okResponse('hello'))
    const onSuccess = jest.fn()
    await lmfChat('system prompt', 'user question', {
      apiKey: 'user-key',
      telemetry: { onSuccess },
    })
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(useAppStore.getState().llmStatus).toBe('ok')
  })

  it('does not leak a degraded status from one call into a later clean call', async () => {
    const { profile, keys } = twoProviderSetup()
    mockFetch
      .mockResolvedValueOnce(errorResponse(429, 'rate limited'))
      .mockResolvedValueOnce(okResponse('recovered'))
    await lmfChat('system prompt', 'user question', {
      profile,
      keys,
      models: ['model-a:free'],
    })
    expect(useAppStore.getState().llmStatus).toBe('degraded')

    mockFetch.mockResolvedValueOnce(okResponse('clean'))
    const result = await lmfChat('system prompt', 'user question', { apiKey: 'user-key' })
    expect(result).toEqual({ ok: true, content: 'clean' })
    expect(useAppStore.getState().llmStatus).toBe('ok')
  })
})

describe('lmfEnrich', () => {
  it('parses and validates structured JSON content', async () => {
    mockFetch.mockResolvedValueOnce(okResponse('{"conditions":[],"measurements":[]}'))
    const validate = (content: string) => {
      const parsed = JSON.parse(content)
      return parsed
    }
    const result = await lmfEnrich('system prompt', 'record text', validate, { apiKey: 'user-key' })
    expect(result).toEqual({ ok: true, value: { conditions: [], measurements: [] } })
  })

  it('reports failures when validation never succeeds', async () => {
    mockFetch.mockResolvedValueOnce(okResponse('not json'))
    const validate = () => null
    const result = await lmfEnrich('system prompt', 'record text', validate, {
      apiKey: 'user-key',
      models: ['model-a:free'],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.failures.length).toBeGreaterThan(0)
    }
  })
})
