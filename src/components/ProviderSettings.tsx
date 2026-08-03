// src/components/ProviderSettings.tsx
// "AI Provider" settings section. Styled to match bodymap.tsx's SettingsSheet
// (same dark palette, BarlowCondensed section labels, surfaceHigh fields).
//
// Hard constraints (see CLAUDE.md): the provider key is never logged, never
// written to the app database, and only ever sent to the selected provider's
// own baseURL — enforced here by only ever using validateKey/listModels
// (which take the ProviderSpec's baseURL) and KeyStore, never a bespoke fetch.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator, Platform, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native'
import { fs, sc } from '@/lib/scale'
import { SETTINGS_CONTROL_GAP } from '@/lib/settingsLayout'
import { useAppStore } from '@/store/useAppStore'
import { useOptionalIndexedDb } from '@/lib/db/indexedDbProvider'
import { loadProfile, saveProfile } from '@/lib/llm/profile'
import { makeKeyStore } from '@/lib/llm/keystore'
import { connectOpenRouter } from '@/lib/llm/oauth'
import { SettingsDropdown, type SettingsDropdownId } from '@/components/SettingsDropdown'
import {
  filterModels, isAllowedBaseURL, resolveSelectedModel,
  validationMessage, validationStateFromResult,
  type KeyValidationState,
} from '@/lib/llm/providerSettingsLogic'
import {
  BUILT_IN_PROVIDERS, listModels, validateKey,
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
const IS_WEB = Platform.OS === 'web'

function effectiveSpec(spec: ProviderSpec, customBaseURL: string): ProviderSpec {
  return spec.id === 'custom' && customBaseURL ? { ...spec, baseURL: customBaseURL } : spec
}

export function ProviderSettings({
  openDropdown = null,
  setOpenDropdown = () => {},
  onDirtyChange = () => {},
}: {
  openDropdown?: SettingsDropdownId
  setOpenDropdown?: (id: SettingsDropdownId) => void
  onDirtyChange?: (dirty: boolean) => void
} = {}) {
  const llmTier = useAppStore((s) => s.llmTier)
  const llmStatus = useAppStore((s) => s.llmStatus)
  const setLlmTier = useAppStore((s) => s.setLlmTier)
  const db = useOptionalIndexedDb()

  const [keyStore, setKeyStore] = useState<KeyStore | null>(null)
  const [profile, setProfile] = useState<LMFProfile | null>(null)

  const [providerId, setProviderId] = useState<string>('openrouter')
  const [keyInput, setKeyInput] = useState('')
  const [validation, setValidation] = useState<KeyValidationState>({ status: 'idle' })

  const [pickedModel, setPickedModel] = useState<string | null>(null)
  const [freeTextModel, setFreeTextModel] = useState('')
  const [allModelsOpen, setAllModelsOpen] = useState(false)
  const [allModels, setAllModels] = useState<string[]>([])
  const [, setAllModelsLoading] = useState(false)
  const [modelQuery, setModelQuery] = useState('')
  const modelSearchRef = useRef<TextInput>(null)

  const [customBaseURLInput, setCustomBaseURLInput] = useState('')
  const [fallbackToFree, setFallbackToFree] = useState(true)

  const [saveStatus, setSaveStatus] = useState<string | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)

  useEffect(() => {
    makeKeyStore().then(setKeyStore)
  }, [])

  useEffect(() => {
    if (!keyStore || !profile?.activeProviderId) return
    keyStore.get(profile.activeProviderId).then((storedKey) => {
      setKeyInput(storedKey ?? '')
    })
  }, [keyStore, profile?.activeProviderId])

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

  useEffect(() => {
    onDirtyChange(hasUnsavedChanges)
  }, [hasUnsavedChanges, onDirtyChange])

  const spec = BUILT_IN_PROVIDERS[providerId] ?? BUILT_IN_PROVIDERS.custom
  const isCustom = providerId === 'custom'
  const baseURLValid = !isCustom || customBaseURLInput.length === 0 || isAllowedBaseURL(customBaseURLInput)
  const visibleModels = useMemo(() => filterModels(providerId === 'openrouter' ? allModels.filter((model) => model.endsWith(':free')) : allModels, modelQuery), [allModels, modelQuery, providerId])
  const vMessage = validationMessage(validation)
  // OpenRouter also supports its OAuth connection flow, which does not need
  // an API key before the Connect control can be shown.
  const credentialsReady = providerId === 'openrouter'
    || spec.authStyle === 'none'
    || keyInput.trim().length > 0
  const connected = validation.status === 'valid'
    || (profile?.activeProviderId === providerId && profile.tier > 0)

  useEffect(() => {
    if (openDropdown !== 'model') return
    const timer = setTimeout(() => modelSearchRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [openDropdown])

  function selectProvider(id: string) {
    setHasUnsavedChanges(true)
    setProviderId(id)
    setKeyInput('')
    setValidation({ status: 'idle' })
    setPickedModel(null)
    setFreeTextModel('')
    setAllModels([])
    setAllModelsOpen(false)
    setModelQuery('')
    setOpenDropdown(null)
  }

  function selectModel(model: string) {
    setHasUnsavedChanges(true)
    setPickedModel(model)
    setFreeTextModel('')
    setOpenDropdown(null)
  }

  const handleValidate = useCallback(async () => {
    if (isCustom && !baseURLValid) {
      setValidation({ status: 'invalid', kind: 'validation' })
      return
    }
    setValidation({ status: 'validating' })
    const activeSpec = effectiveSpec(spec, customBaseURLInput)
    const model = resolveSelectedModel(pickedModel, freeTextModel) ?? undefined
    const result = await validateKey(activeSpec, keyInput, { model })
    setValidation(validationStateFromResult(result))
    if (result.ok) {
      setFallbackToFree(false)
      setHasUnsavedChanges(true)
    }
  }, [isCustom, baseURLValid, spec, customBaseURLInput, pickedModel, freeTextModel, keyInput])

  // Validate after the user pauses typing instead of requiring a separate
  // action. The debounce avoids sending a request for every keypress.
  useEffect(() => {
    if (spec.authStyle === 'none' || !keyInput) {
      // Resets validation for either a provider switch (spec) or the key
      // field being cleared (keyInput) — two independently-changing inputs,
      // not reducible to a single derived value without duplicating this
      // same branch at both call sites.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValidation({ status: 'idle' })
      return
    }
    const timer = setTimeout(() => { void handleValidate() }, 700)
    return () => clearTimeout(timer)
  }, [keyInput, providerId, customBaseURLInput, pickedModel, freeTextModel, handleValidate, spec.authStyle])

  async function handleLoadAllModels() {
    setAllModelsOpen(true)
    if (allModels.length > 0) return
    setAllModelsLoading(true)
    const activeSpec = effectiveSpec(spec, customBaseURLInput)
    const models = await listModels(activeSpec, keyInput || null)
    setAllModels(providerId === 'openrouter' ? models.filter((model) => model.endsWith(':free')) : models)
    setAllModelsLoading(false)
  }

  async function handleSave() {
    if (!db || !keyStore) return
    if (isCustom && customBaseURLInput && !isAllowedBaseURL(customBaseURLInput)) {
      setSaveStatus('Custom base URL must use https:// (http:// only allowed for localhost/LAN).')
      return
    }
    const model = resolveSelectedModel(pickedModel, freeTextModel)
    if (providerId === 'openrouter' && (!model || !model.endsWith(':free'))) {
      setSaveStatus('Choose a free OpenRouter model.')
      return
    }
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
    setHasUnsavedChanges(false)
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
    setHasUnsavedChanges(false)
    setSaveStatus('Disconnected.')
  }

  const selectedModel = resolveSelectedModel(pickedModel, freeTextModel)

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionLabel}>AI Provider</Text>

      <View style={styles.tierRow}>
        <Text style={styles.tierText}>
          Tier {llmTier} · {llmStatus}
        </Text>
      </View>

      <View style={[styles.providerModelRow, openDropdown === 'provider' && styles.providerModelRowOpen]}>
        <View style={styles.providerModelCol}>
          <Text style={styles.label}>Provider</Text>
          <SettingsDropdown
            open={openDropdown === 'provider'}
            onToggle={() => setOpenDropdown(openDropdown === 'provider' ? null : 'provider')}
            onSelect={(provider) => selectProvider(provider.id)}
            options={PROVIDER_LIST}
            optionKey={(provider) => provider.id}
            optionLabel={(provider) => provider.label}
            value={<Text style={styles.dropdownValue} numberOfLines={1}>{spec.label}</Text>}
            isActive={(provider) => provider.id === providerId}
          />
        </View>

        <View style={styles.providerModelCol}>
          <Text style={styles.label}>API key</Text>
          <TextInput
            style={[styles.input, spec.authStyle === 'none' && styles.disabledInput]}
            value={keyInput}
            onChangeText={(v) => {
              setKeyInput(v)
              setValidation({ status: 'idle' })
              setHasUnsavedChanges(true)
            }}
            placeholder={spec.authStyle === 'none'
              ? 'Not required'
              : (spec.keyURL ? `Get a key at ${spec.keyURL}` : 'API key')}
            placeholderTextColor={C.inkMuted}
            secureTextEntry={spec.authStyle !== 'none'}
            editable={spec.authStyle !== 'none'}
            autoCapitalize="none"
            autoCorrect={false}
          />
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
        </View>
      </View>

      {isCustom && (
        <>
          <Text style={styles.label}>Custom base URL</Text>
          <TextInput
            style={[styles.input, !baseURLValid && styles.inputError]}
            value={customBaseURLInput}
            onChangeText={(v) => { setCustomBaseURLInput(v); setHasUnsavedChanges(true) }}
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

      {credentialsReady && <View style={[styles.modelConnectRow, openDropdown === 'model' && styles.modelConnectRowOpen]}>
        <View style={[styles.modelIdCol, providerId !== 'openrouter' && styles.modelIdColFull]}>
          <Text style={styles.label}>Model ID</Text>
          {isCustom ? (
            <TextInput
              style={styles.input}
              value={freeTextModel}
              onChangeText={(v) => { setFreeTextModel(v); setHasUnsavedChanges(true) }}
              placeholder="Enter model ID"
              placeholderTextColor={C.inkMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
          ) : (
            <SettingsDropdown
              open={openDropdown === 'model'}
              onToggle={() => {
                const opening = openDropdown !== 'model'
                setOpenDropdown(opening ? 'model' : null)
                if (opening) {
                  setModelQuery('')
                  if (!allModelsOpen) void handleLoadAllModels()
                }
              }}
              onSelect={selectModel}
              options={visibleModels}
              optionKey={(model) => model}
              optionLabel={(model) => model}
              value={<Text style={styles.dropdownValue} numberOfLines={1}>{selectedModel ?? 'Select model'}</Text>}
              isActive={(model) => model === pickedModel && !freeTextModel}
              openField={(
                <TextInput
                  ref={modelSearchRef}
                  style={styles.modelSearchFieldInput}
                  value={modelQuery}
                  onChangeText={setModelQuery}
                  placeholder="Search models"
                  placeholderTextColor={C.inkMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              )}
            />
          )}
        </View>
        {providerId === 'openrouter' && (
          <View style={styles.connectCol}>
            <Text style={styles.label}>{spec.label}</Text>
            <TouchableOpacity style={styles.connectBtn} onPress={handleConnect} disabled={!db || connecting}>
              {connecting ? (
                <ActivityIndicator size="small" color={C.ink} />
              ) : (
                <Text style={styles.connectBtnText}>Connect</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>}
      {connectError && <Text style={styles.errorText}>{connectError}</Text>}

      {connected && <View style={styles.fallbackRow}>
        <Text style={styles.fallbackText}>
          If your provider fails, retry on free models via OpenRouter. Turn off to keep requests only on chosen provider.
        </Text>
        <Switch
          value={fallbackToFree}
          onValueChange={(value) => { setFallbackToFree(value); setHasUnsavedChanges(true) }}
          trackColor={{ false: C.border, true: C.purpleTint }}
          thumbColor={fallbackToFree ? C.purpleLight : C.inkMuted}
        />
      </View>}

      {connected && <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={!db}>
          <Text style={styles.saveBtnText}>Save</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnect} disabled={!db}>
          <Text style={styles.disconnectBtnText}>Disconnect</Text>
        </TouchableOpacity>
      </View>}
      {saveStatus && <Text style={styles.saveStatusText}>{saveStatus}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  sectionLabel: {
    fontFamily: 'BarlowCondensed-SemiBold', fontSize: fs(10), color: C.aqua,
    textTransform: 'uppercase', letterSpacing: sc(1), marginBottom: sc(10),
  },
  tierRow: { marginBottom: sc(10) },
  tierText: { fontFamily: 'SourceCodePro', fontSize: fs(13), color: C.ink, textTransform: 'capitalize' },
  connectBtn: {
    height: sc(40), borderRadius: sc(8), backgroundColor: C.purple,
    alignItems: 'center', justifyContent: 'center',
  },
  connectBtnText: {
    fontFamily: 'BarlowCondensed-SemiBold', fontSize: fs(13), color: C.ink,
    textTransform: 'uppercase', letterSpacing: sc(0.5),
  },
  label: {
    fontFamily: 'BarlowCondensed-SemiBold', fontSize: fs(11), color: C.inkMuted,
    textTransform: 'uppercase', letterSpacing: sc(0.5), marginBottom: sc(6), marginTop: sc(12),
  },
  providerModelRow: { flexDirection: 'row', gap: sc(SETTINGS_CONTROL_GAP), zIndex: 200 },
  providerModelRowOpen: { zIndex: 10000, elevation: 10000 },
  providerModelCol: { flex: 1, minWidth: 0, zIndex: 200 },
  dropdownWrap: { position: 'relative', zIndex: 30 },
  dropdownWrapOpen: { zIndex: 120 },
  dropdownField: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: sc(6),
    height: sc(40), borderWidth: 1, borderColor: C.border, borderRadius: sc(8),
    paddingHorizontal: sc(10), backgroundColor: C.surfaceHigh,
  },
  dropdownValue: { flex: 1, fontFamily: 'SourceCodePro', fontSize: fs(11), color: C.ink },
  dropdownChevron: { fontSize: fs(9), color: C.aqua },
  dropdownList: {
    position: 'absolute', top: sc(46), left: 0, right: 0,
    backgroundColor: C.surfaceHigh, borderWidth: 1, borderColor: C.border,
    borderRadius: sc(8), overflow: 'hidden', zIndex: 130,
    ...(IS_WEB ? { boxShadow: `0 ${sc(6)}px ${sc(16)}px rgba(0,0,0,0.5)` } : { elevation: 10 }),
  },
  dropdownOptionScroll: { maxHeight: sc(190) },
  dropdownItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    minHeight: sc(38), paddingVertical: sc(8), paddingHorizontal: sc(10),
  },
  dropdownItemActive: { backgroundColor: C.purpleTint },
  dropdownItemText: { flex: 1, fontFamily: 'SourceCodePro', fontSize: fs(11), color: C.ink },
  dropdownItemTextActive: { color: C.purpleLight },
  dropdownCheck: { fontSize: fs(14), color: C.aqua, marginLeft: sc(6) },
  modelConnectRow: { flexDirection: 'row', gap: sc(SETTINGS_CONTROL_GAP), alignItems: 'flex-end', zIndex: 200 },
  modelConnectRowOpen: { zIndex: 10000, elevation: 10000 },
  modelIdCol: { flex: 1, minWidth: 0, zIndex: 200 },
  modelIdColFull: { flexBasis: '100%' },
  connectCol: { flex: 1, minWidth: 0 },
  input: {
    height: sc(40), borderWidth: 1, borderColor: C.border, borderRadius: sc(8),
    paddingHorizontal: sc(10), backgroundColor: C.surfaceHigh, color: C.ink,
    fontFamily: 'SourceCodePro', fontSize: fs(13),
  },
  inputError: { borderColor: C.bad },
  errorText: { fontFamily: 'BarlowCondensed-Regular', fontSize: fs(11), color: C.bad, marginTop: sc(4) },
  keyRow: { flexDirection: 'row', gap: sc(8) },
  disabledInput: { opacity: 0.55 },
  keyInput: { flex: 1 },
  validateBtn: {
    paddingHorizontal: sc(14), borderRadius: sc(8), backgroundColor: C.surfaceHigh,
    borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center',
  },
  validateBtnText: { fontFamily: 'BarlowCondensed-SemiBold', fontSize: fs(12), color: C.ink, textTransform: 'uppercase' },
  validationText: { fontFamily: 'BarlowCondensed-Regular', fontSize: fs(11), color: C.inkMuted, marginTop: sc(6) },
  validationTextOk: { color: C.aqua },
  validationTextBad: { color: C.bad },
  allModelsToggle: { marginTop: sc(10) },
  allModelsToggleText: { fontFamily: 'BarlowCondensed-SemiBold', fontSize: fs(12), color: C.aqua, textTransform: 'uppercase' },
  allModelsBox: {
    marginTop: sc(8), padding: sc(8), borderRadius: sc(8),
    backgroundColor: C.surfaceHigh, borderWidth: 1, borderColor: C.border,
  },
  allModelsItem: { paddingVertical: sc(8), paddingHorizontal: sc(6) },
  allModelsItemText: { fontFamily: 'SourceCodePro', fontSize: fs(12), color: C.ink },
  modelDropdownFooter: { padding: sc(8), borderTopWidth: 1, borderTopColor: C.border },
  modelSearchFieldInput: {
    flex: 1, height: sc(40), paddingHorizontal: sc(10), color: C.ink,
    fontFamily: 'SourceCodePro', fontSize: fs(11),
  },
  modelSearchInput: {
    height: sc(34), borderWidth: 1, borderColor: C.border, borderRadius: sc(6),
    paddingHorizontal: sc(8), backgroundColor: C.surfaceHigh, color: C.ink,
    fontFamily: 'SourceCodePro', fontSize: fs(11),
  },
  fallbackRow: { flexDirection: 'row', alignItems: 'center', gap: sc(12), marginTop: sc(18) },
  fallbackText: { flex: 1, fontFamily: 'BarlowCondensed-Regular', fontSize: fs(11), color: C.inkMuted },
  actionsRow: { flexDirection: 'row', gap: sc(SETTINGS_CONTROL_GAP), marginTop: sc(18) },
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
