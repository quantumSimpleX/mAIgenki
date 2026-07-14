# LMF — LLM Fallback → BYOK Layer

A reusable, provider-agnostic LLM access layer: the app works instantly on shared free models, then transitions each user seamlessly onto their own provider subscription with minimal friction. Part A is generic (portable to other projects); Part B is the mAIgenki integration, phased with verification.

Design decisions locked in:

1. **Provider strategy**: one OpenAI-compatible core adapter (OpenRouter, OpenAI, Groq, Mistral, DeepSeek, xAI, Together, Ollama, custom baseURL) + small native adapters for Anthropic and Gemini.
2. **OAuth-first**: OpenRouter OAuth PKCE is the primary low-friction upgrade path; manual key paste is the fallback for all providers.
3. **Portability**: self-contained, dependency-free `src/lib/lmf/` module (storage/telemetry injected); app wiring stays outside.
4. **Upgrade UX**: contextual nudge on degradation/failure + natural moments (first chat use, settings).

## 0. Verified environment facts

- Deps present: `expo-web-browser ~56.0.5`, `expo-linking ~56.0.14`, `expo-sqlite ~56.0.5`. App scheme `maigenki` (app.json). Platforms: android/ios/web (spa).
- Deps to install: `expo-secure-store`, `expo-crypto` (`npx expo install expo-secure-store expo-crypto`).
- `openai` npm package (^6.44.0) is in dependencies but unused in `src/` — remove in cleanup phase.
- expo-secure-store (SDK 56): `setItemAsync/getItemAsync/deleteItemAsync`, `isAvailableAsync()`. **No web support.** Basic use works in Expo Go; config plugin (Android backup exclusion) requires dev-client rebuild. No `requireAuthentication` usage planned.
- expo-web-browser (SDK 56): `openAuthSessionAsync(url, redirectUrl)` → `{type:'success', url} | {type:'cancel'|'dismiss'|'locked'|'opened'}`. iOS = ASWebAuthenticationSession (custom scheme redirect required); web = popup + same-origin completion page calling `WebBrowser.maybeCompleteAuthSession()`; must be invoked from a user gesture on mobile web.
- expo-crypto (SDK 56): `digestStringAsync(SHA256, data, {encoding: BASE64})`, `getRandomBytesAsync(n)` — sufficient for PKCE S256 (base64→base64url in code).
- OpenRouter PKCE: authorize `https://openrouter.ai/auth?callback_url=…&code_challenge=…&code_challenge_method=S256` → redirect with `?code=` → `POST https://openrouter.ai/api/v1/auth/keys` `{code, code_verifier, code_challenge_method}` → `{key}`. Errors: 400 method mismatch, 403 invalid code/verifier.

### Current-code facts driving the design

- All LLM calls funnel through `callLLMWithFallback` in `src/lib/llm/client.ts` (raw fetch to OpenRouter, OpenAI-shaped body; 4 hardcoded `:free` models). **No streaming, no timeout, no retry, no 429/`res.ok` handling** — any failure advances to the next model.
- `resolveOpenRouterApiKey`: env key **beats** user key — must flip for BYOK.
- Condition chat (`bodymap.tsx sendMessage()`, ~1061) calls `getChatCompletion` with **no apiKey** and never reads the SQLite model chain — unlike the pipeline.
- `enrichFromText` never throws: total LLM failure → silent empty bodymap (bad UX, fixed in Phase 2).
- `openrouter_api_key` in SQLite settings KV is **read-only** (`analyzing.tsx:453`); no write path or UI exists.
- `src/lib/db/backup.ts:18` exports the whole `settings` table → a stored key would leak into backups.
- `src/lib/llm/refresh.ts` (free-chain auto-ranking) is dead code; includes an arena.ai HTML-scrape-via-LLM step.

## Part A — Generic LMF design (reusable)

### A1. User journey spec

| Tier | Name | Setup cost | Key source | Route |
|---|---|---|---|---|
| 0 | Anonymous free | zero | app-shipped env key | curated free chain on aggregator |
| 1 | OAuth BYOK | 2 taps | OAuth PKCE scoped key (OpenRouter) | user model → free chain safety net |
| 2 | Direct provider key | paste key + pick model | manual entry | user provider/model → optional free net |
| 3 | Custom endpoint | baseURL + key + model | manual | custom endpoint → optional free net |

**Upgrade triggers** (non-blocking, dismissible, dismissal remembered):

1. All-chain-exhausted (`ok:false` from the engine).
2. Rate/quota signal: any `rate_limit` (429) or `quota_billing` (402) failure even within an ultimately-successful call → "degraded".
3. First chat use: one-time inline card (per install, persisted flag).
4. Settings entry: AI Provider section always shows tier + upgrade path.

**Degradation ladder**: `ok` (silent) → `degraded` (passive banner: "Free AI models are busy. Connect your own account for reliable access.") → `exhausted` (error surface with Retry + Connect CTAs; copy varies by dominant failure kind — rate_limit / auth / network, where network shows no upgrade nudge). Passive nudges suppressed 7 days after dismissal (`lmf_nudge_dismissed_at`); active error CTAs never suppressed.

### A2. Module layout

```
src/lib/lmf/                 # dependency-free core: no app code, expo-*, RN, SQLite, Zustand imports
  index.ts                   # public surface + "porting LMF" header comment
  types.ts                   # ChatMessage/ChatRequest/ChatResult, Candidate/Route, LMFProfile, injected interfaces
  errors.ts                  # LMFErrorKind, LMFFailure, classifyHttp(), redactSecrets()
  registry.ts                # ProviderSpec + BUILT_IN_PROVIDERS (openrouter, openai, groq, mistral, deepseek, xai, together, ollama, anthropic, gemini, custom)
  adapters/
    types.ts                 # Adapter interface (buildRequest / parseResponse / classifyError)
    openaiCompat.ts          # one adapter for all OpenAI-shaped providers
    anthropic.ts             # Messages API
    gemini.ts                # generateContent
  engine.ts                  # callWithFallback + cooldown ledger + retry/jitter + per-candidate AbortController timeout
  route.ts                   # buildRoute(profile, freeChain) → Route
  models.ts                  # listModels(spec, key), CURATED_MODELS per provider
  validateKey.ts             # cheap key-validation ping
  oauth/openrouterPkce.ts    # pure PKCE logic (crypto + fetch injected)
```

`fetch` from global by default, injectable for tests. Platform specifics (SecureStore, SQLite, expo-web-browser, expo-crypto, Zustand) are injected or live in the app wiring layer.

### A3. Core interfaces

```ts
type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }
type ChatRequest = {
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number                 // mapped per adapter: max_tokens / max_completion_tokens / maxOutputTokens
  responseFormat?: 'text' | 'json'   // best-effort hint; validate() remains the guarantee
  signal?: AbortSignal               // caller cancel, composed with per-candidate timeout
}
type ChatResult = {
  content: string; providerId: string; model: string
  finishReason: string | null
  usage: { promptTokens: number; completionTokens: number } | null
}
type Candidate = { providerId: string; model: string }
type Route = Candidate[]

type LMFErrorKind =
  | 'auth' | 'rate_limit' | 'quota_billing' | 'timeout' | 'network'
  | 'invalid_request' | 'content_filter' | 'server' | 'validation'

type LMFFailure = {
  candidate: Candidate; kind: LMFErrorKind; status: number | null
  message: string                    // always passed through redactSecrets()
  retryAfterMs: number | null
}

type LMFResult<T> =
  | { ok: true; value: T; result: ChatResult; failures: LMFFailure[] }
  | { ok: false; failures: LMFFailure[] }

interface KeyStore {
  get(providerId: string): Promise<string | null>
  set(providerId: string, key: string): Promise<void>
  delete(providerId: string): Promise<void>
}
interface ConfigStore { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void> }
interface Telemetry {                // never receives message content or keys
  onAttempt?(c: Candidate): void
  onFailure?(f: LMFFailure): void
  onSuccess?(r: ChatResult, attemptCount: number): void
  onExhausted?(failures: LMFFailure[]): void
}

type LMFProfile = {
  tier: 0 | 1 | 2 | 3
  activeProviderId: string | null    // null = tier 0
  model: string | null
  customBaseURL: string | null       // tier 3 only
  fallbackToFree: boolean            // default true, user-toggleable (privacy)
  keySource: 'oauth' | 'manual' | null
}

type AuthStyle = 'bearer' | 'x-api-key' | 'x-goog-api-key' | 'none'
type ProviderSpec = {
  id: string; label: string
  kind: 'openai-compat' | 'anthropic' | 'gemini'
  baseURL: string                    // overridable for custom/ollama
  authStyle: AuthStyle
  defaultHeaders?: Record<string, string>    // e.g. OpenRouter HTTP-Referer / X-Title
  tokenParam: 'max_tokens' | 'max_completion_tokens'
  supportsJsonResponseFormat: boolean
  modelListPath: string | null
  oauth?: { authorizeURL: string; exchangeURL: string; method: 'pkce-s256' }
  keyURL?: string                    // "get an API key here" link for UI
}

type EngineOptions = {
  timeoutMs?: number                 // default 45_000 per candidate
  retryTransient?: boolean           // default true: one retry, 250–750ms jitter, on timeout/network/server
  cooldown?: CooldownLedger
  telemetry?: Telemetry
  fetchImpl?: typeof fetch
}
function callWithFallback<T = string>(
  route: Route, req: ChatRequest, keys: KeyStore,
  validate?: (content: string) => T | null | undefined,
  opts?: EngineOptions,
): Promise<LMFResult<T>>
```

### A4. Fallback engine algorithm

Per candidate, in route order:

1. **Cooldown check** — in-memory `CooldownLedger` (`Map<providerId:model, untilEpochMs>` + provider-wide entries). Cooling → synthetic `rate_limit` failure, skip without a network call.
2. **Key resolution** — missing key for auth-required provider → `auth` failure, skip whole provider.
3. **Request** — adapter builds wire request; AbortController timeout composed with caller `signal`.
4. **Classify**: caller abort → stop, return `ok:false`. Timeout → `timeout`; fetch throw → `network`; else `res.ok`? parse : `adapter.classifyError`.
   - `auth` → skip all remaining candidates on that provider; no retry.
   - `rate_limit` → cooldown = `retryAfterMs ?? 60_000` (provider-wide if account-scoped); advance.
   - `quota_billing` / `invalid_request` / `content_filter` → record, advance, no retry.
   - `timeout` / `network` / `server` → retry same candidate once with jitter; then advance.
5. **Validate** — `validate(content)` null/undefined → `validation` failure, advance; else `ok:true`.
6. Exhausted → `telemetry.onExhausted`, `ok:false`.

`redactSecrets(msg)` runs on every failure message: strips `Bearer \S+`, `sk-…`, `sk-or-…`, `AIza…`, and any currently-loaded key value.

### A5. Adapters

**openaiCompat** (openrouter, openai, groq, mistral, deepseek, xai, together, ollama /v1, custom):

- `POST {baseURL}/chat/completions`; `Authorization: Bearer` (skipped when `authStyle:'none'`, e.g. local Ollama); merge `defaultHeaders`.
- Body: `{ model, messages, temperature?, [tokenParam]: maxTokens?, response_format: {type:'json_object'} when json && supportsJsonResponseFormat }`.
- Divergence guards: `invalid_request` with `response_format` present → one-shot retry without it; `max_tokens` rejected naming `max_completion_tokens` → swap param and retry once.
- Parse `choices[0].message.content` / `finish_reason` / `usage`. `insufficient_quota` → quota_billing; `context_length_exceeded` → invalid_request; moderation finish → content_filter.

**anthropic**:

- `POST {baseURL}/v1/messages`; headers `x-api-key`, `anthropic-version: 2023-06-01`, `anthropic-dangerous-direct-browser-access: true` (Anthropic's supported browser opt-in — needed for the web build with user-owned keys).
- System messages hoisted to top-level `system`; merge consecutive same-role messages. `max_tokens` REQUIRED → default 4096.
- No JSON mode param → rely on prompt + validate. Parse: concat `content[]` text blocks; `stop_reason`; `usage.{input,output}_tokens`. `authentication_error`→auth, `rate_limit_error`→rate_limit, `overloaded_error` (529)→server, `invalid_request_error`→invalid_request. Models: `GET /v1/models`.

**gemini**:

- `POST {baseURL}/v1beta/models/{model}:generateContent`; key via `x-goog-api-key` header (never in query — key stays out of URLs).
- `systemInstruction: {parts:[{text}]}`; `contents: [{role:'user'|'model', parts:[{text}]}]` (assistant→model); `generationConfig: {temperature, maxOutputTokens, responseMimeType:'application/json' when json}` (real JSON mode).
- Parse `candidates[0].content.parts[].text`; `finishReason==='SAFETY'` or `promptFeedback.blockReason` → content_filter. `RESOURCE_EXHAUSTED`→rate_limit, `PERMISSION_DENIED`/`UNAUTHENTICATED`→auth, `INVALID_ARGUMENT`→invalid_request. Models: `GET /v1beta/models` filtered on `generateContent` support.

**JSON policy (all adapters)**: `responseFormat:'json'` is a hint; fence-stripping + JSON.parse + shape check stays in the caller's `validate` (as `parseEnrichment` does today).

### A6. Routing policy

`buildRoute(profile, freeChain)`:

- Tier 0: free chain on openrouter.
- Tier 1–3: `[{activeProviderId, model}]` first; then, iff `fallbackToFree`, the free chain (deduped).
- `fallbackToFree` default true but user-toggleable with explicit privacy copy: "If your provider fails, retry on free models via OpenRouter. Turn off to keep requests only on your chosen provider."
- Cooldowns apply across the route: an on-cooldown user candidate falls through to the net within the same request.

### A7. Model selection UX

- `listModels(spec, key)` where a list endpoint exists (openrouter `/models`, openai `/v1/models`, anthropic `/v1/models`, gemini `/v1beta/models`, ollama `/api/tags`, others via compat `/models`).
- `CURATED_MODELS`: 3–5 sensible defaults per provider shown first (curate at implementation time). Picker = curated → "All models" (searchable, fetched) → free-text model-id field always available (the required path for tier 3).

### A8. Key handling

- Secrets live in the injected `KeyStore`: expo-secure-store on native, `localStorage` on web (SecureStore has no web support; matches OpenRouter's own browser-key trust model). Never SQLite settings; if `isAvailableAsync()` false on native → in-memory session-only + visible "key won't persist" notice.
- Never logged; `redactSecrets` on all failure strings; Telemetry receives no keys or content by construction; keys excluded from backups (Part B Phase 3).
- Validation ping on entry (`validateKey.ts`): models-list call when available, else 1-token completion. Returns `{ok} | {ok:false, kind}` so UI distinguishes "wrong key" from "offline".

### A9. OpenRouter OAuth PKCE flow

Pure logic in `lmf/oauth/openrouterPkce.ts` (crypto injected); Expo glue in app wiring.

1. `verifier = base64url(randomBytes(32))` via `getRandomBytesAsync`.
2. `challenge = base64url(SHA256(verifier))` via `digestStringAsync(…, {encoding: BASE64})` + base64url conversion.
3. `redirectUrl`: native `Linking.createURL('oauth/openrouter')` → `maigenki://oauth/openrouter`; web `${origin}/oauth/openrouter`.
4. `authUrl = https://openrouter.ai/auth?callback_url=…&code_challenge=…&code_challenge_method=S256`.
5. `openAuthSessionAsync(authUrl, redirectUrl)` — called synchronously from the button press (mobile-web popup blockers). `success` → parse `code` (also handle `?error=`); `cancel|dismiss` → silent no-op; `locked` → "Another sign-in in progress."
6. Exchange `POST /api/v1/auth/keys` (15s timeout) → `{key}`. 403 → "Authorization expired or invalid — try again"; 400 → internal bug.
7. Success: `KeyStore.set('openrouter', key)`; profile → tier 1 / `keySource:'oauth'`; background `validateKey` sanity check.
8. Completion route `src/app/oauth/openrouter.tsx`: web renders "Completing sign-in…" + `maybeCompleteAuthSession()`; native cold-launch path reads `code` via `useLocalSearchParams` and completes exchange (verifier persisted to ConfigStore under `lmf_oauth_pending` before launch, deleted after).

## Part B — mAIgenki integration (phased)

New app-wiring files (outside `lmf/`):

```
src/lib/llm/service.ts               # composition root: route from profile + free chain, KeyStore, telemetry→store; exposes lmfChat(), lmfEnrich()
src/lib/llm/keystore.ts              # SecureStoreKeyStore (native) / LocalStorageKeyStore (web)
src/lib/llm/profile.ts               # LMFProfile ⇄ settings KV (`lmf_profile` JSON, NO secrets); openrouter_api_key migration
src/lib/llm/oauth.ts                 # connectOpenRouter() (expo-web-browser + expo-crypto + expo-linking)
src/app/oauth/openrouter.tsx         # OAuth completion route
src/components/ProviderSettings.tsx  # settings UI section (keep bodymap.tsx from growing)
```

### Phase 1 — LMF core + adapters + tests (pure TS, no app changes)

- Create everything under `src/lib/lmf/` per A2.
- New tests (mock `fetch`, as `tests/lib/llm.test.ts` does): `tests/lib/lmf/engine.test.ts` (fallback order, timeout, retry-once jitter, auth-skips-provider, cooldown incl. Retry-After, validation-advance, caller abort, redaction), `adapters.test.ts` (wire shapes for all three; response_format degrade; token-param swap; Anthropic system hoist + required max_tokens; Gemini role mapping + SAFETY), `route.test.ts`, `oauthPkce.test.ts` (verifier/challenge vectors, URL build, exchange error mapping), `models.test.ts`.
- Verify: `npm run typecheck`; `npx jest tests/lib/lmf`; ≥80% coverage on `src/lib/lmf`.

### Phase 2 — Migrate call sites (behavior-identical on free tier)

- `src/lib/llm/client.ts`: `callLLMWithFallback` becomes a thin shim over `service.ts`→engine with a tier-0 route (preserve `LLMResult` shape); keep `DEFAULT_MODELS`, `getModelChain`, `updateModelChain`.
- **Flip key precedence**: user key (KeyStore) > env key; env keys become the tier-0 anonymous default only (`resolveOpenRouterApiKey`, client.ts:26). Update `tests/lib/llm.test.ts`.
- `src/lib/llm/enrich.ts`: total LLM failure (`ok:false`) → throw `EnrichmentFailedError(failures)` instead of silent EMPTY (genuinely-empty extraction stays valid EMPTY). `analyzing.tsx` catch shows a truthful error.
- `src/app/bodymap.tsx` `sendMessage()`: dynamic-import `lmfChat` from `service.ts` — chat now uses stored profile, KeyStore, and the SQLite model chain. Session-only + disclaimer flow unchanged.
- `src/lib/pipeline.ts` / `src/app/analyzing.tsx`: pipeline gets its route from `service.ts`; `PipelineOptions.apiKey` becomes optional/deprecated; `analyzing.tsx:453` stops reading `openrouter_api_key` directly.
- Update: llm/enrich/pipeline/apiKeySetting tests.
- Verify: typecheck; full jest; manual — free-tier upload unchanged, chat replies, airplane-mode upload shows an error (not an empty bodymap).

### Phase 3 — Key storage, profile schema, backup exclusion

- Install `expo-secure-store` + `expo-crypto`; add secure-store plugin to app.json (note: requires dev-client rebuild).
- `keystore.ts`: native SecureStore keys `lmf.key.<providerId>`; web localStorage with documented plaintext caveat; native-unavailable → in-memory + notice (never SQLite).
- `profile.ts`: `lmf_profile` JSON in settings KV (non-secret fields only). **Migration** (idempotent, once): existing `openrouter_api_key` setting → KeyStore, delete row, profile tier 2/manual if none.
- Fix `src/lib/db/backup.ts`: export filters settings through a `SECRET_SETTING_KEYS` denylist; restore also strips secret keys (old/crafted backups must not reintroduce keys).
- Tests: keystore (mock SecureStore + localStorage), migration idempotency, backup exclusion both directions.
- Verify: typecheck; jest; manual — set key, export backup, confirm no secrets in JSON.

### Phase 4 — Provider settings UI

- `src/components/ProviderSettings.tsx`, mounted as "AI Provider" section in SettingsSheet (bodymap.tsx ~1479–1670; reuse `SettingsDropdownId` dropdown pattern): tier status line; **Connect OpenRouter** CTA; provider picker (registry-driven) → key entry → Validate (auth-vs-network distinction) → model picker (curated → fetched → free-text) → custom baseURL field (https enforced except localhost/LAN for Ollama); `fallbackToFree` toggle (privacy copy per A6); Disconnect (delete key, revert tier 0).
- `src/store/useAppStore.ts`: add `llmTier`, `llmStatus: 'ok'|'degraded'|'exhausted'`, `lastLlmFailureKind` + setters; service telemetry writes these. Profile hydration is service-owned (leave `useSettingsPersistence.ts` untouched).
- Verify: typecheck; jest; manual — invalid key → auth error; valid key → validated, models load, chat + upload run on it; fallback off → provider-only failure.

### Phase 5 — OAuth PKCE

- `src/lib/llm/oauth.ts` (`connectOpenRouter()` per A9) + `src/app/oauth/openrouter.tsx`. Verifier persisted to settings KV `lmf_oauth_pending` pre-launch (short-lived, useless without the code), deleted on completion/cancel.
- Wire Connect button; success → tier 1 + default-model prompt.
- Tests: `oauth.ts` with mocked WebBrowser/Crypto/Linking — success/cancel/dismiss/error-param/exchange-403.
- Verify: manual on native dev build (deep link back), web (popup + `maybeCompleteAuthSession`), cancel leaves tier 0 intact.

### Phase 6 — Upgrade nudges

- `analyzing.tsx`: `degraded` → passive post-completion banner; `exhausted` with rate/quota kinds → error surface gains "Connect a provider" CTA → opens SettingsSheet at the provider section (store flag `openSettingsSection:'provider'`).
- Chat error (bodymap.tsx:1082) becomes kind-aware: rate/quota → message + inline "Connect your account" chip; network → current copy.
- First-chat-use one-time card above input (tier 0 + `lmf_first_chat_nudge_seen` unset); dismiss persists. Must not delay or replace the medical disclaimer.
- Dismissal memory: `lmf_first_chat_nudge_seen`, `lmf_nudge_dismissed_at` (7-day passive cooldown). All nudges non-blocking.
- Verify: mocked-429 trigger test; dismissal persists across restart.

### Phase 7 — `refresh.ts`: keep, simplify, wire in

- Delete the arena.ai scrape (`fetchArenaScores`) — burns free quota, fragile, injection-shaped input. Score from OpenRouter `/models?max_price=0` metadata only (`compositeScore` already handles the arena-missing branch).
- Wire `shouldRefresh` (30-day gate) into service init after DB ready: fire-and-forget `refreshModelChain`; failure leaves the chain untouched. Makes the free chain self-healing when free models get delisted.
- Update `tests/lib/llm-refresh.test.ts`.

### Phase 8 — Tests, docs, cleanup

- Coverage ≥80% on `src/lib/lmf`, `src/lib/llm`, `src/store`. Repo style: 2-space, single quotes, no semicolons, named exports, no `any`.
- Docs: CLAUDE.md pointer to lmfPlan.md; `.env.example` documents env key as tier-0-only; "porting LMF" note in `src/lib/lmf/index.ts`.
- Remove unused `openai` dependency (verify no transitive use).
- Hard-constraint audit: only redacted plain text reaches adapters; key header only sent to its own provider's baseURL (adapter test asserts); no key in logs; chat session-only; disclaimer ordering untouched; prompts keep "never recommend treatments".

## Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| SecureStore absent on web | keys in localStorage on web | documented; matches OpenRouter's browser-key model; never in backups |
| secure-store plugin needs dev-client rebuild | dev friction | basic get/set works in Expo Go; one rebuild for backup-exclusion plugin |
| Generic `maigenki` scheme interceptable on Android | OAuth code interception | PKCE: code useless without verifier; optionally uniquify scheme pre-release |
| OpenAI-compat divergences (token param, response_format, missing usage) | false invalid_request | per-spec `tokenParam`, one-shot degrade retries, optional usage |
| Anthropic browser CORS | web build fails on Anthropic | `anthropic-dangerous-direct-browser-access: true` header |
| Env-key precedence flip | dev workflow change | env still used when no user key; release note |
| Tier 0 still needs the shipped env key (`:free` requires auth) | shared rate-limit pool | exactly what the nudge ladder converts into BYOK |
| Custom baseURL is user-supplied | key sent to arbitrary URL | user typed both; https enforced except localhost/private-range; never suggest URLs from LLM output |
| Old backups already contain `openrouter_api_key` | historical leak | restore strips it; migration deletes it from live DB |
| Cooldown ledger in-memory | resets each launch | acceptable; 429s short-lived |

## Out of scope

- **Streaming** — no current UI consumes tokens incrementally; `ChatRequest.signal` + adapter seam leaves room for a later `streamWithFallback`.
- Anthropic/Google OAuth (no public PKCE key-issuance equivalents) — manual key only.
- Cost/usage display, multi-key-per-provider, request queuing, on-device encryption of web-stored keys.
