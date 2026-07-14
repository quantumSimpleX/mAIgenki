import { classifyHttp, redactSecrets } from '@/lib/lmf/errors'

describe('classifyHttp', () => {
  it('maps 401 and 403 to auth', () => {
    expect(classifyHttp(401)).toBe('auth')
    expect(classifyHttp(403)).toBe('auth')
  })

  it('maps 429 to rate_limit', () => {
    expect(classifyHttp(429)).toBe('rate_limit')
  })

  it('maps 402 to quota_billing', () => {
    expect(classifyHttp(402)).toBe('quota_billing')
  })

  it('maps 400 to invalid_request', () => {
    expect(classifyHttp(400)).toBe('invalid_request')
  })

  it('maps 5xx to server', () => {
    expect(classifyHttp(500)).toBe('server')
    expect(classifyHttp(503)).toBe('server')
  })

  it('sniffs insufficient_quota in the body for an otherwise-uncategorized status', () => {
    expect(classifyHttp(200, 'Error: insufficient_quota for this account')).toBe('quota_billing')
  })

  it('sniffs context_length_exceeded in the body for an otherwise-uncategorized status', () => {
    expect(classifyHttp(200, 'context_length_exceeded: too many tokens')).toBe('invalid_request')
  })

  it('falls back to server when the status and body match nothing known', () => {
    expect(classifyHttp(200, 'some unrelated message')).toBe('server')
    expect(classifyHttp(200)).toBe('server')
  })
})

describe('redactSecrets', () => {
  it('redacts Bearer tokens', () => {
    expect(redactSecrets('Authorization: Bearer abc123XYZ')).toBe('Authorization: [REDACTED]')
  })

  it('redacts sk-or- prefixed keys', () => {
    expect(redactSecrets('key was sk-or-abc123_XYZ-9')).toBe('key was [REDACTED]')
  })

  it('redacts generic sk- prefixed keys', () => {
    expect(redactSecrets('key was sk-abc123XYZ')).toBe('key was [REDACTED]')
  })

  it('redacts AIza-prefixed Gemini keys', () => {
    expect(redactSecrets('key was AIzaSyAbc123XYZ')).toBe('key was [REDACTED]')
  })

  it('redacts an explicitly-loaded key even if it matches no pattern', () => {
    expect(redactSecrets('plain-secret-value leaked here', 'plain-secret-value')).toBe('[REDACTED] leaked here')
  })

  it('leaves messages with no secrets untouched', () => {
    expect(redactSecrets('just a normal error message')).toBe('just a normal error message')
  })
})
