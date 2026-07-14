import { Platform } from 'react-native'

// expo-secure-store mock — controllable per test via the exported jest.fn()s.
jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
  isAvailableAsync: jest.fn(),
}))

import * as SecureStore from 'expo-secure-store'
import {
  SecureStoreKeyStore,
  LocalStorageKeyStore,
  InMemoryKeyStore,
  isPersistentKeyStore,
  makeKeyStore,
} from '@/lib/llm/keystore'

const mockSecureStore = SecureStore as jest.Mocked<typeof SecureStore>
const origOS = Platform.OS

afterEach(() => {
  jest.clearAllMocks()
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => origOS })
})

// ── SecureStoreKeyStore (native) ──────────────────────────────────────────

describe('SecureStoreKeyStore', () => {
  it('round-trips set/get/delete through expo-secure-store under the lmf.key.<providerId> namespace', async () => {
    const store = new SecureStoreKeyStore()
    mockSecureStore.getItemAsync.mockResolvedValue('sk-test-123')

    await store.set('openrouter', 'sk-test-123')
    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith('lmf.key.openrouter', 'sk-test-123')

    const value = await store.get('openrouter')
    expect(mockSecureStore.getItemAsync).toHaveBeenCalledWith('lmf.key.openrouter')
    expect(value).toBe('sk-test-123')

    await store.delete('openrouter')
    expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('lmf.key.openrouter')
  })

  it('returns null when no key is stored', async () => {
    mockSecureStore.getItemAsync.mockResolvedValue(null)
    const store = new SecureStoreKeyStore()
    expect(await store.get('anthropic')).toBeNull()
  })

  it('is reported as persistent', () => {
    expect(isPersistentKeyStore(new SecureStoreKeyStore())).toBe(true)
  })
})

// ── LocalStorageKeyStore (web) ────────────────────────────────────────────

describe('LocalStorageKeyStore', () => {
  let backing: Map<string, string>

  beforeEach(() => {
    backing = new Map()
    ;(globalThis as any).localStorage = {
      getItem: jest.fn((k: string) => backing.get(k) ?? null),
      setItem: jest.fn((k: string, v: string) => { backing.set(k, v) }),
      removeItem: jest.fn((k: string) => { backing.delete(k) }),
    }
  })

  afterEach(() => {
    delete (globalThis as any).localStorage
  })

  it('round-trips set/get/delete through localStorage under the lmf.key.<providerId> namespace', async () => {
    const store = new LocalStorageKeyStore()

    await store.set('openrouter', 'sk-web-456')
    expect(globalThis.localStorage.setItem).toHaveBeenCalledWith('lmf.key.openrouter', 'sk-web-456')

    expect(await store.get('openrouter')).toBe('sk-web-456')

    await store.delete('openrouter')
    expect(globalThis.localStorage.removeItem).toHaveBeenCalledWith('lmf.key.openrouter')
    expect(await store.get('openrouter')).toBeNull()
  })

  it('is reported as persistent', () => {
    expect(isPersistentKeyStore(new LocalStorageKeyStore())).toBe(true)
  })
})

// ── InMemoryKeyStore (native SecureStore unavailable) ─────────────────────

describe('InMemoryKeyStore', () => {
  it('round-trips set/get/delete in-memory and reports itself non-persistent', async () => {
    const store = new InMemoryKeyStore()

    await store.set('openrouter', 'sk-session-789')
    expect(await store.get('openrouter')).toBe('sk-session-789')

    await store.delete('openrouter')
    expect(await store.get('openrouter')).toBeNull()

    expect(isPersistentKeyStore(store)).toBe(false)
  })
})

// ── makeKeyStore() factory ─────────────────────────────────────────────────

describe('makeKeyStore', () => {
  it('picks LocalStorageKeyStore on web without touching SecureStore.isAvailableAsync', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'web' })
    ;(globalThis as any).localStorage = {
      getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn(),
    }

    const store = await makeKeyStore()

    expect(store).toBeInstanceOf(LocalStorageKeyStore)
    expect(mockSecureStore.isAvailableAsync).not.toHaveBeenCalled()
    delete (globalThis as any).localStorage
  })

  it('picks SecureStoreKeyStore on native when isAvailableAsync resolves true', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'ios' })
    mockSecureStore.isAvailableAsync.mockResolvedValue(true)

    const store = await makeKeyStore()

    expect(store).toBeInstanceOf(SecureStoreKeyStore)
    expect(isPersistentKeyStore(store)).toBe(true)
  })

  it('falls back to an in-memory session-only store with a non-persistent notice when isAvailableAsync resolves false', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'android' })
    mockSecureStore.isAvailableAsync.mockResolvedValue(false)

    const store = await makeKeyStore()

    expect(store).toBeInstanceOf(InMemoryKeyStore)
    expect(isPersistentKeyStore(store)).toBe(false)
    expect(mockSecureStore.setItemAsync).not.toHaveBeenCalled()
  })
})

// ── SQLite isolation ────────────────────────────────────────────────────────

describe('SQLite isolation', () => {
  it('never imports or calls any src/lib/db module', () => {
    const keystoreSource = require('fs').readFileSync(
      require('path').resolve(process.cwd(), 'src/lib/llm/keystore.ts'),
      'utf8',
    )
    expect(keystoreSource).not.toMatch(/lib\/db/)
    expect(keystoreSource).not.toMatch(/expo-sqlite/)
  })
})
