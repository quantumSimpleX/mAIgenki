import { chatErrorCopyForKind } from '@/lib/llm/chatErrorCopy'

describe('chatErrorCopyForKind', () => {
  it('rate_limit shows the connect chip', () => {
    const copy = chatErrorCopyForKind('rate_limit')
    expect(copy.showConnectChip).toBe(true)
    expect(copy.message).toMatch(/limited/i)
  })

  it('quota_billing shows the connect chip', () => {
    const copy = chatErrorCopyForKind('quota_billing')
    expect(copy.showConnectChip).toBe(true)
  })

  it('network keeps the existing copy with no chip', () => {
    const copy = chatErrorCopyForKind('network')
    expect(copy.showConnectChip).toBe(false)
    expect(copy.message).toBe('Unable to connect. Check network and LLM access.')
  })

  it('other kinds fall back to a generic default with no chip', () => {
    for (const kind of ['auth', 'invalid_request', 'content_filter', 'timeout', 'server', 'validation'] as const) {
      const copy = chatErrorCopyForKind(kind)
      expect(copy.showConnectChip).toBe(false)
      expect(copy.message).toBe('Something went wrong. Please try again.')
    }
  })

  it('null kind falls back to the generic default', () => {
    const copy = chatErrorCopyForKind(null)
    expect(copy.showConnectChip).toBe(false)
    expect(copy.message).toBe('Something went wrong. Please try again.')
  })
})
