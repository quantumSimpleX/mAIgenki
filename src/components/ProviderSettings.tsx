// src/components/ProviderSettings.tsx
// "AI Provider" settings section (pB04-T02). Standalone so bodymap.tsx doesn't
// grow further — mounting it into the settings sheet is a separate card
// (pB04-T03). Styled to match bodymap.tsx's SettingsSheet (same dark palette,
// BarlowCondensed section labels, surfaceHigh fields).
//
// Hard constraints (see CLAUDE.md): the provider key is never logged, never
// written to SQLite, and only ever sent to the selected provider's own
// baseURL — enforced here by only ever using validateKey/listModels (which
// take the ProviderSpec's baseURL) and KeyStore, never a bespoke fetch.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native'
import { fs, sc } from '@/lib/scale'
import { useAppStore } from '@/store/useAppStore'
import { useOptionalDatabase } from '@/lib/db/provider'
import { loadProfile, saveProfile } from '@/lib/llm/profile'
import { makeKeyStore } from '@/lib/llm/keystore'
import { connectOpenRouter } from '@/lib/llm/oauth'
import {
  filterModels, isAllowedBaseURL, resolveSelectedModel,
  validationMessage, validationStateFromResult,
  type KeyValidationState,
} from '@/lib/llm/providerSettingsLogic'
import {
  BUILT_IN_PROVIDERS, CURATED_MODELS, listModels, validateKey,
} from '@/lib/lmf'
import type { KeyStore, LMFProfile, ProviderSpec } from '@/lib/lmf'

const C = {
  surfaceHigh: '#1A2333',
  ink: '#FAFAF7',
  inkMuted: '#5A6573',
  border: 'rgba(255,255,255,0.12)',
  purple: '#7042D6',
  purpleLight: '#8A60EB',
  purpleTint: 'rgba(112, 66, 214, 0.15)',
  aqua: '#1FC3A4',
  warn: '#E5A24B',
  bad: '#E05252',
}

const PROVIDER_LIST = Object.values(BUILT_IN_PROVIDERS)

function effectiveSpec(spec: ProviderSpec, customBaseURL: string): ProviderSpec {
  return spec.id === 'custom' && customBaseURL ? { ...spec, baseURL: customBaseURL } : spec
}

export function ProviderSettings() {
  const llmTier = useAppStore((s) => s.llmTier)
  const llmStatus = useAppStore((s) => s.llmStatus)
  const setLlmTier = useAppStore((s) => s.setLlmTier)
  const db = useOptionalDatabase()

  const [keyStore, setKeyStore] = useState<KeyStore | null>(null)
  const [profile, setProfile] = useState<LMFProfile | null>(null)

  const [providerId, setProviderId] = useState<string>('openrouter')
  const [keyInput, setKeyInput] = useState('')
  const [validation, setValidation] = useState<KeyValidationState>({ status: 'idle' })

  const [pickedModel, setPickedModel] = useState<string | null>(null)
  const [freeTextModel, setFreeTextModel] = useState('')
  const [allModelsOpen, setAllModelsOpen] = useState(false)
  const [allModels, setAllModels] = useState<string[]>([])
  const [allModelsLoading, setAllModelsLoading] = useState(false)
  const [modelQuery, setModelQuery] = useState('')

  const [customBaseURLInput, setCustomBaseURLInput] = useState('')
  const [fallbackToFree, setFallbackToFree] = useState(true)

  const [saveStatus, setSaveStatus] = useState<string | null>(null)

  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)

  useEffect(() => {
    makeKeyStore().then(setKeyStore)
  }, [])

  // Shared by the mount-time profile load and a successful connect, so the
  // status line's `llmTier` (read from the store, not local state) is kept in
  // sync with whatever's actually persisted — nothing else in the app syncs
  // that store field from the profile.
  const applyProfile = useCallback((p: LMFProfile) => {
    setProfile(p)
    if (p.activeProviderId) setProviderId(p.activeProviderId)
    setPickedModel(p.model)
    setCustomBaseURLInput(p.customBaseURL ?? '')
    setFallbackToFree(p.fallbackToFree)
    setLlmTier(p.tier)
  }, [setLlmTier])

  useEffect(() => {
    if (!db) return
    loadProfile(db).then(applyProfile)
  }, [db, applyProfile])

  const spec = BUILT_IN_PROVIDERS[providerId] ?? BUILT_IN_PROVIDERS.custom
  const isCustom = providerId === 'custom'
  const curated = CURATED_MODELS[providerId] ?? []
  const baseURLValid = !isCustom || customBaseURLInput.length === 0 || isAllowedBaseURL(customBaseURLInput)
  const visibleModels = useMemo(() => filterModels(allModels, modelQuery), [allModels, modelQuery])
  const vMessage = validationMessage(validation)

  function selectProvider(id: string) {
    setProviderId(id)
    setKeyInput('')
    setValidation({ status: 'idle' })
    setPickedModel(null)
    setFreeTextModel('')
    setAllModels([])
    setAllModelsOpen(false)
    setModelQuery('')
  }

  async function handleValidate() {
    if (isCustom && !baseURLValid) {
      setValidation({ status: 'invalid', kind: 'validation' })
      return
    }
    setValidation({ status: 'validating' })
    const activeSpec = effectiveSpec(spec, customBaseURLInput)
    const model = resolveSelectedModel(pickedModel, freeTextModel) ?? undefined
    const result = await validateKey(activeSpec, keyInput, { model })
    setValidation(validationStateFromResult(result))
  }

  async function handleLoadAllModels() {
    setAllModelsOpen(true)
    if (allModels.length > 0) return
    setAllModelsLoading(true)
    const activeSpec = effectiveSpec(spec, customBaseURLInput)
    const models = await listModels(activeSpec, keyInput || null)
    setAllModels(models)
    setAllModelsLoading(false)
  }

  async function handleSave() {
    if (!db || !keyStore) return
    if (isCustom && customBaseURLInput && !isAllowedBaseURL(customBaseURLInput)) {
      setSaveStatus('Custom base URL must use https:// (http:// only allowed for localhost/LAN).')
      return
    }
    const model = resolveSelectedModel(pickedModel, freeTextModel)
    const next: LMFProfile = {
      tier: isCustom ? 3 : 2,
      activeProviderId: providerId,
      model,
      customBaseURL: isCustom ? (customBaseURLInput || null) : null,
      fallbackToFree,
      keySource: 'manual',
    }
    if (keyInput) await keyStore.set(providerId, keyInput)
    await saveProfile(db, next)
    setProfile(next)
    setSaveStatus('Saved.')
  }

  async function handleConnect() {
    if (!db) return
    setConnectError(null)
    setConnecting(true)
    const result = await connectOpenRouter(db)
    setConnecting(false)
    if (result.status === 'success') {
      const p = await loadProfile(db)
      applyProfile(p)
      setSaveStatus(p.model ? 'Connected via OpenRouter.' : 'Connected via OpenRouter — pick a model below.')
    } else if (result.status === 'cancelled') {
      // User backed out of the browser sheet — tier 0 stays untouched, no error to show.
    } else {
      setConnectError(result.message)
    }
  }

  async function handleDisconnect() {
    if (!db || !keyStore) return
    const target = profile?.activeProviderId ?? providerId
    await keyStore.delete(target)
    const next: LMFProfile = {
      tier: 0,
      activeProviderId: null,
      model: null,
      customBaseURL: null,
      fallbackToFree,
      keySource: null,
    }
    await saveProfile(db, next)
    setProfile(next)
    setKeyInput('')
    setValidation({ status: 'idle' })
    setSaveStatus('Disconnected.')
  }

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.content}>
      <Text style={styles.sectionLabel}>AI Provider</Text>

      <View style={styles.tierRow}>
        <Text style={styles.tierText}>
          Tier {llmTier} · {llmStatus}
        </Text>
      </View>

      <TouchableOpacity style={styles.connectBtn} onPress={handleConnect} disabled={!db || connecting}>
        {connecting ? (
          <ActivityIndicator size="small" color={C.ink} />
        ) : (
          <Text style={styles.connectBtnText}>Connect OpenRouter</Text>
        )}
      </TouchableOpacity>
      {connectError && <Text style={styles.errorText}>{connectError}</Text>}

      <Text style={styles.label}>Provider</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.providerRow}>
        {PROVIDER_LIST.map((p) => (
          <TouchableOpacity
            key={p.id}
            style={[styles.providerChip, providerId === p.id && styles.providerChipActive]}
            onPress={() => selectProvider(p.id)}
          >
            <Text style={[styles.providerChipText, providerId === p.id && styles.providerChipTextActive]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {isCustom && (
        <>
          <Text style={styles.label}>Custom base URL</Text>
          <TextInput
            style={[styles.input, !baseURLValid && styles.inputError]}
            value={customBaseURLInput}
            onChangeText={setCustomBaseURLInput}
            placeholder="https://your-endpoint.example.com/v1"
            placeholderTextColor={C.inkMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {!baseURLValid && (
            <Text style={styles.errorText}>
              Must use https:// (http:// only allowed for localhost/LAN, e.g. Ollama).
            </Text>
          )}
        </>
      )}

      {spec.authStyle !== 'none' && (
        <>
          <Text style={styles.label}>API key</Text>
          <View style={styles.keyRow}>
            <TextInput
              style={[styles.input, styles.keyInput]}
              value={keyInput}
              onChangeText={(v) => { setKeyInput(v); setValidation({ status: 'idle' }) }}
              placeholder={spec.keyURL ? `Get a key at ${spec.keyURL}` : 'API key'}
              placeholderTextColor={C.inkMuted}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={styles.validateBtn}
              onPress={handleValidate}
              disabled={!keyInput || validation.status === 'validating'}
            >
              {validation.status === 'validating' ? (
                <ActivityIndicator size="small" color={C.ink} />
              ) : (
                <Text style={styles.validateBtnText}>Validate</Text>
              )}
            </TouchableOpacity>
          </View>
          {vMessage && (
            <Text style={[
              styles.validationText,
              validation.status === 'valid' && styles.validationTextOk,
              validation.status === 'invalid' && styles.validationTextBad,
            ]}
            >
              {vMessage}
            </Text>
          )}
        </>
      )}

      <Text style={styles.label}>Model</Text>
      <View style={styles.modelChipRow}>
        {curated.map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.providerChip, pickedModel === m && !freeTextModel && styles.providerChipActive]}
            onPress={() => { setPickedModel(m); setFreeTextModel('') }}
          >
            <Text style={[styles.providerChipText, pickedModel === m && !freeTextModel && styles.providerChipTextActive]}>
              {m}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.allModelsToggle} onPress={handleLoadAllModels}>
        <Text style={styles.allModelsToggleText}>{allModelsOpen ? '▲ All models' : '▼ All models'}</Text>
      </TouchableOpacity>
      {allModelsOpen && (
        <View style={styles.allModelsBox}>
          {allModelsLoading ? (
            <ActivityIndicator size="small" color={C.ink} style={{ marginVertical: sc(8) }} />
          ) : (
            <>
              <TextInput
                style={styles.input}
                value={modelQuery}
                onChangeText={setModelQuery}
                placeholder="Search models…"
                placeholderTextColor={C.inkMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <ScrollView style={{ maxHeight: sc(160) }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                {visibleModels.map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={styles.allModelsItem}
                    onPress={() => { setPickedModel(m); setFreeTextModel(''); setAllModelsOpen(false) }}
                  >
                    <Text style={[styles.allModelsItemText, pickedModel === m && styles.validationTextOk]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}
        </View>
      )}

      <Text style={styles.label}>Model ID (free-text, required for custom endpoints)</Text>
      <TextInput
        style={styles.input}
        value={freeTextModel}
        onChangeText={setFreeTextModel}
        placeholder="e.g. llama3.3"
        placeholderTextColor={C.inkMuted}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <View style={styles.fallbackRow}>
        <Text style={styles.fallbackText}>
          If your provider fails, retry on free models via OpenRouter. Turn off to keep requests only on chosen provider.
        </Text>
        <Switch
          value={fallbackToFree}
          onValueChange={setFallbackToFree}
          trackColor={{ false: C.border, true: C.purpleTint }}
          thumbColor={fallbackToFree ? C.purpleLight : C.inkMuted}
        />
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={!db}>
          <Text style={styles.saveBtnText}>Save</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnect} disabled={!db}>
          <Text style={styles.disconnectBtnText}>Disconnect</Text>
        </TouchableOpacity>
      </View>
      {saveStatus && <Text style={styles.saveStatusText}>{saveStatus}</Text>}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  // flex: 1 lets this ScrollView actually scroll/clip when its parent (the
  // SettingsSheet's collapsible box, bodymap.tsx pB04-T03) constrains height
  // via maxHeight — without it, ScrollView just sizes to content and ignores
  // the parent bound.
  wrap: { width: '100%', flex: 1 },
  content: { paddingBottom: sc(24) },
  sectionLabel: {
    fontFamily: 'BarlowCondensed-SemiBold', fontSize: fs(10), color: C.aqua,
    textTransform: 'uppercase', letterSpacing: sc(1), marginBottom: sc(10),
  },
  tierRow: { marginBottom: sc(10) },
  tierText: { fontFamily: 'SourceCodePro', fontSize: fs(13), color: C.ink, textTransform: 'capitalize' },
  connectBtn: {
    height: sc(40), borderRadius: sc(8), backgroundColor: C.purple,
    alignItems: 'center', justifyContent: 'center', marginBottom: sc(16),
  },
  connectBtnText: {
    fontFamily: 'BarlowCondensed-SemiBold', fontSize: fs(13), color: C.ink,
    textTransform: 'uppercase', letterSpacing: sc(0.5),
  },
  label: {
    fontFamily: 'BarlowCondensed-SemiBold', fontSize: fs(11), color: C.inkMuted,
    textTransform: 'uppercase', letterSpacing: sc(0.5), marginBottom: sc(6), marginTop: sc(12),
  },
  providerRow: { marginBottom: sc(4) },
  providerChip: {
    borderWidth: 1, borderColor: C.border, borderRadius: sc(8),
    paddingVertical: sc(6), paddingHorizontal: sc(10), marginRight: sc(6),
    backgroundColor: C.surfaceHigh,
  },
  providerChipActive: { backgroundColor: C.purpleTint, borderColor: C.purpleLight },
  providerChipText: { fontFamily: 'SourceCodePro', fontSize: fs(12), color: C.ink },
  providerChipTextActive: { color: C.purpleLight },
  input: {
    height: sc(40), borderWidth: 1, borderColor: C.border, borderRadius: sc(8),
    paddingHorizontal: sc(10), backgroundColor: C.surfaceHigh, color: C.ink,
    fontFamily: 'SourceCodePro', fontSize: fs(13),
  },
  inputError: { borderColor: C.bad },
  errorText: { fontFamily: 'BarlowCondensed-Regular', fontSize: fs(11), color: C.bad, marginTop: sc(4) },
  keyRow: { flexDirection: 'row', gap: sc(8) },
  keyInput: { flex: 1 },
  validateBtn: {
    paddingHorizontal: sc(14), borderRadius: sc(8), backgroundColor: C.surfaceHigh,
    borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center',
  },
  validateBtnText: { fontFamily: 'BarlowCondensed-SemiBold', fontSize: fs(12), color: C.ink, textTransform: 'uppercase' },
  validationText: { fontFamily: 'BarlowCondensed-Regular', fontSize: fs(11), color: C.inkMuted, marginTop: sc(6) },
  validationTextOk: { color: C.aqua },
  validationTextBad: { color: C.warn },
  modelChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: sc(6) },
  allModelsToggle: { marginTop: sc(10) },
  allModelsToggleText: { fontFamily: 'BarlowCondensed-SemiBold', fontSize: fs(12), color: C.aqua, textTransform: 'uppercase' },
  allModelsBox: {
    marginTop: sc(8), padding: sc(8), borderRadius: sc(8),
    backgroundColor: C.surfaceHigh, borderWidth: 1, borderColor: C.border,
  },
  allModelsItem: { paddingVertical: sc(8), paddingHorizontal: sc(6) },
  allModelsItemText: { fontFamily: 'SourceCodePro', fontSize: fs(12), color: C.ink },
  fallbackRow: { flexDirection: 'row', alignItems: 'center', gap: sc(12), marginTop: sc(18) },
  fallbackText: { flex: 1, fontFamily: 'BarlowCondensed-Regular', fontSize: fs(11), color: C.inkMuted },
  actionsRow: { flexDirection: 'row', gap: sc(10), marginTop: sc(18) },
  saveBtn: {
    flex: 1, height: sc(40), borderRadius: sc(8), backgroundColor: C.purple,
    alignItems: 'center', justifyContent: 'center',
  },
  saveBtnText: { fontFamily: 'BarlowCondensed-SemiBold', fontSize: fs(13), color: C.ink, textTransform: 'uppercase', letterSpacing: sc(0.5) },
  disconnectBtn: {
    flex: 1, height: sc(40), borderRadius: sc(8), backgroundColor: C.surfaceHigh,
    borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center',
  },
  disconnectBtnText: { fontFamily: 'BarlowCondensed-SemiBold', fontSize: fs(13), color: C.ink, textTransform: 'uppercase', letterSpacing: sc(0.5) },
  saveStatusText: { fontFamily: 'BarlowCondensed-Regular', fontSize: fs(11), color: C.aqua, marginTop: sc(8) },
})
