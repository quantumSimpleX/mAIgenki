import { createHash } from 'crypto'
import {
  buildAuthorizeURL,
  createPkcePair,
  exchangeCode,
} from '@/lib/lmf/oauth/openrouterPkce'
import { BUILT_IN_PROVIDERS } from '@/lib/lmf/registry'

const spec = BUILT_IN_PROVIDERS.openrouter

function base64UrlFromBuffer(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

describe('createPkcePair', () => {
  it('derives codeChallenge as base64url(sha256(codeVerifier)) using injected crypto', async () => {
    const fixedBytes = Buffer.from(Array.from({ length: 32 }, (_, i) => i + 1))
    const randomBytes = async () => new Uint8Array(fixedBytes)
    const sha256Base64 = async (input: string) => createHash('sha256').update(input).digest('base64')

    const { codeVerifier, codeChallenge } = await createPkcePair(randomBytes, sha256Base64)

    expect(codeVerifier).toBe(base64UrlFromBuffer(fixedBytes))

    const expectedChallenge = base64UrlFromBuffer(createHash('sha256').update(codeVerifier).digest())
    expect(codeChallenge).toBe(expectedChallenge)
  })
})

describe('buildAuthorizeURL', () => {
  it('includes code_challenge, S256 method, and callback_url', () => {
    const url = buildAuthorizeURL(spec, {
      codeChallenge: 'abc123',
      redirectUri: 'maigenki://oauth/openrouter',
    })
    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe('https://openrouter.ai/auth')
    expect(parsed.searchParams.get('code_challenge')).toBe('abc123')
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256')
    expect(parsed.searchParams.get('callback_url')).toBe('maigenki://oauth/openrouter')
  })
})

describe('exchangeCode', () => {
  it('posts code + verifier and returns key on 200', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ key: 'sk-or-newkey' }),
    })
    const result = await exchangeCode(spec, { code: 'c1', codeVerifier: 'v1' }, fetchImpl as any)
    expect(result).toEqual({ ok: true, key: 'sk-or-newkey' })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(spec.oauth!.exchangeURL)
    const body = JSON.parse(init.body)
    expect(body.code).toBe('c1')
    expect(body.code_verifier).toBe('v1')
  })

  it('classifies 403 as verifier_invalid', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) })
    const result = await exchangeCode(spec, { code: 'c1', codeVerifier: 'v1' }, fetchImpl as any)
    expect(result).toEqual({ ok: false, kind: 'verifier_invalid', message: expect.any(String) })
  })

  it('classifies 400 as internal', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({}) })
    const result = await exchangeCode(spec, { code: 'c1', codeVerifier: 'v1' }, fetchImpl as any)
    expect(result).toEqual({ ok: false, kind: 'internal', message: expect.any(String) })
  })
})
