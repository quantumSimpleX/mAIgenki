import { listModels, CURATED_MODELS } from '@/lib/lmf/models'
import { validateKey } from '@/lib/lmf/validateKey'
import { BUILT_IN_PROVIDERS } from '@/lib/lmf/registry'
import type { ProviderSpec } from '@/lib/lmf/types'

describe('listModels', () => {
  it('parses the OpenAI-shaped {data:[{id}]} list for openai-compat providers', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ id: 'gpt-5' }, { id: 'gpt-5-mini' }] }) })
    const models = await listModels(BUILT_IN_PROVIDERS.openai, 'key123', fetchImpl as any)
    expect(models).toEqual(['gpt-5', 'gpt-5-mini'])
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.openai.com/v1/models')
    expect(init.headers.Authorization).toBe('Bearer key123')
  })

  it('parses the Ollama {models:[{name}]} list with no auth header', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ models: [{ name: 'llama3.3' }, { name: 'qwen2.5' }] }) })
    const models = await listModels(BUILT_IN_PROVIDERS.ollama, null, fetchImpl as any)
    expect(models).toEqual(['llama3.3', 'qwen2.5'])
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('http://localhost:11434/v1/api/tags')
    expect(init.headers.Authorization).toBeUndefined()
  })

  it('parses the Gemini {models:[{name}]} list and strips the "models/" prefix', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ models: [{ name: 'models/gemini-2.5-flash' }] }) })
    const models = await listModels(BUILT_IN_PROVIDERS.gemini, 'key123', fetchImpl as any)
    expect(models).toEqual(['gemini-2.5-flash'])
    const [, init] = fetchImpl.mock.calls[0]
    expect(init.headers['x-goog-api-key']).toBe('key123')
  })

  it('applies x-api-key auth for anthropic', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ id: 'claude-sonnet-4-5' }] }) })
    await listModels(BUILT_IN_PROVIDERS.anthropic, 'key123', fetchImpl as any)
    const [, init] = fetchImpl.mock.calls[0]
    expect(init.headers['x-api-key']).toBe('key123')
    expect(init.headers['anthropic-version']).toBe('2023-06-01')
  })

  it('returns an empty list on a non-ok response', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) })
    const models = await listModels(BUILT_IN_PROVIDERS.openai, 'key123', fetchImpl as any)
    expect(models).toEqual([])
  })

  it('returns an empty list when the spec has no modelListPath', async () => {
    const fetchImpl = jest.fn()
    const spec: ProviderSpec = { ...BUILT_IN_PROVIDERS.custom, modelListPath: null }
    const models = await listModels(spec, 'key123', fetchImpl as any)
    expect(models).toEqual([])
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('has curated defaults for every built-in provider', () => {
    for (const providerId of Object.keys(BUILT_IN_PROVIDERS)) {
      expect(CURATED_MODELS[providerId]).toBeDefined()
    }
  })
})

describe('validateKey', () => {
  it('returns ok:true on a 200 models-list response', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) })
    const result = await validateKey(BUILT_IN_PROVIDERS.openai, 'key123', { fetchImpl: fetchImpl as any })
    expect(result).toEqual({ ok: true })
  })

  it('returns {ok:false, kind:"auth"} on a 401', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
    const result = await validateKey(BUILT_IN_PROVIDERS.openai, 'bad-key', { fetchImpl: fetchImpl as any })
    expect(result).toEqual({ ok: false, kind: 'auth' })
  })

  it('returns {ok:false, kind:"network"} when fetch throws', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new TypeError('Network request failed'))
    const result = await validateKey(BUILT_IN_PROVIDERS.openai, 'key123', { fetchImpl: fetchImpl as any })
    expect(result).toEqual({ ok: false, kind: 'network' })
  })

  it('falls back to a 1-token completion probe when modelListPath is unavailable', async () => {
    const spec: ProviderSpec = { ...BUILT_IN_PROVIDERS.custom, modelListPath: null }
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: 'hi' } }] }) })
    const result = await validateKey(spec, 'key123', { model: 'my-local-model', fetchImpl: fetchImpl as any })
    expect(result).toEqual({ ok: true })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('/chat/completions')
    expect(JSON.parse(init.body).model).toBe('my-local-model')
  })

  it('returns ok:true with no model and no modelListPath (nothing to validate against)', async () => {
    const spec: ProviderSpec = { ...BUILT_IN_PROVIDERS.custom, modelListPath: null }
    const fetchImpl = jest.fn()
    const result = await validateKey(spec, 'key123', { fetchImpl: fetchImpl as any })
    expect(result).toEqual({ ok: true })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('classifies a completion-probe auth failure via the adapter', async () => {
    const spec: ProviderSpec = { ...BUILT_IN_PROVIDERS.custom, modelListPath: null }
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: { message: 'invalid key' } }) })
    const result = await validateKey(spec, 'bad-key', { model: 'my-local-model', fetchImpl: fetchImpl as any })
    expect(result).toEqual({ ok: false, kind: 'auth' })
  })
})
