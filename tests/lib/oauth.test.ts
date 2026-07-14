import type { LMFProfile } from '@/lib/lmf/types'

// ── expo-* mocks ──────────────────────────────────────────────────────────

jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(async (n: number) => new Uint8Array(n).fill(7)),
  digestStringAsync: jest.fn(async () => 'ZmFrZS1kaWdlc3Q='),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
}))

jest.mock('expo-linking', () => ({
  createURL: jest.fn((path: string) => `maigenki://${path}`),
}))

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
}))

// Key exchange goes through the real openrouterPkce.exchangeCode against a
// mocked fetch — no need to mock the pure PKCE module itself.
const mockFetch = jest.fn()

import * as WebBrowser from 'expo-web-browser'
import {
  connectOpenRouter,
  getPendingVerifier,
} from '@/lib/llm/oauth'

const mockWebBrowser = WebBrowser as jest.Mocked<typeof WebBrowser>

// ── mock SQLite settings KV (same shape as tests/lib/profile.test.ts) ──────

function makeMockDb() {
  const settings = new Map<string, string>()
  return {
    settings,
    runAsync: jest.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('INSERT OR REPLACE INTO settings')) {
        const [key, value] = params as [string, string]
        settings.set(key, value)
      } else if (sql.includes('DELETE FROM settings')) {
        const [key] = params as [string]
        settings.delete(key)
      }
      return { lastInsertRowId: 1, changes: 1 }
    }),
    getFirstAsync: jest.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('SELECT value FROM settings')) {
        const [key] = params as [string]
        const value = settings.get(key)
        return value === undefined ? null : { value }
      }
      return null
    }),
  }
}

function makeMockKeyStore() {
  const store = new Map<string, string>()
  return {
    store,
    get: jest.fn(async (providerId: string) => store.get(providerId) ?? null),
    set: jest.fn(async (providerId: string, key: string) => { store.set(providerId, key) }),
    delete: jest.fn(async (providerId: string) => { store.delete(providerId) }),
  }
}

let mockKeyStore: ReturnType<typeof makeMockKeyStore>
jest.mock('@/lib/llm/keystore', () => ({
  makeKeyStore: jest.fn(async () => mockKeyStore),
}))

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockKeyStore = makeMockKeyStore()
  // validateKey's background call hits /models on openrouter.ai; keep it
  // resolved-ok so it never throws unhandled and doesn't affect assertions.
  mockFetch.mockResolvedValue(jsonResponse(200, { data: [] }))
})

// ── success path ─────────────────────────────────────────────────────────

describe('connectOpenRouter success', () => {
  it('persists the verifier before launching the browser, exchanges the code, stores the key, and sets tier 1/oauth', async () => {
    const db = makeMockDb()
    let verifierAtLaunch: string | null = null

    mockWebBrowser.openAuthSessionAsync.mockImplementation(async () => {
      verifierAtLaunch = await getPendingVerifier(db as any)
      return { type: 'success', url: 'maigenki://oauth/openrouter?code=abc123' }
    })
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/auth/keys')) return jsonResponse(200, { key: 'sk-or-new-key' })
      return jsonResponse(200, { data: [] })
    })

    const result = await connectOpenRouter(db as any, mockFetch as unknown as typeof fetch)

    expect(verifierAtLaunch).not.toBeNull()
    expect(result).toEqual({ status: 'success' })

    expect(mockKeyStore.store.get('openrouter')).toBe('sk-or-new-key')

    const profileRaw = db.settings.get('lmf_profile')!
    const profile: LMFProfile = JSON.parse(profileRaw)
    expect(profile.tier).toBe(1)
    expect(profile.activeProviderId).toBe('openrouter')
    expect(profile.keySource).toBe('oauth')

    // Pending verifier deleted after the exchange completes.
    expect(await getPendingVerifier(db as any)).toBeNull()
  })

  it('preserves existing profile fields (model, customBaseURL, fallbackToFree) instead of clobbering them', async () => {
    const db = makeMockDb()
    db.settings.set('lmf_profile', JSON.stringify({
      tier: 0,
      activeProviderId: null,
      model: 'some/model',
      customBaseURL: 'https://custom.example.com',
      fallbackToFree: false,
      keySource: null,
    } satisfies LMFProfile))

    mockWebBrowser.openAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'maigenki://oauth/openrouter?code=abc123',
    })
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/auth/keys')) return jsonResponse(200, { key: 'sk-or-new-key' })
      return jsonResponse(200, { data: [] })
    })

    await connectOpenRouter(db as any, mockFetch as unknown as typeof fetch)

    const profile: LMFProfile = JSON.parse(db.settings.get('lmf_profile')!)
    expect(profile.model).toBe('some/model')
    expect(profile.customBaseURL).toBe('https://custom.example.com')
    expect(profile.fallbackToFree).toBe(false)
  })
})

// ── failure paths ───────────────────────────────────────────────────────

describe('connectOpenRouter exchange failure', () => {
  it('surfaces a 403 as "try again" and does not set tier 1 or store a key', async () => {
    const db = makeMockDb()
    mockWebBrowser.openAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'maigenki://oauth/openrouter?code=abc123',
    })
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/auth/keys')) return jsonResponse(403, {})
      return jsonResponse(200, { data: [] })
    })

    const result = await connectOpenRouter(db as any, mockFetch as unknown as typeof fetch)

    expect(result).toEqual({ status: 'error', message: 'Authorization expired or invalid — try again.' })
    expect(mockKeyStore.store.has('openrouter')).toBe(false)
    expect(db.settings.has('lmf_profile')).toBe(false)
    expect(await getPendingVerifier(db as any)).toBeNull()
  })

  it('surfaces a 400 distinctly from a 403', async () => {
    const db = makeMockDb()
    mockWebBrowser.openAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'maigenki://oauth/openrouter?code=abc123',
    })
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/auth/keys')) return jsonResponse(400, {})
      return jsonResponse(200, { data: [] })
    })

    const result = await connectOpenRouter(db as any, mockFetch as unknown as typeof fetch)

    expect(result.status).toBe('error')
    expect((result as { message: string }).message).not.toMatch(/try again/i)
    expect(mockKeyStore.store.has('openrouter')).toBe(false)
  })

  it('surfaces an ?error= redirect param without calling exchangeCode', async () => {
    const db = makeMockDb()
    mockWebBrowser.openAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'maigenki://oauth/openrouter?error=access_denied',
    })

    const result = await connectOpenRouter(db as any, mockFetch as unknown as typeof fetch)

    expect(result).toEqual({ status: 'error', message: 'Authorization failed: access_denied' })
    expect(mockFetch).not.toHaveBeenCalled()
    expect(await getPendingVerifier(db as any)).toBeNull()
  })
})

// ── cancel / dismiss / locked ──────────────────────────────────────────────

describe('connectOpenRouter non-completion results', () => {
  it('user-cancel leaves tier 0 intact, cleans up the pending verifier, and never calls exchangeCode', async () => {
    const db = makeMockDb()
    mockWebBrowser.openAuthSessionAsync.mockResolvedValue({ type: 'cancel' } as any)

    const result = await connectOpenRouter(db as any, mockFetch as unknown as typeof fetch)

    expect(result).toEqual({ status: 'cancelled' })
    expect(mockFetch).not.toHaveBeenCalled()
    expect(db.settings.has('lmf_profile')).toBe(false)
    expect(await getPendingVerifier(db as any)).toBeNull()
  })

  it('dismiss behaves the same as cancel', async () => {
    const db = makeMockDb()
    mockWebBrowser.openAuthSessionAsync.mockResolvedValue({ type: 'dismiss' } as any)

    const result = await connectOpenRouter(db as any, mockFetch as unknown as typeof fetch)

    expect(result).toEqual({ status: 'cancelled' })
    expect(await getPendingVerifier(db as any)).toBeNull()
  })

  it('locked returns an "another sign-in in progress" result', async () => {
    const db = makeMockDb()
    mockWebBrowser.openAuthSessionAsync.mockResolvedValue({ type: 'locked' } as any)

    const result = await connectOpenRouter(db as any, mockFetch as unknown as typeof fetch)

    expect(result.status).toBe('locked')
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
