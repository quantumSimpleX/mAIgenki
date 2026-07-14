// src/lib/llm/service.ts
// Composition root wiring the dependency-free src/lib/lmf/ engine into the app:
// builds a Route from the (eventually stored) LMFProfile + free chain, resolves
// keys, and exposes the two call shapes the rest of the app needs.
//
// Profile/KeyStore wiring is still tier-0-only (pB03-T02/T03 land the real
// SecureStore-backed KeyStore and persisted LMFProfile) — until then this
// always routes through the free OpenRouter chain, matching pre-LMF behavior.

import type { SQLiteDatabase } from 'expo-sqlite'
import {
  buildRoute,
  callWithFallback,
  createCooldownLedger,
  type Candidate,
  type ChatMessage,
  type ChatResult,
  type CooldownLedger,
  type KeyStore,
  type LMFFailure,
  type LMFProfile,
  type Telemetry,
} from '@/lib/lmf'
import { useAppStore } from '@/store/useAppStore'
import { DEFAULT_MODELS, getModelChain, resolveOpenRouterApiKey } from './client'
import { getSetting } from '../db/queries'
import { refreshModelChain, shouldRefresh } from './refresh'

// One in-memory cooldown ledger for the process lifetime — resets on relaunch,
// which is fine since 429s are short-lived (see lmfPlan.md risk register).
const cooldownLedger: CooldownLedger = createCooldownLedger()

// Test-only escape hatch: without this, a 429 in one test sets a real-time
// provider cooldown on the shared module-level ledger that silently poisons
// every later test in the same file (they'd see "on cooldown", not the
// outcome they mocked). Not used by app code.
export function __resetCooldownLedgerForTests(): void {
  cooldownLedger.clear()
}

// Fire-and-forget model-chain refresh, gated at 30 days (see refresh.ts). Runs
// at most once per process lifetime — lmfChat/lmfEnrich fire per message, not
// per app launch, so this module-level flag stops every call from re-reading
// the setting. Never awaited by callers and never throws: refreshModelChain
// already swallows its own errors and leaves the existing chain untouched on
// failure, and the .catch here guards the setting lookup itself.
let refreshTriggered = false

function maybeRefreshModelChain(db: SQLiteDatabase | undefined, apiKey: string): void {
  if (!db || refreshTriggered) return
  refreshTriggered = true
  getSetting(db, 'llm_chain_last_checked')
    .then((lastChecked) => (shouldRefresh(lastChecked) ? refreshModelChain(db, apiKey) : undefined))
    .catch(() => {})
}

// Maps LMF engine signals to store status per the degradation ladder
// (lmfPlan.md A1: ok -> degraded -> exhausted). Built fresh per call so a
// degrading failure on one call's fallback chain can't leak into a later,
// fully-successful call — `degradingKind` is local to this closure, not a
// module-level variable. Never receives message content or keys: only
// `Candidate`/`LMFFailure` metadata, which is all the engine ever passes.
function createStoreTelemetry(): Telemetry {
  let degradingKind: 'rate_limit' | 'quota_billing' | null = null
  return {
    onFailure(f: LMFFailure) {
      if (f.kind === 'rate_limit' || f.kind === 'quota_billing') {
        degradingKind = f.kind
      }
    },
    onSuccess() {
      const { setLlmStatus, setLastLlmFailureKind } = useAppStore.getState()
      if (degradingKind) {
        setLlmStatus('degraded')
        setLastLlmFailureKind(degradingKind)
      } else {
        setLlmStatus('ok')
      }
    },
    onExhausted(failures: LMFFailure[]) {
      const { setLlmStatus, setLastLlmFailureKind } = useAppStore.getState()
      setLlmStatus('exhausted')
      const last = failures[failures.length - 1]
      if (last) setLastLlmFailureKind(last.kind)
    },
  }
}

// Composes the store-updating telemetry with a caller-supplied one (e.g. test
// assertions) so passing `opts.telemetry` never silently drops store updates
// or vice versa — both observers see every callback.
function composeTelemetry(store: Telemetry, caller: Telemetry | undefined): Telemetry {
  if (!caller) return store
  return {
    onAttempt: (c: Candidate) => {
      store.onAttempt?.(c)
      caller.onAttempt?.(c)
    },
    onFailure: (f: LMFFailure) => {
      store.onFailure?.(f)
      caller.onFailure?.(f)
    },
    onSuccess: (r: ChatResult, attemptCount: number) => {
      store.onSuccess?.(r, attemptCount)
      caller.onSuccess?.(r, attemptCount)
    },
    onExhausted: (failures: LMFFailure[]) => {
      store.onExhausted?.(failures)
      caller.onExhausted?.(failures)
    },
  }
}

const TIER_0_PROFILE: LMFProfile = {
  tier: 0,
  activeProviderId: null,
  model: null,
  customBaseURL: null,
  fallbackToFree: true,
  keySource: null,
}

// Stand-in KeyStore: only ever resolves the openrouter env/user key, mirroring
// today's `resolveOpenRouterApiKey` precedence. Replaced by a real per-provider
// KeyStore in pB03-T02, at which point `activeProviderId` on the profile drives
// which provider's key gets read here instead of this openrouter-only shim.
function envKeyStore(userApiKey: string): KeyStore {
  return {
    async get(providerId: string) {
      if (providerId !== 'openrouter') return null
      // Always resolves to a string (possibly '') — OpenRouter's free-tier models
      // accept anonymous requests, so an empty key means "attempt without one",
      // not "unconfigured" (see the engine's null-vs-empty-string auth gate).
      return resolveOpenRouterApiKey(userApiKey)
    },
    async set() {},
    async delete() {},
  }
}

async function resolveFreeChain(db?: SQLiteDatabase, models?: string[]): Promise<string[]> {
  if (models && models.length > 0) return models
  if (db) return getModelChain(db)
  return DEFAULT_MODELS
}

export type LmfServiceOptions = {
  apiKey?: string
  models?: string[]
  db?: SQLiteDatabase
  profile?: LMFProfile
  keys?: KeyStore
  telemetry?: Telemetry
  temperature?: number
}

export type LmfChatOutcome =
  | { ok: true; content: string }
  | { ok: false; message: string }

// Session-only condition chat (bodymap.tsx). Context is a single system prompt +
// one user message — never the full health record (hard constraint, see CLAUDE.md).
export async function lmfChat(
  systemPrompt: string,
  userMessage: string,
  opts: LmfServiceOptions = {},
): Promise<LmfChatOutcome> {
  const profile = opts.profile ?? TIER_0_PROFILE
  maybeRefreshModelChain(opts.db, resolveOpenRouterApiKey(opts.apiKey ?? ''))
  const freeChain = await resolveFreeChain(opts.db, opts.models)
  const route = buildRoute(profile, freeChain)
  const keys = opts.keys ?? envKeyStore(opts.apiKey ?? '')

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ]

  const result = await callWithFallback<string>(
    route,
    { messages, temperature: opts.temperature ?? 0.4 },
    keys,
    undefined,
    { cooldown: cooldownLedger, telemetry: composeTelemetry(createStoreTelemetry(), opts.telemetry) },
  )

  if (result.ok) return { ok: true, content: result.result.content }
  const message = result.failures.map((f) => f.message).join('; ') || 'No response from LLM'
  return { ok: false, message }
}

// Structured extraction (enrich.ts). `validate` parses/shape-checks the JSON
// response; a null/undefined return advances the fallback chain (A4 step 5).
export async function lmfEnrich<T>(
  systemPrompt: string,
  userMessage: string,
  validate: (content: string) => T | null | undefined,
  opts: LmfServiceOptions = {},
): Promise<{ ok: true; value: T } | { ok: false; failures: string[] }> {
  const profile = opts.profile ?? TIER_0_PROFILE
  maybeRefreshModelChain(opts.db, resolveOpenRouterApiKey(opts.apiKey ?? ''))
  const freeChain = await resolveFreeChain(opts.db, opts.models)
  const route = buildRoute(profile, freeChain)
  const keys = opts.keys ?? envKeyStore(opts.apiKey ?? '')

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ]

  const result = await callWithFallback<T>(
    route,
    { messages, temperature: opts.temperature ?? 0, responseFormat: 'json' },
    keys,
    validate,
    { cooldown: cooldownLedger, telemetry: composeTelemetry(createStoreTelemetry(), opts.telemetry) },
  )

  if (result.ok) return { ok: true, value: result.value }
  return { ok: false, failures: result.failures.map((f) => f.message) }
}
