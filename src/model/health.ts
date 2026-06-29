// 11 organ systems — IDs, labels, and colors are the design canonical source of truth.
// Order matches the legend panel in the body map (top → bottom).
export type OrgSystem =
  | 'integumentary'       // Integumentary
  | 'muscular'      // Muscular
  | 'skeletal'    // Skeletal
  | 'cardiovascular'      // Circulatory
  | 'lymphatic'       // Lymphatic
  | 'nervous'       // Nervous
  | 'respiratory'        // Respiratory
  | 'digestive'          // Digestive
  | 'renal'       // Renal
  | 'endocrine'        // Endocrine
  | 'reproductive'       // Reproductive

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

// Final confirmed colors from mAI Genki design (handoff04).
// repro updated from #7F1D1D → #C0526A in session 04 for visibility on dark bg.
export const SYSTEM_COLORS: Record<OrgSystem, string> = {
  integumentary:    '#4F46E5',
  muscular:   '#F472B6',
  skeletal: '#94A3B8',
  cardiovascular:   '#EF4444',
  lymphatic:    '#22C55E',
  nervous:    '#EAB308',
  respiratory:     '#06B6D4',
  digestive:       '#F97316',
  renal:    '#84CC16',
  endocrine:     '#D946EF',
  reproductive:    '#C0526A',
}
