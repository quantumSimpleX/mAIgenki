import { useEffect, useState, type ReactElement } from 'react'
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useOptionalIndexedDb } from '@/lib/db/indexedDbProvider'
import { connectOpenRouter } from '@/lib/llm/oauth'
import { isFreeOpenRouterModel } from '@/lib/llm/connection'
import { loadProfile, saveProfile } from '@/lib/llm/profile'
import { BUILT_IN_PROVIDERS, listModels, validateKey } from '@/lib/lmf'
import { useLlmConnection } from '@/hooks/useLlmConnection'
import { ConnectionRecovery } from '@/components/ConnectionRecovery'

export function LlmOnboarding({ onReady }: { onReady: () => void }): ReactElement {
  const db = useOptionalIndexedDb()
  const state = useLlmConnection()
  const [models, setModels] = useState<string[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => { if (state.status === 'ready') onReady() }, [state.status, onReady])
  useEffect(() => {
    if (!db || !state.keyStore || state.status === 'loading') return
    void state.keyStore.get('openrouter').then(async (key) => {
      if (!key) return
      const fetched = await listModels(BUILT_IN_PROVIDERS.openrouter, key)
      const free = fetched.filter(isFreeOpenRouterModel)
      setModels(free)
      setSelected(state.profile?.model && free.includes(state.profile.model) ? state.profile.model : free[0] ?? null)
    })
  }, [db, state.keyStore, state.status, state.profile?.model])
  async function connect(): Promise<void> {
    if (!db) return
    setBusy(true); setMessage('')
    const result = await connectOpenRouter(db)
    if (result.status === 'success') { state.reload(); setMessage('Connected. Choose a free model to continue.') }
    else if (result.status === 'cancelled') setMessage('Sign-in cancelled.')
    else setMessage(result.message)
    setBusy(false)
  }
  async function confirm(): Promise<void> {
    if (!db || !state.keyStore || !selected) return
    setBusy(true); setMessage('Checking model…')
    const key = await state.keyStore.get('openrouter')
    const result = key ? await validateKey(BUILT_IN_PROVIDERS.openrouter, key, { model: selected }) : { ok: false as const, kind: 'auth' as const }
    if (!result.ok) { setMessage('That model is unavailable. Choose another free model.'); setBusy(false); return }
    const current = await loadProfile(db)
    await saveProfile(db, { ...current, tier: 1, activeProviderId: 'openrouter', model: selected, fallbackToFree: true, keySource: current.keySource ?? 'oauth', verifiedAt: new Date().toISOString() })
    state.reload(); setBusy(false)
  }
  if (state.status === 'loading') return <View style={styles.card}><ActivityIndicator /><Text style={styles.text}>Preparing secure local settings…</Text></View>
  return <View style={styles.card}>
    <Text style={styles.title}>Connect your AI assistant</Text>
    <Text style={styles.text}>Sign in with OpenRouter. No API key to copy, no account with mAIgenki, and your connection stays on this device.</Text>
    {!state.profile?.keySource && <TouchableOpacity style={styles.primary} onPress={connect} disabled={busy}><Text style={styles.primaryText}>{busy ? 'Opening sign-in…' : 'Sign in with OpenRouter'}</Text></TouchableOpacity>}
    {state.profile?.keySource && <>
      <Text style={styles.label}>Choose a free model</Text>
      {models.length === 0 ? <Text style={styles.text}>Loading free models…</Text> : models.slice(0, 8).map((model) => <TouchableOpacity key={model} style={[styles.model, selected === model && styles.modelSelected]} onPress={() => setSelected(model)}><Text style={styles.modelText}>{model}</Text></TouchableOpacity>)}
      <TouchableOpacity style={styles.primary} onPress={confirm} disabled={busy || !isFreeOpenRouterModel(selected)}><Text style={styles.primaryText}>{busy ? 'Checking…' : 'Continue'}</Text></TouchableOpacity>
    </>}
    {state.status === 'ready' && <ConnectionRecovery />}
    {!!message && <Text style={styles.message}>{message}</Text>}
  </View>
}
const styles = StyleSheet.create({ card: { margin: 20, padding: 20, borderRadius: 12, backgroundColor: '#F5F0FD', borderWidth: 1, borderColor: '#CDD2D9' }, title: { fontSize: 24, fontWeight: '700', color: '#0A0E14', marginBottom: 10 }, text: { fontSize: 16, lineHeight: 22, color: '#5A6573', marginBottom: 14 }, label: { fontSize: 14, fontWeight: '700', color: '#5A6573', marginBottom: 8 }, primary: { backgroundColor: '#7042D6', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 12 }, primaryText: { color: '#FFF', fontSize: 16, fontWeight: '700' }, model: { padding: 10, borderRadius: 8, marginVertical: 3, backgroundColor: '#FFF' }, modelSelected: { borderWidth: 2, borderColor: '#7042D6' }, modelText: { color: '#0A0E14', fontSize: 13 }, message: { color: '#5A6573', marginTop: 10 } })
