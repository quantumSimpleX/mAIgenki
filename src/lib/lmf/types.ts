// src/lib/lmf/types.ts
// Dependency-free shared types for the LMF (LLM fallback -> BYOK) layer.
// No imports from app code, expo-*, react-native, sqlite, or zustand.

export type ChatRole = 'system' | 'user' | 'assistant'

export type ChatMessage = {
  role: ChatRole
  content: string
}

export type ChatRequest = {
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  responseFormat?: 'text' | 'json'
  signal?: AbortSignal
}

export type ChatResult = {
  content: string
  providerId: string
  model: string
  finishReason: string | null
  usage: { promptTokens: number; completionTokens: number } | null
}

export type AuthStyle = 'bearer' | 'x-api-key' | 'x-goog-api-key' | 'none'

export type ProviderKind = 'openai-compat' | 'anthropic' | 'gemini'

export type ProviderOAuthSpec = {
  authorizeURL: string
  exchangeURL: string
  method: 'pkce-s256'
}

export type ProviderSpec = {
  id: string
  label: string
  kind: ProviderKind
  baseURL: string
  authStyle: AuthStyle
  defaultHeaders?: Record<string, string>
  tokenParam: 'max_tokens' | 'max_completion_tokens'
  supportsJsonResponseFormat: boolean
  modelListPath: string | null
  oauth?: ProviderOAuthSpec
  keyURL?: string
}

export type Candidate = {
  providerId: string
  model: string
  spec: ProviderSpec
}

export type Route = Candidate[]

export type LMFProfileTier = 0 | 1 | 2 | 3

export type LMFProfile = {
  tier: LMFProfileTier
  activeProviderId: string | null
  model: string | null
  customBaseURL: string | null
  fallbackToFree: boolean
  keySource: 'oauth' | 'manual' | null
  verifiedAt?: string | null
}

export interface KeyStore {
  get(providerId: string): Promise<string | null>
  set(providerId: string, key: string): Promise<void>
  delete(providerId: string): Promise<void>
}

export interface ConfigStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
}

export interface Telemetry {
  onAttempt?(c: Candidate): void
  onFailure?(f: import('./errors').LMFFailure): void
  onSuccess?(r: ChatResult, attemptCount: number): void
  onExhausted?(failures: import('./errors').LMFFailure[]): void
}

export type CooldownLedger = Map<string, number>

export type EngineOptions = {
  timeoutMs?: number
  retryTransient?: boolean
  cooldown?: CooldownLedger
  telemetry?: Telemetry
  fetchImpl?: typeof fetch
}

export type LMFResult<T> =
  | { ok: true; value: T; result: ChatResult; failures: import('./errors').LMFFailure[] }
  | { ok: false; failures: import('./errors').LMFFailure[] }
