import {
  createContext, useContext, useEffect, useState, type ReactNode,
} from 'react'
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite'
import { initDatabase } from './queries'
import { seedDemoData } from './seed'

// A resilient SQLite provider. Unlike expo's <SQLiteProvider>, it renders its
// children immediately (db starts null) and never blocks the tree if the DB
// fails to open. On web, expo-sqlite needs an exclusive OPFS access handle that
// can fail (NoModificationAllowedError) across dev reloads / multiple tabs; when
// that happens the db stays null and consumers fall back to bundled demo data.
// On native the on-device file DB opens and persists as normal.
const DbContext = createContext<SQLiteDatabase | null>(null)

export function useOptionalDatabase(): SQLiteDatabase | null {
  return useContext(DbContext)
}

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<SQLiteDatabase | null>(null)

  useEffect(() => {
    let cancelled = false
    let opened: SQLiteDatabase | null = null

    async function setup() {
      try {
        const database = await openDatabaseAsync('maigenki.db')
        await initDatabase(database)
        await seedDemoData(database)
        if (cancelled) {
          await database.closeAsync()
          return
        }
        opened = database
        setDb(database)
      } catch (e) {
        console.warn('[SQLite] unavailable, using bundled demo data:', (e as Error).message)
      }
    }

    setup()
    return () => {
      cancelled = true
      opened?.closeAsync().catch(() => {})
    }
  }, [])

  return <DbContext.Provider value={db}>{children}</DbContext.Provider>
}
