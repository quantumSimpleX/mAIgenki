import type {
  KeyStore, LMFProfile, Telemetry, Candidate, ChatResult, LMFFailure,
} from '@/lib/lmf'
import { lmfChat, lmfEnrich } from './service'
import { getIndexedSetting, putIndexedSetting } from '@/lib/db/indexedDb'

// ── Model chain ───────────────────────────────────────────────────────────────
// One fallback chain for every OpenRouter call, following the simFolio pattern:
// one shared model list, one call loop, first usable answer wins.
// All models must end in :free — no paid models flow through here.

export const DEFAULT_MODELS: string[] = [
  'google/gemma-4-31b-it:free',
  'openai/gpt-oss-20b:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
]

const SETTINGS_KEY = 'llm_model_chain'

function localOpenRouterApiKey(): string {
  if (typeof process === 'undefined') return ''
  return (
    process.env.EXPO_PUBLIC_MAIGENKI_OPENROUTER_API_KEY ??
    process.env.EXPO_PUBLIC_OPENROUTER_API_KEY ??
    ''
  ).trim()
}

// BYOK precedence: a user-supplied key always wins when present. The local/env
// app key is only used as the tier-0 fallback when the user hasn't set one.
export function resolveOpenRouterApiKey(userApiKey = ''): string {
  return userApiKey.trim() || localOpenRouterApiKey()
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LLMMessage {
  role: string
  content: string
}

export interface LLMResult<T> {
  ok: boolean
  model: string | null
  content: string | null
  value: T | null
  failures: string[]
}

interface CallOptions<T> {
  messages: LLMMessage[]
  apiKey?: string
  models?: string[]
  validate?: (content: string) => T | null | undefined
  temperature?: number
  label?: string
  db?: IDBDatabase
  profile?: LMFProfile
  keys?: KeyStore
  timeoutMs?: number
  onTrace?: (event: LLMTraceEvent) => void
}

export type LLMTraceEvent =
  | { type: 'attempt'; label: string; candidate: Candidate }
  | { type: 'failure'; label: string; failure: LMFFailure }
  | { type: 'success'; label: string; result: ChatResult; attemptCount: number }
  | { type: 'exhausted'; label: string; failures: LMFFailure[] }

// ── Fallback chain ────────────────────────────────────────────────────────────
// Thin wrapper over the lmf engine (service.ts's lmfChat/lmfEnrich): builds the
// system/user message pair the engine expects, then reconstructs the legacy
// LLMResult shape (including per-candidate `model`/`content`, which lmfChat/
// lmfEnrich don't expose in their own return types) from the engine's telemetry
// hooks. Never throws on a model error — records the reason and moves on so a
// single unavailable model never breaks the caller.

function splitMessages(messages: LLMMessage[]): { systemPrompt: string; userMessage: string } {
  const systemPrompt = messages.find((m) => m.role === 'system')?.content ?? ''
  const userMessage = messages
    .filter((m) => m.role !== 'system')
    .map((m) => m.content)
    .join('\n\n')
  return { systemPrompt, userMessage }
}

export async function callLLMWithFallback<T = string>(
  opts: CallOptions<T>,
): Promise<LLMResult<T>> {
  const { messages, apiKey, validate, temperature, label = 'llm', db, profile, keys, timeoutMs, onTrace } = opts
  const models = opts.models ?? DEFAULT_MODELS
  const { systemPrompt, userMessage } = splitMessages(messages)

  let model: string | null = null
  let content: string | null = null
  const failures: string[] = []
  const telemetry: Telemetry = {
    onAttempt: (candidate) => onTrace?.({ type: 'attempt', label, candidate }),
    onFailure: (failure) => {
      failures.push(`${failure.model}: ${failure.message}`)
      onTrace?.({ type: 'failure', label, failure })
    },
    onSuccess: (result, attemptCount) => {
      model = result.model
      content = result.content
      onTrace?.({ type: 'success', label, result, attemptCount })
    },
    onExhausted: (exhaustedFailures) => onTrace?.({ type: 'exhausted', label, failures: exhaustedFailures }),
  }
  const serviceOpts = { apiKey, models, temperature, telemetry, db, profile, keys, timeoutMs }

  let ok = false
  let value: T | null = null
  if (validate) {
    const outcome = await lmfEnrich<T>(systemPrompt, userMessage, validate, serviceOpts)
    if (outcome.ok) {
      ok = true
      value = outcome.value
    }
  } else {
    const outcome = await lmfChat(systemPrompt, userMessage, serviceOpts)
    if (outcome.ok) {
      ok = true
      value = outcome.content as unknown as T
    }
  }

  if (ok) {
    return { ok: true, model, content, value, failures }
  }


  // A model failing is an expected part of walking the fallback chain — record
  // it for the caller (returned in `failures`) without warning per model. Only
  // a total wipeout (every model failed) is worth a single console warning.
  console.warn(`[${label}] all models failed —`, failures.join('; '))
  return { ok: false, model: null, content: null, value: null, failures }
}

// ── Dynamic chain management ──────────────────────────────────────────────────
// The active chain is stored in the IndexedDB settings store under
// `llm_model_chain` as a JSON array. This lets the chain be updated at runtime
// (e.g. from the settings screen) without a code change or app update. Falls
// back to DEFAULT_MODELS if no override is stored or the stored value can't
// be parsed.

export async function getModelChain(db: IDBDatabase): Promise<string[]> {
  const raw = await getIndexedSetting(db, SETTINGS_KEY)
  if (!raw) return DEFAULT_MODELS
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0) return parsed
  } catch {
    // fall through to default
  }
  return DEFAULT_MODELS
}

export async function updateModelChain(
  db: IDBDatabase,
  models: string[],
): Promise<void> {
  await putIndexedSetting(db, SETTINGS_KEY, JSON.stringify(models))
}

// ── Session chat helper ───────────────────────────────────────────────────────
// For condition-scoped educational chat. The system prompt is constructed by
// the caller (bodymap screen) and must not contain full health record context.
// Returns the assistant reply string, or throws on total failure.

export async function getChatCompletion(
  userMessage: string,
  systemPrompt: string,
  apiKey: string = '',
): Promise<string> {
  const result = await callLLMWithFallback<string>({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    apiKey,
    temperature: 0.4,
    label: 'chat',
  })
  if (!result.ok || !result.content) {
    throw new Error(result.failures.join('; ') || 'No response from LLM')
  }
  return result.content
}
