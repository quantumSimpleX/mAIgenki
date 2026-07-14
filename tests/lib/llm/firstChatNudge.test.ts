import { shouldShowFirstChatNudge } from '@/lib/llm/firstChatNudge'

const NOW = new Date('2026-07-13T00:00:00.000Z')

describe('shouldShowFirstChatNudge', () => {
  it('shows on tier 0 with no prior flags', () => {
    expect(shouldShowFirstChatNudge(0, null, null, NOW)).toBe(true)
  })

  it('never shows above tier 0', () => {
    expect(shouldShowFirstChatNudge(1, null, null, NOW)).toBe(false)
    expect(shouldShowFirstChatNudge(2, null, null, NOW)).toBe(false)
    expect(shouldShowFirstChatNudge(3, null, null, NOW)).toBe(false)
  })

  it('does not show once the seen flag is set', () => {
    expect(shouldShowFirstChatNudge(0, 'true', null, NOW)).toBe(false)
  })

  it('does not show within the 7-day shared cooldown', () => {
    const twoDaysAgo = new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString()
    expect(shouldShowFirstChatNudge(0, null, twoDaysAgo, NOW)).toBe(false)
  })

  it('shows again once the 7-day shared cooldown has elapsed', () => {
    const eightDaysAgo = new Date(NOW.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString()
    expect(shouldShowFirstChatNudge(0, null, eightDaysAgo, NOW)).toBe(true)
  })

  it('treats an unparseable dismissedAt as not blocking', () => {
    expect(shouldShowFirstChatNudge(0, null, 'not-a-date', NOW)).toBe(true)
  })
})
