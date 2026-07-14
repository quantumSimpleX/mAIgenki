import {
  classifyHttp,
  redactSecrets,
  BUILT_IN_PROVIDERS,
  getProviderSpec,
  callWithFallback,
  createCooldownLedger,
  buildRoute,
  listModels,
  CURATED_MODELS,
  validateKey,
  createPkcePair,
  buildAuthorizeURL,
  exchangeCode,
} from '@/lib/lmf'

describe('lmf barrel', () => {
  it('re-exports the public API', () => {
    expect(typeof classifyHttp).toBe('function')
    expect(typeof redactSecrets).toBe('function')
    expect(typeof getProviderSpec).toBe('function')
    expect(typeof callWithFallback).toBe('function')
    expect(typeof createCooldownLedger).toBe('function')
    expect(typeof buildRoute).toBe('function')
    expect(typeof listModels).toBe('function')
    expect(typeof validateKey).toBe('function')
    expect(typeof createPkcePair).toBe('function')
    expect(typeof buildAuthorizeURL).toBe('function')
    expect(typeof exchangeCode).toBe('function')
    expect(BUILT_IN_PROVIDERS.openrouter).toBeDefined()
    expect(CURATED_MODELS.openrouter).toBeDefined()
  })
})
