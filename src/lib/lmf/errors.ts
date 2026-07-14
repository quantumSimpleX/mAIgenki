// src/lib/lmf/errors.ts
// Error classification and secret redaction for the LMF layer.

export type LMFErrorKind =
  | 'auth'
  | 'rate_limit'
  | 'quota_billing'
  | 'invalid_request'
  | 'content_filter'
  | 'timeout'
  | 'network'
  | 'server'
  | 'validation'

export type LMFFailure = {
  providerId: string
  model: string
  kind: LMFErrorKind
  message: string
  status: number | null
  retryAfterMs: number | null
}

export function classifyHttp(status: number, body?: string): LMFErrorKind {
  if (status === 401 || status === 403) return 'auth'
  if (status === 429) return 'rate_limit'
  if (status === 402) return 'quota_billing'
  if (status === 400) return 'invalid_request'
  if (status >= 500) return 'server'
  if (body) {
    const lower = body.toLowerCase()
    if (lower.includes('insufficient_quota')) return 'quota_billing'
    if (lower.includes('context_length_exceeded')) return 'invalid_request'
  }
  return 'server'
}

const SECRET_PATTERNS: RegExp[] = [
  /Bearer\s+\S+/gi,
  /sk-or-[a-zA-Z0-9-_]+/g,
  /sk-[a-zA-Z0-9-_]+/g,
  /AIza[a-zA-Z0-9-_]+/g,
]

export function redactSecrets(msg: string, loadedKey?: string | null): string {
  let out = msg
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, '[REDACTED]')
  }
  if (loadedKey) {
    out = out.split(loadedKey).join('[REDACTED]')
  }
  return out
}
