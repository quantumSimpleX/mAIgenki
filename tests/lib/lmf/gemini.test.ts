import { geminiAdapter } from '@/lib/lmf/adapters/gemini'
import { BUILT_IN_PROVIDERS } from '@/lib/lmf/registry'
import type { ChatRequest } from '@/lib/lmf/types'

const spec = BUILT_IN_PROVIDERS.gemini

describe('geminiAdapter.buildRequest', () => {
  it('maps assistant role to model and hoists system message', () => {
    const req: ChatRequest = {
      messages: [
        { role: 'system', content: 'Be terse.' },
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
      ],
    }
    const wire = geminiAdapter.buildRequest(spec, 'gemini-x', 'key123', req)
    const body = wire.body as any
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'Be terse.' }] })
    expect(body.contents).toEqual([
      { role: 'user', parts: [{ text: 'hi' }] },
      { role: 'model', parts: [{ text: 'hello' }] },
    ])
  })

  it('maps maxTokens to generationConfig.maxOutputTokens', () => {
    const req: ChatRequest = { messages: [{ role: 'user', content: 'hi' }], maxTokens: 200 }
    const wire = geminiAdapter.buildRequest(spec, 'gemini-x', 'key123', req)
    expect((wire.body as any).generationConfig.maxOutputTokens).toBe(200)
  })

  it('emits x-goog-api-key header and correct URL', () => {
    const req: ChatRequest = { messages: [{ role: 'user', content: 'hi' }] }
    const wire = geminiAdapter.buildRequest(spec, 'gemini-x', 'key123', req)
    expect(wire.headers['x-goog-api-key']).toBe('key123')
    expect(wire.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent')
  })
})

describe('geminiAdapter.parseResponse', () => {
  it('parses candidate text, finishReason, and usage', () => {
    const result = geminiAdapter.parseResponse(spec, 'gemini-x', {
      candidates: [{ content: { parts: [{ text: 'hello' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2 },
    })
    expect(result.content).toBe('hello')
    expect(result.finishReason).toBe('STOP')
    expect(result.usage).toEqual({ promptTokens: 4, completionTokens: 2 })
    expect(result.providerId).toBe('gemini')
  })
})

describe('geminiAdapter.classifyError', () => {
  it('maps RESOURCE_EXHAUSTED to rate_limit', () => {
    const c = geminiAdapter.classifyError(spec, 429, { error: { status: 'RESOURCE_EXHAUSTED', message: 'x' } }, {})
    expect(c.kind).toBe('rate_limit')
  })

  it('maps PERMISSION_DENIED and UNAUTHENTICATED to auth', () => {
    expect(geminiAdapter.classifyError(spec, 403, { error: { status: 'PERMISSION_DENIED', message: 'x' } }, {}).kind).toBe('auth')
    expect(geminiAdapter.classifyError(spec, 401, { error: { status: 'UNAUTHENTICATED', message: 'x' } }, {}).kind).toBe('auth')
  })

  it('maps INVALID_ARGUMENT to invalid_request', () => {
    const c = geminiAdapter.classifyError(spec, 400, { error: { status: 'INVALID_ARGUMENT', message: 'x' } }, {})
    expect(c.kind).toBe('invalid_request')
  })

  it('falls back to classifyHttp for unknown codes', () => {
    const c = geminiAdapter.classifyError(spec, 500, { error: { status: 'INTERNAL', message: 'x' } }, {})
    expect(c.kind).toBe('server')
  })
})
