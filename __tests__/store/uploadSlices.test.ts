// Phase 9.8.4 — upload/pipeline store slices.

import { useAppStore } from '@/store/useAppStore'

describe('useAppStore — upload pipeline slices', () => {
  beforeEach(() => {
    useAppStore.getState().setPendingUpload(null)
    useAppStore.getState().setLastUploadResult(null)
    useAppStore.getState().setPipelineError(null)
    useAppStore.getState().setGenderPromptNeeded(false)
  })

  it('defaults are null / false', () => {
    const s = useAppStore.getState()
    expect(s.pendingUpload).toBeNull()
    expect(s.lastUploadResult).toBeNull()
    expect(s.pipelineError).toBeNull()
    expect(s.genderPromptNeeded).toBe(false)
  })

  it('setPendingUpload stores and clears the pick', () => {
    useAppStore.getState().setPendingUpload({ uri: 'blob:x', kind: 'pdf' })
    expect(useAppStore.getState().pendingUpload).toEqual({ uri: 'blob:x', kind: 'pdf' })
    useAppStore.getState().setPendingUpload(null)
    expect(useAppStore.getState().pendingUpload).toBeNull()
  })

  it('setLastUploadResult stores the result summary', () => {
    useAppStore.getState().setLastUploadResult({ recordId: 'r1', conditionCount: 3, measurementCount: 2 })
    expect(useAppStore.getState().lastUploadResult).toEqual({ recordId: 'r1', conditionCount: 3, measurementCount: 2 })
  })

  it('setPipelineError stores and clears the message', () => {
    useAppStore.getState().setPipelineError('boom')
    expect(useAppStore.getState().pipelineError).toBe('boom')
    useAppStore.getState().setPipelineError(null)
    expect(useAppStore.getState().pipelineError).toBeNull()
  })

  it('setGenderPromptNeeded toggles the flag', () => {
    useAppStore.getState().setGenderPromptNeeded(true)
    expect(useAppStore.getState().genderPromptNeeded).toBe(true)
  })
})
