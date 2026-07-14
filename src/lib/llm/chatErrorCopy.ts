// src/lib/llm/chatErrorCopy.ts
// Maps a failed condition-chat call's LLM failure kind to the copy and chip
// shown in bodymap.tsx's sendMessage() (lmfPlan.md Phase 6 upgrade nudges).
// Kept as a pure function so the kind -> copy mapping is unit-testable
// without rendering the chat screen.

import type { LMFErrorKind } from '@/lib/lmf'

export type ChatErrorCopy = {
  message: string
  showConnectChip: boolean
}

const NETWORK_MESSAGE = 'Unable to connect. Check network and LLM access.'
const DEFAULT_MESSAGE = 'Something went wrong. Please try again.'
const RATE_LIMIT_MESSAGE = 'Free AI access is limited right now.'

// rate_limit/quota_billing surface a "Connect your account" chip (BYOK nudge);
// network keeps its existing copy unchanged; every other kind gets a generic
// default. None of these branches touch the disclaimer, session-only chat
// storage, or single-condition prompt scoping.
export function chatErrorCopyForKind(kind: LMFErrorKind | null): ChatErrorCopy {
  if (kind === 'rate_limit' || kind === 'quota_billing') {
    return { message: RATE_LIMIT_MESSAGE, showConnectChip: true }
  }
  if (kind === 'network') {
    return { message: NETWORK_MESSAGE, showConnectChip: false }
  }
  return { message: DEFAULT_MESSAGE, showConnectChip: false }
}
