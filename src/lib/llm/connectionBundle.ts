import type { KeyStore, LMFProfile } from '@/lib/lmf'
import { saveProfile , loadProfile } from './profile'

import { BUILT_IN_PROVIDERS, validateKey } from '@/lib/lmf'
import QRCode from 'qrcode'
import jsQR from 'jsqr'

export const CONNECTION_BUNDLE_VERSION = 1
export type ConnectionBundle = { version: 1; provider: 'openrouter'; model: string; apiKey: string; exportedAt: string }

export function createConnectionBundle(profile: LMFProfile, apiKey: string): ConnectionBundle {
  if (profile.activeProviderId !== 'openrouter' || !profile.model?.endsWith(':free') || !apiKey) throw new Error('Only a verified OpenRouter free-model connection can be exported.')
  return { version: CONNECTION_BUNDLE_VERSION, provider: 'openrouter', model: profile.model, apiKey, exportedAt: new Date().toISOString() }
}

export function parseConnectionBundle(raw: string): ConnectionBundle {
  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object') throw new Error('Invalid connection bundle.')
  const v = value as Record<string, unknown>
  if (v.version !== 1 || v.provider !== 'openrouter' || typeof v.model !== 'string' || !v.model.endsWith(':free') || typeof v.apiKey !== 'string' || !v.apiKey) throw new Error('Invalid OpenRouter connection bundle.')
  return { version: 1, provider: 'openrouter', model: v.model, apiKey: v.apiKey, exportedAt: typeof v.exportedAt === 'string' ? v.exportedAt : new Date().toISOString() }
}

export async function importConnectionBundle(db: IDBDatabase, keyStore: KeyStore, raw: string): Promise<LMFProfile> {
  const bundle = parseConnectionBundle(raw)
  const validation = await validateKey(BUILT_IN_PROVIDERS.openrouter, bundle.apiKey, { model: bundle.model })
  if (!validation.ok) throw new Error('OpenRouter connection could not be verified.')
  const previousProfile = await loadProfile(db)
  const previousKey = await keyStore.get('openrouter')
  const profile: LMFProfile = { tier: 1, activeProviderId: 'openrouter', model: bundle.model, customBaseURL: null, fallbackToFree: true, keySource: 'oauth', verifiedAt: new Date().toISOString() }
  try { await keyStore.set('openrouter', bundle.apiKey); await saveProfile(db, profile); return profile } catch (error) {
    try {
      if (previousKey) await keyStore.set('openrouter', previousKey)
      else await keyStore.delete('openrouter')
      await saveProfile(db, previousProfile)
    } catch { /* best-effort rollback */ }
    throw error
  }
}

export function encodeConnectionBundle(bundle: ConnectionBundle): string { return btoa(unescape(encodeURIComponent(JSON.stringify(bundle)))) }
export function decodeConnectionBundle(encoded: string): ConnectionBundle { return parseConnectionBundle(decodeURIComponent(escape(atob(encoded)))) }
export async function createConnectionQr(bundle: ConnectionBundle): Promise<string> { return QRCode.toDataURL(encodeConnectionBundle(bundle), { errorCorrectionLevel: 'M', margin: 2, width: 320 }) }
export function decodeConnectionQr(data: Uint8ClampedArray, width: number, height: number): ConnectionBundle { const result = jsQR(data, width, height); if (!result?.data) throw new Error('No mAIgenki connection QR code found.'); return decodeConnectionBundle(result.data) }
