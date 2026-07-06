import type { DesignCondition } from '@/model/conditions'

export type BodyType = 'male' | 'female' | 'unknown'

// Best-effort body-type inference from documented conditions. Sex-specific
// diagnoses are the only signal; when none is present we return 'unknown' rather
// than silently defaulting, so the caller can prompt the user once.
export function inferBodyType(conds: DesignCondition[]): BodyType {
  const text = conds.map((c) => `${c.id} ${c.label} ${c.medName}`.toLowerCase()).join(' ')
  if (/prostat|testicular|\bbph\b/.test(text)) return 'male'
  if (/ovar|uter|cervi|pcos|fibroid|menstr|pregnan|endometr/.test(text)) return 'female'
  return 'unknown'
}
