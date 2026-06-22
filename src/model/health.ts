export type OrgSystem =
  | 'cardiovascular'
  | 'respiratory'
  | 'digestive'
  | 'musculoskeletal'
  | 'nervous'
  | 'endocrine'
  | 'urinary'
  | 'reproductive'
  | 'immune'
  | 'integumentary'

export type ConditionStatus = 'documented' | 'resolved' | 'inferred'

export type Condition = {
  id: string
  name: string
  organ: string
  system: OrgSystem
  date: string
  status: ConditionStatus
  evidence: string
  sourceFile: string
}

export type HealthRecord = {
  id: string
  filename: string
  uploadedAt: string
  conditions: Condition[]
}

export const SYSTEM_COLORS: Record<OrgSystem, string> = {
  cardiovascular: '#EF4444',
  respiratory: '#3B82F6',
  digestive: '#F97316',
  nervous: '#EAB308',
  musculoskeletal: '#A855F7',
  endocrine: '#EC4899',
  urinary: '#14B8A6',
  reproductive: '#D946EF',
  immune: '#22C55E',
  integumentary: '#D97706',
}
