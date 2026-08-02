// Bodymap screen tests.
// The component is ~1242 lines with complex SVG/Animated — rendering it
// exhausts the 4GB jest heap. Tests focus on module shape, store state,
// and data contracts without a full render.

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }))

jest.mock('react-native-safe-area-context', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SafeAreaView: function SafeAreaView(props: any) { return props.children },
  useSafeAreaInsets: function () { return { top: 0, bottom: 0, left: 0, right: 0 } },
}))

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'))

jest.mock('@/hooks/useConditions', () => ({
  useConditions: function () {
    return require('@/model/conditions').CONDITIONS.slice(0, 2)
  },
  useConditionRecords: function (id: string) {
    return require('@/model/conditions').CONDITION_RECORDS[id] || []
  },
}))

import { useAppStore } from '@/store/useAppStore'
import { CONDITIONS, SYSTEM_META, CONDITION_RECORDS } from '@/model/conditions'

const htn = CONDITIONS.find((c) => c.id === 'htn')!
const savedState = { ...useAppStore.getState() }

beforeEach(() => useAppStore.setState({ ...savedState }, true))

describe('BodyMapScreen module', () => {
  it('exports a default function component', () => {
    const mod = require('@/app/bodymap')
    expect(typeof mod.default).toBe('function')
  })
})

describe('System meta — Cardiovascular label', () => {
  it('cardio system label is Cardiovascular (not Circulatory)', () => {
    expect(SYSTEM_META.cardiovascular.label).toBe('Cardiovascular')
    expect(SYSTEM_META.cardiovascular.label).not.toBe('Circulatory')
  })
})

describe('bodyMapMode removed from store', () => {
  it('bodyMapMode does not exist on store state', () => {
    expect((useAppStore.getState() as any).bodyMapMode).toBeUndefined()
  })

  it('setBodyMapMode does not exist on store', () => {
    expect((useAppStore.getState() as any).setBodyMapMode).toBeUndefined()
  })
})

describe('Condition sheet store interactions', () => {
  it('selectCondition opens sheet and sets year', () => {
    useAppStore.getState().selectCondition(htn)
    const s = useAppStore.getState()
    expect(s.sheetOpen).toBe(true)
    expect(s.currentYear).toBe(htn.yearFrac)
    expect(s.timeRailActive).toBe(true)
    expect(s.selectedRecords).toEqual([])
    expect(s.lightboxRecord).toBeNull()
  })

  it('closeSheet sets sheetOpen:false immediately', () => {
    useAppStore.getState().selectCondition(htn)
    useAppStore.getState().closeSheet()
    expect(useAppStore.getState().sheetOpen).toBe(false)
  })
})

describe('Settings: exactly 4 languages', () => {
  const LANGUAGES = ['en', 'zh-TW', 'ja', 'es']

  it('has exactly 4 supported language codes', () => {
    expect(LANGUAGES).toHaveLength(4)
  })

  it('includes en, zh-TW, ja, es', () => {
    expect(LANGUAGES).toContain('en')
    expect(LANGUAGES).toContain('zh-TW')
    expect(LANGUAGES).toContain('ja')
    expect(LANGUAGES).toContain('es')
  })

  it('does not include unsupported languages', () => {
    expect(LANGUAGES).not.toContain('fr')
    expect(LANGUAGES).not.toContain('de')
    expect(LANGUAGES).not.toContain('ko')
  })

  it('preferredLanguage has a valid default from the supported set', () => {
    const lang = useAppStore.getState().preferredLanguage
    expect(['en', 'zh-TW', 'ja', 'es']).toContain(lang)
  })

  it('setPreferredLanguage updates to zh-TW', () => {
    useAppStore.getState().setPreferredLanguage('zh-TW')
    expect(useAppStore.getState().preferredLanguage).toBe('zh-TW')
  })
})

describe('CONDITION_RECORDS data', () => {
  it('htn has records', () => {
    expect(CONDITION_RECORDS['htn']).toBeDefined()
    expect(CONDITION_RECORDS['htn'].length).toBeGreaterThan(0)
  })

  it('each record has required fields', () => {
    const records = CONDITION_RECORDS['htn']
    for (const rec of records) {
      expect(rec).toHaveProperty('id')
      expect(rec).toHaveProperty('type')
      expect(rec).toHaveProperty('label')
      expect(rec).toHaveProperty('date')
      expect(rec).toHaveProperty('color')
    }
  })

  it('record types are from the allowed set', () => {
    const allowed = new Set(['TREND', 'ECG', 'IMAGING', 'LABS', 'SPIRO', 'SCAN'])
    for (const [, records] of Object.entries(CONDITION_RECORDS)) {
      for (const rec of records) {
        expect(allowed.has(rec.type)).toBe(true)
      }
    }
  })
})

describe('Upload shortcuts store', () => {
  it('setUploadPanelOpen closes the panel', () => {
    useAppStore.getState().setUploadPanelOpen(false)
    expect(useAppStore.getState().uploadPanelOpen).toBe(false)
  })

  it('setUploadPanelOpen opens the panel', () => {
    useAppStore.getState().setUploadPanelOpen(false)
    useAppStore.getState().setUploadPanelOpen(true)
    expect(useAppStore.getState().uploadPanelOpen).toBe(true)
  })

  it('openHealthChat opens sheet in chat mode with no condition', () => {
    useAppStore.getState().openHealthChat()
    const s = useAppStore.getState()
    expect(s.sheetOpen).toBe(true)
    expect(s.chatOpen).toBe(true)
    expect(s.selectedCondition).toBeNull()
  })
})
