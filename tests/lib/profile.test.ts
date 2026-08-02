import 'fake-indexeddb/auto'
import {
  loadProfile,
  saveProfile,
  migrateLegacyOpenRouterKey,
} from '@/lib/llm/profile'
import { openIndexedDb, getIndexedSetting, putIndexedSetting } from '@/lib/db/indexedDb'
import type { KeyStore, LMFProfile } from '@/lib/lmf/types'

function freshDb(): Promise<IDBDatabase> {
  return openIndexedDb(`maigenki-profile-${Date.now()}-${Math.random()}`)
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
    const db = await freshDb()
    const profile = await loadProfile(db)
    expect(profile).toEqual({
      tier: 0,
      activeProviderId: null,
      model: null,
      customBaseURL: null,
      fallbackToFree: true,
      keySource: null,
    })
    db.close()
  })

  it('returns the default when the stored row is unparseable JSON', async () => {
    const db = await freshDb()
    await putIndexedSetting(db, 'lmf_profile', '{not json')
    const profile = await loadProfile(db)
    expect(profile.tier).toBe(0)
    db.close()
  })

  it('round-trips a saved profile and never persists secret fields', async () => {
    const db = await freshDb()
    const profile: LMFProfile = {
      tier: 3,
      activeProviderId: 'anthropic',
      model: 'claude-sonnet',
      customBaseURL: 'https://example.com',
      fallbackToFree: false,
      keySource: 'oauth',
    }
    await saveProfile(db, profile)

    const raw = (await getIndexedSetting(db, 'lmf_profile'))!
    expect(raw).not.toMatch(/sk-|api[_-]?key|secret|token/i)

    const loaded = await loadProfile(db)
    expect(loaded).toEqual(profile)
    db.close()
  })
})

// ── migration ────────────────────────────────────────────────────────────

describe('migrateLegacyOpenRouterKey', () => {
  it('moves the legacy key into the KeyStore, deletes the settings row, and sets tier 2', async () => {
    const db = await freshDb()
    await putIndexedSetting(db, 'openrouter_api_key', 'sk-legacy-secret')
    const keyStore = makeMockKeyStore()

    await migrateLegacyOpenRouterKey(db, keyStore)

    expect(keyStore.store.get('openrouter')).toBe('sk-legacy-secret')
    expect(await getIndexedSetting(db, 'openrouter_api_key')).toBeNull()

    const profile = await loadProfile(db)
    expect(profile.tier).toBe(2)
    expect(profile.activeProviderId).toBe('openrouter')
    expect(profile.keySource).toBe('manual')

    // No secret ever lands in the profile JSON.
    const raw = (await getIndexedSetting(db, 'lmf_profile'))!
    expect(raw).not.toMatch(/sk-legacy-secret/)
    db.close()
  })

  it('is a no-op when there is no legacy key row', async () => {
    const db = await freshDb()
    const keyStore = makeMockKeyStore()

    await migrateLegacyOpenRouterKey(db, keyStore)

    expect(keyStore.set).not.toHaveBeenCalled()
    expect(await getIndexedSetting(db, 'lmf_profile')).toBeNull()
    db.close()
  })

  it('moves the legacy key but does not overwrite a profile that already exists', async () => {
    const db = await freshDb()
    await putIndexedSetting(db, 'openrouter_api_key', 'sk-legacy-secret')
    const preexisting: LMFProfile = {
      tier: 1,
      activeProviderId: 'gemini',
      model: 'gemini-pro',
      customBaseURL: null,
      fallbackToFree: true,
      keySource: 'oauth',
    }
    await putIndexedSetting(db, 'lmf_profile', JSON.stringify(preexisting))
    const keyStore = makeMockKeyStore()

    await migrateLegacyOpenRouterKey(db, keyStore)

    expect(keyStore.store.get('openrouter')).toBe('sk-legacy-secret')
    expect(await getIndexedSetting(db, 'openrouter_api_key')).toBeNull()

    const profile = await loadProfile(db)
    expect(profile).toEqual(preexisting)
    db.close()
  })

  it('is idempotent: a second call is a no-op and does not clobber a profile changed since the first migration', async () => {
    const db = await freshDb()
    await putIndexedSetting(db, 'openrouter_api_key', 'sk-legacy-secret')
    const keyStore = makeMockKeyStore()

    await migrateLegacyOpenRouterKey(db, keyStore)

    // User changes their profile after the first migration ran.
    const changedProfile: LMFProfile = {
      tier: 1,
      activeProviderId: 'gemini',
      model: 'gemini-pro',
      customBaseURL: null,
      fallbackToFree: true,
      keySource: 'oauth',
    }
    await saveProfile(db, changedProfile)

    jest.clearAllMocks()
    await migrateLegacyOpenRouterKey(db, keyStore)

    expect(keyStore.set).not.toHaveBeenCalled()
    const profile = await loadProfile(db)
    expect(profile).toEqual(changedProfile)
    db.close()
  })
})
