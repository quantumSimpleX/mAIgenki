// src/lib/lmf/oauth/openrouterPkce.ts
// Pure PKCE logic for OpenRouter OAuth. Crypto + fetch are injected so this file has
// no expo-* / react-native imports and stays dependency-free.

import type { ProviderSpec } from '../types'

export type PkcePair = { codeVerifier: string; codeChallenge: string }

function base64ToBase64Url(b64: string): string {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function bytesToBase64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : undefined
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : undefined

    out += BASE64_CHARS[b0 >> 2]
    out += BASE64_CHARS[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)]
    out += b1 === undefined ? '=' : BASE64_CHARS[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)]
    out += b2 === undefined ? '=' : BASE64_CHARS[b2 & 0x3f]
  }
  return out
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return base64ToBase64Url(bytesToBase64(bytes))
}

export async function createPkcePair(
  randomBytes: (length: number) => Promise<Uint8Array>,
  sha256Base64: (input: string) => Promise<string>,
): Promise<PkcePair> {
  const verifierBytes = await randomBytes(32)
  const codeVerifier = bytesToBase64Url(verifierBytes)
  const challengeB64 = await sha256Base64(codeVerifier)
  const codeChallenge = base64ToBase64Url(challengeB64)
  return { codeVerifier, codeChallenge }
}

export function buildAuthorizeURL(
  spec: ProviderSpec,
  opts: { codeChallenge: string; redirectUri: string; state?: string },
): string {
  if (!spec.oauth) throw new Error(`Provider ${spec.id} has no oauth config`)
  const url = new URL(spec.oauth.authorizeURL)
  url.searchParams.set('callback_url', opts.redirectUri)
  url.searchParams.set('code_challenge', opts.codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  if (opts.state) url.searchParams.set('state', opts.state)
  return url.toString()
}

export type ExchangeResult =
  | { ok: true; key: string }
  | { ok: false; kind: 'verifier_invalid' | 'internal'; message: string }

export async function exchangeCode(
  spec: ProviderSpec,
  opts: { code: string; codeVerifier: string },
  fetchImpl: typeof fetch = fetch,
): Promise<ExchangeResult> {
  if (!spec.oauth) throw new Error(`Provider ${spec.id} has no oauth config`)

  const res = await fetchImpl(spec.oauth.exchangeURL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: opts.code,
      code_verifier: opts.codeVerifier,
      code_challenge_method: 'S256',
    }),
  })

  if (res.status === 403) {
    return { ok: false, kind: 'verifier_invalid', message: 'Authorization expired or invalid — try again.' }
  }
  if (res.status === 400) {
    return { ok: false, kind: 'internal', message: 'OAuth exchange request was malformed.' }
  }
  if (!res.ok) {
    return { ok: false, kind: 'internal', message: `OAuth exchange failed with HTTP ${res.status}.` }
  }

  const json = (await res.json()) as { key?: string }
  if (!json.key) {
    return { ok: false, kind: 'internal', message: 'OAuth exchange succeeded but returned no key.' }
  }
  return { ok: true, key: json.key }
}
