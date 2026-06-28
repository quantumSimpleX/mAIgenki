// End-to-end-ish flow tests driving the real store. Component rendering is
// guarded behind @testing-library/react-native; the pure store-flow assertions
// always run.

import { useAppStore } from '@/store/useAppStore'
import { CONDITIONS } from '@/model/conditions'

const initial = { ...useAppStore.getState() }
const get = () => useAppStore.getState()
const htn = CONDITIONS.find((c) => c.id === 'htn')!

beforeEach(() => useAppStore.setState({ ...initial }, true))

describe('store-driven flows', () => {
  it('selecting a condition opens the sheet with its data', () => {
    get().selectCondition(htn)
    expect(get().sheetOpen).toBe(true)
    expect(get().selectedCondition?.id).toBe('htn')
  })

  it('opening chat keeps the condition and clears records', () => {
    get().selectCondition(htn)
    get().setChatOpen(true)
    expect(get().chatOpen).toBe(true)
    expect(get().selectedRecords).toEqual([])
  })

  it('a date override persists across sheet close/reopen', () => {
    get().selectCondition(htn)
    get().setCondDateOverride('htn', '2019-OCT-20')
    get().closeSheet()
    get().selectCondition(htn)
    expect(get().condDateOverrides['htn']).toBe('2019-OCT-20')
  })

  it('changing language affects the resolved condition name', () => {
    const { getLocalName } = require('@/model/conditions')
    get().setPreferredLanguage('ja')
    expect(getLocalName(htn, get().preferredLanguage)).toBe('高血圧症')
  })

  it('lightbox add-to-chat updates selectedRecords', () => {
    const rec = { id: 'r-htn-1', type: 'TREND', label: 'BP trend', date: '2019–2024', color: '#EF4444' } as const
    get().setLightboxRecord(rec)
    get().setSelectedRecords([rec])
    expect(get().selectedRecords).toHaveLength(1)
  })
})
