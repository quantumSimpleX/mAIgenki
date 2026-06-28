import { create } from 'zustand'
import { ALL_SYSTEMS, ChatMessage, DesignCondition, SupportedLang, SystemId } from '@/model/conditions'

type Screen = 'upload' | 'analyzing' | 'bodymap'
type TimeDisplayMode = 'date' | 'age'
type BodyMapMode = 'body' | 'list'

type AppState = {
  screen: Screen
  dragOver: boolean
  analyzeProgress: number
  analyzePhase: number
  activeSystems: SystemId[]
  currentYear: number
  selectedCondition: DesignCondition | null
  sheetOpen: boolean
  legendOpen: boolean
  timeDisplayMode: TimeDisplayMode
  timeRailActive: boolean
  timeRailDragging: boolean
  settingsOpen: boolean
  uploadPanelOpen: boolean
  birthYear: number
  birthMonth: string
  preferredLanguage: SupportedLang
  chatOpen: boolean
  chatMessages: ChatMessage[]
  chatInputVal: string
  chatLoading: boolean
  condDateOverrides: Record<string, string>
  selectedRecords: string[]
  lightboxRecord: string | null
  bodyMapMode: BodyMapMode
}

type AppActions = {
  setScreen: (screen: Screen) => void
  setDragOver: (over: boolean) => void
  setAnalyzeProgress: (progress: number) => void
  setAnalyzePhase: (phase: number) => void
  toggleSystem: (id: SystemId) => void
  setActiveSystems: (systems: SystemId[]) => void
  setCurrentYear: (year: number) => void
  selectCondition: (c: DesignCondition | null) => void
  closeSheet: () => void
  toggleLegend: () => void
  toggleTimeDisplayMode: () => void
  setTimeRailActive: (active: boolean) => void
  setTimeRailDragging: (dragging: boolean) => void
  toggleSettings: () => void
  setUploadPanelOpen: (open: boolean) => void
  setBirthYear: (year: number) => void
  setBirthMonth: (month: string) => void
  setPreferredLanguage: (lang: SupportedLang) => void
  setChatOpen: (open: boolean) => void
  addChatMessage: (msg: ChatMessage) => void
  setChatInputVal: (val: string) => void
  setChatLoading: (loading: boolean) => void
  clearChat: () => void
  setCondDateOverride: (id: string, date: string) => void
  setSelectedRecords: (records: string[]) => void
  setLightboxRecord: (r: string | null) => void
  startAnalyze: () => void
  setBodyMapMode: (mode: BodyMapMode) => void
}

export const useAppStore = create<AppState & AppActions>((set) => ({
  screen: 'upload',
  dragOver: false,
  analyzeProgress: 0,
  analyzePhase: 0,
  activeSystems: [...ALL_SYSTEMS],
  currentYear: 2024,
  selectedCondition: null,
  sheetOpen: false,
  legendOpen: true,
  timeDisplayMode: 'date',
  timeRailActive: false,
  timeRailDragging: false,
  settingsOpen: false,
  uploadPanelOpen: true,
  birthYear: 1985,
  birthMonth: 'JAN',
  preferredLanguage: 'ja',
  chatOpen: false,
  chatMessages: [],
  chatInputVal: '',
  chatLoading: false,
  condDateOverrides: {},
  selectedRecords: [],
  lightboxRecord: null,
  bodyMapMode: 'body',

  setScreen: (screen) => set({ screen }),
  setDragOver: (dragOver) => set({ dragOver }),
  setAnalyzeProgress: (analyzeProgress) => set({ analyzeProgress }),
  setAnalyzePhase: (analyzePhase) => set({ analyzePhase }),
  toggleSystem: (id) => set((s) => ({
    activeSystems: s.activeSystems.includes(id)
      ? s.activeSystems.filter((x) => x !== id)
      : [...s.activeSystems, id],
  })),
  setActiveSystems: (activeSystems) => set({ activeSystems }),
  setCurrentYear: (currentYear) => set({ currentYear }),
  selectCondition: (c) => set({ selectedCondition: c, sheetOpen: c !== null, chatOpen: false, chatMessages: [] }),
  closeSheet: () => set({ sheetOpen: false, selectedCondition: null, chatOpen: false, chatMessages: [] }),
  toggleLegend: () => set((s) => ({ legendOpen: !s.legendOpen })),
  toggleTimeDisplayMode: () => set((s) => ({
    timeDisplayMode: s.timeDisplayMode === 'date' ? 'age' : 'date',
  })),
  setTimeRailActive: (timeRailActive) => set({ timeRailActive }),
  setTimeRailDragging: (timeRailDragging) => set({ timeRailDragging }),
  toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),
  setUploadPanelOpen: (uploadPanelOpen) => set({ uploadPanelOpen }),
  setBirthYear: (birthYear) => set({ birthYear }),
  setBirthMonth: (birthMonth) => set({ birthMonth }),
  setPreferredLanguage: (preferredLanguage) => set({ preferredLanguage }),
  setChatOpen: (chatOpen) => set({ chatOpen }),
  addChatMessage: (msg) => set((s) => ({ chatMessages: [...s.chatMessages, msg] })),
  setChatInputVal: (chatInputVal) => set({ chatInputVal }),
  setChatLoading: (chatLoading) => set({ chatLoading }),
  clearChat: () => set({ chatMessages: [], chatInputVal: '', chatLoading: false }),
  setCondDateOverride: (id, date) => set((s) => ({
    condDateOverrides: { ...s.condDateOverrides, [id]: date },
  })),
  setSelectedRecords: (selectedRecords) => set({ selectedRecords }),
  setLightboxRecord: (lightboxRecord) => set({ lightboxRecord }),
  startAnalyze: () => set({ screen: 'analyzing', analyzeProgress: 0, analyzePhase: 0 }),
  setBodyMapMode: (bodyMapMode) => set({ bodyMapMode }),
}))
