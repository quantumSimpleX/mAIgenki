import type { SQLiteDatabase } from 'expo-sqlite'

// ── Model chain ───────────────────────────────────────────────────────────────
// Ordered best → last-resort for medical text extraction.
// Priority: structured-JSON accuracy, medical vocabulary, context window, speed.
// All models must end in :free — no paid models ever flow through here.

export const DEFAULT_MODELS: string[] = [
  'nousresearch/hermes-3-llama-3.1-405b:free', // Structured-output specialist; best JSON schema adherence + medical vocabulary
  'openai/gpt-oss-120b:free',                  // Dense 120B; strong clinical reasoning
  'nvidia/nemotron-3-super-120b-a12b:free',    // MoE — fast, 1M context for long cumulative histories
  'meta-llama/llama-3.3-70b-instruct:free',    // Reliable 70B workhorse
  'meta-llama/llama-3.2-3b-instruct:free',     // Emergency fallback — small but fast
]

const SETTINGS_KEY = 'llm_model_chain'

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
  apiKey: string
  models?: string[]
  validate?: (content: string) => T | null | undefined
  temperature?: number
  label?: string
}

// ── Fallback chain ────────────────────────────────────────────────────────────
// Walks the model list in order. Never throws on a model error — records the
// reason and moves on so a single unavailable model never breaks the caller.

export async function callLLMWithFallback<T = string>(
  opts: CallOptions<T>,
): Promise<LLMResult<T>> {
  const { messages, apiKey, validate, temperature, label = 'llm' } = opts
  const models = opts.models ?? DEFAULT_MODELS
  const failures: string[] = []

  for (const model of models) {
    let content: string | undefined
    let why = ''
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/quantumSimpleX/mAIgenki',
          'X-Title': 'mAIgenki',
        },
        body: JSON.stringify({
          model,
          messages,
          ...(temperature !== undefined ? { temperature } : {}),
        }),
      })
      const data = await res.json()
      content = data.choices?.[0]?.message?.content
      why = data.error?.message ?? `HTTP ${res.status}`
    } catch (err) {
      why = String(err)
    }

    if (content) {
      const value = validate ? validate(content) : (content as unknown as T)
      if (value !== null && value !== undefined) {
        return { ok: true, model, content, value: value as T, failures }
      }
      why = 'returned content failed validation'
    }

    // A model failing is an expected part of walking the fallback chain — record
    // it for the caller (returned in `failures`) without warning per model. Only
    // a total wipeout (every model failed) is worth a single console warning.
    failures.push(`${model}: ${why}`)
  }

  console.warn(`[${label}] all models failed —`, failures.join('; '))
  return { ok: false, model: null, content: null, value: null, failures }
}

// ── Dynamic chain management ──────────────────────────────────────────────────
// The active chain is stored in SQLite settings under `llm_model_chain` as a
// JSON array. This lets the chain be updated at runtime (e.g. from the settings
// screen) without a code change or app update. Falls back to DEFAULT_MODELS if
// no override is stored or the stored value can't be parsed.

export async function getModelChain(db: SQLiteDatabase): Promise<string[]> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    [SETTINGS_KEY],
  )
  if (!row) return DEFAULT_MODELS
  try {
    const parsed = JSON.parse(row.value)
    if (Array.isArray(parsed) && parsed.length > 0) return parsed
  } catch {
    // fall through to default
  }
  return DEFAULT_MODELS
}

export async function updateModelChain(
  db: SQLiteDatabase,
  models: string[],
): Promise<void> {
  await db.runAsync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    [SETTINGS_KEY, JSON.stringify(models)],
  )
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
