// src/lib/llm/keystore.ts
// App-wiring KeyStore implementations for the LMF layer (see lmf/types.ts
// KeyStore interface). Provider API keys never touch SQLite; on native they
// live in expo-secure-store, on web in localStorage (SecureStore has no web
// support — matches OpenRouter's own browser-key trust model, lmfPlan.md A8).
// Key values are never logged.

import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import type { KeyStore } from '@/lib/lmf/types'

function storageKey(providerId: string): string {
  return `lmf.key.${providerId}`
}

// Native: expo-secure-store (Keychain on iOS, Keystore-backed EncryptedSharedPreferences
// on Android). Verified against SDK 56 docs: setItemAsync/getItemAsync/deleteItemAsync
// all take (key, value?, options?) and resolve void/string|null; isAvailableAsync()
// resolves a boolean (true on Android/iOS only).
export class SecureStoreKeyStore implements KeyStore {
  async get(providerId: string): Promise<string | null> {
    return SecureStore.getItemAsync(storageKey(providerId))
  }

  async set(providerId: string, key: string): Promise<void> {
    await SecureStore.setItemAsync(storageKey(providerId), key)
  }

  async delete(providerId: string): Promise<void> {
    await SecureStore.deleteItemAsync(storageKey(providerId))
  }
}

// Web: localStorage. Plaintext, readable by any script on the page — same
// trust model OpenRouter's own web app uses for browser-held keys.
export class LocalStorageKeyStore implements KeyStore {
  async get(providerId: string): Promise<string | null> {
    return globalThis.localStorage.getItem(storageKey(providerId))
  }

  async set(providerId: string, key: string): Promise<void> {
    globalThis.localStorage.setItem(storageKey(providerId), key)
  }

  async delete(providerId: string): Promise<void> {
    globalThis.localStorage.removeItem(storageKey(providerId))
  }
}

// Fallback for native devices where SecureStore reports itself unavailable
// (isAvailableAsync() false). Session-only: nothing survives an app restart,
// so callers must check `persistent` and surface a "key won't persist" notice
// rather than silently losing the user's key.
export class InMemoryKeyStore implements KeyStore {
  readonly persistent = false
  private store = new Map<string, string>()

  async get(providerId: string): Promise<string | null> {
    return this.store.get(providerId) ?? null
  }

  async set(providerId: string, key: string): Promise<void> {
    this.store.set(providerId, key)
  }

  async delete(providerId: string): Promise<void> {
    this.store.delete(providerId)
  }
}

// Capability flag callers can check to decide whether to show a persistence
// notice. Defaults to true for SecureStoreKeyStore/LocalStorageKeyStore
// (neither class sets it, so the `?? true` below covers them); InMemoryKeyStore
// overrides it to false.
export function isPersistentKeyStore(store: KeyStore): boolean {
  return (store as { persistent?: boolean }).persistent ?? true
}

// Picks the right KeyStore for the current platform. On native, falls back to
// an in-memory session-only store if SecureStore reports itself unavailable.
export async function makeKeyStore(): Promise<KeyStore> {
  if (Platform.OS === 'web') return new LocalStorageKeyStore()
  const available = await SecureStore.isAvailableAsync()
  if (!available) return new InMemoryKeyStore()
  return new SecureStoreKeyStore()
}
