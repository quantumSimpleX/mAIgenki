// src/lib/lmf/route.ts
// buildRoute(profile, freeChain) -> Route. Pure, no I/O.

import { BUILT_IN_PROVIDERS, getProviderSpec } from './registry'
import type { Candidate, LMFProfile, Route } from './types'

export function buildRoute(profile: LMFProfile, freeChain: string[]): Route {
  const openrouterSpec = BUILT_IN_PROVIDERS.openrouter
  const freeCandidates: Candidate[] = freeChain.map((model) => ({
    providerId: 'openrouter',
    model,
    spec: openrouterSpec,
  }))

  if (profile.tier === 0 || !profile.activeProviderId || !profile.model) {
    return freeCandidates
  }

  const baseSpec = getProviderSpec(profile.activeProviderId)
  if (!baseSpec) {
    return freeCandidates
  }

  const primarySpec =
    profile.tier === 3 && profile.customBaseURL
      ? { ...baseSpec, baseURL: profile.customBaseURL }
      : baseSpec

  const primary: Candidate = {
    providerId: profile.activeProviderId,
    model: profile.model,
    spec: primarySpec,
  }

  if (!profile.fallbackToFree) {
    return [primary]
  }

  const dedupedFreeChain = freeCandidates.filter(
    (c) => !(c.providerId === primary.providerId && c.model === primary.model),
  )

  return [primary, ...dedupedFreeChain]
}
