import {
  openaiCompatAdapter,
  shouldRetryWithoutResponseFormat,
  shouldRetryWithSwappedTokenParam,
  withoutResponseFormat,
  withSwappedTokenParam,
} from '@/lib/lmf/adapters/openaiCompat'
import { BUILT_IN_PROVIDERS } from '@/lib/lmf/registry'
import type { ChatRequest } from '@/lib/lmf/types'

const req: ChatRequest = {
  messages: [{ role: 'user', content: 'hello' }],
  maxTokens: 500,
}

describe('openaiCompatAdapter.buildRequest', () => {
  it('builds the correct URL, bearer header, and tokenParam', () => {
    const spec = BUILT_IN_PROVIDERS.openrouter
    const wire = openaiCompatAdapter.buildRequest(spec, 'some/model:free', 'sk-or-abc', req)
    expect(wire.url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(wire.headers.Authorization).toBe('Bearer sk-or-abc')
    expect(wire.headers['HTTP-Referer']).toBe('https://maigenki.app')
    expect(wire.headers['X-Title']).toBe('mAIgenki')
    expect((wire.body as any).max_tokens).toBe(500)
  })

  it('uses max_completion_tokens for openai', () => {
    const spec = BUILT_IN_PROVIDERS.openai
    const wire = openaiCompatAdapter.buildRequest(spec, 'gpt-5', 'sk-abc', req)
    expect((wire.body as any).max_completion_tokens).toBe(500)
    expect((wire.body as any).max_tokens).toBeUndefined()
  })

  it('emits no Authorization header for ollama (authStyle none)', () => {
    const spec = BUILT_IN_PROVIDERS.ollama
    const wire = openaiCompatAdapter.buildRequest(spec, 'llama3', null, req)
    expect(wire.headers.Authorization).toBeUndefined()
  })

  it('includes response_format only when json requested and supported', () => {
    const spec = BUILT_IN_PROVIDERS.openrouter
    const withJson = openaiCompatAdapter.buildRequest(spec, 'm', 'k', { ...req, responseFormat: 'json' })
    expect((withJson.body as any).response_format).toEqual({ type: 'json_object' })

    const withoutJson = openaiCompatAdapter.buildRequest(spec, 'm', 'k', req)
    expect((withoutJson.body as any).response_format).toBeUndefined()

    const unsupported = BUILT_IN_PROVIDERS.ollama
    const wireUnsupported = openaiCompatAdapter.buildRequest(unsupported, 'm', null, {
      ...req,
      responseFormat: 'json',
    })
    expect((wireUnsupported.body as any).response_format).toBeUndefined()
  })
})

describe('openaiCompatAdapter.parseResponse', () => {
  it('parses content, finish_reason, and usage', () => {
    const spec = BUILT_IN_PROVIDERS.openrouter
    const result = openaiCompatAdapter.parseResponse(spec, 'm', {
      choices: [{ message: { content: 'hi there' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    })
    expect(result.content).toBe('hi there')
    expect(result.finishReason).toBe('stop')
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 5 })
    expect(result.providerId).toBe('openrouter')
  })
})

describe('openaiCompatAdapter.classifyError', () => {
  const spec = BUILT_IN_PROVIDERS.openrouter

  it('classifies insufficient_quota as quota_billing', () => {
    const c = openaiCompatAdapter.classifyError(spec, 400, { error: { message: 'insufficient_quota' } }, {})
    expect(c.kind).toBe('quota_billing')
  })

  it('classifies context_length_exceeded as invalid_request', () => {
    const c = openaiCompatAdapter.classifyError(spec, 400, { error: { message: 'context_length_exceeded' } }, {})
    expect(c.kind).toBe('invalid_request')
  })

  it('classifies moderation as content_filter', () => {
    const c = openaiCompatAdapter.classifyError(spec, 400, { error: { message: 'flagged by moderation' } }, {})
    expect(c.kind).toBe('content_filter')
  })

  it('falls back to classifyHttp for other statuses', () => {
    const c = openaiCompatAdapter.classifyError(spec, 429, { error: { message: 'too many requests' } }, {})
    expect(c.kind).toBe('rate_limit')
  })
})

describe('divergence guards', () => {
  it('detects response_format retry condition and strips it', () => {
    const spec = BUILT_IN_PROVIDERS.openrouter
    const wire = openaiCompatAdapter.buildRequest(spec, 'm', 'k', { ...req, responseFormat: 'json' })
    expect(shouldRetryWithoutResponseFormat(wire.body, 'response_format is not supported')).toBe(true)
    const stripped = withoutResponseFormat(wire.body)
    expect(stripped.response_format).toBeUndefined()
  })

  it('detects max_completion_tokens swap condition and swaps it', () => {
    const spec = BUILT_IN_PROVIDERS.openrouter
    const wire = openaiCompatAdapter.buildRequest(spec, 'm', 'k', req)
    expect(shouldRetryWithSwappedTokenParam(wire.body, 'use max_completion_tokens instead')).toBe(true)
    const swapped = withSwappedTokenParam(wire.body)
    expect(swapped.max_completion_tokens).toBe(500)
    expect(swapped.max_tokens).toBeUndefined()
  })
})
