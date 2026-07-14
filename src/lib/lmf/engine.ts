// src/lib/lmf/engine.ts
// callWithFallback: walk a Route in order, dispatching to the right adapter per candidate,
// classifying failures, applying cooldowns, and retrying transient errors once.

import { redactSecrets } from './errors'
import type { LMFErrorKind, LMFFailure } from './errors'
import { openaiCompatAdapter, shouldRetryWithoutResponseFormat, shouldRetryWithSwappedTokenParam, withoutResponseFormat, withSwappedTokenParam } from './adapters/openaiCompat'
import { anthropicAdapter } from './adapters/anthropic'
import { geminiAdapter } from './adapters/gemini'
import type { Adapter, WireRequest } from './adapters/types'
import type {
  CooldownLedger,
  Candidate,
  ChatRequest,
  ChatResult,
  EngineOptions,
  KeyStore,
  LMFResult,
  Route,
} from './types'

const DEFAULT_TIMEOUT_MS = 45_000
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 60_000
const RETRY_JITTER_MIN_MS = 250
const RETRY_JITTER_MAX_MS = 500

export function createCooldownLedger(): CooldownLedger {
  return new Map()
}

function adapterFor(kind: Candidate['spec']['kind']): Adapter {
  switch (kind) {
    case 'openai-compat':
      return openaiCompatAdapter
    case 'anthropic':
      return anthropicAdapter
    case 'gemini':
      return geminiAdapter
  }
}

function modelCooldownKey(candidate: Candidate): string {
  return `${candidate.providerId}:${candidate.model}`
}

function isOnCooldown(ledger: CooldownLedger, candidate: Candidate, now: number): boolean {
  const providerUntil = ledger.get(candidate.providerId) ?? 0
  const modelUntil = ledger.get(modelCooldownKey(candidate)) ?? 0
  return Math.max(providerUntil, modelUntil) > now
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function jitterDelay(): number {
  return RETRY_JITTER_MIN_MS + Math.random() * (RETRY_JITTER_MAX_MS - RETRY_JITTER_MIN_MS)
}

function makeFailure(
  candidate: Candidate,
  kind: LMFErrorKind,
  status: number | null,
  message: string,
  retryAfterMs: number | null,
  apiKey: string | null,
): LMFFailure {
  return {
    providerId: candidate.providerId,
    model: candidate.model,
    kind,
    status,
    retryAfterMs,
    message: redactSecrets(message, apiKey),
  }
}

function parseRetryAfterMs(headers: Headers | Record<string, string> | null | undefined): number | null {
  if (!headers) return null
  const raw = headers instanceof Headers ? headers.get('retry-after') : headers['retry-after']
  if (!raw) return null
  const seconds = Number(raw)
  if (Number.isFinite(seconds)) return seconds * 1000
  return null
}

type FetchOutcome =
  | { kind: 'success'; result: ChatResult }
  | { kind: 'aborted' }
  | {
      kind: 'failure'
      errorKind: LMFErrorKind
      status: number | null
      message: string
      retryAfterMs: number | null
      rawMessage: string
      responseFormatPresent: boolean
      tokenParamMaxTokens: boolean
    }

async function doFetch(
  adapter: Adapter,
  candidate: Candidate,
  wire: WireRequest,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  callerSignal: AbortSignal | undefined,
): Promise<FetchOutcome> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  const onCallerAbort = () => controller.abort()
  callerSignal?.addEventListener('abort', onCallerAbort)

  try {
    const res = await fetchImpl(wire.url, {
      method: wire.method,
      headers: wire.headers,
      body: JSON.stringify(wire.body),
      signal: controller.signal,
    })
    const json = await res.json().catch(() => ({}))

    if (res.ok) {
      const result = adapter.parseResponse(candidate.spec, candidate.model, json)
      return { kind: 'success', result }
    }

    const classified = adapter.classifyError(candidate.spec, res.status, json, res.headers)
    const retryAfterMs = classified.retryAfterMs ?? parseRetryAfterMs(res.headers)
    const bodyObj = wire.body as { response_format?: unknown; max_tokens?: unknown }
    return {
      kind: 'failure',
      errorKind: classified.kind,
      status: classified.status,
      message: classified.message,
      retryAfterMs,
      rawMessage: classified.message,
      responseFormatPresent: Boolean(bodyObj.response_format),
      tokenParamMaxTokens: bodyObj.max_tokens !== undefined,
    }
  } catch (err) {
    if (callerSignal?.aborted) {
      return { kind: 'aborted' }
    }
    if (controller.signal.aborted) {
      return {
        kind: 'failure',
        errorKind: 'timeout',
        status: null,
        message: 'Request timed out.',
        retryAfterMs: null,
        rawMessage: 'Request timed out.',
        responseFormatPresent: false,
        tokenParamMaxTokens: false,
      }
    }
    const message = err instanceof Error ? err.message : String(err)
    return {
      kind: 'failure',
      errorKind: 'network',
      status: null,
      message,
      retryAfterMs: null,
      rawMessage: message,
      responseFormatPresent: false,
      tokenParamMaxTokens: false,
    }
  } finally {
    clearTimeout(timeoutId)
    callerSignal?.removeEventListener('abort', onCallerAbort)
  }
}

export async function callWithFallback<T = string>(
  route: Route,
  req: ChatRequest,
  keys: KeyStore,
  validate?: (content: string) => T | null | undefined,
  opts: EngineOptions = {},
): Promise<LMFResult<T>> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const retryTransient = opts.retryTransient ?? true
  const cooldown = opts.cooldown ?? new Map<string, number>()
  const telemetry = opts.telemetry
  const fetchImpl = opts.fetchImpl ?? fetch

  const failures: LMFFailure[] = []
  const skippedProviders = new Set<string>()

  for (const candidate of route) {
    if (req.signal?.aborted) {
      return { ok: false, failures }
    }
    if (skippedProviders.has(candidate.providerId)) continue

    const now = Date.now()
    if (isOnCooldown(cooldown, candidate, now)) {
      const f = makeFailure(candidate, 'rate_limit', null, 'Candidate is on cooldown from a previous failure.', null, null)
      failures.push(f)
      telemetry?.onFailure?.(f)
      continue
    }

    // `keys.get` returning `null` means "no key configured for this provider" (skip);
    // returning `''` means "configured as empty" — used by providers with optional
    // bearer auth (e.g. OpenRouter's free tier, which accepts anonymous requests) to
    // signal "attempt without a key" rather than "not configured".
    const apiKey = candidate.spec.authStyle === 'none' ? null : await keys.get(candidate.providerId)
    if (candidate.spec.authStyle !== 'none' && apiKey === null) {
      const f = makeFailure(candidate, 'auth', null, `No API key configured for provider "${candidate.providerId}".`, null, null)
      failures.push(f)
      telemetry?.onFailure?.(f)
      skippedProviders.add(candidate.providerId)
      continue
    }

    telemetry?.onAttempt?.(candidate)

    const adapter = adapterFor(candidate.spec.kind)
    let wire = adapter.buildRequest(candidate.spec, candidate.model, apiKey, req)
    let outcome = await doFetch(adapter, candidate, wire, fetchImpl, timeoutMs, req.signal)

    if (outcome.kind === 'aborted') {
      return { ok: false, failures }
    }

    // Divergence guards: openai-compat only, one-shot retry with an adjusted wire body.
    if (outcome.kind === 'failure' && outcome.errorKind === 'invalid_request' && candidate.spec.kind === 'openai-compat') {
      if (shouldRetryWithoutResponseFormat(wire.body, outcome.rawMessage)) {
        wire = { ...wire, body: withoutResponseFormat(wire.body) }
        outcome = await doFetch(adapter, candidate, wire, fetchImpl, timeoutMs, req.signal)
      } else if (shouldRetryWithSwappedTokenParam(wire.body, outcome.rawMessage)) {
        wire = { ...wire, body: withSwappedTokenParam(wire.body) }
        outcome = await doFetch(adapter, candidate, wire, fetchImpl, timeoutMs, req.signal)
      }
      if (outcome.kind === 'aborted') {
        return { ok: false, failures }
      }
    }

    // Transient retry: timeout / network / server, once, with jitter.
    if (
      outcome.kind === 'failure' &&
      retryTransient &&
      (outcome.errorKind === 'timeout' || outcome.errorKind === 'network' || outcome.errorKind === 'server')
    ) {
      await sleep(jitterDelay())
      outcome = await doFetch(adapter, candidate, wire, fetchImpl, timeoutMs, req.signal)
      if (outcome.kind === 'aborted') {
        return { ok: false, failures }
      }
    }

    if (outcome.kind === 'failure') {
      const f = makeFailure(candidate, outcome.errorKind, outcome.status, outcome.message, outcome.retryAfterMs, apiKey)
      failures.push(f)
      telemetry?.onFailure?.(f)

      if (outcome.errorKind === 'auth') {
        skippedProviders.add(candidate.providerId)
      } else if (outcome.errorKind === 'rate_limit') {
        const cooldownMs = outcome.retryAfterMs ?? DEFAULT_RATE_LIMIT_COOLDOWN_MS
        const until = Date.now() + cooldownMs
        // Account-scoped (no model in message) cools the whole provider; default to provider-wide.
        cooldown.set(candidate.providerId, until)
      }
      continue
    }

    // Success at the transport level — now validate the payload.
    const attemptCount = failures.filter((f) => f.providerId === candidate.providerId && f.model === candidate.model).length + 1
    if (validate) {
      const value = validate(outcome.result.content)
      if (value === null || value === undefined) {
        const f = makeFailure(candidate, 'validation', null, 'Response failed validation.', null, apiKey)
        failures.push(f)
        telemetry?.onFailure?.(f)
        continue
      }
      telemetry?.onSuccess?.(outcome.result, attemptCount)
      return { ok: true, value, result: outcome.result, failures }
    }

    telemetry?.onSuccess?.(outcome.result, attemptCount)
    return { ok: true, value: outcome.result.content as unknown as T, result: outcome.result, failures }
  }

  telemetry?.onExhausted?.(failures)
  return { ok: false, failures }
}
