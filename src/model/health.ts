// 11 organ systems — IDs, labels, and colors are the design canonical source of truth.
// Order matches the legend panel in the body map (top → bottom).
export type OrgSystem =
  | 'integumentary'       // Integumentary
  | 'muscular'      // Muscular
  | 'skeletal'    // Skeletal
  | 'cardiovascular'      // Circulatory
  | 'nervous'       // Nervous
  | 'digestive'          // Digestive
  | 'respiratory'        // Respiratory
  | 'renal'       // Renal
  | 'lymphatic'       // Lymphatic
  | 'endocrine'        // Endocrine
  | 'reproductive'       // Reproductive

export type ConditionStatus = 'documented' | 'resolved' | 'suspected' | 'inferred'

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

// Final confirmed colors from mAI Genki design (handoff04).
// repro updated from #7F1D1D → #C0526A in session 04 for visibility on dark bg.
export const SYSTEM_COLORS: Record<OrgSystem, string> = {
  integumentary:    '#4F46E5',
  muscular:   '#D946EF',
  skeletal: '#94A3B8',
  cardiovascular:   '#EF4444',
  nervous:    '#EAB308',
  digestive:       '#F97316',
  respiratory:     '#06B6D4',
  renal:    '#22C55E',
  lymphatic:    '#F472B6',
  endocrine:     '#84CC16',
  reproductive:    '#C0526A',
}
