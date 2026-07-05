// Regression net for the Phase 8 snapshot triggers wired into the settings
// persistence effects. The DB is mocked (useOptionalDatabase → a stub handle) and
// the snapshot + queries modules are mocked, so this asserts only that a settings
// change schedules a snapshot for the right db handle — no real SQLite/IndexedDB.

import { renderHook, act, waitFor } from '@testing-library/react-native'

const fakeDb = { __fake: true } as unknown as import('expo-sqlite').SQLiteDatabase

jest.mock('@/lib/db/snapshot', () => ({
  scheduleSnapshot: jest.fn(),
  saveSnapshotNow: jest.fn(),
}))
jest.mock('@/lib/db/provider', () => ({
  useOptionalDatabase: jest.fn(),
}))
jest.mock('@/hooks/useConditions', () => ({
  useConditions: () => [[], jest.fn()],
}))
jest.mock('@/lib/db/queries', () => ({
  getSetting: jest.fn().mockResolvedValue(null),
  upsertSetting: jest.fn().mockResolvedValue(undefined),
}))

import { useSettingsPersistence } from '@/hooks/useSettingsPersistence'
import { useAppStore } from '@/store/useAppStore'
import { useOptionalDatabase } from '@/lib/db/provider'
import { scheduleSnapshot } from '@/lib/db/snapshot'

const snapshotMock = scheduleSnapshot as jest.Mock

describe('useSettingsPersistence — snapshot triggers', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(useOptionalDatabase as jest.Mock).mockReturnValue(fakeDb)
  })

  it('schedules a snapshot for the db handle when settings change', async () => {
    renderHook(() => useSettingsPersistence())

    // The write effects fire once on hydration; wait for that to settle, then
    // clear so we measure only the effect of each subsequent setting change.
    await waitFor(() => expect(snapshotMock).toHaveBeenCalledWith(fakeDb))
    snapshotMock.mockClear()

    // Changing birth_year re-runs only that write effect → exactly one snapshot.
    act(() => { useAppStore.getState().setBirthYear(2001) })
    await waitFor(() => expect(snapshotMock).toHaveBeenCalledWith(fakeDb))
    expect(snapshotMock).toHaveBeenCalledTimes(1)

    snapshotMock.mockClear()

    // Changing the preferred language re-runs only that write effect.
    act(() => { useAppStore.getState().setPreferredLanguage('es') })
    await waitFor(() => expect(snapshotMock).toHaveBeenCalledWith(fakeDb))
    expect(snapshotMock).toHaveBeenCalledTimes(1)
  })

  it('never schedules a snapshot when the db is unavailable', async () => {
    ;(useOptionalDatabase as jest.Mock).mockReturnValue(null)

    renderHook(() => useSettingsPersistence())
    act(() => { useAppStore.getState().setBirthYear(1999) })

    // Give effects a chance to run, then confirm nothing was scheduled.
    await act(async () => { await Promise.resolve() })
    expect(snapshotMock).not.toHaveBeenCalled()
  })
})
