// src/lib/llm/profile.ts
// Persists the non-secret LMFProfile fields as a single `lmf_profile` JSON row
// in the SQLite settings KV table, and migrates the legacy `openrouter_api_key`
// setting row into the KeyStore. Provider keys never touch SQLite — see
// src/lib/llm/keystore.ts and lmfPlan.md Part B Phase 3.

import type { SQLiteDatabase } from 'expo-sqlite'
import { getSetting, upsertSetting, deleteSetting } from '@/lib/db/queries'
import type { KeyStore, LMFProfile } from '@/lib/lmf/types'

const PROFILE_KEY = 'lmf_profile'
const LEGACY_OPENROUTER_KEY_SETTING = 'openrouter_api_key'

const DEFAULT_PROFILE: LMFProfile = {
  tier: 0,
  activeProviderId: null,
  model: null,
  customBaseURL: null,
  fallbackToFree: true,
  keySource: null,
}

export async function loadProfile(db: SQLiteDatabase): Promise<LMFProfile> {
  const raw = await getSetting(db, PROFILE_KEY)
  if (!raw) return { ...DEFAULT_PROFILE }
  try {
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_PROFILE, ...parsed }
  } catch {
    return { ...DEFAULT_PROFILE }
  }
}

export async function saveProfile(db: SQLiteDatabase, profile: LMFProfile): Promise<void> {
  await upsertSetting(db, PROFILE_KEY, JSON.stringify(profile))
}

// Idempotent, meant to run once at app startup. Moves a legacy plaintext
// OpenRouter key out of SQLite and into the KeyStore, then deletes the SQLite
// row. Safe to call repeatedly: the legacy row is gone after the first run,
// so later calls are a no-op and never touch (or clobber) the profile again.
export async function migrateLegacyOpenRouterKey(
  db: SQLiteDatabase,
  keyStore: KeyStore,
): Promise<void> {
  const legacyKey = await getSetting(db, LEGACY_OPENROUTER_KEY_SETTING)
  if (!legacyKey) return

  await keyStore.set('openrouter', legacyKey)
  await deleteSetting(db, LEGACY_OPENROUTER_KEY_SETTING)

  const existingProfile = await getSetting(db, PROFILE_KEY)
  if (!existingProfile) {
    const profile: LMFProfile = {
      ...DEFAULT_PROFILE,
      tier: 2,
      activeProviderId: 'openrouter',
      keySource: 'manual',
    }
    await saveProfile(db, profile)
  }
}
