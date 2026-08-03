import { isFreeOpenRouterModel, isVerifiedLlmProfile } from '@/lib/llm/connection'
import type { LMFProfile } from '@/lib/lmf'

const profile: LMFProfile = { tier: 1, activeProviderId: 'openrouter', model: 'x:free', customBaseURL: null, fallbackToFree: true, keySource: 'oauth', verifiedAt: '2026-01-01' }
describe('LLM connection readiness', () => {
  it('requires OpenRouter free model and key', () => {
    expect(isFreeOpenRouterModel('x:free')).toBe(true)
    expect(isFreeOpenRouterModel('x')).toBe(false)
    expect(isVerifiedLlmProfile(profile, 'key')).toBe(true)
    expect(isVerifiedLlmProfile({ ...profile, model: 'x' }, 'key')).toBe(false)
  })
})
