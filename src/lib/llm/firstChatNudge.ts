// src/lib/llm/firstChatNudge.ts
// Gate logic for the one-time first-chat-use upgrade card (lmfPlan.md A1
// trigger 3, Phase 6 ~line 285). Kept pure so the once/tier-0/cooldown rules
// are unit-testable without rendering bodymap.tsx's ConditionSheet.

const NUDGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000

// Card shows only when: on the free tier, the user hasn't dismissed this
// specific nudge before, and the shared 7-day passive-nudge cooldown (if any
// other nudge set it) hasn't elapsed yet.
export function shouldShowFirstChatNudge(
  tier: 0 | 1 | 2 | 3,
  seenFlag: string | null,
  dismissedAt: string | null,
  now: Date,
): boolean {
  if (tier !== 0) return false
  if (seenFlag != null) return false
  if (dismissedAt != null) {
    const dismissedMs = Date.parse(dismissedAt)
    if (Number.isFinite(dismissedMs) && now.getTime() - dismissedMs < NUDGE_COOLDOWN_MS) {
      return false
    }
  }
  return true
}
