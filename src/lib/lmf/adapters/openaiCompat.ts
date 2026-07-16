// src/lib/lmf/adapters/openaiCompat.ts
// One adapter for every OpenAI-shaped provider (openrouter, openai, groq, mistral, deepseek,
// xai, together, ollama /v1, custom).

import type { ChatRequest, ChatResult, ProviderSpec } from '../types'
import { classifyHttp } from '../errors'
import type { Adapter, ClassifiedError, WireRequest } from './types'

type OpenAiCompatBody = {
  model: string
  messages: { role: string; content: string }[]
  temperature?: number
  max_tokens?: number
  max_completion_tokens?: number
  response_format?: { type: 'json_object' }
}

export const openaiCompatAdapter: Adapter = {
  buildRequest(spec: ProviderSpec, model: string, apiKey: string | null, req: ChatRequest): WireRequest {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(spec.defaultHeaders ?? {}),
    }
    if (spec.authStyle === 'bearer' && apiKey) {
      headers.Authorization = `Bearer ${apiKey}`
    }

    const body: OpenAiCompatBody = {
      model,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
    }
    if (req.temperature !== undefined) body.temperature = req.temperature
    if (req.maxTokens !== undefined) body[spec.tokenParam] = req.maxTokens
    if (req.responseFormat === 'json' && spec.supportsJsonResponseFormat) {
      body.response_format = { type: 'json_object' }
    }

    return {
      url: `${spec.baseURL}/chat/completions`,
      method: 'POST',
      headers,
      body,
    }
  },

  parseResponse(spec: ProviderSpec, model: string, json: unknown): ChatResult {
    const obj = json as {
      choices?: { message?: { content?: string }; finish_reason?: string }[]
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    const choice = obj.choices?.[0]
    return {
      content: choice?.message?.content ?? '',
      providerId: spec.id,
      model,
      finishReason: choice?.finish_reason ?? null,
      usage: obj.usage
        ? {
            promptTokens: obj.usage.prompt_tokens ?? 0,
            completionTokens: obj.usage.completion_tokens ?? 0,
          }
        : null,
    }
  },

  classifyError(_spec: ProviderSpec, status: number, json: unknown): ClassifiedError {
    const obj = json as {
      error?: {
        message?: string
        code?: string
        type?: string
        metadata?: { provider_name?: string; raw?: string }
      }
    }
    const message = obj.error?.message ?? `HTTP ${status}`
    const code = obj.error?.code ?? ''
    const type = obj.error?.type ?? ''
    const providerName = obj.error?.metadata?.provider_name
    const providerDetail = obj.error?.metadata?.raw
    const detail = providerName
      ? ` (${providerName}${providerDetail ? `: ${providerDetail.slice(0, 240)}` : ''})`
      : ''
    const detailedMessage = `${message}${detail}`
    const lower = `${detailedMessage} ${code} ${type}`.toLowerCase()

    if (lower.includes('insufficient_quota')) {
      return { kind: 'quota_billing', status, message: detailedMessage, retryAfterMs: null }
    }
    if (lower.includes('context_length_exceeded')) {
      return { kind: 'invalid_request', status, message: detailedMessage, retryAfterMs: null }
    }
    if (lower.includes('moderation') || lower.includes('content_filter')) {
      return { kind: 'content_filter', status, message: detailedMessage, retryAfterMs: null }
    }

    return { kind: classifyHttp(status, detailedMessage), status, message: detailedMessage, retryAfterMs: null }
  },
}

// Divergence guards: called by the engine when a request fails in a way that indicates
// the wire body needs adjusting before a one-shot retry, not a provider-cooldown failure.
export function shouldRetryWithoutResponseFormat(body: WireRequest['body'], message: string): boolean {
  const b = body as OpenAiCompatBody
  return Boolean(b.response_format) && message.toLowerCase().includes('response_format')
}

export function shouldRetryWithSwappedTokenParam(body: WireRequest['body'], message: string): boolean {
  const b = body as OpenAiCompatBody
  const lower = message.toLowerCase()
  return Boolean(b.max_tokens) && lower.includes('max_completion_tokens')
}

export function withoutResponseFormat(body: WireRequest['body']): OpenAiCompatBody {
  const b = { ...(body as OpenAiCompatBody) }
  delete b.response_format
  return b
}

export function withSwappedTokenParam(body: WireRequest['body']): OpenAiCompatBody {
  const b = { ...(body as OpenAiCompatBody) }
  if (b.max_tokens !== undefined) {
    b.max_completion_tokens = b.max_tokens
    delete b.max_tokens
  }
  return b
}
