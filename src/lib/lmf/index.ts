// src/lib/lmf/index.ts
// Public surface of the LMF (LLM fallback -> BYOK) layer.
//
// Porting LMF
// -----------
// `src/lib/lmf/` is dependency-free: no imports from app code, expo-*, react-native,
// SQLite, or Zustand anywhere under this directory. It only uses `fetch`, `AbortController`,
// `Headers`, and standard JS/TS. To port it into another project, copy this directory as-is
// and supply the following from your own app-wiring layer:
//
// - `fetch` — pass a custom `fetchImpl` via `EngineOptions` if you need proxying/instrumentation;
//   otherwise the global `fetch` is used.
// - `KeyStore` — where provider API keys live (e.g. platform secure storage, a keychain, an
//   encrypted DB column). Never SQLite/plaintext in this codebase's own usage.
// - `ConfigStore` — where non-secret config (e.g. a pending OAuth PKCE verifier) lives between
//   the authorize redirect and the exchange step.
// - `Telemetry` — hook `onAttempt`/`onFailure`/`onSuccess`/`onExhausted` into your own logging/UI
//   state. These callbacks only ever receive `Candidate` and `LMFFailure`/`ChatResult` objects —
//   never raw API keys, and failure `message` strings are always pre-redacted via `redactSecrets`.
// - OAuth glue (PKCE flow, A9) — `oauth/openrouterPkce.ts` is pure logic with crypto/fetch
//   injected; the actual browser-launch step (e.g. Expo's `expo-web-browser`, or a plain
//   `window.open` redirect flow on web) belongs in your app layer, not here.

export type {
  ChatRole,
  ChatMessage,
  ChatRequest,
  ChatResult,
  AuthStyle,
  ProviderKind,
  ProviderOAuthSpec,
  ProviderSpec,
  Candidate,
  Route,
  LMFProfileTier,
  LMFProfile,
  KeyStore,
  ConfigStore,
  Telemetry,
  CooldownLedger,
  EngineOptions,
  LMFResult,
} from './types'

export type { LMFErrorKind, LMFFailure } from './errors'
export { classifyHttp, redactSecrets } from './errors'

export { BUILT_IN_PROVIDERS, getProviderSpec } from './registry'

export { callWithFallback, createCooldownLedger } from './engine'

export { buildRoute } from './route'

export { listModels, CURATED_MODELS } from './models'

export { validateKey } from './validateKey'
export type { ValidateKeyResult } from './validateKey'

export { createPkcePair, buildAuthorizeURL, exchangeCode } from './oauth/openrouterPkce'
export type { PkcePair, ExchangeResult } from './oauth/openrouterPkce'
