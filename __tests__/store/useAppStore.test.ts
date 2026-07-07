import { useAppStore } from '@/store/useAppStore'
import { ALL_SYSTEMS, CONDITIONS, ConditionRecord } from '@/model/conditions'

const htn = CONDITIONS.find((c) => c.id === 'htn')!
const initial = { ...useAppStore.getState() }

beforeEach(() => {
  useAppStore.setState({ ...initial }, true)
})

const get = () => useAppStore.getState()

describe('initial state', () => {
  it('screen is upload', () => expect(get().screen).toBe('upload'))
  it('all 11 systems active', () => {
    expect(get().activeSystems.length).toBe(11)
    for (const s of ALL_SYSTEMS) expect(get().activeSystems).toContain(s)
  })
  it('sheet closed', () => expect(get().sheetOpen).toBe(false))
  it('legend open', () => expect(get().legendOpen).toBe(true))
})

describe('actions', () => {
  it('startAnalyze resets analyze state', () => {
    get().setConditionSource('demo')
    get().startAnalyze()
    expect(get().screen).toBe('analyzing')
    expect(get().analyzeProgress).toBe(0)
    expect(get().analyzePhase).toBe(0)
    expect(get().conditionSource).toBe('auto')
  })

  it('startDemoAnalyze resets demo view state', () => {
    get().setActiveSystems(['cardiovascular'])
    get().startDemoAnalyze()
    expect(get().screen).toBe('analyzing')
    expect(get().pendingDemo).toBe(true)
    expect(get().conditionSource).toBe('demo')
    expect(get().activeSystems).toEqual(ALL_SYSTEMS)
  })

  it('toggleSystem removes then re-adds', () => {
    get().toggleSystem('cardiovascular')
    expect(get().activeSystems).not.toContain('cardiovascular')
    get().toggleSystem('cardiovascular')
    expect(get().activeSystems).toContain('cardiovascular')
  })

  it('selectCondition opens the sheet with year/rail/cleared state', () => {
    get().selectCondition(htn)
    expect(get().sheetOpen).toBe(true)
    expect(get().currentYear).toBe(htn.yearFrac)
    expect(get().timeRailActive).toBe(true)
    expect(get().chatMessages).toEqual([])
    expect(get().chatOpen).toBe(false)
    expect(get().selectedRecords).toEqual([])
    expect(get().lightboxRecord).toBeNull()
  })

  it('closeSheet closes immediately', () => {
    get().selectCondition(htn)
    get().closeSheet()
    expect(get().sheetOpen).toBe(false)
  })

  it('toggleLegend flips', () => {
    const before = get().legendOpen
    get().toggleLegend()
    expect(get().legendOpen).toBe(!before)
  })

  it('toggleTimeDisplayMode cycles', () => {
    expect(get().timeDisplayMode).toBe('date')
    get().toggleTimeDisplayMode()
    expect(get().timeDisplayMode).toBe('age')
    get().toggleTimeDisplayMode()
    expect(get().timeDisplayMode).toBe('date')
  })

  it('addChatMessage appends', () => {
    get().addChatMessage({ role: 'user', content: 'hi' })
    expect(get().chatMessages.length).toBe(1)
  })

  it('clearChat empties', () => {
    get().addChatMessage({ role: 'user', content: 'hi' })
    get().clearChat()
    expect(get().chatMessages).toEqual([])
    expect(get().chatInputVal).toBe('')
    expect(get().chatLoading).toBe(false)
  })

  it('setCondDateOverride stores the override', () => {
    get().setCondDateOverride('htn', '2019-OCT-20')
    expect(get().condDateOverrides['htn']).toBe('2019-OCT-20')
  })

  it('startEditDate sets editing state', () => {
    get().startEditDate('htn', '2019-OCT-14')
    expect(get().editingCondDate).toBe('htn')
    expect(get().editDateInput).toBe('2019-OCT-14')
  })

  it('confirmEditDate saves override and clears editing', () => {
    get().startEditDate('htn', '2019-OCT-20')
    get().confirmEditDate()
    expect(get().condDateOverrides['htn']).toBe('2019-OCT-20')
    expect(get().editingCondDate).toBeNull()
  })

  it('cancelEditDate clears without saving', () => {
    get().startEditDate('htn', '2099-JAN-01')
    get().cancelEditDate()
    expect(get().editingCondDate).toBeNull()
    expect(get().condDateOverrides['htn']).toBeUndefined()
  })

  it('setPreferredLanguage updates', () => {
    get().setPreferredLanguage('ja')
    expect(get().preferredLanguage).toBe('ja')
  })

  it('setBirthYear / setBirthMonth update', () => {
    get().setBirthYear(1990)
    get().setBirthMonth('MAR')
    expect(get().birthYear).toBe(1990)
    expect(get().birthMonth).toBe('MAR')
  })

  it('setUploadPanelOpen updates', () => {
    get().setUploadPanelOpen(false)
    expect(get().uploadPanelOpen).toBe(false)
  })

  it('setLightboxRecord / setSelectedRecords update', () => {
    const rec: ConditionRecord = { id: 'x', type: 'LABS', label: 'L', date: '2020', color: '#fff' }
    get().setLightboxRecord(rec)
    expect(get().lightboxRecord).toEqual(rec)
    get().setSelectedRecords([rec])
    expect(get().selectedRecords).toEqual([rec])
  })

  it('openHealthChat opens a general chat', () => {
    get().openHealthChat()
    expect(get().sheetOpen).toBe(true)
    expect(get().chatOpen).toBe(true)
    expect(get().selectedCondition).toBeNull()
  })
})

describe('simple setters', () => {
  it('setScreen updates screen', () => {
    get().setScreen('analyzing')
    expect(get().screen).toBe('analyzing')
  })
  it('setDragOver updates dragOver', () => {
    get().setDragOver(true)
    expect(get().dragOver).toBe(true)
  })
  it('setAnalyzeProgress updates progress', () => {
    get().setAnalyzeProgress(0.5)
    expect(get().analyzeProgress).toBe(0.5)
  })
  it('setAnalyzePhase updates phase', () => {
    get().setAnalyzePhase(2)
    expect(get().analyzePhase).toBe(2)
  })
  it('setActiveSystems replaces array', () => {
    get().setActiveSystems(['cardiovascular', 'nervous'])
    expect(get().activeSystems).toEqual(['cardiovascular', 'nervous'])
  })
  it('setCurrentYear updates year', () => {
    get().setCurrentYear(2020.5)
    expect(get().currentYear).toBe(2020.5)
  })
  it('setTimeRailActive updates flag', () => {
    get().setTimeRailActive(true)
    expect(get().timeRailActive).toBe(true)
  })
  it('setTimeRailDragging updates flag', () => {
    get().setTimeRailDragging(true)
    expect(get().timeRailDragging).toBe(true)
  })
  it('toggleSettings flips settingsOpen', () => {
    expect(get().settingsOpen).toBe(false)
    get().toggleSettings()
    expect(get().settingsOpen).toBe(true)
    get().toggleSettings()
    expect(get().settingsOpen).toBe(false)
  })
  it('setChatOpen updates chatOpen', () => {
    get().setChatOpen(true)
    expect(get().chatOpen).toBe(true)
  })
  it('setChatInputVal updates input', () => {
    get().setChatInputVal('hello')
    expect(get().chatInputVal).toBe('hello')
  })
  it('setChatLoading updates loading', () => {
    get().setChatLoading(true)
    expect(get().chatLoading).toBe(true)
  })
  it('setUploadBtnsHovered updates hover', () => {
    get().setUploadBtnsHovered(true)
    expect(get().uploadBtnsHovered).toBe(true)
  })
  it('setDragging updates dragging', () => {
    get().setDragging(true)
    expect(get().dragging).toBe(true)
  })
  it('selectCondition with null clears sheet', () => {
    get().selectCondition(htn)
    get().selectCondition(null)
    expect(get().sheetOpen).toBe(false)
    expect(get().selectedCondition).toBeNull()
  })
  it('setEditDateInput updates input', () => {
    get().startEditDate('htn', '2019-OCT-14')
    get().setEditDateInput('2020-JAN-01')
    expect(get().editDateInput).toBe('2020-JAN-01')
  })
})

describe('removed bodyMapMode API', () => {
  it('bodyMapMode does not exist', () => {
    expect((get() as any).bodyMapMode).toBeUndefined()
  })
  it('setBodyMapMode does not exist', () => {
    expect((get() as any).setBodyMapMode).toBeUndefined()
  })
})
