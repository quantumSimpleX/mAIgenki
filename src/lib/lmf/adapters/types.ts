// src/lib/lmf/adapters/types.ts
// Adapter interface: one implementation per provider "kind" (openai-compat, anthropic, gemini).

import type { ChatRequest, ChatResult, ProviderSpec } from '../types'
import type { LMFErrorKind } from '../errors'

export type WireRequest = {
  url: string
  method: 'POST'
  headers: Record<string, string>
  body: unknown
}

export type ClassifiedError = {
  kind: LMFErrorKind
  status: number
  message: string
  retryAfterMs: number | null
}

export interface Adapter {
  buildRequest(spec: ProviderSpec, model: string, apiKey: string | null, req: ChatRequest): WireRequest
  parseResponse(spec: ProviderSpec, model: string, json: unknown): ChatResult
  classifyError(spec: ProviderSpec, status: number, json: unknown, headers: Headers | Record<string, string>): ClassifiedError
}
