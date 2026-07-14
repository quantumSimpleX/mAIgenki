// src/lib/lmf/validateKey.ts
// Cheap key-validation ping (A8): distinguishes "wrong key" from "offline" so the UI can react.

import type { ChatRequest, ProviderSpec } from './types'
import type { LMFErrorKind } from './errors'
import { classifyHttp } from './errors'
import { openaiCompatAdapter } from './adapters/openaiCompat'
import { anthropicAdapter } from './adapters/anthropic'
import { geminiAdapter } from './adapters/gemini'
import type { Adapter } from './adapters/types'

export type ValidateKeyResult = { ok: true } | { ok: false; kind: LMFErrorKind }

function adapterFor(kind: ProviderSpec['kind']): Adapter {
  switch (kind) {
    case 'openai-compat':
      return openaiCompatAdapter
    case 'anthropic':
      return anthropicAdapter
    case 'gemini':
      return geminiAdapter
  }
}

function authHeaders(spec: ProviderSpec, key: string): Record<string, string> {
  const headers: Record<string, string> = { ...(spec.defaultHeaders ?? {}) }
  if (spec.authStyle === 'bearer') headers.Authorization = `Bearer ${key}`
  else if (spec.authStyle === 'x-api-key') headers['x-api-key'] = key
  else if (spec.authStyle === 'x-goog-api-key') headers['x-goog-api-key'] = key
  return headers
}

async function validateViaModelsList(spec: ProviderSpec, key: string, fetchImpl: typeof fetch): Promise<ValidateKeyResult> {
  try {
    const res = await fetchImpl(`${spec.baseURL}${spec.modelListPath}`, {
      method: 'GET',
      headers: authHeaders(spec, key),
    })
    if (res.ok) return { ok: true }
    if (res.status === 401 || res.status === 403) return { ok: false, kind: 'auth' }
    return { ok: false, kind: classifyHttp(res.status) }
  } catch {
    return { ok: false, kind: 'network' }
  }
}

async function validateViaCompletion(spec: ProviderSpec, key: string, model: string, fetchImpl: typeof fetch): Promise<ValidateKeyResult> {
  const adapter = adapterFor(spec.kind)
  const req: ChatRequest = { messages: [{ role: 'user', content: 'hi' }], maxTokens: 1 }
  const wire = adapter.buildRequest(spec, model, key, req)
  try {
    const res = await fetchImpl(wire.url, { method: wire.method, headers: wire.headers, body: JSON.stringify(wire.body) })
    if (res.ok) return { ok: true }
    const json = await res.json().catch(() => ({}))
    const classified = adapter.classifyError(spec, res.status, json, res.headers)
    return { ok: false, kind: classified.kind }
  } catch {
    return { ok: false, kind: 'network' }
  }
}

// When the provider has a model-list endpoint, validate via that (no model id needed).
// Otherwise a `model` must be supplied (e.g. from the UI's model field) for a 1-token completion probe.
export async function validateKey(
  spec: ProviderSpec,
  key: string,
  opts: { model?: string; fetchImpl?: typeof fetch } = {},
): Promise<ValidateKeyResult> {
  const fetchImpl = opts.fetchImpl ?? fetch
  if (spec.modelListPath) {
    return validateViaModelsList(spec, key, fetchImpl)
  }
  if (opts.model) {
    return validateViaCompletion(spec, key, opts.model, fetchImpl)
  }
  return { ok: true }
}
