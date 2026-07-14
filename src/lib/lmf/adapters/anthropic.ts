// src/lib/lmf/adapters/anthropic.ts
// Anthropic Messages API adapter.

import type { ChatRequest, ChatResult, ProviderSpec } from '../types'
import { classifyHttp } from '../errors'
import type { Adapter, ClassifiedError, WireRequest } from './types'

const DEFAULT_MAX_TOKENS = 4096

type AnthropicBody = {
  model: string
  messages: { role: 'user' | 'assistant'; content: string }[]
  system?: string
  max_tokens: number
  temperature?: number
}

export const anthropicAdapter: Adapter = {
  buildRequest(spec: ProviderSpec, model: string, apiKey: string | null, req: ChatRequest): WireRequest {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(spec.defaultHeaders ?? {}),
    }
    if (apiKey) headers['x-api-key'] = apiKey

    const systemParts: string[] = []
    const messages: { role: 'user' | 'assistant'; content: string }[] = []
    for (const m of req.messages) {
      if (m.role === 'system') {
        systemParts.push(m.content)
      } else {
        messages.push({ role: m.role, content: m.content })
      }
    }

    const body: AnthropicBody = {
      model,
      messages,
      max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    }
    if (systemParts.length > 0) body.system = systemParts.join('\n\n')
    if (req.temperature !== undefined) body.temperature = req.temperature

    return {
      url: `${spec.baseURL}/v1/messages`,
      method: 'POST',
      headers,
      body,
    }
  },

  parseResponse(spec: ProviderSpec, model: string, json: unknown): ChatResult {
    const obj = json as {
      content?: { type: string; text?: string }[]
      stop_reason?: string
      usage?: { input_tokens?: number; output_tokens?: number }
    }
    const text = (obj.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('')
    return {
      content: text,
      providerId: spec.id,
      model,
      finishReason: obj.stop_reason ?? null,
      usage: obj.usage
        ? {
            promptTokens: obj.usage.input_tokens ?? 0,
            completionTokens: obj.usage.output_tokens ?? 0,
          }
        : null,
    }
  },

  classifyError(_spec: ProviderSpec, status: number, json: unknown): ClassifiedError {
    const obj = json as { error?: { type?: string; message?: string } }
    const message = obj.error?.message ?? `HTTP ${status}`
    const type = obj.error?.type ?? ''

    switch (type) {
      case 'authentication_error':
        return { kind: 'auth', status, message, retryAfterMs: null }
      case 'rate_limit_error':
        return { kind: 'rate_limit', status, message, retryAfterMs: null }
      case 'overloaded_error':
        return { kind: 'server', status, message, retryAfterMs: null }
      case 'invalid_request_error':
        return { kind: 'invalid_request', status, message, retryAfterMs: null }
      default:
        return { kind: classifyHttp(status, message), status, message, retryAfterMs: null }
    }
  },
}
