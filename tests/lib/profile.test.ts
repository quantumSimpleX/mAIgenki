import {
  loadProfile,
  saveProfile,
  migrateLegacyOpenRouterKey,
} from '@/lib/llm/profile'
import type { KeyStore, LMFProfile } from '@/lib/lmf/types'

// ── Mock expo-sqlite settings KV as an in-memory map ─────────────────────────

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

function makeMockKeyStore(): KeyStore & { store: Map<string, string> } {
  const store = new Map<string, string>()
  return {
    store,
    get: jest.fn(async (providerId: string) => store.get(providerId) ?? null),
    set: jest.fn(async (providerId: string, key: string) => { store.set(providerId, key) }),
    delete: jest.fn(async (providerId: string) => { store.delete(providerId) }),
  }
}

beforeEach(() => jest.clearAllMocks())

// ── load/save round-trip ──────────────────────────────────────────────────

describe('loadProfile / saveProfile', () => {
  it('returns a sane tier-0 default when no profile row exists', async () => {
    const db = makeMockDb()
    const profile = await loadProfile(db as any)
    expect(profile).toEqual({
      tier: 0,
      activeProviderId: null,
      model: null,
      customBaseURL: null,
      fallbackToFree: true,
      keySource: null,
    })
  })

  it('returns the default when the stored row is unparseable JSON', async () => {
    const db = makeMockDb()
    db.settings.set('lmf_profile', '{not json')
    const profile = await loadProfile(db as any)
    expect(profile.tier).toBe(0)
  })

  it('round-trips a saved profile and never persists secret fields', async () => {
    const db = makeMockDb()
    const profile: LMFProfile = {
      tier: 3,
      activeProviderId: 'anthropic',
      model: 'claude-sonnet',
      customBaseURL: 'https://example.com',
      fallbackToFree: false,
      keySource: 'oauth',
    }
    await saveProfile(db as any, profile)

    const raw = db.settings.get('lmf_profile')!
    expect(raw).not.toMatch(/sk-|api[_-]?key|secret|token/i)

    const loaded = await loadProfile(db as any)
    expect(loaded).toEqual(profile)
  })
})

// ── migration ────────────────────────────────────────────────────────────

describe('migrateLegacyOpenRouterKey', () => {
  it('moves the legacy key into the KeyStore, deletes the SQLite row, and sets tier 2', async () => {
    const db = makeMockDb()
    db.settings.set('openrouter_api_key', 'sk-legacy-secret')
    const keyStore = makeMockKeyStore()

    await migrateLegacyOpenRouterKey(db as any, keyStore)

    expect(keyStore.store.get('openrouter')).toBe('sk-legacy-secret')
    expect(db.settings.has('openrouter_api_key')).toBe(false)

    const profile = await loadProfile(db as any)
    expect(profile.tier).toBe(2)
    expect(profile.activeProviderId).toBe('openrouter')
    expect(profile.keySource).toBe('manual')

    // No secret ever lands in the profile JSON.
    const raw = db.settings.get('lmf_profile')!
    expect(raw).not.toMatch(/sk-legacy-secret/)
  })

  it('is a no-op when there is no legacy key row', async () => {
    const db = makeMockDb()
    const keyStore = makeMockKeyStore()

    await migrateLegacyOpenRouterKey(db as any, keyStore)

    expect(keyStore.set).not.toHaveBeenCalled()
    expect(db.settings.has('lmf_profile')).toBe(false)
  })

  it('moves the legacy key but does not overwrite a profile that already exists', async () => {
    const db = makeMockDb()
    db.settings.set('openrouter_api_key', 'sk-legacy-secret')
    const preexisting: LMFProfile = {
      tier: 1,
      activeProviderId: 'gemini',
      model: 'gemini-pro',
      customBaseURL: null,
      fallbackToFree: true,
      keySource: 'oauth',
    }
    db.settings.set('lmf_profile', JSON.stringify(preexisting))
    const keyStore = makeMockKeyStore()

    await migrateLegacyOpenRouterKey(db as any, keyStore)

    expect(keyStore.store.get('openrouter')).toBe('sk-legacy-secret')
    expect(db.settings.has('openrouter_api_key')).toBe(false)

    const profile = await loadProfile(db as any)
    expect(profile).toEqual(preexisting)
  })

  it('is idempotent: a second call is a no-op and does not clobber a profile changed since the first migration', async () => {
    const db = makeMockDb()
    db.settings.set('openrouter_api_key', 'sk-legacy-secret')
    const keyStore = makeMockKeyStore()

    await migrateLegacyOpenRouterKey(db as any, keyStore)

    // User changes their profile after the first migration ran.
    const changedProfile: LMFProfile = {
      tier: 1,
      activeProviderId: 'gemini',
      model: 'gemini-pro',
      customBaseURL: null,
      fallbackToFree: true,
      keySource: 'oauth',
    }
    await saveProfile(db as any, changedProfile)

    jest.clearAllMocks()
    await migrateLegacyOpenRouterKey(db as any, keyStore)

    expect(keyStore.set).not.toHaveBeenCalled()
    const profile = await loadProfile(db as any)
    expect(profile).toEqual(changedProfile)
  })
})
