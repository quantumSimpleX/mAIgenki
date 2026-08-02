import { create } from 'zustand'
import {
  ALL_SYSTEMS, ChatMessage, ConditionRecord, DesignCondition,
  SupportedLang, SystemId,
} from '@/model/conditions'
import { LMFErrorKind } from '@/lib/lmf'

type Screen = 'upload' | 'analyzing' | 'bodymap'
type TimeDisplayMode = 'date' | 'age'
export type ConditionSource = 'auto' | 'demo'
export type Gender = 'male' | 'female'

export type PendingUpload = { uri: string; kind: 'pdf' | 'image' }
export type UploadResult = { recordId: string; conditionCount: number; measurementCount: number }

const CONDITION_SOURCE_STORAGE_KEY = 'maigenki_condition_source'

function readInitialConditionSource(): ConditionSource {
  if (typeof localStorage === 'undefined') return 'auto'
  const value = localStorage.getItem(CONDITION_SOURCE_STORAGE_KEY)
  return value === 'demo' ? 'demo' : 'auto'
}

function persistConditionSource(conditionSource: ConditionSource): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(CONDITION_SOURCE_STORAGE_KEY, conditionSource)
}

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
  locationEditingCondition: DesignCondition | null
  locationEditMode: 'add' | 'remove' | null
  preLocationEditSystems: SystemId[]
  // Upload → pipeline → bodymap plumbing (URI flows via the store, not route params).
  pendingUpload: PendingUpload | null
  pendingDemo: boolean
  conditionSource: ConditionSource
  lastUploadResult: UploadResult | null
  pipelineError: string | null
  // Set when body-type inference finds no gendered signal and none was stored,
  // so the bodymap can prompt the user once instead of silently defaulting.
  genderPromptNeeded: boolean
  // LLM fallback (LMF) telemetry — ephemeral, session-only, never persisted.
  llmTier: 0 | 1 | 2 | 3
  llmStatus: 'ok' | 'degraded' | 'exhausted'
  lastLlmFailureKind: LMFErrorKind | null
  // Set by an upgrade-nudge CTA to tell the SettingsSheet which section to
  // open/scroll to on next render; the sheet clears it after reacting.
  openSettingsSection: 'provider' | null
  // Measured (onLayout) rendered height of the top nav bar, so the condition
  // sheet/chat panel can size itself to start exactly 1px below it.
  navBarHeight: number
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
  startDemoAnalyze: () => void
  startLocationEditing: (c: DesignCondition) => void
  setLocationEditMode: (mode: 'add' | 'remove') => void
  finishLocationEditing: () => void
  setPendingUpload: (upload: PendingUpload | null) => void
  setPendingDemo: (pending: boolean) => void
  setConditionSource: (source: ConditionSource) => void
  setLastUploadResult: (result: UploadResult | null) => void
  setPipelineError: (error: string | null) => void
  setGenderPromptNeeded: (needed: boolean) => void
  setLlmTier: (tier: 0 | 1 | 2 | 3) => void
  setLlmStatus: (status: 'ok' | 'degraded' | 'exhausted') => void
  setLastLlmFailureKind: (kind: LMFErrorKind | null) => void
  setOpenSettingsSection: (section: 'provider' | null) => void
  setNavBarHeight: (height: number) => void
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
  birthYear: 1963,
  birthMonth: 'FEB',
  gender: 'female',
  preferredLanguage: 'en',
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
  locationEditingCondition: null,
  locationEditMode: null,
  preLocationEditSystems: [],
  pendingUpload: null,
  pendingDemo: false,
  conditionSource: readInitialConditionSource(),
  lastUploadResult: null,
  pipelineError: null,
  genderPromptNeeded: false,
  llmTier: 0,
  llmStatus: 'ok',
  lastLlmFailureKind: null,
  openSettingsSection: null,
  navBarHeight: 0,

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
  startAnalyze: () => {
    persistConditionSource('auto')
    set({
      screen: 'analyzing',
      analyzeProgress: 0,
      analyzePhase: 0,
      conditionSource: 'auto',
    })
  },
  startDemoAnalyze: () => {
    persistConditionSource('demo')
    set({
      screen: 'analyzing',
      analyzeProgress: 0,
      analyzePhase: 0,
      activeSystems: [...ALL_SYSTEMS],
      currentYear: 2024,
      pendingDemo: true,
      conditionSource: 'demo',
      lastUploadResult: null,
      pipelineError: null,
    })
  },
  // Remove is the default tool on entry, not Add — most users editing
  // locations want to erase a wrong one first (userDataReq.md §5.10).
  startLocationEditing: (c) => set((s) => ({
    preLocationEditSystems: [...s.activeSystems],
    activeSystems: [c.system],
    locationEditingCondition: c,
    locationEditMode: 'remove',
    sheetOpen: false,
    selectedCondition: null,
  })),
  setLocationEditMode: (locationEditMode) => set({ locationEditMode }),
  // Done exits back to the bare body map, not the condition's sheet — the
  // user places/removes dots to see the map, not to reopen the card.
  finishLocationEditing: () => set((s) => ({
    activeSystems: [...s.preLocationEditSystems],
    selectedCondition: null,
    sheetOpen: false,
    locationEditingCondition: null,
    locationEditMode: null,
    preLocationEditSystems: [],
  })),
  setPendingUpload: (pendingUpload) => set({ pendingUpload }),
  setPendingDemo: (pendingDemo) => set({ pendingDemo }),
  setConditionSource: (conditionSource) => {
    persistConditionSource(conditionSource)
    set({ conditionSource })
  },
  setLastUploadResult: (lastUploadResult) => set({ lastUploadResult }),
  setPipelineError: (pipelineError) => set({ pipelineError }),
  setGenderPromptNeeded: (genderPromptNeeded) => set({ genderPromptNeeded }),
  setLlmTier: (llmTier) => set({ llmTier }),
  setLlmStatus: (llmStatus) => set({ llmStatus }),
  setLastLlmFailureKind: (lastLlmFailureKind) => set({ lastLlmFailureKind }),
  setOpenSettingsSection: (openSettingsSection) => set({ openSettingsSection }),
  setNavBarHeight: (navBarHeight) => set({ navBarHeight }),
}))
