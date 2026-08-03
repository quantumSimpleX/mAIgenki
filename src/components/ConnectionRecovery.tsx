import { useState, type ReactElement } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import { useOptionalIndexedDb } from '@/lib/db/indexedDbProvider'
import { useLlmConnection } from '@/hooks/useLlmConnection'
import { createConnectionBundle, importConnectionBundle, createConnectionQr } from '@/lib/llm/connectionBundle'
import { Image } from 'expo-image'

export function ConnectionRecovery(): ReactElement {
  const db = useOptionalIndexedDb(); const state = useLlmConnection(); const [message, setMessage] = useState(''); const [qr, setQr] = useState<string | null>(null)
  async function exportFile(): Promise<void> { if (!state.profile || !state.keyStore || typeof document === 'undefined') return; const key = await state.keyStore.get('openrouter'); if (!key) return; const blob = new Blob([JSON.stringify(createConnectionBundle(state.profile, key), null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'maigenki-connection.json'; a.click(); URL.revokeObjectURL(url) }
  async function importFile(event: { target: { files?: FileList | null } }): Promise<void> { const file = event.target.files?.[0]; if (!file || !db || !state.keyStore) return; if (!window.confirm('This file contains your OpenRouter credential. Import it on this trusted device?')) return; try { await importConnectionBundle(db, state.keyStore, await file.text()); setMessage('Connection restored.'); state.reload() } catch { setMessage('Invalid connection file.') } }
  async function showQr(): Promise<void> { if (!state.profile || !state.keyStore) return; const key = await state.keyStore.get('openrouter'); if (!key) return; setQr(await createConnectionQr(createConnectionBundle(state.profile, key))) }
  return <View><TouchableOpacity onPress={() => void exportFile()}><Text>Save recovery file</Text></TouchableOpacity><TouchableOpacity onPress={() => void showQr()}><Text>Show recovery QR</Text></TouchableOpacity>{qr && <Image source={{ uri: qr }} style={{ width: 220, height: 220 }} accessibilityLabel="mAIgenki connection QR code" />}{typeof document !== 'undefined' && <input type="file" accept="application/json" onChange={(e) => { void importFile(e) }} />}{!!message && <Text>{message}</Text>}</View>
}
