import {
  filterModels, isAllowedBaseURL, resolveSelectedModel,
  validationMessage, validationStateFromResult,
} from '@/lib/llm/providerSettingsLogic'

describe('validationStateFromResult / validationMessage', () => {
  it('maps ok result to valid state with a positive message', () => {
    const state = validationStateFromResult({ ok: true })
    expect(state).toEqual({ status: 'valid' })
    expect(validationMessage(state)).toBe('Key verified.')
  })

  it('distinguishes auth failure from network failure', () => {
    const authState = validationStateFromResult({ ok: false, kind: 'auth' })
    const networkState = validationStateFromResult({ ok: false, kind: 'network' })
    expect(validationMessage(authState)).toMatch(/rejected/i)
    expect(validationMessage(networkState)).toMatch(/reach the provider/i)
    expect(validationMessage(authState)).not.toBe(validationMessage(networkState))
  })

  it('falls back to a generic message for other error kinds', () => {
    const state = validationStateFromResult({ ok: false, kind: 'server' })
    expect(validationMessage(state)).toBe('Validation failed — please try again.')
  })

  it('has no message for idle state and a progress message while validating', () => {
    expect(validationMessage({ status: 'idle' })).toBeNull()
    expect(validationMessage({ status: 'validating' })).toMatch(/validating/i)
  })
})

describe('isAllowedBaseURL', () => {
  it('allows https URLs', () => {
    expect(isAllowedBaseURL('https://api.example.com/v1')).toBe(true)
  })

  it('rejects http URLs for public hosts', () => {
    expect(isAllowedBaseURL('http://api.example.com/v1')).toBe(false)
  })

  it('allows http for localhost and private LAN addresses (Ollama)', () => {
    expect(isAllowedBaseURL('http://localhost:11434/v1')).toBe(true)
    expect(isAllowedBaseURL('http://127.0.0.1:11434/v1')).toBe(true)
    expect(isAllowedBaseURL('http://192.168.1.50:11434/v1')).toBe(true)
    expect(isAllowedBaseURL('http://10.0.0.5:11434/v1')).toBe(true)
    expect(isAllowedBaseURL('http://172.16.0.5:11434/v1')).toBe(true)
  })

  it('rejects malformed URLs', () => {
    expect(isAllowedBaseURL('not-a-url')).toBe(false)
    expect(isAllowedBaseURL('')).toBe(false)
  })
})

describe('filterModels', () => {
  const models = ['gpt-5-mini', 'gpt-5', 'claude-sonnet-4-5', 'llama-3.3-70b']

  it('returns all models when query is empty', () => {
    expect(filterModels(models, '')).toEqual(models)
    expect(filterModels(models, '   ')).toEqual(models)
  })

  it('filters case-insensitively by substring', () => {
    expect(filterModels(models, 'GPT')).toEqual(['gpt-5-mini', 'gpt-5'])
    expect(filterModels(models, 'claude')).toEqual(['claude-sonnet-4-5'])
  })

  it('returns an empty list when nothing matches', () => {
    expect(filterModels(models, 'nonexistent')).toEqual([])
  })
})

describe('resolveSelectedModel', () => {
  it('prefers free-text over a picked model', () => {
    expect(resolveSelectedModel('gpt-5', 'custom-model-id')).toBe('custom-model-id')
  })

  it('trims free-text before comparing', () => {
    expect(resolveSelectedModel('gpt-5', '   ')).toBe('gpt-5')
    expect(resolveSelectedModel('gpt-5', '  custom  ')).toBe('custom')
  })

  it('falls back to the picked model when free-text is empty', () => {
    expect(resolveSelectedModel('gpt-5', '')).toBe('gpt-5')
  })

  it('returns null when nothing is selected', () => {
    expect(resolveSelectedModel(null, '')).toBeNull()
  })
})
