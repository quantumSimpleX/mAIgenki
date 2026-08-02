// Regression net for the settings persistence effects (now IndexedDB-backed,
// Task 2.13). The DB is mocked (useOptionalIndexedDb → a stub handle) and the
// indexedDb module is mocked, so this asserts only that a settings change
// writes through putIndexedSetting for the right db handle — no real IndexedDB.
// IndexedDB is natively durable, so there's no snapshot-scheduling step to
// assert here (unlike the old SQLite-backed version of this hook).

import { renderHook, act, waitFor } from '@testing-library/react-native'

const fakeDb = { __fake: true } as unknown as IDBDatabase

jest.mock('@/lib/db/indexedDbProvider', () => ({
  useOptionalIndexedDb: jest.fn(),
}))
jest.mock('@/hooks/useConditions', () => ({
  useConditions: () => [[], jest.fn()],
}))
jest.mock('@/lib/db/indexedDb', () => ({
  getIndexedSetting: jest.fn().mockResolvedValue(null),
  putIndexedSetting: jest.fn().mockResolvedValue(undefined),
}))

import { useSettingsPersistence } from '@/hooks/useSettingsPersistence'
import { useAppStore } from '@/store/useAppStore'
import { useOptionalIndexedDb } from '@/lib/db/indexedDbProvider'
import { putIndexedSetting } from '@/lib/db/indexedDb'

const putSettingMock = putIndexedSetting as jest.Mock

describe('useSettingsPersistence — write-through', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(useOptionalIndexedDb as jest.Mock).mockReturnValue(fakeDb)
  })

  it('writes a setting for the db handle when settings change', async () => {
    renderHook(() => useSettingsPersistence())

    // The write effects fire once on hydration; wait for that to settle, then
    // clear so we measure only the effect of each subsequent setting change.
    await waitFor(() => expect(putSettingMock).toHaveBeenCalledWith(fakeDb, 'birth_year', expect.any(String)))
    putSettingMock.mockClear()

    // Changing birth_year re-runs only that write effect → exactly one write.
    act(() => { useAppStore.getState().setBirthYear(2001) })
    await waitFor(() => expect(putSettingMock).toHaveBeenCalledWith(fakeDb, 'birth_year', '2001'))
    expect(putSettingMock).toHaveBeenCalledTimes(1)

    putSettingMock.mockClear()

    // Changing the preferred language re-runs only that write effect.
    act(() => { useAppStore.getState().setPreferredLanguage('es') })
    await waitFor(() => expect(putSettingMock).toHaveBeenCalledWith(fakeDb, 'preferred_language', 'es'))
    expect(putSettingMock).toHaveBeenCalledTimes(1)
  })

  it('never writes a setting when the db is unavailable', async () => {
    ;(useOptionalIndexedDb as jest.Mock).mockReturnValue(null)

    renderHook(() => useSettingsPersistence())
    act(() => { useAppStore.getState().setBirthYear(1999) })

    // Give effects a chance to run, then confirm nothing was written.
    await act(async () => { await Promise.resolve() })
    expect(putSettingMock).not.toHaveBeenCalled()
  })
})
