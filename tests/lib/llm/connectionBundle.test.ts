import { createConnectionBundle, parseConnectionBundle, createConnectionQr } from '@/lib/llm/connectionBundle'
import type { LMFProfile } from '@/lib/lmf'

const profile: LMFProfile = { tier: 1, activeProviderId: 'openrouter', model: 'google/gemma:free', customBaseURL: null, fallbackToFree: true, keySource: 'oauth' }

describe('connection bundle', () => {
  it('round trips provider-only credentials', () => {
    const bundle = createConnectionBundle(profile, 'secret')
    expect(parseConnectionBundle(JSON.stringify(bundle))).toEqual(bundle)
  })
  it('rejects paid models', () => {
    expect(() => createConnectionBundle({ ...profile, model: 'openai/gpt-4' }, 'secret')).toThrow()
  })
  it('creates a local QR data URL without network access', async () => {
    const qr = await createConnectionQr(createConnectionBundle(profile, 'secret'))
    expect(qr.startsWith('data:image/png;base64,')).toBe(true)
  })
})
