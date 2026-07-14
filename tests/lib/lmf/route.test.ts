import { buildRoute } from '@/lib/lmf/route'
import type { LMFProfile } from '@/lib/lmf/types'

const freeChain = ['google/gemma:free', 'meta/llama:free']

const tier0Profile: LMFProfile = {
  tier: 0,
  activeProviderId: null,
  model: null,
  customBaseURL: null,
  fallbackToFree: true,
  keySource: null,
}

const tier1Profile: LMFProfile = {
  tier: 1,
  activeProviderId: 'openrouter',
  model: 'anthropic/claude-x',
  customBaseURL: null,
  fallbackToFree: true,
  keySource: 'oauth',
}

describe('buildRoute', () => {
  it('tier 0 returns the free chain only, on openrouter', () => {
    const route = buildRoute(tier0Profile, freeChain)
    expect(route).toHaveLength(2)
    expect(route.every((c) => c.providerId === 'openrouter')).toBe(true)
    expect(route.map((c) => c.model)).toEqual(freeChain)
  })

  it('tier 1+ puts the primary candidate first, then the free chain', () => {
    const route = buildRoute(tier1Profile, freeChain)
    expect(route[0]).toMatchObject({ providerId: 'openrouter', model: 'anthropic/claude-x' })
    expect(route.slice(1).map((c) => c.model)).toEqual(freeChain)
  })

  it('fallbackToFree:false yields a single-candidate route', () => {
    const profile: LMFProfile = { ...tier1Profile, fallbackToFree: false }
    const route = buildRoute(profile, freeChain)
    expect(route).toHaveLength(1)
    expect(route[0]).toMatchObject({ providerId: 'openrouter', model: 'anthropic/claude-x' })
  })

  it('dedupes when the primary model is also in the free chain', () => {
    const profile: LMFProfile = { ...tier1Profile, model: freeChain[0] }
    const route = buildRoute(profile, freeChain)
    const occurrences = route.filter((c) => c.providerId === 'openrouter' && c.model === freeChain[0])
    expect(occurrences).toHaveLength(1)
    expect(route).toHaveLength(2)
  })

  it('falls back to the free chain when activeProviderId matches no known provider', () => {
    const profile: LMFProfile = { ...tier1Profile, activeProviderId: 'not-a-real-provider' }
    const route = buildRoute(profile, freeChain)
    expect(route).toHaveLength(2)
    expect(route.every((c) => c.providerId === 'openrouter')).toBe(true)
    expect(route.map((c) => c.model)).toEqual(freeChain)
  })

  it('tier 3 propagates the custom baseURL onto the primary candidate spec', () => {
    const profile: LMFProfile = {
      tier: 3,
      activeProviderId: 'custom',
      model: 'my-local-model',
      customBaseURL: 'https://my-endpoint.example.com/v1',
      fallbackToFree: false,
      keySource: 'manual',
    }
    const route = buildRoute(profile, freeChain)
    expect(route).toHaveLength(1)
    expect(route[0].spec.baseURL).toBe('https://my-endpoint.example.com/v1')
  })
})
