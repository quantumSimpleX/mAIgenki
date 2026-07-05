// Provider restore-on-heal tests. Mocks expo-sqlite's openDatabaseAsync to drive
// the CANTOPEN heal branch, using the shared in-memory fake as the "reopened" DB
// and fake-indexeddb for the snapshot. Platform.OS is forced to 'web'.

import 'fake-indexeddb/auto'
import { Platform } from 'react-native'

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }))

import { openDatabaseAsync } from 'expo-sqlite'
import * as backup from '@/lib/db/backup'
import { getConditions, updateConditionPosition } from '@/lib/db/queries'
import { saveSnapshotNow } from '@/lib/db/snapshot'
import { openDatabaseWithRecovery } from '@/lib/db/provider'
import { makeFakeDb, seededFakeDb } from './fakeDb'

const mockOpenDatabaseAsync = openDatabaseAsync as jest.Mock

const origOS = Platform.OS
const CANTOPEN = new Error('cannot create file')

let getDirectory: jest.Mock
let persist: jest.Mock

beforeAll(() => { (Platform as any).OS = 'web' })
afterAll(() => { (Platform as any).OS = origOS })

beforeEach(() => {
  getDirectory = jest.fn().mockResolvedValue({ removeEntry: jest.fn().mockResolvedValue(undefined) })
  persist = jest.fn().mockResolvedValue(true)
  ;(globalThis as any).navigator = { storage: { getDirectory, persist } }
})

afterEach(async () => {
  jest.restoreAllMocks()
  mockOpenDatabaseAsync.mockReset()
  delete (globalThis as any).navigator
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('maigenki-meta')
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
})

// Store a snapshot whose htn dot is at a sentinel position, so a restore is
// observable in the reopened DB.
async function storeSnapshotWithSentinel(): Promise<void> {
  const src = await seededFakeDb()
  await updateConditionPosition(src, 'htn', 42.5, 17)
  await saveSnapshotNow(src)
}

describe('openDatabaseWithRecovery — restore-on-heal', () => {
  it('CANTOPEN → wipe → reopen → restores the snapshot into the new DB', async () => {
    await storeSnapshotWithSentinel()
    mockOpenDatabaseAsync
      .mockRejectedValueOnce(CANTOPEN)
      .mockImplementation(async () => makeFakeDb())

    const db = await openDatabaseWithRecovery()

    expect(db).not.toBeNull()
    expect(getDirectory).toHaveBeenCalledTimes(1) // wipe ran
    const conds = await getConditions(db!)
    expect(conds.find((c) => c.id === 'htn')!.cx_percent).toBeCloseTo(42.5, 2)
  })

  it('CANTOPEN with no snapshot → seeded demo path, no restore', async () => {
    const restoreSpy = jest.spyOn(backup, 'restoreBackup')
    mockOpenDatabaseAsync
      .mockRejectedValueOnce(CANTOPEN)
      .mockImplementation(async () => makeFakeDb())

    const db = await openDatabaseWithRecovery()

    expect(db).not.toBeNull()
    expect(restoreSpy).not.toHaveBeenCalled()
    const conds = await getConditions(db!)
    expect(conds.length).toBe(22) // reseeded demo data
  })

  it('CANTOPEN, snapshot present, restore throws → usable seeded DB', async () => {
    await storeSnapshotWithSentinel()
    jest.spyOn(backup, 'restoreBackup').mockRejectedValue(new Error('restore boom'))
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    mockOpenDatabaseAsync
      .mockRejectedValueOnce(CANTOPEN)
      .mockImplementation(async () => makeFakeDb())

    const db = await openDatabaseWithRecovery()

    expect(db).not.toBeNull()
    const conds = await getConditions(db!)
    expect(conds.length).toBe(22) // seeded state survives the failed restore
    expect(conds.find((c) => c.id === 'htn')!.cx_percent).not.toBeCloseTo(42.5, 2)
    expect(warn).toHaveBeenCalledWith(
      '[SQLite] snapshot restore failed, continuing with seeded data:', 'restore boom',
    )
  })

  it('CANTOPEN, reopen after wipe also fails → demo fallback (null)', async () => {
    const restoreSpy = jest.spyOn(backup, 'restoreBackup')
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    mockOpenDatabaseAsync
      .mockRejectedValueOnce(CANTOPEN)
      .mockRejectedValueOnce(CANTOPEN)

    const db = await openDatabaseWithRecovery()

    expect(db).toBeNull()
    expect(getDirectory).toHaveBeenCalledTimes(1) // wipe ran
    expect(restoreSpy).not.toHaveBeenCalled()
  })

  it('non-CANTOPEN failure → demo fallback (null), no wipe, no restore', async () => {
    const restoreSpy = jest.spyOn(backup, 'restoreBackup')
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    mockOpenDatabaseAsync.mockRejectedValue(new Error('something unrelated'))

    const db = await openDatabaseWithRecovery()

    expect(db).toBeNull()
    expect(getDirectory).not.toHaveBeenCalled() // no wipe
    expect(restoreSpy).not.toHaveBeenCalled()
  })
})

// Store a snapshot that contains a real (non-demo) health record, simulating a
// user who uploaded a document before the OPFS store was silently lost.
async function storeSnapshotWithUserRecord(): Promise<void> {
  const src = await seededFakeDb()
  await src.runAsync(
    'INSERT INTO health_records (id, filename, record_type) VALUES (?, ?, ?)',
    ['user-rec-1', 'lab-results.pdf', 'lab_report'],
  )
  await updateConditionPosition(src, 'htn', 42.5, 17)
  await saveSnapshotNow(src)
}

describe('openDatabaseWithRecovery — restore-on-boot guard (B-P8-3)', () => {
  it('live DB has no user records + snapshot does → restores the snapshot', async () => {
    await storeSnapshotWithUserRecord()
    mockOpenDatabaseAsync.mockImplementation(async () => makeFakeDb())

    const db = await openDatabaseWithRecovery()

    expect(db).not.toBeNull()
    const recs = await db!.getAllAsync<{ id: string }>('SELECT * FROM health_records')
    expect(recs.some((r) => r.id === 'user-rec-1')).toBe(true)
    const conds = await getConditions(db!)
    expect(conds.find((c) => c.id === 'htn')!.cx_percent).toBeCloseTo(42.5, 2)
  })

  it('live DB already has a user record → never restores', async () => {
    await storeSnapshotWithUserRecord()
    const restoreSpy = jest.spyOn(backup, 'restoreBackup')
    const live = makeFakeDb()
    await live.runAsync(
      'INSERT INTO health_records (id, filename, record_type) VALUES (?, ?, ?)',
      ['live-rec-1', 'current.pdf', 'lab_report'],
    )
    mockOpenDatabaseAsync.mockImplementation(async () => live)

    const db = await openDatabaseWithRecovery()

    expect(db).not.toBeNull()
    expect(restoreSpy).not.toHaveBeenCalled()
    const recs = await db!.getAllAsync<{ id: string }>('SELECT * FROM health_records')
    expect(recs.some((r) => r.id === 'live-rec-1')).toBe(true)
  })

  it('snapshot is demo-only → never restores', async () => {
    await storeSnapshotWithSentinel() // seeded demo only, no user records
    const restoreSpy = jest.spyOn(backup, 'restoreBackup')
    mockOpenDatabaseAsync.mockImplementation(async () => makeFakeDb())

    const db = await openDatabaseWithRecovery()

    expect(db).not.toBeNull()
    expect(restoreSpy).not.toHaveBeenCalled()
    const conds = await getConditions(db!)
    expect(conds.find((c) => c.id === 'htn')!.cx_percent).not.toBeCloseTo(42.5, 2)
  })

  it('no snapshot → normal boot, no restore', async () => {
    const restoreSpy = jest.spyOn(backup, 'restoreBackup')
    mockOpenDatabaseAsync.mockImplementation(async () => makeFakeDb())

    const db = await openDatabaseWithRecovery()

    expect(db).not.toBeNull()
    expect(restoreSpy).not.toHaveBeenCalled()
    const conds = await getConditions(db!)
    expect(conds.length).toBe(22) // seeded demo
  })

  it('guard restore throws → still returns a usable seeded DB', async () => {
    await storeSnapshotWithUserRecord()
    jest.spyOn(backup, 'restoreBackup').mockRejectedValue(new Error('boot boom'))
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    mockOpenDatabaseAsync.mockImplementation(async () => makeFakeDb())

    const db = await openDatabaseWithRecovery()

    expect(db).not.toBeNull()
    const conds = await getConditions(db!)
    expect(conds.length).toBe(22) // seeded state survives the failed guard
    expect(warn).toHaveBeenCalledWith(
      '[SQLite] restore-on-boot failed, continuing with live data:', 'boot boom',
    )
  })
})
