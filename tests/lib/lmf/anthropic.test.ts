import { anthropicAdapter } from '@/lib/lmf/adapters/anthropic'
import { BUILT_IN_PROVIDERS } from '@/lib/lmf/registry'
import type { ChatRequest } from '@/lib/lmf/types'

const spec = BUILT_IN_PROVIDERS.anthropic

describe('anthropicAdapter.buildRequest', () => {
  it('hoists system message to top-level system field', () => {
    const req: ChatRequest = {
      messages: [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'hi' },
      ],
    }
    const wire = anthropicAdapter.buildRequest(spec, 'claude-x', 'key123', req)
    const body = wire.body as any
    expect(body.system).toBe('You are helpful.')
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }])
  })

  it('emits x-api-key and browser-access headers', () => {
    const req: ChatRequest = { messages: [{ role: 'user', content: 'hi' }] }
    const wire = anthropicAdapter.buildRequest(spec, 'claude-x', 'key123', req)
    expect(wire.headers['x-api-key']).toBe('key123')
    expect(wire.headers['anthropic-dangerous-direct-browser-access']).toBe('true')
    expect(wire.headers['anthropic-version']).toBe('2023-06-01')
  })

  it('defaults max_tokens when maxTokens is unset', () => {
    const req: ChatRequest = { messages: [{ role: 'user', content: 'hi' }] }
    const wire = anthropicAdapter.buildRequest(spec, 'claude-x', 'key123', req)
    expect((wire.body as any).max_tokens).toBe(4096)
  })

  it('posts to /v1/messages', () => {
    const req: ChatRequest = { messages: [{ role: 'user', content: 'hi' }] }
    const wire = anthropicAdapter.buildRequest(spec, 'claude-x', 'key123', req)
    expect(wire.url).toBe('https://api.anthropic.com/v1/messages')
  })
})

describe('anthropicAdapter.parseResponse', () => {
  it('parses content text blocks and stop_reason', () => {
    const result = anthropicAdapter.parseResponse(spec, 'claude-x', {
      content: [{ type: 'text', text: 'hello world' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 12, output_tokens: 8 },
    })
    expect(result.content).toBe('hello world')
    expect(result.finishReason).toBe('end_turn')
    expect(result.usage).toEqual({ promptTokens: 12, completionTokens: 8 })
    expect(result.providerId).toBe('anthropic')
  })
})

describe('anthropicAdapter.classifyError', () => {
  it('maps authentication_error to auth', () => {
    const c = anthropicAdapter.classifyError(spec, 401, { error: { type: 'authentication_error', message: 'x' } }, {})
    expect(c.kind).toBe('auth')
  })

  it('maps rate_limit_error to rate_limit', () => {
    const c = anthropicAdapter.classifyError(spec, 429, { error: { type: 'rate_limit_error', message: 'x' } }, {})
    expect(c.kind).toBe('rate_limit')
  })

  it('maps overloaded_error to server', () => {
    const c = anthropicAdapter.classifyError(spec, 529, { error: { type: 'overloaded_error', message: 'x' } }, {})
    expect(c.kind).toBe('server')
  })

  it('maps invalid_request_error to invalid_request', () => {
    const c = anthropicAdapter.classifyError(spec, 400, { error: { type: 'invalid_request_error', message: 'x' } }, {})
    expect(c.kind).toBe('invalid_request')
  })

  it('falls back to classifyHttp for unknown types', () => {
    const c = anthropicAdapter.classifyError(spec, 500, { error: { type: 'weird_error', message: 'x' } }, {})
    expect(c.kind).toBe('server')
  })
})
