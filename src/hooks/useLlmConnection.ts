import { useCallback, useEffect, useState } from 'react'
import { useOptionalIndexedDb } from '@/lib/db/indexedDbProvider'
import { loadLlmConnection, type LlmConnectionState } from '@/lib/llm/connection'

export function useLlmConnection(): LlmConnectionState & { reload: () => void } {
  const db = useOptionalIndexedDb()
  const [state, setState] = useState<LlmConnectionState>({ status: 'loading', profile: null, keyStore: null })
  const reload = useCallback(() => { void loadLlmConnection(db).then(setState) }, [db])
  useEffect(() => { reload() }, [reload])
  return { ...state, reload }
}
