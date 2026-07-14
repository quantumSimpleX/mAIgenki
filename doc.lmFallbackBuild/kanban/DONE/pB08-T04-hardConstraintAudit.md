# pB08-T04 — hardConstraintAudit

**Part:** B, **Phase:** 8. **Implements:** CLAUDE.md Hard Constraints + lmfPlan.md security posture across all phases.

## Description
Final cross-cutting audit that no hard constraint was violated by the LMF work. Verify (with grep/read evidence in Issues Found / Test Results):
1. **On-device health data**: only extracted/redacted plain text is sent to any provider; raw PDFs never leave device; no health data written to remote storage.
2. **Key handling**: API keys never logged (grep for console.* near key vars); keys stored only in KeyStore (never SQLite settings); each provider key only ever sent to that provider's own baseURL (no cross-send); `redactSecrets` covers failure strings.
3. **Chat**: session-only (never persisted to SQLite); scoped to one condition (full record never injected); educational disclaimer appears before the first chat message every session and cannot be permanently dismissed.
4. **LLM output**: prompts never solicit treatment/medication recommendations; no clinical-accuracy claims introduced.
5. **Backup**: exported/restored settings exclude secret keys (denylist both directions).

For each, cite the file/line proving compliance, or file an Issue if violated (which triggers a dev fix loop).

## Dependencies
All pA (pA02–pA09) and pB02–pB07 DONE.

## Acceptance criteria
- Each of the 5 constraint areas verified with evidence; zero violations open.
- Any violation found is filed in Issues Found for remediation before DONE.

## Implementation Notes

Read-only audit — no code changes were required (see "Observation" below for one non-blocking finding). All five constraint areas re-verified against live source, not prior task reports.

**1. On-device health data — CLEAN**
- `src/lib/pipeline.ts:74-92`: PDF/image URI is read locally (`extractTextFromPDF`/`extractTextFromImage`), then `redactPII(text)` runs (line 87) *before* the only network call, `enrichFromText(safeText, ...)` (line 92). Raw file bytes/URI never appear in any adapter request — adapters (`src/lib/lmf/adapters/*.ts`) only ever receive `ChatMessage[]` built from `systemPrompt`/`userMessage` strings.
- `src/lib/db/queries.ts:109-122` `insertHealthRecord`: persists only `filename, file_hash, record_type, record_date, page_count, extraction_method, facility_id` — no raw PDF bytes and no extracted/redacted text column exists in `health_records`.
- `src/lib/pdf/extract.ts:48`: the only `fetch(uri)` in the PDF path reads the local file URI into bytes (standard Expo pattern for `file://`/`blob:` URIs) — not a network upload.
- `src/lib/privacy/redact.ts:1-40`: label/pattern-based redaction (patient name, DOB, MRN, phone, in EN/zh-TW/JA) runs unconditionally on all extracted text before it reaches the LLM.

**2. Key handling — CLEAN (see Observation for a related non-violation gap)**
- Grepped `console\.(log|warn|error|info|debug)` across `src/` (see full list) — none is adjacent to `apiKey`/key variables; the only `console.warn` in the LLM path (`src/lib/llm/client.ts:119`) logs `failures.join('; ')`, which is an array of `LMFFailure.message` strings already passed through `redactSecrets` (see next point) — never the raw key.
- `src/lib/lmf/engine.ts:60-76` `makeFailure()`: every `LMFFailure.message` is built via `redactSecrets(message, apiKey)` (line 74), called from both failure sites (line 210 "no key configured" and line 255/275 HTTP/validation failures). `src/lib/lmf/errors.ts:38-54`: `redactSecrets` strips `Bearer <token>`, `sk-or-*`, `sk-*`, `AIza*` patterns AND does an exact-string strip of the loaded key if passed (`out.split(loadedKey).join('[REDACTED]')`) — covers both known-pattern keys and arbitrary custom-provider keys.
- `src/lib/llm/keystore.ts:20-32,36-45`: `SecureStoreKeyStore` (native, expo-secure-store/Keychain/EncryptedSharedPreferences) and `LocalStorageKeyStore` (web) are the only persistent KeyStore impls; no code path writes a provider key to SQLite. `src/lib/llm/profile.ts:38-51` `migrateLegacyOpenRouterKey()` moves any pre-LMF plaintext `openrouter_api_key` SQLite row into the KeyStore and deletes the row (idempotent).
- No-cross-send confirmed per-adapter: `src/lib/lmf/adapters/openaiCompat.ts:24-26` only sets `Authorization` when `spec.authStyle === 'bearer'`, `anthropic.ts:24` only sets `x-api-key`, `gemini.ts:20` only sets `x-goog-api-key` — each built from `spec.baseURL` (openai-compat.ts:39, anthropic.ts:45, gemini.ts:44) belonging to that same candidate's own `ProviderSpec`, sourced from `keys.get(candidate.providerId)` (engine.ts:208) for that exact provider ID. No code path takes provider A's key and sends it to provider B's baseURL.

**3. Chat — CLEAN**
- Session-only: `useAppStore.ts` has no zustand `persist()` middleware wrapping the store (confirmed no `persist(` match in the file) and `chatMessages` (line 49) is plain in-memory array state, cleared via `clearChat()`/on sheet-close (lines 203, 215, 237, 259) — never written to SQLite or any storage.
- Scoping: `src/app/bodymap.tsx:1101-1109` builds the chat system prompt from only `cond.label`/`cond.medName` (the single selected condition) plus lightweight metadata for user-selected records (`type`, `label`, `date` only — `selectedRecords` never carries full extracted/redacted record text). The full health record (conditions/measurements DB rows) is never serialized into the prompt.
- Disclaimer: `DISCLAIMER` constant (line 163) is pushed as the first chat message via a `useEffect` gated on `disclaimerShown` (line 1035), a component-local `useRef` — resets every remount/session, not backed by any persisted "dismissed" flag, so it reappears every session and cannot be permanently dismissed. The separate `firstChatNudge` (lines 1059-1081, persisted via `lmf_first_chat_nudge_seen`) is an unrelated additive upgrade nudge that never gates or reorders the disclaimer (per its own comment, line 1059-1060).

**4. LLM output constraints — CLEAN**
- `src/lib/llm/enrich.ts:110` system prompt ends with explicit rule: "Never recommend treatments or medications." (also "Never invent data not present in the record," line 109 — guards against clinical-accuracy overclaims in extraction).
- `src/app/bodymap.tsx:1107-1108` chat system prompt: "Always recommend consulting a healthcare provider." followed by the `DISCLAIMER` string itself ("Educational only. Not medical advice. Never a substitute for professional clinical judgment.") appended to every chat system prompt, not just shown once in the transcript.

**5. Backup — CLEAN**
- `src/lib/db/backup.ts:35,40-46`: `SECRET_SETTING_KEYS = ['openrouter_api_key']` (exact) + `SECRET_SETTING_KEY_PREFIXES = ['lmf.key.']` (prefix, forward-looking). `stripSecretSettings()` (lines 51-57) is applied on **export** (`buildBackup`, line 65: `t === 'settings' ? stripSecretSettings(rows) : rows`) and again on **restore** (line 99: same filter applied to incoming backup rows before insert) — denylist enforced both directions per the acceptance criteria.

**Observation (not a hard-constraint violation — flagged for follow-up, not fixed here):**
`lmfTask.md` marks `pB02-T04` ("bodymap.tsx sendMessage() routes via lmfChat (uses profile/keystore chain)") and `pB02-T05` ("pipeline.ts/analyzing.tsx route from service... stop reading openrouter_api_key directly") DONE, but the live code doesn't match: `bodymap.tsx:1110-1111` still reads `getSetting(db, 'openrouter_api_key')` directly and calls `lmfChat(sys, userMsg, { apiKey, db })` with no `profile`/`keys` option; `pipeline.ts:91` does the same (`getSetting(db, 'openrouter_api_key')` → `enrichFromText`, which routes through `client.ts`'s `callLLMWithFallback`, whose `CallOptions<T>` type has no `profile`/`keys` fields at all). Because `service.ts`'s `lmfChat`/`lmfEnrich` default to `TIER_0_PROFILE` + `envKeyStore` whenever `opts.profile`/`opts.keys` are omitted (`service.ts:168,172,200,204`), and `buildRoute()` (`route.ts:15-17`) only routes to a BYOK provider when `profile.tier !== 0 && activeProviderId && model` are set, this means the profile/KeyStore machinery built in pB03-pB05 (real per-provider keys via `ProviderSettings.tsx`/OAuth) is never actually consulted by either call site — every chat/enrich call always uses the free OpenRouter chain, regardless of what the user configured. **This is not a hard-constraint violation**: no key is logged, no cross-provider send occurs, and no health data leak results — `envKeyStore.get()` simply returns `null` for any non-openrouter provider ID, so a configured BYOK key is just never read or transmitted. But it does mean BYOK is currently non-functional end-to-end, contradicting the DONE status of pB02-T04/T05. Wiring `loadProfile(db)`/`makeKeyStore()` into both call sites (and threading `profile`/`keys` through `client.ts`'s `CallOptions` for the enrich path) is a multi-file change with its own test implications, so it was left out of this audit's remediation (scoped to the 5 named constraint areas) and is called out here for a follow-up task instead.

No `npm run typecheck` run — no source files were modified by this audit.

## Test Plan

Independently re-verify each of the 5 constraint-area citations against live source (not the dev agent's report), plus independently verify the flagged BYOK-not-wired observation by tracing the actual call sites:

1. Re-read `pipeline.ts`, `redact.ts` — confirm redaction runs unconditionally before the only network call, and no health data is written anywhere but SQLite.
2. Re-read `errors.ts`, `engine.ts`, `keystore.ts`, plus a fresh repo-wide grep for `console.(log|warn|error|info|debug)` — confirm no key material reaches any log call, keys never touch SQLite, and `redactSecrets` covers both pattern-based and exact-string leakage.
3. Re-read `bodymap.tsx` chat init/disclaimer logic and `service.ts`'s `lmfChat` — confirm session-only scope (no full record injected) and non-dismissible disclaimer gating.
4. Re-read `enrich.ts` system prompt and `bodymap.tsx` chat system prompt — confirm no treatment/medication solicitation and no clinical-accuracy overclaim.
5. Re-read `backup.ts` — confirm the secret denylist is applied on both export and restore paths.
6. Trace `pipeline.ts` → `enrich.ts` → `client.ts` → `service.ts` and `bodymap.tsx`'s `sendMessage()` → `service.ts` to determine whether `profile`/`keys` are ever constructed and threaded into `lmfChat`/`lmfEnrich`, or whether both call sites silently default to the tier-0 free chain.

## Test Results

All 5 constraint-area verdicts independently confirmed CLEAN. Citations are accurate and support the claims:

1. **On-device health data — CLEAN.** `src/lib/pipeline.ts:87` (`redactPII(text)`) runs unconditionally before the only network call at line 92 (`enrichFromText`). Local file URIs are read, not uploaded. `src/lib/privacy/redact.ts:85-113` redacts name/DOB/MRN/phone/insurance/email/SSN/national-ID via label + pattern rules (EN/zh-TW/JA) before any text reaches the LLM. No remote persistence path found.
2. **Key handling — CLEAN.** Repo-wide grep for `console\.(log|warn|error|info|debug)` (12 hits) confirms none logs a key or unredacted failure string — the only LLM-path warns (`client.ts:119`, `analyzing.tsx:521`) log `failures.join('; ')`, and every `LMFFailure.message` is built via `redactSecrets(message, apiKey)` in `engine.ts` (called at the "no key configured" site line 210 and both HTTP/validation failure sites). `errors.ts:38-54` strips `Bearer <token>`, `sk-or-*`, `sk-*`, `AIza*` by pattern and does an exact-string strip of the loaded key regardless of pattern match. `keystore.ts` confirms `SecureStoreKeyStore`/`LocalStorageKeyStore`/`InMemoryKeyStore` are the only persistent/session KeyStore impls — no SQLite write path for provider keys exists anywhere in `src/`.
3. **Chat — CLEAN.** `bodymap.tsx:1091-1124` (`sendMessage`) builds the system prompt from only the selected condition's label/name and selected-record labels/dates — never the full health record. `bodymap.tsx:1052-1057`: disclaimer pushed via a component-local `useRef` (`disclaimerShown`, line 1035) gated only on `chatOpen && sheetOpen`, with no persisted "seen" flag — resets every remount, so it reappears every session and cannot be permanently dismissed, confirmed distinct from the separately-persisted `firstChatNudge` (lines 1059-1081, backed by `lmf_first_chat_nudge_seen`/`lmf_nudge_dismissed_at` settings) which the code comment (lines 1059-1061) explicitly notes is additive and never gates/reorders the disclaimer. Chat history lives only in Zustand store state (`chatMessages`), never written to SQLite.
4. **LLM output constraints — CLEAN.** `enrich.ts:109-110`: prompt ends "Never invent data not present in the record." / "Never recommend treatments or medications." `bodymap.tsx:1107-1108`: chat system prompt appends "Always recommend consulting a healthcare provider." plus the full `DISCLAIMER` string on every call (not just shown once in the transcript).
5. **Backup — CLEAN.** `backup.ts:35,40`: `SECRET_SETTING_KEYS = ['openrouter_api_key']` (exact) + `SECRET_SETTING_KEY_PREFIXES = ['lmf.key.']` (prefix). `stripSecretSettings()` is applied both in `buildBackup` (line 65, export) and `restoreBackup` (line 99, restore) — denylist enforced in both directions.

**BYOK-not-wired finding — CONFIRMED REAL**, and slightly worse than the dev agent's writeup suggests:
- `bodymap.tsx:1111`: `lmfChat(sys, userMsg, { apiKey, db: db ?? undefined })` — no `profile`/`keys` passed. `service.ts:168,172` shows `lmfChat`/`lmfEnrich` default to `TIER_0_PROFILE` and `envKeyStore()` (which only ever resolves the `openrouter` provider ID, `service.ts:127-138`) whenever `opts.profile`/`opts.keys` are omitted.
- `pipeline.ts:92` calls `enrichFromText(safeText, apiKey, models)`, which (`enrich.ts:119-129`) calls `callLLMWithFallback` in `client.ts`, which (`client.ts:94-105`) builds `serviceOpts = { apiKey, models, temperature, telemetry }` — again no `profile`/`keys` — before calling `lmfEnrich`. So neither the pipeline (extraction) nor the chat path ever constructs a profile/keys from the user's connected provider; both always resolve to the free OpenRouter chain regardless of what `ProviderSettings.tsx` has configured.
- Additional wrinkle found during independent tracing (not in the dev agent's notes): `bodymap.tsx:1110` reads the API key via `getSetting(db, 'openrouter_api_key')` — the **legacy** SQLite setting. But `profile.ts:42-61` (`migrateLegacyOpenRouterKey`) deletes that exact SQLite row once it migrates the key into the KeyStore. If that migration has run (it's meant to run once at startup per its own doc comment), `bodymap.tsx`'s chat path will read an empty string for `apiKey` even for the free-tier local/env fallback path, relying entirely on `resolveOpenRouterApiKey`'s env-var fallback inside `service.ts`/`client.ts`. This doesn't change the CLEAN verdict on any constraint (no key is logged or cross-sent either way), but it means the legacy-setting read at `bodymap.tsx:1110` is itself dead/stale code post-migration, compounding the same BYOK-wiring gap.

No violations found in the 5 named constraint areas. No `npm run typecheck` re-run needed since no source was modified during this audit (read-only verification).

## Issues Found

**None blocking this card's DONE status** — all 5 hard-constraint areas are independently verified CLEAN with accurate citations.

One non-blocking, out-of-scope defect confirmed and recommended for a new follow-up task (not a hard-constraint violation: no key is ever logged, cross-sent to the wrong provider, or leaked — the bug is purely functional):

- **Severity:** High (functional, not security) — the entire BYOK/connect-your-own-provider feature (`ProviderSettings.tsx`, OAuth/manual key flows from pB03-pB05) is dead on arrival end-to-end.
- **Impact:** Any user who connects a paid/personal provider key or OAuth account never actually gets it used for either chat or enrichment — every call silently continues on the free OpenRouter tier-0 chain. This directly contradicts the DONE status recorded for `pB02-T04`/`pB02-T05` in `lmfTask.md`.
- **Likelihood:** 100% reproducible — it's a structural wiring gap, not a conditional bug. Every chat/enrich call hits it.
- **Repro / Evidence:** `bodymap.tsx:1111` (`lmfChat(sys, userMsg, { apiKey, db })`, no `profile`/`keys`); `pipeline.ts:92` → `enrich.ts:119` → `client.ts:94-105` (`serviceOpts` never includes `profile`/`keys`) → `lmfEnrich`. Both land on `service.ts`'s defaults: `TIER_0_PROFILE` (line 168/200) and `envKeyStore()` (line 172/204), which only resolves the `openrouter` provider.
- **Recommendation:** File a new follow-up kanban task to thread `loadProfile(db)` (`profile.ts:23`) and `makeKeyStore()` (`keystore.ts:81`) into both `bodymap.tsx`'s `sendMessage()` and `pipeline.ts`'s enrichment call, passing them through `CallOptions`/`serviceOpts` in `client.ts` so `lmfChat`/`lmfEnrich` receive the user's actual profile/keys instead of silently defaulting. Recommend re-opening or superseding `pB02-T04`/`pB02-T05`'s DONE status with this follow-up, since their acceptance criteria implied working end-to-end BYOK. Out of scope for this card (`pB08-T04`'s acceptance criteria is the 5 named constraint areas only) — does not block this card's DONE.

## Verdict

**READY FOR DONE.** All 5 hard-constraint areas are independently re-verified clean with accurate file:line evidence; zero constraint violations found. The BYOK-not-wired bug is real but is explicitly out of this card's scope (a functional gap, not a hard-constraint violation) and should be tracked as a new follow-up task rather than blocking this card's closure.
