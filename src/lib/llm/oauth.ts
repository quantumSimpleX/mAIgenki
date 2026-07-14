// src/lib/llm/oauth.ts
// App-wiring around the pure PKCE logic in src/lib/lmf/oauth/openrouterPkce.ts:
// generates the PKCE pair via expo-crypto, opens the OpenRouter authorize page
// via expo-web-browser, and on a successful redirect exchanges the code for a
// key and activates it (KeyStore + LMFProfile). See lmfPlan.md A9.

import type { SQLiteDatabase } from 'expo-sqlite'
import * as Crypto from 'expo-crypto'
import * as Linking from 'expo-linking'
import * as WebBrowser from 'expo-web-browser'
import { getSetting, upsertSetting, deleteSetting } from '@/lib/db/queries'
import { BUILT_IN_PROVIDERS, createPkcePair, buildAuthorizeURL, exchangeCode, validateKey } from '@/lib/lmf'
import { makeKeyStore } from './keystore'
import { loadProfile, saveProfile } from './profile'

const OAUTH_REDIRECT_PATH = 'oauth/openrouter'
const OAUTH_PENDING_KEY = 'lmf_oauth_pending'
const OPENROUTER_SPEC = BUILT_IN_PROVIDERS.openrouter

export type OAuthConnectResult =
  | { status: 'success' }
  | { status: 'cancelled' }
  | { status: 'locked'; message: string }
  | { status: 'error'; message: string }

// Reads the code verifier persisted before the browser was launched. Exposed
// for the future oauth completion route (pB05-T02), which needs it to finish
// the exchange after a native cold-launch reopens the app on the redirect.
export async function getPendingVerifier(db: SQLiteDatabase): Promise<string | null> {
  return getSetting(db, OAUTH_PENDING_KEY)
}

// Deletes the persisted pending-verifier setting. Exposed for the oauth
// completion route (pB05-T02), which must clear it after finishing (or
// failing) a native cold-launch exchange — mirroring connectOpenRouter's own
// cleanup on every terminal outcome below.
export async function clearPendingVerifier(db: SQLiteDatabase): Promise<void> {
  await deleteSetting(db, OAUTH_PENDING_KEY)
}

// Exchanges an authorization code for a key and, on success, activates it:
// stores the key in KeyStore, flips the profile to tier 1 / keySource 'oauth'
// (preserving other profile fields), and fires an unawaited background
// validateKey sanity check. Exposed so the future cold-launch completion route
// (pB05-T02) can reuse this instead of duplicating the exchange.
export async function completeOAuthExchange(
  db: SQLiteDatabase,
  code: string,
  codeVerifier: string,
  fetchImpl?: typeof fetch,
): Promise<OAuthConnectResult> {
  const exchangeResult = await exchangeCode(OPENROUTER_SPEC, { code, codeVerifier }, fetchImpl)
  if (!exchangeResult.ok) {
    return { status: 'error', message: exchangeResult.message }
  }

  const keyStore = await makeKeyStore()
  await keyStore.set('openrouter', exchangeResult.key)

  const profile = await loadProfile(db)
  await saveProfile(db, { ...profile, tier: 1, activeProviderId: 'openrouter', keySource: 'oauth' })

  // Background sanity check — never blocks the caller and never throws.
  validateKey(OPENROUTER_SPEC, exchangeResult.key).catch(() => {})

  return { status: 'success' }
}

// Kicks off the OpenRouter OAuth PKCE flow. Must be called synchronously from
// within a user-gesture handler (e.g. a button's onPress) — openAuthSessionAsync
// opens a browser/popup, which browsers and some platforms block if it isn't a
// direct result of user interaction. That constraint is on the caller, not here.
export async function connectOpenRouter(
  db: SQLiteDatabase,
  fetchImpl?: typeof fetch,
): Promise<OAuthConnectResult> {
  const { codeVerifier, codeChallenge } = await createPkcePair(
    (length) => Crypto.getRandomBytesAsync(length),
    (input) =>
      Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input, {
        encoding: Crypto.CryptoEncoding.BASE64,
      }),
  )

  const redirectUri = Linking.createURL(OAUTH_REDIRECT_PATH)

  // Persisted before the browser opens so a native cold-launch during the
  // redirect can still complete the exchange later (see pB05-T02).
  await upsertSetting(db, OAUTH_PENDING_KEY, codeVerifier)

  const authorizeUrl = buildAuthorizeURL(OPENROUTER_SPEC, { codeChallenge, redirectUri })
  const result = await WebBrowser.openAuthSessionAsync(authorizeUrl, redirectUri)

  if (result.type !== 'success') {
    await clearPendingVerifier(db)
    if (result.type === 'locked') {
      return { status: 'locked', message: 'Another sign-in is already in progress.' }
    }
    return { status: 'cancelled' } // cancel or dismiss
  }

  const redirectUrl = new URL(result.url)
  const error = redirectUrl.searchParams.get('error')
  const code = redirectUrl.searchParams.get('code')

  if (error) {
    await clearPendingVerifier(db)
    return { status: 'error', message: `Authorization failed: ${error}` }
  }
  if (!code) {
    await clearPendingVerifier(db)
    return { status: 'error', message: 'Authorization redirect was missing a code.' }
  }

  const outcome = await completeOAuthExchange(db, code, codeVerifier, fetchImpl)
  await clearPendingVerifier(db)
  return outcome
}
