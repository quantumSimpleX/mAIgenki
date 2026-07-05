// Snapshot module tests. Run against fake-indexeddb (as globalThis.indexedDB) plus
// the shared in-memory fake SQLiteDatabase — expo-sqlite can't load under
// jest-expo's node env. Platform.OS is forced to 'web' so the web-gated entry
// points are exercised.

import 'fake-indexeddb/auto'
import { Platform } from 'react-native'
import * as backup from '@/lib/db/backup'
import { seededFakeDb } from './fakeDb'
import {
  saveSnapshotNow, scheduleSnapshot, loadSnapshot, clearSnapshot, SNAPSHOT_DEBOUNCE_MS,
} from '@/lib/db/snapshot'

const flush = () => new Promise<void>((r) => setImmediate(r))

// Directly stash a raw envelope in IndexedDB (bypasses saveSnapshotNow) so we can
// feed loadSnapshot deliberately malformed payloads.
function rawPut(value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('maigenki-meta', 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots')
    }
    req.onsuccess = () => {
      const db = req.result
      const tx = db.transaction('snapshots', 'readwrite')
      tx.objectStore('snapshots').put(value, 'latest')
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror = () => { db.close(); reject(tx.error) }
    }
    req.onerror = () => reject(req.error)
  })
}

const origOS = Platform.OS
const realIDB = globalThis.indexedDB

beforeAll(() => { (Platform as any).OS = 'web' })
afterAll(() => { (Platform as any).OS = origOS })

afterEach(async () => {
  jest.restoreAllMocks()
  ;(globalThis as any).indexedDB = realIDB
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('maigenki-meta')
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
})

describe('snapshot module', () => {
  it('save → load round-trips the buildBackup output', async () => {
    const db = await seededFakeDb()
    const ref = await backup.buildBackup(db)
    jest.spyOn(backup, 'buildBackup').mockResolvedValue(ref)

    await saveSnapshotNow(db)
    const loaded = await loadSnapshot()

    expect(loaded).toEqual(ref)
  })

  it('debounces rapid scheduleSnapshot calls into a single save', async () => {
    const db = await seededFakeDb()
    const ref = await backup.buildBackup(db)
    const spy = jest.spyOn(backup, 'buildBackup').mockResolvedValue(ref)
    jest.useFakeTimers()

    scheduleSnapshot(db)
    scheduleSnapshot(db)
    scheduleSnapshot(db)
    expect(spy).not.toHaveBeenCalled()

    jest.advanceTimersByTime(SNAPSHOT_DEBOUNCE_MS)
    expect(spy).toHaveBeenCalledTimes(1)

    jest.useRealTimers()
    await flush()
  })

  it('loadSnapshot returns null when the store is empty', async () => {
    expect(await loadSnapshot()).toBeNull()
  })

  it('loadSnapshot returns null for a wrong-app envelope', async () => {
    await rawPut({ savedAt: 'x', backup: { app: 'other', formatVersion: 1, tables: {} } })
    expect(await loadSnapshot()).toBeNull()
  })

  it('loadSnapshot returns null for a wrong formatVersion', async () => {
    await rawPut({ savedAt: 'x', backup: { app: 'maigenki', formatVersion: 2, tables: {} } })
    expect(await loadSnapshot()).toBeNull()
  })

  it('saveSnapshotNow swallows a buildBackup failure without throwing', async () => {
    const db = await seededFakeDb()
    jest.spyOn(backup, 'buildBackup').mockRejectedValue(new Error('boom'))
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(saveSnapshotNow(db)).resolves.toBeUndefined()

    expect(warn).toHaveBeenCalledWith('[snapshot] save failed:', 'boom')
    // Nothing was persisted, so nothing to restore.
    expect(await loadSnapshot()).toBeNull()
  })

  it('clearSnapshot removes a stored snapshot', async () => {
    const db = await seededFakeDb()
    await saveSnapshotNow(db)
    expect(await loadSnapshot()).not.toBeNull()

    await clearSnapshot()
    expect(await loadSnapshot()).toBeNull()
  })

  it('flushes a pending debounced snapshot on pagehide', async () => {
    const db = await seededFakeDb()
    const ref = await backup.buildBackup(db)
    const spy = jest.spyOn(backup, 'buildBackup').mockResolvedValue(ref)
    jest.useFakeTimers()

    let pagehideHandler: (() => void) | null = null
    ;(globalThis as any).window = {
      addEventListener: (event: string, handler: () => void) => {
        if (event === 'pagehide') pagehideHandler = handler
      },
    }

    scheduleSnapshot(db)
    expect(pagehideHandler).not.toBeNull()
    expect(spy).not.toHaveBeenCalled()

    pagehideHandler!()
    expect(spy).toHaveBeenCalledTimes(1)

    jest.useRealTimers()
    await flush()
    delete (globalThis as any).window
  })

  it('no-ops every entry point when indexedDB is undefined', async () => {
    const db = await seededFakeDb()
    ;(globalThis as any).indexedDB = undefined
    const spy = jest.spyOn(backup, 'buildBackup')
    jest.useFakeTimers()

    await expect(saveSnapshotNow(db)).resolves.toBeUndefined()
    expect(await loadSnapshot()).toBeNull()
    await expect(clearSnapshot()).resolves.toBeUndefined()
    scheduleSnapshot(db)
    jest.advanceTimersByTime(SNAPSHOT_DEBOUNCE_MS)

    expect(spy).not.toHaveBeenCalled()
    jest.useRealTimers()
  })

  it('no-ops off web (Platform.OS !== web)', async () => {
    const db = await seededFakeDb()
    ;(Platform as any).OS = 'ios'
    const spy = jest.spyOn(backup, 'buildBackup')

    await saveSnapshotNow(db)
    expect(await loadSnapshot()).toBeNull()

    ;(Platform as any).OS = 'web'
    expect(spy).not.toHaveBeenCalled()
  })
})
