// src/lib/lmf/adapters/gemini.ts
// Google Gemini generateContent API adapter.

import type { ChatRequest, ChatResult, ProviderSpec } from '../types'
import { classifyHttp } from '../errors'
import type { Adapter, ClassifiedError, WireRequest } from './types'

type GeminiBody = {
  contents: { role: 'user' | 'model'; parts: { text: string }[] }[]
  systemInstruction?: { parts: { text: string }[] }
  generationConfig?: { temperature?: number; maxOutputTokens?: number; responseMimeType?: string }
}

export const geminiAdapter: Adapter = {
  buildRequest(spec: ProviderSpec, model: string, apiKey: string | null, req: ChatRequest): WireRequest {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(spec.defaultHeaders ?? {}),
    }
    if (apiKey) headers['x-goog-api-key'] = apiKey

    const systemParts: string[] = []
    const contents: { role: 'user' | 'model'; parts: { text: string }[] }[] = []
    for (const m of req.messages) {
      if (m.role === 'system') {
        systemParts.push(m.content)
      } else {
        contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })
      }
    }

    const generationConfig: GeminiBody['generationConfig'] = {}
    if (req.temperature !== undefined) generationConfig.temperature = req.temperature
    if (req.maxTokens !== undefined) generationConfig.maxOutputTokens = req.maxTokens
    if (req.responseFormat === 'json' && spec.supportsJsonResponseFormat) {
      generationConfig.responseMimeType = 'application/json'
    }

    const body: GeminiBody = { contents }
    if (systemParts.length > 0) body.systemInstruction = { parts: [{ text: systemParts.join('\n\n') }] }
    if (Object.keys(generationConfig).length > 0) body.generationConfig = generationConfig

    return {
      url: `${spec.baseURL}/v1beta/models/${model}:generateContent`,
      method: 'POST',
      headers,
      body,
    }
  },

  parseResponse(spec: ProviderSpec, model: string, json: unknown): ChatResult {
    const obj = json as {
      candidates?: {
        content?: { parts?: { text?: string }[] }
        finishReason?: string
      }[]
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
    }
    const candidate = obj.candidates?.[0]
    const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? '').join('')
    return {
      content: text,
      providerId: spec.id,
      model,
      finishReason: candidate?.finishReason ?? null,
      usage: obj.usageMetadata
        ? {
            promptTokens: obj.usageMetadata.promptTokenCount ?? 0,
            completionTokens: obj.usageMetadata.candidatesTokenCount ?? 0,
          }
        : null,
    }
  },

  classifyError(_spec: ProviderSpec, status: number, json: unknown): ClassifiedError {
    const obj = json as { error?: { status?: string; message?: string } }
    const message = obj.error?.message ?? `HTTP ${status}`
    const code = obj.error?.status ?? ''

    switch (code) {
      case 'RESOURCE_EXHAUSTED':
        return { kind: 'rate_limit', status, message, retryAfterMs: null }
      case 'PERMISSION_DENIED':
      case 'UNAUTHENTICATED':
        return { kind: 'auth', status, message, retryAfterMs: null }
      case 'INVALID_ARGUMENT':
        return { kind: 'invalid_request', status, message, retryAfterMs: null }
      default:
        return { kind: classifyHttp(status, message), status, message, retryAfterMs: null }
    }
  },
}
