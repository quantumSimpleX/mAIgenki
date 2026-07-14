// src/lib/llm/providerSettingsLogic.ts
// Pure, testable helpers for the ProviderSettings UI (pB04-T02): key-validation
// state transitions, custom-baseURL https enforcement, and model-picker
// fallthrough (curated -> all -> free-text). Kept out of the component so this
// logic can be unit-tested without rendering React Native.

import type { LMFErrorKind } from '@/lib/lmf/errors'
import type { ValidateKeyResult } from '@/lib/lmf/validateKey'

// ── Key validation state machine ────────────────────────────────────────────

export type KeyValidationState =
  | { status: 'idle' }
  | { status: 'validating' }
  | { status: 'valid' }
  | { status: 'invalid'; kind: LMFErrorKind }

export function validationStateFromResult(result: ValidateKeyResult): KeyValidationState {
  return result.ok ? { status: 'valid' } : { status: 'invalid', kind: result.kind }
}

// User-facing copy that distinguishes a rejected key (auth) from an
// unreachable provider (network) per A8 — never includes the key value.
export function validationMessage(state: KeyValidationState): string | null {
  switch (state.status) {
    case 'idle':
      return null
    case 'validating':
      return 'Validating key…'
    case 'valid':
      return 'Key verified.'
    case 'invalid':
      if (state.kind === 'auth') return 'Key rejected — check that you copied it correctly.'
      if (state.kind === 'network') return 'Could not reach the provider — check your connection and try again.'
      return 'Validation failed — please try again.'
  }
}

// ── Custom baseURL https enforcement (tier 3 / Ollama) ──────────────────────

const PRIVATE_HOSTNAME_RE = /^(localhost|127(?:\.\d{1,3}){3}|\[?::1\]?|10(?:\.\d{1,3}){3}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|192\.168(?:\.\d{1,3}){2})$/i

// https:// is required for any custom endpoint except localhost/private-LAN
// addresses (needed for local Ollama, which serves plain http).
export function isAllowedBaseURL(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol === 'https:') return true
  if (parsed.protocol === 'http:' && PRIVATE_HOSTNAME_RE.test(parsed.hostname)) return true
  return false
}

// ── Model picker fallthrough: curated -> all (searchable) -> free-text ──────

export function filterModels(allModels: string[], query: string): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return allModels
  return allModels.filter((m) => m.toLowerCase().includes(q))
}

// The effective model id to save: free-text (if the user typed one) always
// wins, otherwise whatever was picked from curated/all-models.
export function resolveSelectedModel(pickedModel: string | null, freeText: string): string | null {
  const trimmed = freeText.trim()
  if (trimmed) return trimmed
  return pickedModel
}
