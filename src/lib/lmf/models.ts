// src/lib/lmf/models.ts
// Model listing + curated per-provider defaults for the model-selection UI (A7).

import type { ProviderSpec } from './types'

function authHeaders(spec: ProviderSpec, key: string | null): Record<string, string> {
  const headers: Record<string, string> = { ...(spec.defaultHeaders ?? {}) }
  if (!key) return headers
  if (spec.authStyle === 'bearer') headers.Authorization = `Bearer ${key}`
  else if (spec.authStyle === 'x-api-key') headers['x-api-key'] = key
  else if (spec.authStyle === 'x-goog-api-key') headers['x-goog-api-key'] = key
  return headers
}

export async function listModels(spec: ProviderSpec, key: string | null, fetchImpl: typeof fetch = fetch): Promise<string[]> {
  if (!spec.modelListPath) return []

  const res = await fetchImpl(`${spec.baseURL}${spec.modelListPath}`, {
    method: 'GET',
    headers: authHeaders(spec, key),
  })
  if (!res.ok) return []
  const json = await res.json().catch(() => null)
  if (!json) return []

  if (spec.modelListPath === '/api/tags') {
    const obj = json as { models?: { name?: string }[] }
    return (obj.models ?? []).map((m) => m.name).filter((n): n is string => Boolean(n))
  }

  if (spec.kind === 'gemini') {
    const obj = json as { models?: { name?: string }[] }
    return (obj.models ?? [])
      .map((m) => m.name?.replace(/^models\//, ''))
      .filter((n): n is string => Boolean(n))
  }

  const obj = json as { data?: { id?: string }[] }
  return (obj.data ?? []).map((m) => m.id).filter((n): n is string => Boolean(n))
}

// Curated, current-as-of-implementation defaults shown first in the model picker before
// "browse all" (fetched via listModels) or a free-text model-id field.
export const CURATED_MODELS: Record<string, string[]> = {
  openrouter: [
    'anthropic/claude-sonnet-4.5',
    'openai/gpt-5-mini',
    'google/gemini-2.5-flash',
    'meta-llama/llama-3.3-70b-instruct',
  ],
  openai: ['gpt-5-mini', 'gpt-5', 'gpt-4.1-mini'],
  groq: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768'],
  mistral: ['mistral-large-latest', 'mistral-small-latest'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  xai: ['grok-4', 'grok-4-fast'],
  together: ['meta-llama/Llama-3.3-70B-Instruct-Turbo'],
  ollama: ['llama3.3', 'qwen2.5'],
  anthropic: ['claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-opus-4-1'],
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro'],
  custom: [],
}
