import { callWithFallback, createCooldownLedger } from '@/lib/lmf/engine'
import { BUILT_IN_PROVIDERS } from '@/lib/lmf/registry'
import type { Candidate, ChatRequest, KeyStore, Route } from '@/lib/lmf/types'

const openrouterSpec = BUILT_IN_PROVIDERS.openrouter
const anthropicSpec = BUILT_IN_PROVIDERS.anthropic
const geminiSpec = BUILT_IN_PROVIDERS.gemini

function candidate(model: string, spec = openrouterSpec, providerId = spec.id): Candidate {
  return { providerId, model, spec }
}

function okResponse(content: string) {
  const body = { choices: [{ message: { content }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } }
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => body,
    text: async () => JSON.stringify(body),
  }
}

function errorResponse(status: number, body: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  return {
    ok: false,
    status,
    headers: new Headers(headers),
    json: async () => body,
    text: async () => JSON.stringify(body),
  }
}

function makeKeys(map: Record<string, string | null> = {}): KeyStore {
  return {
    get: async (providerId: string) => (providerId in map ? map[providerId] : 'test-key'),
    set: async () => {},
    delete: async () => {},
  }
}

const req: ChatRequest = { messages: [{ role: 'user', content: 'hi' }] }

describe('callWithFallback', () => {
  it('returns success from the first candidate when it succeeds', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(okResponse('hello'))
    const route: Route = [candidate('model-a'), candidate('model-b')]
    const result = await callWithFallback(route, req, makeKeys(), undefined, { fetchImpl })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe('hello')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('falls through to the next candidate on failure, in route order', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(errorResponse(400, { error: { message: 'bad request' } }))
      .mockResolvedValueOnce(okResponse('from second'))
    const route: Route = [candidate('model-a'), candidate('model-b')]
    const result = await callWithFallback(route, req, makeKeys(), undefined, { fetchImpl })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe('from second')
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0].kind).toBe('invalid_request')
  })

  it('returns ok:false with all failures when every candidate fails', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(errorResponse(400, { error: { message: 'bad' } }))
    const route: Route = [candidate('model-a'), candidate('model-b')]
    const result = await callWithFallback(route, req, makeKeys(), undefined, { fetchImpl })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failures).toHaveLength(2)
  })

  it('skips all remaining candidates on the same provider after an auth failure', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(errorResponse(401, { error: { message: 'bad key' } }))
      .mockResolvedValueOnce((() => {
        const body = { content: [{ type: 'text', text: 'from anthropic' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }
        return { ok: true, status: 200, headers: new Headers(), json: async () => body, text: async () => JSON.stringify(body) }
      })())
    const route: Route = [
      candidate('model-a', openrouterSpec, 'openrouter'),
      candidate('model-b', openrouterSpec, 'openrouter'),
      candidate('claude-x', anthropicSpec, 'anthropic'),
    ]
    const result = await callWithFallback(route, req, makeKeys(), undefined, { fetchImpl })

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe('from anthropic')
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0].kind).toBe('auth')
  })

  it('records an auth failure and skips the provider when no key is configured', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(okResponse('unused'))
    const route: Route = [candidate('model-a', openrouterSpec, 'openrouter')]
    const keys = makeKeys({ openrouter: null })
    const result = await callWithFallback(route, req, keys, undefined, { fetchImpl })

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failures[0].kind).toBe('auth')
  })

  it('sets a cooldown on rate_limit using Retry-After and skips the candidate on the next call', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(errorResponse(429, { error: { message: 'slow down' } }, { 'retry-after': '30' }))
    const cooldown = createCooldownLedger()
    const route: Route = [candidate('model-a')]

    const first = await callWithFallback(route, req, makeKeys(), undefined, { fetchImpl, cooldown })
    expect(first.ok).toBe(false)
    if (!first.ok) expect(first.failures[0].kind).toBe('rate_limit')

    fetchImpl.mockClear()
    const second = await callWithFallback(route, req, makeKeys(), undefined, { fetchImpl, cooldown })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.failures[0].message).toMatch(/cooldown/i)
  })

  it('advances past a candidate whose response fails validation', async () => {
    const fetchImpl = jest.fn().mockResolvedValueOnce(okResponse('not json')).mockResolvedValueOnce(okResponse('{"ok":true}'))
    const route: Route = [candidate('model-a'), candidate('model-b')]
    const validate = (content: string) => {
      try {
        return JSON.parse(content)
      } catch {
        return null
      }
    }
    const result = await callWithFallback(route, req, makeKeys(), validate, { fetchImpl })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toEqual({ ok: true })
    expect(result.failures.some((f) => f.kind === 'validation')).toBe(true)
  })

  it('stops immediately and returns ok:false when the caller aborts', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchImpl = jest.fn()
    const abortedReq: ChatRequest = { ...req, signal: controller.signal }
    const route: Route = [candidate('model-a')]
    const result = await callWithFallback(route, abortedReq, makeKeys(), undefined, { fetchImpl })

    expect(result.ok).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('retries a transient network failure once before advancing', async () => {
    const fetchImpl = jest
      .fn()
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce(okResponse('recovered'))
    const route: Route = [candidate('model-a')]
    const result = await callWithFallback(route, req, makeKeys(), undefined, { fetchImpl })

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe('recovered')
  })

  it('times out a hung request using the composed AbortController', async () => {
    const fetchImpl = jest.fn((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted')
          err.name = 'AbortError'
          reject(err)
        })
      })
    })
    const route: Route = [candidate('model-a')]
    const result = await callWithFallback(route, req, makeKeys(), undefined, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 20,
      retryTransient: false,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failures[0].kind).toBe('timeout')
  }, 10000)

  it('redacts API keys from failure messages', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(errorResponse(400, { error: { message: 'bad token sk-or-secretsecretsecret123' } }))
    const route: Route = [candidate('model-a')]
    const result = await callWithFallback(route, req, makeKeys({ openrouter: 'sk-or-secretsecretsecret123' }), undefined, { fetchImpl })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.failures[0].message).not.toContain('sk-or-secretsecretsecret123')
      expect(result.failures[0].message).toContain('[REDACTED]')
    }
  })

  it('never passes raw keys or message content to telemetry, only Candidate/failure metadata', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(errorResponse(400, { error: { message: 'bad sk-or-leakedleakedleaked123' } }))
      .mockResolvedValueOnce(okResponse('final content'))
    const route: Route = [candidate('model-a'), candidate('model-b')]
    const onAttempt = jest.fn()
    const onFailure = jest.fn()
    const onSuccess = jest.fn()
    const result = await callWithFallback(route, req, makeKeys({ openrouter: 'sk-or-leakedleakedleaked123' }), undefined, {
      fetchImpl,
      telemetry: { onAttempt, onFailure, onSuccess },
    })

    expect(result.ok).toBe(true)
    expect(onAttempt).toHaveBeenCalledTimes(2)
    expect(onAttempt.mock.calls[0][0]).toEqual(candidate('model-a'))
    expect(onFailure).toHaveBeenCalledTimes(1)
    expect(onFailure.mock.calls[0][0].message).not.toContain('sk-or-leakedleakedleaked123')
    expect(onSuccess).toHaveBeenCalledTimes(1)
    const [successResult] = onSuccess.mock.calls[0]
    expect(successResult.content).toBe('final content')
  })

  it('calls onExhausted with all failures when the whole route is exhausted', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(errorResponse(400, { error: { message: 'bad' } }))
    const route: Route = [candidate('model-a')]
    const onExhausted = jest.fn()
    await callWithFallback(route, req, makeKeys(), undefined, { fetchImpl, telemetry: { onExhausted } })

    expect(onExhausted).toHaveBeenCalledTimes(1)
    expect(onExhausted.mock.calls[0][0]).toHaveLength(1)
  })

  it('dispatches to the gemini adapter for a gemini candidate', async () => {
    const geminiBody = { candidates: [{ content: { parts: [{ text: 'from gemini' }] }, finishReason: 'STOP' }] }
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => geminiBody,
      text: async () => JSON.stringify(geminiBody),
    })
    const route: Route = [candidate('gemini-x', geminiSpec, 'gemini')]
    const result = await callWithFallback(route, req, makeKeys(), undefined, { fetchImpl })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe('from gemini')
    const [url] = fetchImpl.mock.calls[0]
    expect(url).toContain('generateContent')
  })

  it('treats a non-numeric Retry-After header as no retry hint', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(errorResponse(429, { error: { message: 'slow down' } }, { 'retry-after': 'not-a-number' }))
    const route: Route = [candidate('model-a')]
    const result = await callWithFallback(route, req, makeKeys(), undefined, { fetchImpl })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failures[0].retryAfterMs).toBeNull()
  })

  it('returns ok:false when the caller aborts mid-flight, after a fetch is already in progress', async () => {
    const controller = new AbortController()
    const fetchImpl = jest.fn((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted')
          err.name = 'AbortError'
          reject(err)
        })
      })
    })
    const abortedReq: ChatRequest = { ...req, signal: controller.signal }
    const route: Route = [candidate('model-a'), candidate('model-b')]
    const resultPromise = callWithFallback(route, abortedReq, makeKeys(), undefined, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    // Let the engine reach doFetch and register its abort listener before aborting.
    await new Promise((resolve) => setTimeout(resolve, 0))
    controller.abort()
    const result = await resultPromise

    expect(result.ok).toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('retries without response_format when the provider rejects it, then succeeds', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(errorResponse(400, { error: { message: 'response_format is not supported for this model' } }))
      .mockResolvedValueOnce(okResponse('retried ok'))
    const route: Route = [candidate('model-a')]
    const jsonReq: ChatRequest = { ...req, responseFormat: 'json' }
    const result = await callWithFallback(route, jsonReq, makeKeys(), undefined, { fetchImpl })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe('retried ok')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const secondBody = JSON.parse(fetchImpl.mock.calls[1][1].body)
    expect(secondBody.response_format).toBeUndefined()
  })

  it('retries with a swapped token param when the provider rejects max_tokens, then succeeds', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(errorResponse(400, { error: { message: 'use max_completion_tokens instead of max_tokens' } }))
      .mockResolvedValueOnce(okResponse('retried ok'))
    const route: Route = [candidate('model-a')]
    const tokenReq: ChatRequest = { ...req, maxTokens: 100 }
    const result = await callWithFallback(route, tokenReq, makeKeys(), undefined, { fetchImpl })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe('retried ok')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const secondBody = JSON.parse(fetchImpl.mock.calls[1][1].body)
    expect(secondBody.max_completion_tokens).toBe(100)
    expect(secondBody.max_tokens).toBeUndefined()
  })
})
