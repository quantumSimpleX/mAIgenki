// src/app/oauth/openrouter.tsx
// OAuth completion route (pB05-T02). See lmfPlan.md A9 step 8.
//
// Web: the OAuth popup redirects here; maybeCompleteAuthSession() hands the
// result back to the opener window and closes the popup. The opener (wherever
// connectOpenRouter's openAuthSessionAsync call is awaiting) does the actual
// exchange — this screen has nothing else to do on web.
//
// Native: a cold-launch reopens the app on this route via the deep-link
// redirect, so there is no in-memory caller awaiting the result. This screen
// reads `code` from the URL, loads the verifier persisted before the browser
// launched (oauth.ts's getPendingVerifier), and completes the exchange itself
// via completeOAuthExchange — reusing pB05-T01's logic rather than
// duplicating the PKCE/exchange code.

import { useEffect, useState } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { useOptionalIndexedDb } from '@/lib/db/indexedDbProvider'
import { clearPendingVerifier, completeOAuthExchange, getPendingVerifier } from '@/lib/llm/oauth'

const REDIRECT_DELAY_MS = 1200

export default function OAuthOpenRouterScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>()
  const db = useOptionalIndexedDb()
  const [message, setMessage] = useState('Completing sign-in…')

  // Web: hand the result back to the opener and close the popup. The
  // exchange itself happens in the opener's in-memory openAuthSessionAsync
  // call, not here.
  useEffect(() => {
    if (Platform.OS === 'web') {
      WebBrowser.maybeCompleteAuthSession()
    }
  }, [])

  // Native cold-launch: no in-memory caller is awaiting the browser result,
  // so this screen must finish the exchange itself before returning to the app.
  useEffect(() => {
    if (Platform.OS === 'web') return
    if (!db) return // wait for IndexedDbProvider to finish opening

    let cancelled = false

    async function finish() {
      if (!code) {
        setMessage('Sign-in redirect was missing a code.')
      } else {
        const verifier = await getPendingVerifier(db!)
        if (!verifier) {
          setMessage('Sign-in session expired — please try connecting again.')
        } else {
          const result = await completeOAuthExchange(db!, code, verifier)
          setMessage(
            result.status === 'success'
              ? 'Signed in with OpenRouter.'
              : 'message' in result ? result.message : 'Sign-in was cancelled.',
          )
        }
      }
      // Clear the persisted verifier on every terminal outcome — success,
      // exchange failure, missing code, or an expired/missing verifier —
      // mirroring connectOpenRouter's own cleanup so lmf_oauth_pending never
      // lingers after this route finishes (lmfPlan.md A9 step 8 / Phase 5).
      await clearPendingVerifier(db!)
      if (!cancelled) {
        setTimeout(() => { if (!cancelled) router.replace('/') }, REDIRECT_DELAY_MS)
      }
    }

    finish()
    return () => { cancelled = true }
  }, [db, code])

  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>{message}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0E14', padding: 24 },
  text: { color: '#FAFAF7', fontSize: 14, textAlign: 'center' },
})
