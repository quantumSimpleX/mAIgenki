import {
  createContext, useContext, useEffect, useState, type ReactNode,
} from 'react'
import { Platform } from 'react-native'
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

// Opens the DB and runs init + seed. On any init/seed failure the handle is
// closed (releasing the OPFS access handles the worker holds) and the error is
// rethrown, so a caller can safely wipe the OPFS store before retrying.
async function openInitSeed(): Promise<SQLiteDatabase> {
  const database = await openDatabaseAsync('maigenki.db')
  try {
    await initDatabase(database)
    await seedDemoData(database)
    return database
  } catch (e) {
    await database.closeAsync().catch(() => {})
    throw e
  }
}

// Signatures of a wedged AccessHandlePoolVFS: its 6-file OPFS pool is full of
// leaked anonymous associations, so opening a file throws SQLITE_CANTOPEN
// ('cannot create file'). Deliberately does NOT match NoModificationAllowedError
// / "access handle" — those mean another tab or worker holds the handles, where
// wiping would destroy a live session's data. That case falls through to the
// non-destructive demo fallback.
const OPFS_EXHAUSTED = /CANTOPEN|cannot create file|unable to open/i

// Last-resort recovery (web only): wipe the entire expo-sqlite OPFS directory,
// clearing the leaked pool files that can't be removed individually. This also
// DESTROYS any persisted on-device records — acceptable today because
// seedDemoData rebuilds the DB on every open, but must be revisited before real
// user-uploaded history is the only persistent copy. Only ever runs after a
// normal open has already failed. Requires the DB handle to be closed first
// (openInitSeed does this) or removeEntry throws NoModificationAllowedError.
async function wipeOpfsSqliteStore(): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) return
  const root = await navigator.storage.getDirectory()
  await root.removeEntry('expo-sqlite', { recursive: true }).catch(() => {})
}

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<SQLiteDatabase | null>(null)

  useEffect(() => {
    let cancelled = false
    let opened: SQLiteDatabase | null = null

    async function setup() {
      let database: SQLiteDatabase | null = null
      try {
        database = await openInitSeed()
      } catch (e) {
        const msg = (e as Error).message ?? ''
        if (Platform.OS === 'web' && OPFS_EXHAUSTED.test(msg)) {
          console.warn('[SQLite] OPFS store wedged, resetting and retrying once:', msg)
          await wipeOpfsSqliteStore()
          try {
            database = await openInitSeed()
          } catch (e2) {
            console.warn('[SQLite] retry after reset failed, using bundled demo data:', (e2 as Error).message)
            database = null
          }
        } else {
          console.warn('[SQLite] unavailable, using bundled demo data:', msg)
          database = null
        }
      }

      if (cancelled) {
        await database?.closeAsync().catch(() => {})
        return
      }
      opened = database
      setDb(database)
    }

    setup()
    return () => {
      cancelled = true
      opened?.closeAsync().catch(() => {})
    }
  }, [])

  return <DbContext.Provider value={db}>{children}</DbContext.Provider>
}
