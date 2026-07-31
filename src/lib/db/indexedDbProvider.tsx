import {
  createContext, useContext, useEffect, useState, type ReactNode,
} from 'react'
import { openIndexedDb } from './indexedDb'

// Mirrors provider.tsx's useOptionalDatabase() pattern for the browser-only
// IndexedDB store: renders children immediately (db starts null) and never
// blocks the tree while the database opens.
const IndexedDbContext = createContext<IDBDatabase | null>(null)

export function useOptionalIndexedDb(): IDBDatabase | null {
  return useContext(IndexedDbContext)
}

export function IndexedDbProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<IDBDatabase | null>(null)

  useEffect(() => {
    let cancelled = false
    let opened: IDBDatabase | null = null

    openIndexedDb()
      .then((database) => {
        if (cancelled) {
          database.close()
          return
        }
        opened = database
        setDb(database)
      })
      .catch((e) => {
        console.warn('[IndexedDB] unavailable:', (e as Error).message)
      })

    return () => {
      cancelled = true
      opened?.close()
    }
  }, [])

  return <IndexedDbContext.Provider value={db}>{children}</IndexedDbContext.Provider>
}
