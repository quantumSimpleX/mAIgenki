import { create } from 'zustand'
import {
  ALL_SYSTEMS, ChatMessage, ConditionRecord, DesignCondition,
  SupportedLang, SystemId,
} from '@/model/conditions'

type Screen = 'upload' | 'analyzing' | 'bodymap'
type TimeDisplayMode = 'date' | 'age'
export type Gender = 'male' | 'female'

export type PendingUpload = { uri: string; kind: 'pdf' | 'image' }
export type UploadResult = { recordId: string; conditionCount: number; measurementCount: number }

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
  gender: Gender
  preferredLanguage: SupportedLang
  chatOpen: boolean
  chatMessages: ChatMessage[]
  chatInputVal: string
  chatLoading: boolean
  condDateOverrides: Record<string, string>
  selectedRecords: ConditionRecord[]
  lightboxRecord: ConditionRecord | null
  editingCondDate: string | null
  editDateInput: string
  dragging: boolean
  uploadBtnsHovered: boolean
  relocatingCondition: DesignCondition | null
  preRelocationSystems: SystemId[]
  // Upload → pipeline → bodymap plumbing (URI flows via the store, not route params).
  pendingUpload: PendingUpload | null
  lastUploadResult: UploadResult | null
  pipelineError: string | null
  // Set when body-type inference finds no gendered signal and none was stored,
  // so the bodymap can prompt the user once instead of silently defaulting.
  genderPromptNeeded: boolean
}

type AppActions = {
  setScreen: (screen: Screen) => void
  setDragOver: (over: boolean) => void
  setAnalyzeProgress: (progress: number) => void
  setAnalyzePhase: (phase: number) => void
  toggleSystem: (id: SystemId) => void
  soloSystem: (id: SystemId) => void
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
  setGender: (gender: Gender) => void
  setPreferredLanguage: (lang: SupportedLang) => void
  setChatOpen: (open: boolean) => void
  addChatMessage: (msg: ChatMessage) => void
  setChatInputVal: (val: string) => void
  setChatLoading: (loading: boolean) => void
  clearChat: () => void
  setCondDateOverride: (id: string, date: string) => void
  setSelectedRecords: (records: ConditionRecord[]) => void
  setLightboxRecord: (r: ConditionRecord | null) => void
  startEditDate: (condId: string, date: string) => void
  setEditDateInput: (val: string) => void
  confirmEditDate: () => void
  cancelEditDate: () => void
  openHealthChat: () => void
  setUploadBtnsHovered: (h: boolean) => void
  setDragging: (d: boolean) => void
  startAnalyze: () => void
  startRelocation: (c: DesignCondition) => void
  cancelRelocation: () => void
  setPendingUpload: (upload: PendingUpload | null) => void
  setLastUploadResult: (result: UploadResult | null) => void
  setPipelineError: (error: string | null) => void
  setGenderPromptNeeded: (needed: boolean) => void
}

export const useAppStore = create<AppState & AppActions>((set, get) => ({
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
  gender: 'female',
  preferredLanguage: 'ja',
  chatOpen: false,
  chatMessages: [],
  chatInputVal: '',
  chatLoading: false,
  condDateOverrides: {},
  selectedRecords: [],
  lightboxRecord: null,
  editingCondDate: null,
  editDateInput: '',
  dragging: false,
  uploadBtnsHovered: false,
  relocatingCondition: null,
  preRelocationSystems: [],
  pendingUpload: null,
  lastUploadResult: null,
  pipelineError: null,
  genderPromptNeeded: false,

  setScreen: (screen) => set({ screen }),
  setDragOver: (dragOver) => set({ dragOver }),
  setAnalyzeProgress: (analyzeProgress) => set({ analyzeProgress }),
  setAnalyzePhase: (analyzePhase) => set({ analyzePhase }),
  toggleSystem: (id) => set((s) => ({
    activeSystems: s.activeSystems.includes(id)
      ? s.activeSystems.filter((x) => x !== id)
      : [...s.activeSystems, id],
  })),
  // Solo the tapped system; soloing it again restores all layers.
  soloSystem: (id) => set((s) => ({
    activeSystems: s.activeSystems.length === 1 && s.activeSystems[0] === id
      ? [...ALL_SYSTEMS]
      : [id],
  })),
  setActiveSystems: (activeSystems) => set({ activeSystems }),
  setCurrentYear: (currentYear) => set({ currentYear }),
  selectCondition: (c) => {
    if (!c) {
      set({ selectedCondition: null, sheetOpen: false })
      return
    }
    set({
      selectedCondition: c,
      sheetOpen: true,
      currentYear: c.yearFrac,
      timeRailActive: true,
      selectedRecords: [],
      lightboxRecord: null,
      chatMessages: [],
      chatOpen: false,
    })
  },
  closeSheet: () => {
    set({ sheetOpen: false })
    setTimeout(() => {
      // Only clear if a new sheet wasn't opened in the meantime
      if (!get().sheetOpen) {
        set({
          selectedCondition: null,
          chatOpen: false,
          chatMessages: [],
          editingCondDate: null,
        })
      }
    }, 340)
  },
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
  setGender: (gender) => set({ gender }),
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
  startEditDate: (condId, date) => set({ editingCondDate: condId, editDateInput: date }),
  setEditDateInput: (editDateInput) => set({ editDateInput }),
  confirmEditDate: () => {
    const { editingCondDate, editDateInput } = get()
    if (editingCondDate) {
      set((s) => ({
        condDateOverrides: { ...s.condDateOverrides, [editingCondDate]: editDateInput },
      }))
    }
    set({ editingCondDate: null, editDateInput: '' })
  },
  cancelEditDate: () => set({ editingCondDate: null, editDateInput: '' }),
  openHealthChat: () => set({
    sheetOpen: true,
    chatOpen: true,
    selectedCondition: null,
    chatMessages: [],
    selectedRecords: [],
    lightboxRecord: null,
  }),
  setUploadBtnsHovered: (uploadBtnsHovered) => set({ uploadBtnsHovered }),
  setDragging: (dragging) => set({ dragging }),
  startAnalyze: () => set({ screen: 'analyzing', analyzeProgress: 0, analyzePhase: 0 }),
  startRelocation: (c) => set((s) => ({
    preRelocationSystems: [...s.activeSystems],
    activeSystems: [c.system],
    relocatingCondition: c,
    sheetOpen: false,
    selectedCondition: null,
  })),
  cancelRelocation: () => set((s) => ({
    activeSystems: [...s.preRelocationSystems],
    relocatingCondition: null,
    preRelocationSystems: [],
  })),
  setPendingUpload: (pendingUpload) => set({ pendingUpload }),
  setLastUploadResult: (lastUploadResult) => set({ lastUploadResult }),
  setPipelineError: (pipelineError) => set({ pipelineError }),
  setGenderPromptNeeded: (genderPromptNeeded) => set({ genderPromptNeeded }),
}))
