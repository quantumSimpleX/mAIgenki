import { makeKeyStore } from './keystore'
import { loadProfile, migrateLegacyOpenRouterKey } from './profile'
import type { KeyStore, LMFProfile } from '@/lib/lmf'

export type LlmConnectionState = {
  status: 'loading' | 'ready' | 'needs_setup' | 'unavailable'
  profile: LMFProfile | null
  keyStore: KeyStore | null
  reason?: string
}

export function isFreeOpenRouterModel(model: string | null | undefined): boolean {
  return Boolean(model && model.endsWith(':free'))
}

export function isVerifiedLlmProfile(profile: LMFProfile | null, key: string | null): boolean {
  return Boolean(profile && profile.verifiedAt && profile.tier > 0 && profile.activeProviderId === 'openrouter' && isFreeOpenRouterModel(profile.model) && key)
}

export async function loadLlmConnection(db: IDBDatabase | null): Promise<LlmConnectionState> {
  if (!db) return { status: 'unavailable', profile: null, keyStore: null, reason: 'Local storage is unavailable.' }
  try {
    const keyStore = await makeKeyStore()
    await migrateLegacyOpenRouterKey(db, keyStore)
    const profile = await loadProfile(db)
    const key = profile.activeProviderId ? await keyStore.get(profile.activeProviderId) : null
    return isVerifiedLlmProfile(profile, key)
      ? { status: 'ready', profile, keyStore }
      : { status: 'needs_setup', profile, keyStore }
  } catch {
    return { status: 'unavailable', profile: null, keyStore: null, reason: 'Could not open local settings.' }
  }
}

export async function hasLlmConnection(db: IDBDatabase | null): Promise<boolean> {
  const state = await loadLlmConnection(db)
  return state.status === 'ready'
}
